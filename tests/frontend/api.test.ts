import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setUnauthorizedHandler, tokenStore } from '../../frontend/src/lib/api';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  tokenStore.set(null);
});
afterEach(() => setUnauthorizedHandler(() => {}));

describe('gateway errors retain their meaning after refactoring', () => {
  it.each([
    [401, 'Invalid email or password', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'],
    [401, 'Expired', 'กรุณาเข้าสู่ระบบอีกครั้ง'],
    [403, 'Forbidden', 'คุณไม่มีสิทธิ์ทำรายการนี้'],
    [404, 'Missing', 'ไม่พบข้อมูลที่ต้องการ'],
    [503, 'Offline', 'ระบบบางส่วนไม่พร้อมใช้งานชั่วคราว ลองอีกครั้งในอีกสักครู่'],
    [504, 'Timeout', 'ระบบตอบช้าเกินไป ลองอีกครั้งในอีกสักครู่'],
    [409, 'routing rule already exists', 'หมวดนี้เลือกหน่วยงานรับงานไว้แล้ว'],
    [409, 'Department has active routing rules', 'กรุณายกเลิกการส่งต่ออัตโนมัติที่ใช้หน่วยงานนี้ก่อน'],
    [409, 'Automatic routing is disabled', 'ระบบส่งต่ออัตโนมัติยังไม่เปิดใช้งาน'],
    [409, 'Email already exists', 'มีข้อมูลนี้อยู่แล้ว'],
    [409, 'Stale version', 'สถานะงานเปลี่ยนไปแล้ว กรุณารีเฟรชหน้า'],
    [400, 'Current password is incorrect', 'รหัสผ่านปัจจุบันไม่ถูกต้อง'],
    [400, 'Reset link is invalid or expired', 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่'],
    [400, 'password must be longer', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'],
    [400, 'File too large', 'รูปแต่ละรูปต้องไม่เกิน 5 MB'],
    [400, 'Unrecognized message', 'Unrecognized message'],
  ])('maps HTTP %i / %s', async (status, message, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message }), { status })));
    await expect(api('/tickets')).rejects.toMatchObject({ status, message: expected });
  });
});

it('adds the token, serializes JSON, and preserves caller headers', async () => {
  tokenStore.set('session-test-token');
  const fetch = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
  vi.stubGlobal('fetch', fetch);
  await expect(api('/tickets', { method: 'POST', json: { category: 'Building' }, headers: { 'Idempotency-Key': 'submission-test' } })).resolves.toEqual({ ok: true });
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('/api/tickets');
  expect(init.headers.get('Authorization')).toBe('Bearer session-test-token');
  expect(init.headers.get('Idempotency-Key')).toBe('submission-test');
  expect(init.headers.get('Content-Type')).toBe('application/json');
  expect(JSON.parse(init.body)).toEqual({ category: 'Building' });
});

it('does not sign out a newer session when an old request returns 401', async () => {
  tokenStore.set('old-session');
  const unauthorized = vi.fn();
  setUnauthorizedHandler(unauthorized);
  let complete!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { complete = resolve; })));
  const request = api('/tickets');
  const result = expect(request).rejects.toBeInstanceOf(ApiError);
  tokenStore.set('new-session');
  complete(new Response('', { status: 401 }));
  await result;
  expect(unauthorized).not.toHaveBeenCalled();
  expect(tokenStore.get()).toBe('new-session');
});

it('clears only the current non-auth session on 401', async () => {
  tokenStore.set('current-session');
  const unauthorized = vi.fn();
  setUnauthorizedHandler(unauthorized);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 401 }))));
  await expect(api('/auth/password')).rejects.toBeInstanceOf(ApiError);
  expect(unauthorized).not.toHaveBeenCalled();
  await expect(api('/tickets')).rejects.toBeInstanceOf(ApiError);
  expect(unauthorized).toHaveBeenCalledTimes(1);
});

it('handles empty/text responses and network failures', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response('text')).mockRejectedValueOnce(new Error('offline'));
  vi.stubGlobal('fetch', fetch);
  await expect(api('/notifications/x/read')).resolves.toBeNull();
  await expect(api('/text')).resolves.toBe('text');
  await expect(api('/tickets')).rejects.toMatchObject({ status: 0 });
});
