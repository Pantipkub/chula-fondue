import type { Ticket } from './api';
import { categoryOf, shortId } from './format';

export const ACTIVE_STATUSES = new Set(['ASSIGNED', 'IN_PROGRESS', 'RESOLVED']);

export function queuePage(params: URLSearchParams, count: number) {
  const requestedSize = Number(params.get('size'));
  const size = [10, 20, 50].includes(requestedSize) ? requestedSize : 20;
  const pageCount = Math.max(1, Math.ceil(count / size));
  const requestedPage = Number(params.get('page'));
  const page = Math.min(pageCount, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  return { size, pageCount, page };
}

export function queueCounts(tickets: Ticket[]) {
  const counts: Record<string, number> = { ACTIVE: 0, ALL: tickets.length };
  for (const ticket of tickets) {
    counts[ticket.status] = (counts[ticket.status] ?? 0) + 1;
    if (ACTIVE_STATUSES.has(ticket.status)) counts.ACTIVE++;
  }
  return counts;
}

interface QueueFilter { query: string; category: string; status: string; sort: string }
export function filterQueue(tickets: Ticket[], filter: QueueFilter) {
  const search = filter.query.trim().toLocaleLowerCase('th');
  return tickets.filter(ticket => matchesStatus(ticket, filter.status)
    && (!filter.category || ticket.category === filter.category)
    && (!search || searchable(ticket).includes(search)))
    .sort((a, b) => {
      const time = (ticket: Ticket) => Date.parse(filter.sort === 'updated' ? ticket.updatedAt : ticket.createdAt) || 0;
      const difference = filter.sort === 'oldest' ? time(a) - time(b) : time(b) - time(a);
      return difference || a.id.localeCompare(b.id);
    });
}
function matchesStatus(ticket: Ticket, status: string) {
  if (status === 'ALL') return true;
  return status === 'ACTIVE' ? ACTIVE_STATUSES.has(ticket.status) : ticket.status === status;
}
function searchable(ticket: Ticket) {
  return `${ticket.id} ${shortId(ticket.id)} ${ticket.description} ${ticket.location} ${ticket.reporterEmail} ${categoryOf(ticket.category).label}`.toLocaleLowerCase('th');
}

export function updateQueueParams(current: URLSearchParams, values: Record<string, string>, resetPage: boolean) {
  const next = new URLSearchParams(current);
  if (resetPage) next.delete('page');
  const defaults: Record<string, string> = { status: 'ACTIVE', sort: 'oldest', size: '20', page: '1' };
  for (const [key, value] of Object.entries(values)) {
    if (!value || defaults[key] === value) next.delete(key);
    else next.set(key, value);
  }
  return next;
}

export function emptyQueueCopy(total: number, filtered: boolean) {
  if (total === 0) return { title: 'ยังไม่มีงานส่งถึงหน่วยงาน', detail: 'งานใหม่จะแสดงที่นี่' };
  if (filtered) return { title: 'ไม่พบงานที่ตรงเงื่อนไข', detail: 'ลองเปลี่ยนคำค้นหรือตัวกรอง' };
  return { title: 'ไม่มีงานค้าง', detail: 'ดูงานที่ปิดแล้วได้จากตัวกรองสถานะ' };
}

export function queueResultLabel(hasData: boolean, loading: boolean, count: number, page: number, size: number) {
  if (!hasData) return loading ? 'กำลังโหลด…' : 'โหลดข้อมูลไม่สำเร็จ';
  const label = `${count.toLocaleString('th-TH')} รายการ`;
  if (count === 0) return label;
  const first = ((page - 1) * size + 1).toLocaleString('th-TH');
  const last = Math.min(page * size, count).toLocaleString('th-TH');
  return `${label} · แสดง ${first}–${last}`;
}
