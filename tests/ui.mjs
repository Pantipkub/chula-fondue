import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const base = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch(process.env.BROWSER_CHANNEL === 'chromium' ? {} : { channel: process.env.BROWSER_CHANNEL || 'msedge' });
mkdirSync('test-results', { recursive: true });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/', '/login', '/register', '/report', '/track']) {
      await page.goto(base + route);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, `${name} ${route} must not overflow`);
      assert.ok(await page.locator('h1, h2').count(), `${route} has a page heading`);
      await page.screenshot({ path: `test-results/${name}-${route.replaceAll('/', '') || 'home'}.png`, fullPage: true });
    }
    assert.deepEqual(errors, [], `${name} browser runtime errors`);
    await page.close();
  }
  console.log('PASS: 10 responsive page checks; screenshots in test-results/');
} finally { await browser.close(); }
