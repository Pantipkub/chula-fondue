import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { fixture, json, TICKET_ID } from './app-fixture';

let app: ReturnType<typeof fixture>;
afterEach(() => expect(app.unexpected).toEqual([]));

it.each(['REPORTER', 'STAFF', 'ADMIN'] as const)('shows the correct ticket links for %s and persists a read action', async role => {
  app = fixture();
  app.state.notifications = [{ eventId: 'event', ticketId: TICKET_ID, status: 'RESOLVED', recipientEmail: 'reporter@example.test', receivedAt: '2026-11-10T00:00:00Z', read: false, delivery: 'RECORDED' }];
  app.on('PUT', '/notifications/event/read', () => { app.state.notifications[0].read = true; return new Response(null, { status: 204 }); });
  const { user } = app.open('/notifications', role);
  const link = await screen.findByRole('link', { name: '#AAAAAAAA', exact: true });
  expect(link.getAttribute('href')).toBe(({ REPORTER: '/tickets/', STAFF: '/staff/tickets/', ADMIN: '/admin/tickets/' })[role] + TICKET_ID);
  expect(screen.getByRole('status').textContent).toContain('ยังไม่อ่าน 1 จาก 1');
  await user.click(screen.getByRole('button', { name: 'อ่านแล้ว #AAAAAAAA' }));
  await screen.findByText('อ่านแล้ว', { exact: true });
  expect(screen.getByRole('status').textContent).toContain('ยังไม่อ่าน 0 จาก 1');
  expect(app.requests.filter(request => request.method === 'PUT')).toHaveLength(1);
});

it('keeps unread notifications when an update fails and allows a retry', async () => {
  app = fixture();
  app.state.notifications = [{ eventId: 'event', ticketId: TICKET_ID, status: 'IN_PROGRESS', recipientDepartmentId: 'department', recipientEmail: 'team@example.test', receivedAt: '2026-11-10T00:00:00Z', read: false, delivery: 'RETRY' }];
  app.on('PUT', '/notifications/event/read', () => json({ message: 'Unavailable' }, 503));
  const { user } = app.open('/notifications', 'STAFF');
  await user.click(await screen.findByRole('button', { name: 'อ่านแล้ว #AAAAAAAA' }));
  expect((await screen.findByRole('alert')).textContent).toContain('ไม่พร้อมใช้งาน');
  expect(screen.getByRole('status').textContent).toContain('ยังไม่อ่าน 1');
});

it('shows an empty inbox, refreshes it, and marks unread items when following a ticket link', async () => {
  app = fixture();
  const { user } = app.open('/notifications', 'REPORTER');
  await screen.findByText('ยังไม่มีการแจ้งเตือน');
  app.state.notifications = [{ eventId: 'event', ticketId: TICKET_ID, status: 'SUBMITTED', recipientEmail: 'reporter@example.test', receivedAt: '2026-11-10T00:00:00Z', read: false, delivery: 'PENDING' }];
  app.on('PUT', '/notifications/event/read', () => new Response(null, { status: 204 }));
  await user.click(screen.getByRole('button', { name: 'รีเฟรช' }));
  fireEvent.click(await screen.findByRole('link', { name: '#AAAAAAAA', exact: true }));
  await waitFor(() => expect(window.location.pathname).toBe('/tickets/' + TICKET_ID));
  expect(app.requests.some(request => request.path === '/notifications/event/read')).toBe(true);
});
