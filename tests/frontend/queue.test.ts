import { expect, it } from 'vitest';
import type { Ticket } from '../../frontend/src/lib/api';
import { emptyQueueCopy, filterQueue, queueCounts, queuePage, queueResultLabel, updateQueueParams } from '../../frontend/src/lib/staff-queue';

const make = (id: string, status: Ticket['status'], createdAt: string, category = 'Electrical'): Ticket => ({
  id, status, category, createdAt, updatedAt: createdAt, description: 'ไฟเสีย', location: 'Library', reporterEmail: 'reporter@example.test',
  photoUrls: [], completionPhotoUrls: [], departmentId: 'department', departmentName: 'Facilities', reason: '',
});
const tickets = [make('b', 'ASSIGNED', '2026-01-02'), make('a', 'IN_PROGRESS', '2026-01-01'), make('c', 'CLOSED', '2026-01-03', 'Plumbing'), make('d', 'CANCELLED', '2026-01-04')];
const filter = { query: '', category: '', status: 'ACTIVE', sort: 'oldest' };

it('counts active work without counting closed or cancelled tickets', () => {
  expect(queueCounts(tickets)).toEqual({ ACTIVE: 2, ALL: 4, ASSIGNED: 1, IN_PROGRESS: 1, CLOSED: 1, CANCELLED: 1 });
});
it('filters by active/specific/all statuses and sorts without mutating the input', () => {
  expect(filterQueue(tickets, filter).map(t => t.id)).toEqual(['a', 'b']);
  expect(filterQueue(tickets, { ...filter, status: 'ALL', sort: 'newest' }).map(t => t.id)).toEqual(['d', 'c', 'b', 'a']);
  expect(filterQueue(tickets, { ...filter, status: 'CLOSED' }).map(t => t.id)).toEqual(['c']);
  expect(tickets[0].id).toBe('b');
});
it('searches Thai category labels and handles whitespace/case in search text', () => {
  expect(filterQueue(tickets, { ...filter, query: ' ไฟฟ้า ' })).toHaveLength(2);
  expect(filterQueue(tickets, { ...filter, query: ' LIBRARY ' })).toHaveLength(2);
  expect(filterQueue(tickets, { ...filter, category: 'Plumbing', status: 'ALL' }).map(t => t.id)).toEqual(['c']);
  expect(filterQueue(tickets, { ...filter, query: 'not-present' })).toEqual([]);
});
it('sorts updates and breaks equal-date ties by ID', () => {
  const sameDate = [make('b', 'ASSIGNED', '2026-01-01'), make('a', 'ASSIGNED', '2026-01-01')];
  expect(filterQueue(sameDate, filter).map(t => t.id)).toEqual(['a', 'b']);
  expect(filterQueue([{ ...sameDate[0], updatedAt: '2026-01-05' }, sameDate[1]], { ...filter, sort: 'updated' }).map(t => t.id)).toEqual(['b', 'a']);
});
it('resets pagination on a filter change and keeps unrelated query parameters', () => {
  const current = new URLSearchParams('page=3&q=old&other=keep');
  const next = updateQueueParams(current, { q: 'new', status: 'ACTIVE', size: '20', sort: 'oldest' }, true);
  expect(next.toString()).toBe('q=new&other=keep');
  expect(current.get('page')).toBe('3');
  expect(updateQueueParams(next, { page: '2' }, false).get('page')).toBe('2');
  expect(updateQueueParams(next, { q: '' }, true).has('q')).toBe(false);
});
it('distinguishes an empty department, empty filter and completed queue', () => {
  expect(emptyQueueCopy(0, false).title).toBe('ยังไม่มีงานส่งถึงหน่วยงาน');
  expect(emptyQueueCopy(4, true).title).toBe('ไม่พบงานที่ตรงเงื่อนไข');
  expect(emptyQueueCopy(4, false).title).toBe('ไม่มีงานค้าง');
});
it('announces loading, outages, empty results and the current page range', () => {
  expect(queueResultLabel(false, true, 0, 1, 20)).toBe('กำลังโหลด…');
  expect(queueResultLabel(false, false, 0, 1, 20)).toBe('โหลดข้อมูลไม่สำเร็จ');
  expect(queueResultLabel(true, false, 0, 1, 20)).toBe('0 รายการ');
  expect(queueResultLabel(true, false, 25, 2, 20)).toBe('25 รายการ · แสดง 21–25');
});
it('clamps missing, invalid and out-of-range pagination without losing the selected page size', () => {
  expect(queuePage(new URLSearchParams(), 0)).toEqual({ size: 20, pageCount: 1, page: 1 });
  expect(queuePage(new URLSearchParams('size=10&page=9999'), 251)).toEqual({ size: 10, pageCount: 26, page: 26 });
  expect(queuePage(new URLSearchParams('size=999&page=-1'), 25)).toEqual({ size: 20, pageCount: 2, page: 1 });
});
