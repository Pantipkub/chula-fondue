import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { photoForm, eventually } from './e2e.mjs';

assert.equal(process.env.FONDUE_ENV_FILE, '.env.demo', 'Run only against the isolated demo');
assert.ok(process.env.ADMIN_PASSWORD, 'Set ADMIN_PASSWORD in .env.demo before running platform tests');
const base = process.env.WEB_URL ?? 'http://127.0.0.1:8080';
const api = process.env.API_URL ?? 'http://localhost:3100';
const run = randomUUID().slice(0, 8);
const password = randomBytes(24).toString('hex');
async function call(path, token, method = 'GET', json, form) {
  const res = await fetch(api + path, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(json && { 'Content-Type': 'application/json' }) }, body: form ?? (json && JSON.stringify(json)), signal: AbortSignal.timeout(15000) });
  assert.ok(res.ok, `fixture ${method} ${path}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}
const login = async (email, pass = password) => (await call('/auth/login', null, 'POST', { email, password: pass })).accessToken;
const admin = await login(process.env.ADMIN_EMAIL ?? 'admin@fondue.test', process.env.ADMIN_PASSWORD);
const email = `ui-platform-${run}@example.test`;
await call('/auth/register', null, 'POST', { email, password });
const reporter = await login(email);
const dept = await call('/departments', admin, 'POST', { name: `Platform UI ${run}`, contactEmail: `team-ui-${run}@example.test` });
const staff = await call('/auth/users', admin, 'POST', { email: `staff-ui-${run}@example.test`, password, role: 'STAFF', departmentId: dept.id });
const staffToken = await login(staff.email);
const ticket = await call('/tickets', reporter, 'POST', undefined, photoForm({ category: 'Other', location: 'Library', description: `Notification UI ${run}` }));
await call(`/tickets/${ticket.id}/assign`, admin, 'POST', { departmentId: dept.id });
await eventually(async () => (await call('/notifications', staffToken)).some(n => n.ticketId === ticket.id));
const channel = process.env.BROWSER_CHANNEL ?? (process.platform === 'darwin' ? 'chrome' : 'chromium');
const browser = await chromium.launch(channel === 'chromium' ? {} : { channel });
mkdirSync('test-results', { recursive: true });
const errors = [];
const contexts = [];
const open = async (token, width = 1440) => {
   const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(20000);
  contexts.push(context);
  if (token) await context.addInitScript(token => localStorage.setItem('fondue.token', token), token);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  return page;
};
try {
  for (const width of [1440, 390]) {
    const page = await open(reporter, width);
    for (const [name, path] of [['account', '/account'], ['forgot', '/forgot-password'], ['reset', `/reset-password?token=${'a'.repeat(64)}`]]) {
      await page.goto(base + path); await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} ${width} overflow`);
      await page.screenshot({ path: `test-results/platform-${name}-${width}.png`, fullPage: true });
    }
    await page.close();
    const adminPage = await open(admin, width);
    await adminPage.goto(base + '/admin/users');
    await adminPage.getByRole('button', { name: `จัดการบัญชี ${staff.email}`, exact: true }).click();
    const dialog = adminPage.getByRole('dialog', { name: 'จัดการบัญชี', exact: true });
    await dialog.getByRole('heading', { name: 'จัดการบัญชี', exact: true }).waitFor();
    assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `accounts ${width} overflow`);
    await adminPage.screenshot({ path: `test-results/platform-users-${width}.png`, animations: 'disabled' });
    await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await adminPage.close();
  }
  console.log('PASS: responsive account and recovery views');
  const staffPage = await open(staffToken, 390);
  await staffPage.goto(base + '/notifications');
  const read = staffPage.getByRole('button', { name: `อ่านแล้ว #${ticket.id.slice(0, 8).toUpperCase()}`, exact: true });
  await read.click();
  await staffPage.getByText('อ่านแล้ว', { exact: true }).waitFor();
  await staffPage.screenshot({ path: 'test-results/platform-notifications-390.png', fullPage: true });
  await staffPage.getByRole('link', { name: `#${ticket.id.slice(0, 8).toUpperCase()}`, exact: true }).click();
  await staffPage.waitForURL(`**/staff/tickets/${ticket.id}`);
  console.log('PASS: Staff department notification, read state and detail link');

  const reportPage = await open(reporter, 390);
  await reportPage.goto(base + '/report');
  await reportPage.getByRole('radio', { name: 'อื่น ๆ', exact: true }).click();
  await reportPage.getByLabel('รายละเอียด', { exact: false }).fill(`Browser retry ${run}`);
  await reportPage.getByLabel(/^อาคาร/).fill('หอสมุดกลาง');
  await reportPage.locator('input[type=file]').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSTsAAAAASUVORK5CYII=', 'base64') });
  let acceptedId; const keys = [];
  await reportPage.route('**/api/tickets', async route => {
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    const result = await response.json();
    if (!acceptedId) {
      acceptedId = result.id;
      await route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated response timeout after commit' }) });
    } else {
      assert.equal(result.id, acceptedId);
      await route.fulfill({ response });
    }
  });
  await reportPage.getByRole('button', { name: 'ส่งแจ้งซ่อม', exact: true }).click();
  await reportPage.getByText('ระบบตอบช้าเกินไป ลองอีกครั้งในอีกสักครู่', { exact: true }).waitFor();
  await reportPage.getByRole('button', { name: 'ส่งแจ้งซ่อม', exact: true }).click();
  await reportPage.waitForURL('**/report/done/**');
  assert.equal(keys.length, 2); assert.equal(new Set(keys).size, 1); assert.ok(keys[0]);
  assert.equal((await call('/tickets', reporter)).tickets.filter(t => t.description === `Browser retry ${run}`).length, 1);
  console.log('PASS: retry after losing a successful submission response creates one ticket');

  await reportPage.goto(base + '/account');
  const newPassword = randomBytes(24).toString('hex');
  await reportPage.getByLabel(/^รหัสผ่านปัจจุบัน/).fill('wrong-password');
  await reportPage.getByLabel(/^รหัสผ่านใหม่/).fill(newPassword);
  await reportPage.getByLabel(/^ยืนยันรหัสผ่านใหม่/).fill(newPassword);
  await reportPage.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน', exact: true }).click();
  await reportPage.getByText('รหัสผ่านปัจจุบันไม่ถูกต้อง', { exact: true }).waitFor();
  await reportPage.getByLabel(/^รหัสผ่านปัจจุบัน/).fill(password);
  await reportPage.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน', exact: true }).click();
  await reportPage.waitForURL('**/login');
  await reportPage.getByText('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบอีกครั้ง', { exact: true }).waitFor();

  const adminPage = await open(admin, 390);
  await adminPage.goto(base + '/admin/users');
  await adminPage.getByRole('button', { name: `จัดการบัญชี ${staff.email}`, exact: true }).click();
  const dialog = adminPage.getByRole('dialog', { name: 'จัดการบัญชี', exact: true });
  await dialog.getByRole('checkbox', { name: 'เปิดใช้งานบัญชี', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'บันทึกบัญชี', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const revoked = await fetch(api + '/auth/me', { headers: { Authorization: `Bearer ${staffToken}` } });
  assert.equal(revoked.status, 401);
  assert.deepEqual(errors, []);
  writeFileSync('test-results/platform-ui.json', JSON.stringify({ run, passed: true, responsiveChecks: 8, lostResponseRetry: true, accountChange: true, departmentNotification: true }, null, 2));
  console.log('PASS: 8 responsive views, department notification/read/link, account management, password change and retry after a committed submission loses its response');
} finally { for (const context of contexts) await context.close(); await browser.close(); }
