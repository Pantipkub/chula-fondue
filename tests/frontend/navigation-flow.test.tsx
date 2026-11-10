import { screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { fixture, json, jwt } from './app-fixture';

let app: ReturnType<typeof fixture>;
afterEach(() => expect(app.unexpected).toEqual([]));

it('closes the public mobile menu on Escape, restores focus and closes it on navigation', async () => {
  app = fixture();
  const { user } = app.open('/');
  const toggle = screen.getByRole('button', { name: 'เปิดเมนูหลัก' });
  await user.click(toggle);
  expect(screen.getByRole('button', { name: 'ปิดเมนูหลัก' }).getAttribute('aria-expanded')).toBe('true');
  await user.keyboard('{Escape}');
  expect(document.activeElement).toBe(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await user.click(toggle);
  await user.click(screen.getByRole('link', { name: 'ติดตามสถานะ', exact: true }));
  await screen.findByRole('heading', { name: 'ติดตามสถานะ', exact: true });
  expect(screen.getByRole('button', { name: 'เปิดเมนูหลัก' }).getAttribute('aria-expanded')).toBe('false');
});

it('redirects a staff account away from admin routes and closes the workspace menu on Escape', async () => {
  app = fixture();
  const { user } = app.open('/admin', 'STAFF');
  await screen.findByRole('heading', { name: 'คิวงานซ่อม', exact: true });
  expect(window.location.pathname).toBe('/staff');
  const toggle = screen.getByRole('button', { name: 'เปิดเมนูเจ้าหน้าที่' });
  await user.click(toggle);
  await user.keyboard('{Escape}');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle);
});

it('enters guest mode from login with a private token and reuses an existing guest session', async () => {
  app = fixture();
  app.on('POST', '/auth/guest', () => json({ accessToken: jwt('GUEST') }));
  const { user } = app.open('/login');
  await user.click(screen.getByRole('button', { name: 'เข้าใช้งานแบบผู้เยี่ยมชม' }));
  await screen.findByRole('heading', { name: 'แจ้งซ่อม', exact: true });
  expect(localStorage.getItem('fondue.token')).toBeNull();
  expect(app.requests.filter(request => request.path === '/auth/guest')).toHaveLength(1);
  await user.click(screen.getAllByRole('button', { name: 'เข้าสู่ระบบ', exact: true })[0]);
  await screen.findByRole('heading', { name: 'เข้าสู่ระบบ', exact: true });
  await user.click(screen.getByRole('button', { name: 'เข้าใช้งานแบบผู้เยี่ยมชม' }));
  await waitFor(() => expect(window.location.pathname).toBe('/report'));
  expect(app.requests.filter(request => request.path === '/auth/guest')).toHaveLength(1);
});
