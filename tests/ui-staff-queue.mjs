import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// Large-queue and empty/error-state coverage without changing live tickets.
const base = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch(process.env.BROWSER_CHANNEL === 'chromium' ? {} : { channel: process.env.BROWSER_CHANNEL || 'chrome' });
const output = 'test-results/staff-queue';
mkdirSync(output, { recursive: true });
const statuses = ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const categories = ['IT / Network', 'Electrical', 'Building'];
const tickets = Array.from({ length: 1000 }, (_, index) => ({
  id: `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`,
  category: categories[index % categories.length], status: statuses[index % statuses.length],
  description: ['เชื่อมต่อ Wi-Fi ไม่ได้บริเวณห้องอ่านหนังสือ', 'ไฟทางเดินหน้าห้องปฏิบัติการไม่ติด', 'ประตูห้องเรียนปิดไม่สนิท'][index % 3],
  location: ['อาคารวิศวกรรมศาสตร์ 4 · ชั้น 3', 'หอสมุดกลาง · ชั้น 2', 'อาคารเรียนรวม · ห้อง 401'][index % 3],
  photoUrls: [], completionPhotoUrls: [], reporterEmail: `reporter${index}@chula.ac.th`,
  departmentId: 'department-1', departmentName: 'ฝ่ายเทคโนโลยีสารสนเทศ', reason: '',
  createdAt: new Date(Date.parse('2026-11-06T03:00:00Z') - index * 3600000).toISOString(),
  updatedAt: new Date(Date.parse('2026-11-06T04:00:00Z') - index * 1800000).toISOString(),
}));
tickets[998].description = 'อุปกรณ์ในห้องปฏิบัติการชำรุด ' + 'รายละเอียดคำร้องที่ยาวมาก'.repeat(20);
tickets[998].location = 'อาคารเรียนรวม ' + 'สถานที่ไม่มีช่องว่าง'.repeat(20);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  let mode = 'error';
  const errors = [];
  const unexpected = [];
  const writes = [];
  await context.addInitScript(() => {
    const claims = { role: 'STAFF', email: 'staff@chula.ac.th', departmentId: 'department-1', exp: Math.floor(Date.now() / 1000) + 3600 };
    localStorage.setItem('fondue.token', `test.${btoa(JSON.stringify(claims))}.test`);
  });
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/tickets') {
      if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      let data = mode === 'empty' ? [] : mode === 'single' ? [tickets[4]] : mode === 'closed' ? tickets.map(ticket => ({ ...ticket, status: 'CLOSED' })) : tickets;
      const status = url.searchParams.get('status');
      if (status) data = data.filter(ticket => ticket.status === status);
      return route.fulfill({ json: { tickets: data } });
    }
    const ticket = tickets.find(ticket => url.pathname.includes(ticket.id));
    if (ticket && url.pathname.endsWith('/history')) return route.fulfill({ json: { ticket, history: [] } });
    if (ticket && url.pathname.endsWith('/start') && request.method() === 'POST') {
      writes.push(ticket.id);
      ticket.status = 'IN_PROGRESS';
      return route.fulfill({ json: ticket });
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    await route.fulfill({ status: 500, json: { message: 'Unexpected test request' } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const rows = page.locator('.queue-table tbody tr');
  const search = page.getByRole('textbox', { name: 'ค้นหางาน', exact: true });
  const status = page.getByRole('combobox', { name: 'สถานะ', exact: true });
  const category = page.getByRole('combobox', { name: 'หมวดหมู่', exact: true });
  const sort = page.getByRole('combobox', { name: 'เรียงตาม', exact: true });
  const size = page.getByRole('combobox', { name: 'รายการต่อหน้า', exact: true });
  const result = page.locator('.queue-results-heading [role=status]');
  // Dropdowns are Radix Select: open the trigger, then choose the option by its value.
  const pick = async (box, value) => { await box.click(); await page.locator(`[role=option][data-value="${value}"]`).click(); };
  const refresh = page.getByRole('button', { name: 'รีเฟรช', exact: true });
  const clear = async () => {
    await page.getByRole('button', { name: 'ล้างตัวกรอง', exact: true }).first().click();
    await expect(search).toHaveValue('');
    await expect(status).toHaveAttribute('data-value', 'ACTIVE');
    await expect(category).toHaveAttribute('data-value', '');
  };
  const fits = async label => {
    const bounds = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth, container: document.querySelector('.queue-workspace')?.scrollWidth, box: document.querySelector('.queue-workspace')?.clientWidth }));
    assert.ok(bounds.page <= bounds.width + 1 && bounds.container <= bounds.box + 1, `${label}: content fits (${JSON.stringify(bounds)})`);
  };

  await page.goto(base + '/staff');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('ยังไม่มีงานส่งถึงหน่วยงาน', { exact: true })).toHaveCount(0);
  mode = 'large';
  await page.getByRole('button', { name: 'ลองโหลดอีกครั้ง', exact: true }).click();
  await expect(rows).toHaveCount(20);
  await expect(result).toContainText('750 รายการ');
  await expect(rows.first()).toContainText('#000003E6');
  await fits('desktop long text');
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.screenshot({ path: `${output}/desktop-overview.png` });
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('page'), '2');
  await pick(size, '50');
  await expect(rows).toHaveCount(50);
  assert.equal(new URL(page.url()).searchParams.get('page'), null, 'page size resets the page');
  await pick(sort, 'newest');
  await expect(rows.first()).toContainText('#00000000');
  await pick(status, 'IN_PROGRESS');
  await expect(result).toContainText('250 รายการ');
  await pick(category, 'IT / Network');
  await expect(result).toContainText('83 รายการ');
  await expect(rows).toHaveCount(50);
  await clear();
  await search.fill('#00000389'); // index 905, beyond the first rendered page
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('#00000389');
  await search.fill('reporter777@chula.ac.th');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('#00000309');
  await search.fill('คำค้นที่ไม่มีอยู่');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('ไม่พบงานที่ตรงเงื่อนไข', { exact: true })).toBeVisible();
  await clear();
  await pick(status, 'CLOSED');
  await expect(result).toContainText('250 รายการ');
  await expect(rows.getByRole('button', { name: /เริ่มซ่อม/ })).toHaveCount(0);
  await pick(status, 'ALL');
  await expect(result).toContainText('1,000 รายการ');
  await pick(status, 'IN_PROGRESS');
  await pick(category, 'IT / Network');
  await pick(size, '10');
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  const queueSearch = new URL(page.url()).search;
  await page.getByRole('link', { name: /ดูรายละเอียด #/ }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'คิวงาน', exact: true }).click();
  await expect(rows).toHaveCount(10);
  assert.equal(new URL(page.url()).search, queueSearch, 'returning from details preserves queue filters and page');
  await expect(status).toHaveAttribute('data-value', 'IN_PROGRESS');
  await clear();
  await pick(status, 'ASSIGNED');
  await search.fill('#00000000');
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'เริ่มซ่อม #00000000', exact: true }).click();
  await expect(rows).toHaveCount(0);
  assert.deepEqual(writes, [tickets[0].id], 'row action updates only the chosen ticket');

  for (const [width, height] of [[320, 740], [375, 812], [390, 844], [640, 900], [768, 1024], [900, 1000], [1024, 1000], [1280, 1000], [1440, 1000], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base + '/staff?size=10');
    await expect(rows).toHaveCount(10);
    await fits(`${width}x${height}`);
    if (width <= 640) {
      await expect(status).toBeHidden();
      await page.getByRole('button', { name: 'แสดงตัวกรอง', exact: true }).click();
      await expect(status).toBeVisible();
      await pick(status, 'IN_PROGRESS');
      await fits(`${width}px expanded filters`);
      await page.getByRole('button', { name: 'ซ่อนตัวกรอง', exact: true }).click();
    }
    if (width === 375) await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/staff?status=IN_PROGRESS&size=10&page=9999');
  await expect(rows).toHaveCount(1); // 251 in progress after starting one ticket
  await expect(page.getByRole('button', { name: 'ถัดไป', exact: true })).toBeDisabled();
  mode = 'error';
  await refresh.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(page.getByText('โหลดข้อมูลใหม่ไม่สำเร็จ กำลังแสดงข้อมูลล่าสุด', { exact: true })).toBeVisible();
  mode = 'single';
  await page.goto(base + '/staff');
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'ก่อนหน้า', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'ถัดไป', exact: true })).toBeDisabled();
  mode = 'closed';
  await refresh.click();
  await expect(page.getByText('ไม่มีงานค้าง', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ดูงานทั้งหมด', exact: true }).click();
  await expect(rows).toHaveCount(20);
  mode = 'empty';
  await refresh.click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('ยังไม่มีงานส่งถึงหน่วยงาน', { exact: true })).toBeVisible();
  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.deepEqual(unexpected, [], 'only expected fixture requests');
  console.log('PASS: 0 / 1 / 1,000 tickets, search, combined filters, sorting, pagination, return navigation, start action, errors and 10 viewport sizes');
  console.log(`Screenshots: ${output}/`);
  await context.close();
} finally {
  await browser.close();
}
