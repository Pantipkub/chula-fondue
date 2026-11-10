import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { field, fixture, json, jwt, makeTicket, TICKET_ID } from './app-fixture';

let app: ReturnType<typeof fixture>;
afterEach(() => expect(app.unexpected).toEqual([]));
const photo = () => new File(['image'], 'before.png', { type: 'image/png' });

it('requires login before a guest can submit even an empty report form', async () => {
  app = fixture();
  const { user } = app.open('/report');
  await user.click(screen.getByRole('button', { name: 'ส่งแจ้งซ่อม' }));
  const dialog = await screen.findByRole('dialog', { name: 'ต้องเข้าสู่ระบบ' });
  expect(app.requests.filter(request => request.method === 'POST')).toEqual([]);
  await user.click(within(dialog).getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }));
  await screen.findByRole('heading', { name: 'เข้าสู่ระบบ', exact: true });
});

it('requires a photo, preserves a failed submission, and retries with the same idempotency key', async () => {
  app = fixture();
  let fail = true;
  app.on('POST', '/tickets', request => {
    if (fail) return json({ message: 'Unavailable' }, 503);
    expect((request.init.body as FormData).get('category')).toBe('Plumbing');
    expect((request.init.body as FormData).get('location')).toBe('Library · Floor 2');
    return json(app.state.tickets[0]);
  });
  const { user, container } = app.open('/report', 'REPORTER');
  await user.click(screen.getByRole('radio', { name: 'ประปา', exact: true }));
  await user.type(field('รายละเอียด'), ' น้ำรั่ว ');
  await user.type(field('อาคาร'), 'Library');
  await user.type(field('ชั้น / ห้อง / จุดสังเกต'), 'Floor 2');
  await user.click(screen.getByRole('button', { name: 'ส่งแจ้งซ่อม' }));
  expect((await screen.findByRole('alert')).textContent).toContain('กรุณาแนบรูป');
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [photo()] } });
  await user.click(screen.getByRole('button', { name: 'ส่งแจ้งซ่อม' }));
  expect((await screen.findByRole('alert')).textContent).toContain('ไม่พร้อมใช้งาน');
  fail = false;
  await user.click(screen.getByRole('button', { name: 'ส่งแจ้งซ่อม' }));
  await screen.findByRole('heading', { name: 'แจ้งซ่อมเรียบร้อย' });
  const submissions = app.requests.filter(request => request.method === 'POST' && request.path === '/tickets');
  expect(submissions).toHaveLength(2);
  const keys = submissions.map(request => new Headers(request.init.headers).get('Idempotency-Key'));
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
  expect((submissions[1].init.body as FormData).get('description')).toBe('น้ำรั่ว');
  await user.click(screen.getByRole('button', { name: 'ติดตามสถานะ', exact: true }));
  await waitFor(() => expect(window.location.pathname).toBe('/tickets/' + TICKET_ID));
});

it('prevents a double-submit while the first request is still pending', async () => {
  app = fixture();
  let release!: (response: Response) => void;
  app.on('POST', '/tickets', () => new Promise(resolve => { release = resolve; }));
  const { user, container } = app.open('/report', 'REPORTER');
  await user.type(field('รายละเอียด'), 'Broken light');
  await user.type(field('อาคาร'), 'Library');
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [photo()] } });
  const form = screen.getByRole('button', { name: 'ส่งแจ้งซ่อม' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(app.requests.filter(request => request.path === '/tickets' && request.method === 'POST')).toHaveLength(1);
  await act(async () => { release(json(app.state.tickets[0])); });
  await screen.findByRole('heading', { name: 'แจ้งซ่อมเรียบร้อย' });
});

it('filters reporter history and confirms a resolved card without navigating away', async () => {
  app = fixture();
  app.state.tickets = [makeTicket({ status: 'RESOLVED' }), makeTicket({ id: 'cccccccc-0000-4000-8000-000000000001', status: 'CANCELLED', description: 'Cancelled work' })];
  app.on('POST', `/tickets/${TICKET_ID}/confirm`, () => { app.state.tickets[0].status = 'CLOSED'; return json(app.state.tickets[0]); });
  const { user, container } = app.open('/my', 'REPORTER');
  await screen.findByRole('button', { name: 'ตรวจรับ', exact: true });
  await user.type(field('ค้นหา'), 'no-match');
  await screen.findByText('ไม่มีรายการในสถานะนี้');
  await user.clear(field('ค้นหา'));
  await user.click(within(container.querySelector('.tabs')!).getByRole('button', { name: /^รอตรวจรับ/ }));
  await user.click(screen.getByRole('button', { name: 'ตรวจรับ', exact: true }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'ตรวจรับ', exact: true })).toBeNull());
  expect(window.location.pathname).toBe('/my');
  expect(app.state.tickets[0].status).toBe('CLOSED');
});

it('requires a reopen reason and preserves failed requests before retrying', async () => {
  app = fixture();
  app.state.tickets = [makeTicket({ status: 'RESOLVED', departmentName: 'Facilities', completionPhotoUrls: ['https://images.example/after.png'] })];
  let fail = true;
  app.on('POST', `/tickets/${TICKET_ID}/reopen`, request => {
    if (fail) return json({ message: 'Unavailable' }, 503);
    Object.assign(app.state.tickets[0], { status: 'IN_PROGRESS', reason: request.body.reason });
    return json(app.state.tickets[0]);
  });
  const { user } = app.open(`/tickets/${TICKET_ID}?reopen=1`, 'REPORTER');
  const dialog = await screen.findByRole('dialog', { name: 'ส่งกลับแก้ไข' });
  expect((within(dialog).getByRole('button', { name: 'ส่งกลับ', exact: true }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(within(dialog).getByRole('button', { name: 'ยังใช้งานไม่ได้', exact: true }));
  await user.type(within(dialog).getByLabelText(/^รายละเอียด/), 'ไฟยังดับ');
  await user.click(within(dialog).getByRole('button', { name: 'ส่งกลับ', exact: true }));
  await screen.findByRole('alert');
  fail = false;
  await user.click(within(dialog).getByRole('button', { name: 'ส่งกลับ', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(window.location.search).toBe('');
  expect(app.requests.filter(request => request.path.endsWith('/reopen')).at(-1)?.body).toEqual({ reason: 'ยังใช้งานไม่ได้ — ไฟยังดับ' });
});

it('requires cancellation confirmation and changes only the chosen ticket', async () => {
  app = fixture();
  app.on('DELETE', `/tickets/${TICKET_ID}`, () => { app.state.tickets[0].status = 'CANCELLED'; return json(app.state.tickets[0]); });
  const { user } = app.open('/tickets/' + TICKET_ID, 'REPORTER');
  await user.click(await screen.findByRole('button', { name: 'ยกเลิกการแจ้งซ่อม', exact: true }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ปิด', exact: true }));
  expect(app.requests.some(request => request.method === 'DELETE')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'ยกเลิกการแจ้งซ่อม', exact: true }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยืนยันยกเลิก' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(app.state.tickets[0].status).toBe('CANCELLED');
});

it('rejects malformed tracking IDs before requesting ticket data', async () => {
  app = fixture();
  const { user } = app.open('/track/bad-id');
  expect((await screen.findByRole('alert')).textContent).toContain('เลขที่แจ้งซ่อมไม่ถูกต้อง');
  await user.clear(field('เลขที่แจ้งซ่อม'));
  await user.type(field('เลขที่แจ้งซ่อม'), 'another-bad-id');
  await user.click(screen.getByRole('button', { name: 'ค้นหา', exact: true }));
  expect(app.requests).toEqual([]);
});

it('obtains a private guest token to track a valid ticket without publishing a login', async () => {
  app = fixture();
  app.on('POST', '/auth/guest', () => json({ accessToken: jwt('GUEST') }));
  app.state.tickets[0].completionPhotoUrls = ['https://images.example/after.png'];
  const { user } = app.open('/track/' + TICKET_ID);
  await screen.findByRole('heading', { name: 'ความคืบหน้า', exact: true });
  expect(localStorage.getItem('fondue.token')).toBeNull();
  expect(app.requests.filter(request => request.path === '/auth/guest')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'ลงทะเบียน', exact: true }));
  await screen.findByRole('heading', { name: 'ลงทะเบียน', exact: true });
});
