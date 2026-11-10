import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const base = process.env.WEB_URL ?? 'http://127.0.0.1:8080';
const browser = await chromium.launch(process.env.BROWSER_CHANNEL === 'chromium' ? {} : { channel: process.env.BROWSER_CHANNEL || 'chrome' });
mkdirSync('test-results', { recursive: true });
try {
  const admin = await browser.newContext();
  const page = await admin.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  async function login(page, email) {
    await page.goto(base + '/login');
    await page.locator('#email').fill(email);
    await page.locator('#pw').fill(process.env.ADMIN_PASSWORD ?? 'FondueDemo!2026');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(url => !url.pathname.endsWith('/login'));
  }
  await login(page, 'admin@fondue.test');
  await page.goto(base + '/admin/departments');
  const token = await page.evaluate(() => localStorage.getItem('fondue.token'));
  const headers = { Authorization: `Bearer ${token}` };
  const response = await page.request.get(base + '/api/routing-rules', { headers });
  const rules = await response.json();
  const original = rules.find(r => r.category === 'IT / Network' && r.enabled);
  assert.ok(original, 'Seed an enabled IT rule first');
  try {
    const toggle = page.getByRole('checkbox', { name: 'เปิดส่งต่ออัตโนมัติ ไอที / เครือข่าย', exact: true });
    await toggle.uncheck();
    await page.getByRole('button', { name: 'บันทึกไอที / เครือข่าย', exact: true }).click();
    await page.getByText('บันทึกหมวดไอที / เครือข่ายแล้ว', { exact: true }).waitFor();
    await page.reload();
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(), false, 'disabled rule persists after reload');
    await toggle.check();
    await page.getByRole('button', { name: 'บันทึกไอที / เครือข่าย', exact: true }).click();
    await page.getByText('บันทึกหมวดไอที / เครือข่ายแล้ว', { exact: true }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 950 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({ path: `test-results/routing-rules-${width}.png` });
    }
  } finally {
    const restored = await page.request.put(base + `/api/routing-rules/${original.id}`, { headers, data: { enabled: original.enabled, departmentId: original.departmentId } });
    assert.ok(restored.ok(), 'restore original rule');
  }
  const reporter = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const report = await reporter.newPage();
  report.on('pageerror', e => errors.push(e.message));
  await login(report, 'reporter@fondue.test');
  // Keep writes and final state live; inject a pending snapshot and one failed read to test polling recovery.
  let historyReads = 0;
  await report.route('**/api/tickets/*/history', async (route) => {
    historyReads++;
    if (historyReads === 2) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary test outage' }) });
    if (historyReads !== 1) return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.ticket = { ...body.ticket, status: 'SUBMITTED', routingStatus: 'PENDING', assignmentSource: '', departmentId: '', departmentName: '', routingRuleId: '' };
    await route.fulfill({ response, json: body });
  });
  await report.goto(base + '/report');
  await report.getByRole('radio', { name: 'ไอที / เครือข่าย', exact: true }).click();
  await report.locator('#desc').fill('ทดสอบส่งต่ออัตโนมัติจากมือถือ');
  await report.locator('#building').fill('อาคารวิศวกรรมศาสตร์ 1');
  await report.locator('input[type=file]').setInputFiles({ name: 'issue.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSTsAAAAASUVORK5CYII=', 'base64') });
  await report.locator('button[type=submit]').click();
  await report.waitForURL(/\/report\/done\/[a-f0-9-]+$/);
  await report.getByRole('status').filter({ hasText: 'ส่งต่ออัตโนมัติ' }).waitFor({ timeout: 20000 });
  assert.ok(historyReads >= 3, 'polling recovers after a failed read');
  await report.getByRole('button', { name: 'ติดตามสถานะ', exact: true }).click();
  await report.getByRole('button', { name: 'ยกเลิกการแจ้งซ่อม', exact: true }).waitFor();
  assert.ok(await report.getByText('ส่งต่ออัตโนมัติ', { exact: true }).count(), 'timeline identifies automatic routing');
  assert.equal(await report.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await report.screenshot({ path: 'test-results/routing-mobile-assigned.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: rule editing/persistence, desktop/mobile layout, browser submission, routing polling and cancel before work starts');
} finally { await browser.close(); }
