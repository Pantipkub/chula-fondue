import type { HistoryEntry, Status, Ticket } from './api';

export const STATUS: Record<Status, { label: string; tone: string; desc: string }> = {
  SUBMITTED: { label: 'รอรับเรื่อง', tone: 'honey', desc: 'ส่งแจ้งซ่อมแล้ว รอเจ้าหน้าที่รับเรื่อง' },
  ASSIGNED: { label: 'รับเรื่องแล้ว', tone: 'pink', desc: 'ส่งต่อหน่วยงานที่รับผิดชอบแล้ว รอช่างเข้าซ่อม' },
  IN_PROGRESS: { label: 'กำลังซ่อม', tone: 'lilac', desc: 'ช่างกำลังดำเนินการ' },
  RESOLVED: { label: 'รอตรวจรับ', tone: 'sage', desc: 'ซ่อมเสร็จแล้ว รอผู้แจ้งตรวจรับงาน' },
  CLOSED: { label: 'ปิดงาน', tone: 'gray', desc: 'ผู้แจ้งตรวจรับงานแล้ว' },
  REJECTED: { label: 'ไม่รับเรื่อง', tone: 'red', desc: 'ไม่อยู่ในขอบเขตงานซ่อม แจ้งเหตุผลให้ผู้แจ้งทราบแล้ว' },
  CANCELLED: { label: 'ยกเลิก', tone: 'muted', desc: 'ผู้แจ้งยกเลิกก่อนช่างเริ่มซ่อม' },
};
export const STEPS = ['แจ้งซ่อม', 'รับเรื่อง', 'กำลังซ่อม', 'ตรวจรับงาน', 'ปิดงาน'];
export const stepIndex = (s: Status) => ({ SUBMITTED: 0, ASSIGNED: 1, IN_PROGRESS: 2, RESOLVED: 3, CLOSED: 5, REJECTED: -1, CANCELLED: -1 })[s];

// Stored in English (what the API and the demo scripts send); shown in Thai.
export const CATEGORIES = [
  { value: 'Electrical', label: 'ไฟฟ้า', icon: 'zap', tone: 'honey' },
  { value: 'Plumbing', label: 'ประปา', icon: 'droplet', tone: 'sage' },
  { value: 'Air conditioning', label: 'เครื่องปรับอากาศ', icon: 'wind', tone: 'lilac' },
  { value: 'IT / Network', label: 'ไอที / เครือข่าย', icon: 'wifi', tone: 'pink' },
  { value: 'Building', label: 'อาคารสถานที่', icon: 'building', tone: 'gray' },
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
  if (s < 60) return 'เมื่อครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  return fmtShort(iso);
}

/** Turns one history row into a Thai title, an optional detail line, and an icon. */
export function describe(h: HistoryEntry) {
  const n = h.note ?? '';
  if (n.startsWith('Category changed to ')) return { title: 'เปลี่ยนหมวดงาน', detail: categoryOf(n.slice('Category changed to '.length)).label, icon: 'route', tone: 'pink' };
  switch (h.toStatus) {
    case 'SUBMITTED': return n.startsWith('Automatic routing needs review: ')
      ? { title: 'รอผู้ดูแลส่งต่อ', detail: routingReason(n.slice('Automatic routing needs review: '.length)), icon: 'info', tone: 'honey' }
      : n === 'Automatic routing requested by admin'
        ? { title: 'ส่งต่ออัตโนมัติอีกครั้ง', detail: '', icon: 'route', tone: 'pink' }
        : { title: 'แจ้งซ่อม', detail: '', icon: 'send', tone: 'honey' };
    case 'ASSIGNED': return { title: n.startsWith('Automatically assigned to ') ? 'ส่งต่ออัตโนมัติ' : h.fromStatus === 'ASSIGNED' ? 'เปลี่ยนหน่วยงาน' : 'ส่งต่อหน่วยงาน', detail: n.replace(/^Automatically assigned to (.*?) \(category:.*$/, 'ให้ $1').replace(/^Assigned to /, 'ให้ '), icon: 'route', tone: 'pink' };
    case 'IN_PROGRESS': return h.fromStatus === 'RESOLVED'
      ? { title: 'ผู้แจ้งส่งกลับแก้ไข', detail: n, icon: 'undo', tone: 'lilac', quote: true }
      : { title: 'เริ่มซ่อม', detail: '', icon: 'wrench', tone: 'lilac' };
    case 'RESOLVED': return { title: 'ซ่อมเสร็จ', detail: n.replace(/^Resolved with (\d+) completion photo\(s\)$/, 'แนบรูปหลังซ่อม $1 รูป'), icon: 'check', tone: 'sage' };
    case 'CLOSED': return { title: 'ผู้แจ้งตรวจรับงาน', detail: '', icon: 'done', tone: 'sage' };
    case 'REJECTED': return { title: 'ไม่รับเรื่อง', detail: n, icon: 'x', tone: 'red', quote: true };
    case 'CANCELLED': return { title: 'ผู้แจ้งยกเลิก', detail: '', icon: 'x', tone: 'gray' };
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
  return ({ NO_RULE: 'หมวดนี้ยังไม่ได้เลือกหน่วยงานรับงาน รอผู้ดูแลส่งต่อ', AMBIGUOUS_RULES: 'หมวดนี้มีหลายหน่วยงานรับงาน รอผู้ดูแลเลือก',
    SERVICE_UNAVAILABLE: 'ระบบหน่วยงานขัดข้องชั่วคราว จะส่งต่อให้อีกครั้งโดยอัตโนมัติ', RETRIES_EXHAUSTED: 'ส่งต่อไม่สำเร็จ รอผู้ดูแลส่งต่อ',
    INVALID_RULE: 'ตั้งค่าหน่วยงานรับงานไม่ครบ รอผู้ดูแลตรวจสอบ', AUTO_ROUTING_DISABLED: 'รอผู้ดูแลส่งต่อ' } as Record<string, string>)[reason ?? ''] ?? 'รอผู้ดูแลส่งต่อ';
}
