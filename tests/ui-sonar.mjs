import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// Isolated API fixtures: exercises native dialogs and ticket actions without touching live data.
const base = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const channel = process.env.BROWSER_CHANNEL ?? 'chrome';
const browser = await chromium.launch(channel === 'chromium' ? {} : { channel });
mkdirSync('test-results/sonar', { recursive: true });
const department = { id: 'department', name: 'Facilities', contactEmail: 'team@example.test', buildings: [], active: true };
const ticket = { id: 'aaaaaaaa-0000-4000-8000-000000000001', status: 'RESOLVED', category: 'Electrical', location: 'Library', description: 'ไฟเสีย',
  photoUrls: [], completionPhotoUrls: [], reporterEmail: 'reporter@example.test', departmentId: department.id, departmentName: department.name,
  reason: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const errors = [];
const writes = [];

async function open(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const claims = { role, email: 'reporter@example.test', departmentId: 'department', exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `test.${Buffer.from(JSON.stringify(claims)).toString('base64')}.test`;
  await context.addInitScript(token => localStorage.setItem('fondue.token', token), token);
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      writes.push(path);
      if (path === `/api/tickets/${ticket.id}/confirm`) {
        ticket.status = 'CLOSED';
        return route.fulfill({ json: ticket });
      }
      return route.fulfill({ status: 500, json: { message: 'Unexpected fixture write' } });
    }
    if (path === '/api/departments') return route.fulfill({ json: [department] });
    if (path === '/api/auth/users') return route.fulfill({ json: [{ id: 'staff-test', email: 'staff@example.test', role: 'STAFF', departmentId: department.id, active: true }] });
    if (path === '/api/routing-rules' || path === '/api/notifications') return route.fulfill({ json: [] });
    if (path === '/api/tickets') return route.fulfill({ json: { tickets: role === 'ADMIN' ? [] : [ticket] } });
    return route.fulfill({ status: 404, json: { message: 'Unexpected fixture read' } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}

try {
  const admin = await open('ADMIN');
  const page = admin.page;
  await page.goto(base + '/admin/departments');
  const trigger = page.getByRole('button', { name: 'เพิ่มหน่วยงาน', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'แก้ไขหน่วยงาน' });
  await expect(drawer).toBeVisible();
  assert.equal(await drawer.evaluate(element => element.matches(':modal')), true);
  await drawer.getByLabel('ชื่อหน่วยงาน').fill('Keyboard fixture');
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await drawer.evaluate(element => element.contains(document.activeElement)), true, 'Tab focus stays inside the dialog');
  }
  await page.screenshot({ path: 'test-results/sonar/drawer-desktop.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(drawer).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(drawer).toHaveCount(0);
  await page.getByRole('button', { name: 'ปิดใช้งาน Facilities', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'ปิดใช้งานหน่วยงาน' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(drawer).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: 'test-results/sonar/drawer-mobile.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/admin/users');
  await page.getByRole('button', { name: 'จัดการบัญชี staff@example.test' }).click();
  const accountDialog = page.getByRole('dialog');
  await expect(accountDialog).toBeVisible();
  const departmentSelect = accountDialog.getByRole('combobox', { name: 'หน่วยงาน' });
  await departmentSelect.click();
  const option = page.getByRole('option', { name: 'Facilities', exact: true });
  await expect(option).toBeVisible();
  assert.equal(await option.evaluate(element => element.closest('dialog') !== null), true, 'dropdown portal stays inside the native dialog');
  await option.click();
  await page.keyboard.press('Escape');
  await expect(accountDialog).toHaveCount(0);
  await admin.context.close();

  const reporter = await open('REPORTER');
  await reporter.page.goto(base + '/my');
  const confirm = reporter.page.getByRole('button', { name: 'ตรวจรับ', exact: true });
  await expect(confirm).toBeVisible();
  assert.equal(await confirm.evaluate(element => element.closest('a') === null), true);
  await confirm.focus();
  await reporter.page.keyboard.press('Enter');
  await expect(reporter.page.getByRole('article').getByText('ปิดงาน', { exact: true })).toBeVisible();
  assert.equal(new URL(reporter.page.url()).pathname, '/my', 'confirm action must not navigate into the ticket');
  assert.deepEqual(writes, [`/api/tickets/${ticket.id}/confirm`]);
  await reporter.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS: native modal/drawer, focus containment, Escape, backdrop, mobile layout and keyboard confirmation without navigation');
} finally { await browser.close(); }
