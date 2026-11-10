import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { field, fixture, json, makeTicket, selectOption, TICKET_ID } from './app-fixture';

let app: ReturnType<typeof fixture>;
afterEach(() => expect(app.unexpected).toEqual([]));

it('filters the queue, preserves pagination in the URL and starts exactly the selected ticket', async () => {
  app = fixture();
  app.state.tickets = Array.from({ length: 25 }, (_, index) => makeTicket({ id: `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001`, status: 'ASSIGNED', departmentName: 'Facilities', description: `Light ${index}` }));
  const first = app.state.tickets[0];
  app.on('POST', `/tickets/${first.id}/start`, () => { first.status = 'IN_PROGRESS'; return json(first); });
  const { user } = app.open('/staff?status=ASSIGNED&size=10', 'STAFF');
  await screen.findByRole('table');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(11);
  await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('page')).toBe('2'));
  await user.type(field('ค้นหางาน'), 'Light 0');
  await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2));
  await user.click(screen.getByRole('button', { name: /^เริ่มซ่อม\s*#00000000$/ }));
  await screen.findByText('ไม่พบงานที่ตรงเงื่อนไข');
  expect(app.requests.filter(request => request.method === 'POST').map(request => request.path)).toEqual([`/tickets/${first.id}/start`]);
  await user.click(screen.getAllByRole('button', { name: 'ล้างตัวกรอง', exact: true })[0]);
  await screen.findByRole('table');
});

it('retains the last loaded queue on refresh failure and recovers after retry', async () => {
  app = fixture();
  app.state.tickets = [makeTicket({ status: 'ASSIGNED', departmentName: 'Facilities' })];
  const { user } = app.open('/staff', 'STAFF');
  await screen.findByRole('table');
  let fail = true;
  app.on('GET', '/tickets', () => fail ? json({ message: 'Unavailable' }, 503) : json({ tickets: [] }));
  await user.click(screen.getByRole('button', { name: 'รีเฟรช' }));
  await screen.findByText('โหลดข้อมูลใหม่ไม่สำเร็จ กำลังแสดงข้อมูลล่าสุด');
  expect(screen.getByRole('table')).toBeTruthy();
  fail = false;
  await user.click(screen.getByRole('button', { name: 'รีเฟรช' }));
  await screen.findByText('ยังไม่มีงานส่งถึงหน่วยงาน');
  expect(screen.queryByRole('table')).toBeNull();
});

it('distinguishes a failed initial load from an empty department and supports filter controls', async () => {
  app = fixture();
  let fail = true;
  app.on('GET', '/tickets', () => fail ? json({ message: 'Unavailable' }, 503) : json({ tickets: app.state.tickets }));
  const { user } = app.open('/staff', 'STAFF');
  await screen.findByRole('alert');
  expect(screen.queryByText('ยังไม่มีงานส่งถึงหน่วยงาน')).toBeNull();
  fail = false;
  app.state.tickets[0].status = 'CLOSED';
  await user.click(screen.getByRole('button', { name: 'ลองโหลดอีกครั้ง' }));
  await screen.findByText('ไม่มีงานค้าง');
  await user.click(screen.getByRole('button', { name: 'ดูงานทั้งหมด' }));
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: 'แสดงตัวกรอง' }));
  expect(screen.getByRole('button', { name: 'ซ่อนตัวกรอง' }).getAttribute('aria-expanded')).toBe('true');
  await selectOption(user, screen.getByRole('combobox', { name: 'เรียงตาม' }), 'อัปเดตล่าสุดก่อน');
  expect(new URLSearchParams(window.location.search).get('sort')).toBe('updated');
});

it('starts work, validates completion photos and submits the actual selected file', async () => {
  app = fixture();
  app.state.tickets = [makeTicket({ status: 'ASSIGNED', departmentName: 'Facilities' })];
  app.on('POST', `/tickets/${TICKET_ID}/start`, () => { app.state.tickets[0].status = 'IN_PROGRESS'; return json(app.state.tickets[0]); });
  app.on('POST', `/tickets/${TICKET_ID}/resolve`, request => {
    expect((request.init.body as FormData).getAll('photos')).toHaveLength(1);
    app.state.tickets[0].status = 'RESOLVED';
    app.state.tickets[0].completionPhotoUrls = ['https://images.example/after.png'];
    return json(app.state.tickets[0]);
  });
  const { user, container } = app.open(`/staff/tickets/${TICKET_ID}`, 'STAFF');
  await user.click(await screen.findByRole('button', { name: 'เริ่มซ่อม', exact: true }));
  await screen.findByRole('button', { name: 'ส่งงาน', exact: true });
  expect((screen.getByRole('button', { name: 'ส่งงาน', exact: true }) as HTMLButtonElement).disabled).toBe(true);
  const file = new File(['image'], 'after.png', { type: 'image/png' });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  await user.click(screen.getByRole('button', { name: 'ส่งงาน', exact: true }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'ส่งงาน', exact: true })).toBeNull());
  expect(screen.getAllByText('ส่งงานแล้ว รอผู้แจ้งตรวจรับ').length).toBeGreaterThan(0);
  expect(app.requests.filter(request => request.method === 'POST').map(request => request.path)).toEqual([`/tickets/${TICKET_ID}/start`, `/tickets/${TICKET_ID}/resolve`]);
});

it('shows a failed work transition without losing ticket details', async () => {
  app = fixture();
  app.state.tickets[0].status = 'ASSIGNED';
  app.on('POST', `/tickets/${TICKET_ID}/start`, () => json({ message: 'Stale version' }, 409));
  const { user } = app.open(`/staff/tickets/${TICKET_ID}`, 'STAFF');
  await user.click(await screen.findByRole('button', { name: 'เริ่มซ่อม', exact: true }));
  expect((await screen.findByRole('alert')).textContent).toContain('สถานะงานเปลี่ยนไปแล้ว');
  expect(screen.getByRole('heading', { name: 'ไฟทางเดินเสีย', level: 1 })).toBeTruthy();
});
