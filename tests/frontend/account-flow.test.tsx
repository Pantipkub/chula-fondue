import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { field, fixture, json, jwt } from './app-fixture';
import { tokenStore } from '../../frontend/src/lib/api';

let app: ReturnType<typeof fixture>;
afterEach(() => expect(app.unexpected).toEqual([]));

it('logs in through the protected-page redirect and signs out through the account menu', async () => {
  app = fixture();
  const accessToken = jwt('REPORTER');
  app.on('POST', '/auth/login', () => json({ accessToken }));
  app.on('POST', '/auth/logout', () => json({}));
  const { user } = app.open('/my');
  await screen.findByRole('heading', { name: 'เข้าสู่ระบบ', exact: true });
  await user.type(field('อีเมล'), 'reporter@example.test');
  await user.type(field('รหัสผ่าน'), 'test-input-only');
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }));
  await screen.findByRole('heading', { name: 'รายการแจ้งซ่อม', exact: true });
  expect(tokenStore.get()).toBe(accessToken);
  await user.click(screen.getByRole('button', { name: 'บัญชี reporter@example.test' }));
  await user.click(screen.getByRole('button', { name: 'ออกจากระบบ', exact: true }));
  await waitFor(() => expect(tokenStore.get()).toBeNull());
  expect(app.requests.some(request => request.path === '/auth/logout')).toBe(true);
});

it('shows an invalid-login message and allows retry without losing the email', async () => {
  app = fixture();
  app.on('POST', '/auth/login', () => json({ message: 'Invalid email or password' }, 401));
  const { user } = app.open('/login');
  await user.type(field('อีเมล'), 'wrong@example.test');
  await user.type(field('รหัสผ่าน'), 'test-input-only');
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }));
  expect((await screen.findByRole('alert')).textContent).toContain('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  expect((field('อีเมล') as HTMLInputElement).value).toBe('wrong@example.test');
  expect((screen.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }) as HTMLButtonElement).disabled).toBe(false);
});

it('submits recovery requests once, shows success without exposing account existence, and handles outages', async () => {
  app = fixture();
  let fail = true;
  app.on('POST', '/auth/forgot-password', () => fail ? json({ message: 'Unavailable' }, 503) : json({ accepted: true }));
  const { user } = app.open('/forgot-password');
  await user.type(field('อีเมล'), 'reporter@example.test');
  await user.click(screen.getByRole('button', { name: 'ส่งลิงก์' }));
  expect((await screen.findByRole('alert')).textContent).toContain('ไม่พร้อมใช้งาน');
  fail = false;
  await user.click(screen.getByRole('button', { name: 'ส่งลิงก์' }));
  await screen.findByText(/หากอีเมลนี้มีบัญชีอยู่ในระบบ/);
  expect(screen.queryByRole('button', { name: 'ส่งลิงก์' })).toBeNull();
  expect(app.requests.filter(request => request.path === '/auth/forgot-password')).toHaveLength(2);
});

it('rejects malformed reset links before any reset request', async () => {
  app = fixture();
  app.open('/reset-password?token=bad');
  expect((await screen.findByRole('alert')).textContent).toContain('ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง');
  expect(screen.queryByLabelText('รหัสผ่านใหม่')).toBeNull();
});

it('requires matching passwords, preserves reset errors, and clears the session after a successful reset', async () => {
  app = fixture();
  let fail = true;
  app.on('POST', '/auth/reset-password', () => fail ? json({ message: 'Reset link is invalid or expired' }, 400) : json({}));
  const { user } = app.open('/reset-password?token=' + 'a'.repeat(64), 'REPORTER');
  await user.type(field('รหัสผ่านใหม่'), 'new-test-input');
  await user.type(field('ยืนยันรหัสผ่านใหม่'), 'different-input');
  expect((screen.getByRole('button', { name: 'บันทึกรหัสผ่าน' }) as HTMLButtonElement).disabled).toBe(true);
  await user.clear(field('ยืนยันรหัสผ่านใหม่'));
  await user.type(field('ยืนยันรหัสผ่านใหม่'), 'new-test-input');
  await user.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่าน' }));
  expect((await screen.findByRole('alert')).textContent).toContain('หมดอายุ');
  fail = false;
  await user.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่าน' }));
  await screen.findByText(/ตั้งรหัสผ่านแล้ว กรุณาเข้าสู่ระบบ/);
  expect(tokenStore.get()).toBeNull();
});

it('changes the password with all three fields, preserves a server error, then signs out', async () => {
  app = fixture();
  let fail = true;
  app.on('POST', '/auth/password', () => fail ? json({ message: 'Current password is incorrect' }, 401) : json({}));
  const { user } = app.open('/account', 'REPORTER');
  await user.type(field('รหัสผ่านปัจจุบัน'), 'current-test-input');
  await user.type(field('รหัสผ่านใหม่'), 'new-test-input');
  await user.type(field('ยืนยันรหัสผ่านใหม่'), 'new-test-input');
  await user.click(screen.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน', exact: true }));
  expect((await screen.findByRole('alert')).textContent).toContain('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  expect(tokenStore.get()).not.toBeNull();
  fail = false;
  await user.click(screen.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน', exact: true }));
  await screen.findByRole('heading', { name: 'เข้าสู่ระบบ', exact: true });
  expect(tokenStore.get()).toBeNull();
  expect(app.requests.find(request => request.path === '/auth/password')?.body).toEqual({ currentPassword: 'current-test-input', password: 'new-test-input' });
});

it('validates registration, submits a matching pair, then pre-fills the login email', async () => {
  app = fixture();
  app.on('POST', '/auth/register', request => json({ email: request.body.email }));
  const { user } = app.open('/register');
  await user.type(field('อีเมล'), 'new@example.test');
  await user.type(field('รหัสผ่าน'), 'short');
  await user.type(field('ยืนยันรหัสผ่าน'), 'short');
  fireEvent.submit(screen.getByRole('button', { name: 'ลงทะเบียน', exact: true }).closest('form')!);
  expect((await screen.findByRole('alert')).textContent).toContain('อย่างน้อย 8');
  await user.clear(field('รหัสผ่าน'));
  await user.type(field('รหัสผ่าน'), 'new-test-input');
  await user.clear(field('ยืนยันรหัสผ่าน'));
  await user.type(field('ยืนยันรหัสผ่าน'), 'new-test-input');
  await user.click(screen.getByRole('button', { name: 'ลงทะเบียน', exact: true }));
  await screen.findByRole('heading', { name: 'เข้าสู่ระบบ', exact: true });
  expect((field('อีเมล') as HTMLInputElement).value).toBe('new@example.test');
  await screen.findByText('ลงทะเบียนแล้ว กรุณาเข้าสู่ระบบ');
});
