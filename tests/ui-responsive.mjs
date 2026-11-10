import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// Deterministic layout coverage, including populated screens, without changing backend data.
const base = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch(process.env.BROWSER_CHANNEL === 'chromium' ? {} : { channel: process.env.BROWSER_CHANNEL || 'msedge' });
const widths = [320, 390, 640, 768, 900, 1024, 1280, 1440];
const email = 'reporter.with.a.long.email.address@engineering.chula.ac.th';
const departments = [{ id: '10000000-0000-4000-8000-000000000001', name: 'ฝ่ายดูแลอาคารและระบบสาธารณูปโภค', contactEmail: email, buildings: ['อาคารวิศวกรรมศาสตร์ 1', 'อาคารเรียนรวมและห้องปฏิบัติการ'] }];
const tickets = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((status, i) => ({
  id: `20000000-0000-4000-8000-00000000000${i + 1}`, category: 'ไฟฟ้า',
  description: 'ไฟเพดานกระพริบและบางหลอดดับ บริเวณทางเดินหน้าห้องปฏิบัติการ',
  location: 'อาคารวิศวกรรมศาสตร์ 1 · ชั้น 4 ห้องปฏิบัติการระบบคอมพิวเตอร์',
  photoUrls: [], completionPhotoUrls: [], reporterEmail: email, status,
  departmentId: departments[0].id, departmentName: departments[0].name, reason: '',
  createdAt: '2026-11-05T02:00:00Z', updatedAt: '2026-11-05T03:00:00Z',
}));
const history = ticket => [{ id: 1, ticketId: ticket.id, fromStatus: '', toStatus: 'SUBMITTED', note: '', changedAt: ticket.createdAt }];
const analytics = {
  total: 5, resolvedCount: 2, mttrHours: 12, closedRate: 20, generatedAt: tickets[0].updatedAt,
  byStatus: [], byCategory: [{ name: 'ไฟฟ้า', count: 5 }],
  hotspots: [{ name: tickets[0].location, count: 5 }],
  byDepartment: [{ ...departments[0], count: 5, mttrHours: 12 }],
  daily: Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, count: i % 5 + 1 })),
};
const routes = {
  PUBLIC: ['/', '/login', '/register', '/report', '/track', `/track/${tickets[0].id}`, `/report/done/${tickets[0].id}`],
  REPORTER: ['/my', '/report', `/tickets/${tickets[0].id}`, `/tickets/${tickets[3].id}`, '/notifications'],
  ADMIN: ['/admin', '/admin/departments', '/admin/users', '/admin/analytics', `/admin/tickets/${tickets[0].id}`],
  STAFF: ['/staff', `/staff/tickets/${tickets[1].id}`, `/staff/tickets/${tickets[2].id}`],
};
mkdirSync('test-results/responsive', { recursive: true });
let checks = 0;

async function fits(page, label) {
  const overflow = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(overflow.page <= overflow.viewport + 1, `${label}: page width ${overflow.page} exceeds ${overflow.viewport}`);
}

try {
  for (const [role, paths] of Object.entries(routes)) {
    const context = await browser.newContext({ reducedMotion: 'reduce', hasTouch: true });
    const errors = [];
    const unexpectedRequests = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.addInitScript(({ role, email, departmentId, origin }) => {
      if (role === 'PUBLIC' || location.origin !== origin) return;
      const claims = { role, email, departmentId, exp: Math.floor(Date.now() / 1000) + 3600 };
      localStorage.setItem('fondue.token', `test.${btoa(JSON.stringify(claims))}.test`);
    }, { role, email, departmentId: departments[0].id, origin: new URL(base).origin });
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let data;
      if (route.request().method() !== 'GET' && url.pathname !== '/api/auth/guest') {
        unexpectedRequests.push(`${route.request().method()} ${url.pathname}`);
      } else if (url.pathname === '/api/auth/guest') {
        data = { accessToken: `test.${Buffer.from(JSON.stringify({ role: 'GUEST', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test` };
      } else if (url.pathname === '/api/departments') data = departments;
      else if (url.pathname === '/api/tickets') data = { tickets };
      else if (url.pathname.endsWith('/history')) {
        const ticket = tickets.find(t => url.pathname.includes(t.id));
        data = { ticket, history: history(ticket) };
      } else if (url.pathname === '/api/auth/users') data = [{ id: 'user-1', email, role: 'STAFF', departmentId: departments[0].id }];
      else if (url.pathname === '/api/analytics') data = analytics;
      else if (url.pathname === '/api/routing-rules') data = [];
      else if (url.pathname === '/api/notifications') data = [{ eventId: 'event-1', ticketId: tickets[0].id, status: 'SUBMITTED', recipientEmail: email, delivery: 'SENT', receivedAt: tickets[0].createdAt }];
      else unexpectedRequests.push(url.pathname);
      await route.fulfill({ status: data === undefined ? 500 : 200, json: data ?? { message: 'Unexpected test request' } });
    });
    const page = await context.newPage();
    for (const width of widths) {
      await page.setViewportSize({ width, height: width <= 640 ? 740 : 1000 });
      for (const path of paths) {
        await page.goto(base + path);
        await page.waitForLoadState('networkidle');
        await fits(page, `${role} ${path} at ${width}`);
        assert.ok(await page.locator('h1').count(), `${role} ${path}: heading renders`);
        assert.equal(await page.getByRole('alert').count(), 0, `${role} ${path}: no load errors`);
        if (width === 390 || width === 1440) await page.screenshot({ path: `test-results/responsive/${role}-${width}-${path.replaceAll('/', '-') || 'home'}.png`, fullPage: true });
        checks++;
      }
      const workspace = role === 'ADMIN' || role === 'STAFF';
      if (width <= (workspace ? 900 : 1100)) {
        const menu = page.getByRole('button', { name: workspace ? 'เปิดเมนูเจ้าหน้าที่' : 'เปิดเมนูหลัก', exact: true });
        await menu.click();
        const navigation = page.getByRole('navigation', { name: workspace ? 'เมนูเจ้าหน้าที่' : 'เมนูหลัก', exact: true });
        assert.equal(await navigation.isVisible(), true, `${role} mobile navigation opens`);
        await fits(page, `${role} expanded menu at ${width}`);
        await page.keyboard.press('Escape');
        assert.equal(await menu.getAttribute('aria-expanded'), 'false');
        assert.equal(await menu.evaluate(el => el === document.activeElement), true, 'Escape restores focus');
        await menu.click();
        await navigation.getByRole('link').first().click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'false', 'choosing a route closes the menu');
      }
      if (width === 320 || width === 390) {
        if (role === 'ADMIN') {
          await page.goto(base + '/admin/departments');
          await page.getByRole('button', { name: 'เพิ่มหน่วยงาน', exact: true }).click();
          const drawer = page.getByRole('dialog', { name: 'แก้ไขหน่วยงาน' });
          await fits(page, `department drawer at ${width}`);
          await drawer.getByRole('button', { name: 'บันทึก', exact: true }).scrollIntoViewIfNeeded();
          await page.keyboard.press('Escape');
          assert.equal(await drawer.count(), 0);
        } else if (role === 'REPORTER') {
          await page.goto(base + `/tickets/${tickets[3].id}`);
          await page.getByRole('button', { name: 'ส่งกลับแก้ไข', exact: true }).click();
          await fits(page, `reporter dialog at ${width}`);
          await page.getByRole('dialog').getByRole('button', { name: 'ยกเลิก', exact: true }).click();
        }
      }
    }
    assert.deepEqual(errors, [], `${role}: no runtime errors`);
    assert.deepEqual(unexpectedRequests, [], `${role}: only expected fixture requests`);
    console.log(`PASS: ${role} at ${widths.join(', ')}px`);
    await context.close();
  }
  console.log(`PASS: ${checks} populated responsive pages, mobile menus, dialogs and drawers; screenshots in test-results/responsive/`);
} finally {
  await browser.close();
}
