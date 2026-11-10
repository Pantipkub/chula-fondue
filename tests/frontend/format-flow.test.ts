import { expect, it, vi } from 'vitest';
import { ago, describe, recentTickets, routingReason, suggestDepartment } from '../../frontend/src/lib/format';
import type { HistoryEntry } from '../../frontend/src/lib/api';

it('shows appropriate relative time units and falls back to a date for older events', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  try {
    const before = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
    expect(ago(before(30))).toBe('เมื่อครู่');
    expect(ago(before(120))).toBe('2 นาทีที่แล้ว');
    expect(ago(before(7200))).toBe('2 ชั่วโมงที่แล้ว');
    expect(ago(before(172800))).toBe('2 วันที่แล้ว');
    expect(ago(before(864000))).not.toContain('ที่แล้ว');
  } finally { vi.useRealTimers(); }
});

it('describes resolution, closure, cancellation, rejection and unknown events without losing notes', () => {
  const row = (toStatus: string, note = '', fromStatus = 'SUBMITTED') => ({ toStatus, fromStatus, note } as HistoryEntry);
  expect(describe(row('IN_PROGRESS')).title).toBe('เริ่มซ่อม');
  expect(describe(row('IN_PROGRESS', 'ไฟยังดับ', 'RESOLVED'))).toMatchObject({ title: 'ผู้แจ้งส่งกลับแก้ไข', detail: 'ไฟยังดับ', quote: true });
  expect(describe(row('RESOLVED', 'Resolved with 2 completion photo(s)')).detail).toBe('แนบรูปหลังซ่อม 2 รูป');
  expect(describe(row('CLOSED')).title).toBe('ผู้แจ้งตรวจรับงาน');
  expect(describe(row('CANCELLED')).title).toBe('ผู้แจ้งยกเลิก');
  expect(describe(row('REJECTED', 'งานซ้ำ'))).toMatchObject({ title: 'ไม่รับเรื่อง', detail: 'งานซ้ำ', quote: true });
  expect(describe(row('FUTURE_STATUS', 'Original note'))).toMatchObject({ title: 'FUTURE_STATUS', detail: 'Original note' });
});

it('keeps a deduplicated list of the ten most recent reports and tolerates blocked storage', () => {
  localStorage.clear();
  for (let index = 0; index < 12; index++) recentTickets.add(String(index));
  expect(recentTickets.list()).toHaveLength(10);
  expect(recentTickets.list()[0].id).toBe('11');
  recentTickets.add('5');
  expect(recentTickets.list()[0].id).toBe('5');
  expect(recentTickets.list().filter(ticket => ticket.id === '5')).toHaveLength(1);
  localStorage.setItem('fondue.recentTickets', '{invalid');
  expect(recentTickets.list()).toEqual([]);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => recentTickets.add('new-ticket')).not.toThrow();
});

it('matches building suggestions without case sensitivity and gives a safe routing fallback', () => {
  const departments = [{ name: 'IT', buildings: ['Lab'] }, { name: 'Facilities', buildings: ['Library'] }];
  expect(suggestDepartment('LIBRARY ชั้น 2', departments)?.name).toBe('Facilities');
  expect(suggestDepartment('Unknown building', departments)).toBeUndefined();
  expect(routingReason('RETRIES_EXHAUSTED')).toContain('รอผู้ดูแลส่งต่อ');
  expect(routingReason()).toBe('รอผู้ดูแลส่งต่อ');
  expect(routingReason('FUTURE_REASON')).toBe('รอผู้ดูแลส่งต่อ');
});
