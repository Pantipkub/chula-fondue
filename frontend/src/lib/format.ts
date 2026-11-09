import type { HistoryEntry, Status, Ticket } from './api';

export const STATUS: Record<Status, { label: string; tone: string; desc: string }> = {
  SUBMITTED: { label: 'ส่งเรื่องแล้ว', tone: 'honey', desc: 'ระบบได้รับเรื่องแล้ว รอผู้ดูแลตรวจสอบ' },
  ASSIGNED: { label: 'มอบหมายแล้ว', tone: 'pink', desc: 'ส่งต่อให้หน่วยงานที่รับผิดชอบแล้ว' },
  IN_PROGRESS: { label: 'กำลังดำเนินการ', tone: 'lilac', desc: 'เจ้าหน้าที่กำลังแก้ไข' },
  RESOLVED: { label: 'แก้ไขเสร็จแล้ว', tone: 'sage', desc: 'แก้ไขเสร็จ รอผู้แจ้งยืนยันผล' },
  CLOSED: { label: 'ปิดเรื่องแล้ว', tone: 'gray', desc: 'ยืนยันแล้ว ปิดเรื่องเรียบร้อย' },
  REJECTED: { label: 'ถูกปฏิเสธ', tone: 'red', desc: 'ไม่รับเรื่อง พร้อมแจ้งเหตุผล' },
  CANCELLED: { label: 'ยกเลิกแล้ว', tone: 'muted', desc: 'ผู้แจ้งยกเลิกเอง ก่อนเริ่มดำเนินการ' },
};
export const STEPS = ['ส่งเรื่องแล้ว', 'มอบหมายหน่วยงาน', 'กำลังดำเนินการ', 'แก้ไขเสร็จ · รอยืนยัน', 'ปิดเรื่อง'];
export const stepIndex = (s: Status) => ({ SUBMITTED: 0, ASSIGNED: 1, IN_PROGRESS: 2, RESOLVED: 3, CLOSED: 5, REJECTED: -1, CANCELLED: -1 })[s];

// Stored in English (what the API and the demo scripts send); shown in Thai.
export const CATEGORIES = [
  { value: 'Electrical', label: 'ไฟฟ้า', icon: 'zap', tone: 'honey' },
  { value: 'Plumbing', label: 'ประปา', icon: 'droplet', tone: 'sage' },
  { value: 'Air conditioning', label: 'แอร์', icon: 'wind', tone: 'lilac' },
  { value: 'IT / Network', label: 'ไอที / เน็ต', icon: 'wifi', tone: 'pink' },
  { value: 'Building', label: 'อาคาร', icon: 'building', tone: 'gray' },
  { value: 'Other', label: 'อื่น ๆ', icon: 'more', tone: 'pink' },
] as const;
export const categoryOf = (v: string) => CATEGORIES.find((c) => c.value.toLowerCase() === v.toLowerCase()) ?? { value: v, label: v, icon: 'more', tone: 'pink' as const };

export const BUILDINGS = ['อาคารวิศวกรรมศาสตร์ 1', 'อาคารวิศวกรรมศาสตร์ 2', 'อาคารวิศวกรรมศาสตร์ 3', 'อาคารวิศวกรรมศาสตร์ 4', 'อาคารเจริญวิศวกรรม (วิศวฯ 4)', 'อาคารมหิตลาธิเบศร', 'อาคารจามจุรี 4', 'อาคารจามจุรี 9', 'หอสมุดกลาง', 'อาคารมหาจักรีสิรินธร'];

/** Ticket ids are UUIDs; the first 8 characters are enough to tell tickets apart on screen. */
export const shortId = (id: string) => '#' + id.slice(0, 8).toUpperCase();

const dtf = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (iso: string) => (iso ? dtf.format(new Date(iso)) : '—');
export const fmtShort = (iso: string) => (iso ? df.format(new Date(iso)) : '—');
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม. ที่แล้ว`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  return fmtShort(iso);
}

/** Turns one history row into a Thai title, an optional detail line, and an icon. */
export function describe(h: HistoryEntry) {
  const n = h.note ?? '';
  if (n.startsWith('Category changed to ')) return { title: 'เปลี่ยนหมวดหมู่', detail: categoryOf(n.slice('Category changed to '.length)).label, icon: 'route', tone: 'pink' };
  switch (h.toStatus) {
    case 'SUBMITTED': return n.startsWith('Automatic routing needs review: ')
      ? { title: 'รอผู้ดูแลตรวจสอบ', detail: routingReason(n.slice('Automatic routing needs review: '.length)), icon: 'info', tone: 'honey' }
      : n === 'Automatic routing requested by admin'
        ? { title: 'ขอให้ระบบส่งต่ออีกครั้ง', detail: '', icon: 'route', tone: 'pink' }
        : { title: 'ส่งเรื่องแล้ว', detail: '', icon: 'send', tone: 'honey' };
    case 'ASSIGNED': return { title: n.startsWith('Automatically assigned to ') ? 'ระบบมอบหมายอัตโนมัติ' : h.fromStatus === 'ASSIGNED' ? 'เปลี่ยนหน่วยงาน' : 'มอบหมายหน่วยงาน', detail: n.replace(/^Automatically assigned to (.*?) \(category:.*$/, 'ให้ $1').replace(/^Assigned to /, 'ให้ '), icon: 'route', tone: 'pink' };
    case 'IN_PROGRESS': return h.fromStatus === 'RESOLVED'
      ? { title: 'ผู้แจ้งขอให้แก้ไขใหม่', detail: n, icon: 'undo', tone: 'lilac', quote: true }
      : { title: 'เริ่มดำเนินการ', detail: '', icon: 'wrench', tone: 'lilac' };
    case 'RESOLVED': return { title: 'แก้ไขเสร็จแล้ว', detail: n.replace(/^Resolved with (\d+) completion photo\(s\)$/, 'แนบรูปหลังแก้ไข $1 รูป'), icon: 'check', tone: 'sage' };
    case 'CLOSED': return { title: 'ผู้แจ้งยืนยันผล · ปิดเรื่อง', detail: '', icon: 'heart', tone: 'sage' };
    case 'REJECTED': return { title: 'ปฏิเสธเรื่อง', detail: n, icon: 'x', tone: 'red', quote: true };
    case 'CANCELLED': return { title: 'ผู้แจ้งยกเลิกเรื่อง', detail: '', icon: 'x', tone: 'gray' };
    default: return { title: h.toStatus, detail: n, icon: 'info', tone: 'gray' };
  }
}



// Guests have no ticket list, so the browser remembers the ids it reported.
const RECENT = 'fondue.recentTickets';
export const recentTickets = {
  list: (): { id: string; at: string }[] => { try { return JSON.parse(localStorage.getItem(RECENT) || '[]'); } catch { return []; } },
  add: (id: string) => { try { const l = recentTickets.list().filter((x) => x.id !== id); localStorage.setItem(RECENT, JSON.stringify([{ id, at: new Date().toISOString() }, ...l].slice(0, 10))); } catch { /* ignore */ } },
};

/** Department whose building list matches the ticket location, used as a suggestion when assigning. */
export function suggestDepartment<T extends { buildings: string[] }>(location: string, departments: T[]) {
  const loc = location.toLowerCase();
  return departments.find((d) => d.buildings.some((b) => b && loc.includes(b.toLowerCase())));
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isRoutingPending = (t: Ticket) => t.status === 'SUBMITTED' && (t.routingStatus === 'PENDING' || t.routingStatus === 'RETRY');
export function routingReason(reason?: string) {
  return ({ NO_RULE: 'ยังไม่มีกฎส่งต่อสำหรับหมวดนี้', AMBIGUOUS_RULES: 'พบกฎที่ชี้หลายหน่วยงาน ต้องให้ผู้ดูแลเลือก',
    SERVICE_UNAVAILABLE: 'บริการหน่วยงานไม่พร้อม ระบบจะลองใหม่', RETRIES_EXHAUSTED: 'ระบบส่งต่อยังไม่สำเร็จ ให้ผู้ดูแลตรวจสอบ',
    INVALID_RULE: 'ข้อมูลกฎส่งต่อไม่สมบูรณ์ ให้ผู้ดูแลตรวจสอบ', AUTO_ROUTING_DISABLED: 'รอผู้ดูแลมอบหมาย' } as Record<string, string>)[reason ?? ''] ?? 'รอผู้ดูแลตรวจสอบและส่งต่อ';
}
