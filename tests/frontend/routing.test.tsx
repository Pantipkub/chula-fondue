import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { RoutingNotice } from '../../frontend/src/components/routing';
import { Timeline } from '../../frontend/src/components/ui';
import { describe } from '../../frontend/src/lib/format';
import type { HistoryEntry, Ticket } from '../../frontend/src/lib/api';

const ticket = { status: 'SUBMITTED', departmentName: 'Facilities', routingStatus: 'PENDING' } as Ticket;
it('announces routing progress, retries and automatic assignment through a native status region', () => {
  const { rerender } = render(<RoutingNotice ticket={ticket} />);
  expect(screen.getByRole('status').textContent).toContain('กำลังส่งต่อหน่วยงานที่รับผิดชอบ');
  rerender(<RoutingNotice ticket={{ ...ticket, routingStatus: 'RETRY', routingReason: 'SERVICE_UNAVAILABLE' }} />);
  expect(screen.getByRole('status').textContent).toContain('ระบบหน่วยงานขัดข้องชั่วคราว');
  rerender(<RoutingNotice ticket={{ ...ticket, status: 'ASSIGNED', assignmentSource: 'AUTO' }} />);
  expect(screen.getByRole('status').textContent).toContain('ส่งต่ออัตโนมัติถึง Facilities');
  rerender(<RoutingNotice ticket={{ ...ticket, status: 'CANCELLED', assignmentSource: 'AUTO' }} />);
  expect(screen.queryByRole('status')).toBeNull();
});

const history = (toStatus: HistoryEntry['toStatus'], note = '', fromStatus = 'SUBMITTED'): HistoryEntry => ({ id: 1, ticketId: 'ticket', toStatus, note, fromStatus, changedAt: '2026-11-10T01:00:00Z' });
it('keeps manual assignment, automatic routing and recategorization history distinct', () => {
  expect(describe(history('SUBMITTED', 'Automatic routing requested by admin')).title).toBe('ส่งต่ออัตโนมัติอีกครั้ง');
  expect(describe(history('SUBMITTED', 'Automatic routing needs review: NO_RULE')).title).toBe('รอผู้ดูแลส่งต่อ');
  expect(describe(history('SUBMITTED')).title).toBe('แจ้งซ่อม');
  expect(describe(history('ASSIGNED', 'Assigned to Facilities')).title).toBe('ส่งต่อหน่วยงาน');
  expect(describe(history('ASSIGNED', 'Assigned to IT', 'ASSIGNED')).title).toBe('เปลี่ยนหน่วยงาน');
  expect(describe(history('ASSIGNED', 'Automatically assigned to IT (category: Electrical; rule: id)')).title).toBe('ส่งต่ออัตโนมัติ');
  expect(describe(history('SUBMITTED', 'Category changed to Electrical')).detail).toBe('ไฟฟ้า');
});

it('attributes system, admin, reporter and staff actions correctly after removing nested conditionals', () => {
  const { rerender } = render(<Timeline history={[history('ASSIGNED', 'Automatically assigned to IT (category: Electrical; rule: id)')]} />);
  expect(screen.getByText(/ระบบ ·/)).toBeTruthy();
  rerender(<Timeline history={[history('SUBMITTED', 'Automatic routing requested by admin')]} />);
  expect(screen.getByText(/ผู้ดูแลระบบ ·/)).toBeTruthy();
  rerender(<Timeline reporterLabel="เจ้าของเรื่อง" history={[history('IN_PROGRESS', 'ยังไม่เรียบร้อย', 'RESOLVED')]} />);
  expect(screen.getByText(/เจ้าของเรื่อง ·/)).toBeTruthy();
  expect(screen.getByText('“ยังไม่เรียบร้อย”')).toBeTruthy();
  rerender(<Timeline history={[history('IN_PROGRESS', '', 'ASSIGNED')]} />);
  expect(screen.getByText(/เจ้าหน้าที่ ·/)).toBeTruthy();
});
