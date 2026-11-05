import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.WEB_URL ?? 'http://127.0.0.1:8080';
const browser = await chromium.launch(process.env.BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'msedge' });
try {
  for (const [role, email, home, routes] of [
    ['admin', 'admin@fondue.test', '/admin', ['/admin', '/admin/departments', '/admin/users', '/admin/analytics', '/notifications']],
    ['reporter', 'reporter@fondue.test', '/my', ['/my', '/report', '/notifications']],
    ['staff', 'staff@fondue.test', '/staff', ['/staff', '/notifications']],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/login');
    await page.locator('#email').fill(email);
    await page.locator('#pw').fill('FondueDemo!2026');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(base + home);
    for (const [width, height] of [[1440, 1000], [390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const route of routes) {
        await page.goto(base + route); await page.waitForLoadState('networkidle');
        await page.screenshot({ path: `test-results/live-${role}-${width}-${route.replaceAll('/', '-')}.png`, fullPage: true });
        const error = page.locator('[role=alert]');
        assert.equal(await error.count(), 0, `${role} ${route}: ${await error.allTextContents()}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${role} ${route} overflow at ${width}`);
      }
    }
    if (role === 'reporter') {
      await page.goto(base + '/report');
      await page.locator('#desc').fill('ทดสอบแจ้งซ่อมจากหน้าจอจริง');
      await page.locator('#building').fill('อาคารวิศวกรรมศาสตร์ 1');
      await page.locator('#spot').fill('ชั้น 1');
      await page.locator('input[type=file]').setInputFiles({ name: 'issue.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSTsAAAAASUVORK5CYII=', 'base64') });
      await page.locator('button[type=submit]').click();
      await page.waitForURL(/\/report\/done\/[a-f0-9-]+$/);
      await page.screenshot({ path: 'test-results/live-report-submitted.png', fullPage: true });
    }
    assert.deepEqual(errors, [], `${role}: runtime errors`);
    await context.close();
  }
  console.log('PASS: login, 20 authenticated responsive page checks and browser report submission');
} finally { await browser.close(); }
