import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

// Real same-origin tabs/storage, with controlled HTTP responses to exercise login races.
const base = process.env.WEB_URL ?? 'http://127.0.0.1:8080';
const password = 'BrowserTest!2026';
const notice = 'ออกจากระบบแล้ว เนื่องจากมีการเข้าสู่ระบบในแท็บอื่น กรุณาเข้าสู่ระบบอีกครั้ง';
const alice = 'alice@example.test';
const bob = 'bob@example.test';
function jwt(email, role = 'REPORTER') {
  return `test.${Buffer.from(JSON.stringify({ sub: email, email, role, departmentId: '', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
}
// Deliberately return the exact same token for repeated logins to the same account.
const tokens = { [alice]: jwt(alice), [bob]: jwt(bob), guest: jwt('', 'GUEST') };
const channel = process.env.BROWSER_CHANNEL ?? (process.platform === 'darwin' ? 'chrome' : 'chromium');
const browser = await chromium.launch(channel === 'chromium' ? {} : { channel });
const contexts = [];
const errors = [];
mkdirSync('test-results', { recursive: true });

async function setup(width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(10000); context.setDefaultNavigationTimeout(15000);
  contexts.push(context);
  const requests = [];
  const state = { logouts: 0, notification: null };
  await context.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/api', '');
    const token = (req.headers().authorization ?? '').replace(/^Bearer /, '');
    requests.push({ page: req.frame().page(), path, token });
    if (path === '/auth/login') {
      const body = req.postDataJSON();
      if (body.password !== password || !tokens[body.email]) return route.fulfill({ status: 401, json: { message: 'Invalid email or password' } });
      return route.fulfill({ json: { accessToken: tokens[body.email], user: { email: body.email, role: 'REPORTER', departmentId: '' } } });
    }
    if (path === '/auth/guest') return route.fulfill({ json: { accessToken: tokens.guest } });
    if (path === '/auth/logout') { state.logouts++; return route.fulfill({ json: {} }); }
    if (!Object.values(tokens).includes(token)) return route.fulfill({ status: 401, json: { message: 'Missing bearer token' } });
    if (path === '/tickets') return route.fulfill({ json: { tickets: [] } });
    if (path === '/notifications') {
      if (state.notification) return state.notification(route);
      return route.fulfill({ json: [] });
    }
    throw Error(`Unexpected test request ${path}`);
  });
  const page = async () => {
    const tab = await context.newPage();
    tab.on('pageerror', error => errors.push(error.message));
    return tab;
  };
  return { context, page, requests, state };
}

async function login(page, email, pass = password) {
  await page.goto(base + '/login');
  await page.locator('#email').fill(email); await page.locator('#pw').fill(pass);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  if (pass === password) await signedIn(page, email);
  else await page.getByRole('alert').filter({ hasText: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }).waitFor();
}
async function signedIn(page, email) {
  await page.waitForURL('**/my');
  await page.getByRole('button', { name: `บัญชี ${email}`, exact: true }).waitFor();
}
async function replaced(page) {
  await page.waitForURL('**/login');
  await page.getByText(notice, { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'เรื่องของฉัน', exact: true }).count(), 0);
}

try {
  const isolated = await setup(); const isolatedPage = await isolated.page();
  await login(isolatedPage, alice);

  const shared = await setup(390);
  const old = await shared.page(); await login(old, alice);
  const winner = await shared.page();
  await login(winner, bob, 'wrong-password');
  await signedIn(old, alice); // An unsuccessful login must not evict another tab.
  await login(winner, bob);
  await replaced(old); await signedIn(winner, bob); await signedIn(isolatedPage, alice);
  assert.equal(shared.state.logouts, 0, 'replacement must not call the server logout endpoint');
  await old.screenshot({ path: 'test-results/auth-tabs-replaced-390.png', fullPage: true, animations: 'disabled' });
  await old.reload(); await replaced(old);
  await old.goto(base + '/my'); await replaced(old); // Reload/direct navigation cannot adopt Bob's session.
  await winner.reload(); await signedIn(winner, bob);
  await old.getByRole('button', { name: 'ดำเนินการต่อแบบผู้เยี่ยมชม', exact: true }).click();
  await old.waitForURL('**/report'); await signedIn(winner, bob);
  assert.equal(await old.getByRole('button', { name: `บัญชี ${bob}`, exact: true }).count(), 0);
  await login(old, alice); await replaced(winner); await signedIn(old, alice);
  assert.equal(shared.state.logouts, 0);
  console.log('PASS: failed login, different accounts, old-tab reload, guest isolation, reverse replacement and separate browser contexts');

  const same = await setup(); const first = await same.page(); const second = await same.page();
  await login(first, alice); await login(second, alice);
  await replaced(first); await signedIn(second, alice);
  assert.equal(same.state.logouts, 0, 'same-account replacement must not revoke the new login');
  console.log('PASS: another login forces logout even when the server returns an identical JWT');

  // A late 401 from the previous login must not clear a fresh login in the same tab.
  const stale = await setup(); const tab = await stale.page(); await login(tab, alice);
  let release;
  const started = new Promise(resolve => {
    stale.state.notification = route => { resolve(); return new Promise(done => { release = async () => { await route.fulfill({ status: 401, json: { message: 'Old request expired' } }); done(); }; }); };
  });
  await tab.getByRole('link', { name: 'การแจ้งเตือน', exact: true }).click();
  await started;
  // SPA history navigation leaves the previous fetch alive while opening the login form.
  await tab.evaluate(() => { history.pushState(null, '', '/login'); dispatchEvent(new PopStateEvent('popstate')); });
  await tab.locator('#email').fill(alice); await tab.locator('#pw').fill(password);
  await tab.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await signedIn(tab, alice);
  await release(); await tab.waitForLoadState('networkidle'); await signedIn(tab, alice);
  console.log('PASS: a stale 401 cannot log out a newer same-account session');

  // Simulate a background tab whose storage/focus/visibility events have been deferred.
  const suspended = await setup(); const background = await suspended.page(); const active = await suspended.page();
  await background.addInitScript(() => {
    const addWindow = window.addEventListener.bind(window);
    const addDocument = document.addEventListener.bind(document);
    window.addEventListener = (type, ...args) => { if (type !== 'storage' && type !== 'focus') addWindow(type, ...args); };
    document.addEventListener = (type, ...args) => { if (type !== 'visibilitychange') addDocument(type, ...args); };
  });
  await login(background, alice);
  await background.getByRole('link', { name: 'การแจ้งเตือน', exact: true }).click();
  await background.getByRole('heading', { name: 'การแจ้งเตือน', exact: true }).waitFor();
  await background.waitForLoadState('networkidle');
  await login(active, bob);
  await background.getByRole('heading', { name: 'การแจ้งเตือน', exact: true }).waitFor();
  const before = suspended.requests.length;
  await background.getByRole('button', { name: 'รีเฟรช', exact: true }).evaluate(button => button.click());
  await replaced(background); await signedIn(active, bob);
  assert.ok(suspended.requests.slice(before).filter(r => r.page === background).every(r => r.token !== tokens[bob]), 'an old screen must never send the winning account token');
  assert.equal(suspended.state.logouts, 0);
  console.log('PASS: the next API call rejects a replaced session even when browser events are deferred');

  assert.deepEqual(errors, []);
  writeFileSync('test-results/auth-tabs.json', JSON.stringify({ passed: true, differentAccounts: true, sameToken: true, reloadIsolation: true, privateGuest: true, separateContexts: true, stale401: true, deferredEvents: true }, null, 2));
} finally { for (const context of contexts) await context.close(); await browser.close(); }
