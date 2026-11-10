// Thin client for the API Gateway. Every call goes to /api/* (proxied to the gateway by Vite or nginx).
import { tokenStore } from './session-store';
export { tokenStore } from './session-store';

export type Role = 'REPORTER' | 'GUEST' | 'ADMIN' | 'STAFF';
export type Status = 'SUBMITTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REJECTED' | 'CANCELLED';
export type RoutingStatus = 'NONE' | 'PENDING' | 'RETRY' | 'REVIEW' | 'DONE' | 'STOPPED';
export interface RoutingRule { id: string; category: string; departmentId: string; enabled: boolean }

export interface Ticket {
  id: string;
  category: string;
  location: string;
  description: string;
  photoUrls: string[];
  completionPhotoUrls: string[];
  reporterEmail: string;
  status: Status;
  departmentId: string;
  departmentName: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
  assignmentSource?: '' | 'AUTO' | 'ADMIN';
  routingRuleId?: string;
  routingStatus?: RoutingStatus;
  routingReason?: string;
}
export interface HistoryEntry { id: number; ticketId: string; fromStatus: string; toStatus: Status; note: string; changedAt: string }
export interface Department { id: string; name: string; contactEmail: string; buildings: string[]; active?: boolean }
export interface PublicUser { id: string; email: string; role: Role; departmentId: string; active: boolean }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

// Turns the gateway's error body into a short Thai message; the original text is kept for the details.
function friendly(status: number, raw: string) {
  const accountMessages: [RegExp, string][] = [
    [/Submission key was already used/i, 'ข้อมูลเปลี่ยนจากคำขอเดิม กรุณาเริ่มส่งเรื่องใหม่'],
    [/Current password is incorrect/i, 'รหัสผ่านปัจจุบันไม่ถูกต้อง'],
    [/Cannot disable your own account/i, 'ไม่สามารถปิดใช้งานบัญชีของตัวเองได้'],
    [/Cannot remove the last active admin/i, 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 บัญชี'],
    [/Department still has active staff/i, 'หน่วยงานนี้ยังมี Staff ที่ใช้งานอยู่ กรุณาย้ายหรือปิดบัญชีก่อน'],
    [/Department still has open tickets/i, 'หน่วยงานนี้ยังมีงานค้าง กรุณาย้ายงานหรือดำเนินการให้เสร็จก่อน'],
    [/does not exist or is inactive/i, 'หน่วยงานนี้ไม่มีอยู่หรือปิดใช้งานแล้ว กรุณาเลือกหน่วยงานใหม่'],
  ];
  const accountMessage = accountMessages.find(([re]) => re.test(raw));
  if (accountMessage) return accountMessage[1];
  if (status === 503) return 'ระบบบางส่วนไม่พร้อมใช้งานชั่วคราว ลองอีกครั้งในอีกสักครู่';
  if (status === 504) return 'ระบบตอบช้าเกินไป ลองอีกครั้งในอีกสักครู่';
  if (status === 401) return raw.includes('Invalid email') ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'กรุณาเข้าสู่ระบบอีกครั้ง';
  if (status === 403) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  if (status === 404) return 'ไม่พบข้อมูลที่ต้องการ';
  if (status === 409 && raw.includes('routing rule already exists')) return 'หมวดนี้มีกฎที่เปิดใช้อยู่แล้ว กรุณาแก้ไขกฎเดิม';
  if (status === 409 && raw.includes('active routing rules')) return 'กรุณาปิดหรือย้ายกฎส่งต่อที่ใช้หน่วยงานนี้ก่อนลบ';
  if (status === 409 && raw.includes('routing is disabled')) return 'ระบบส่งต่ออัตโนมัติยังไม่เปิดใช้งาน';
  if (status === 409) return raw.includes('exists') || raw.includes('already') ? 'มีข้อมูลนี้อยู่แล้ว' : 'สถานะของเรื่องเปลี่ยนไปแล้ว รีเฟรชหน้าแล้วลองใหม่';
  const known: [RegExp, string][] = [
    [/Reset link is invalid or expired/i, 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว กรุณาขอลิงก์ใหม่'],
    [/password must be longer/i, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'],
    [/email must be an email/i, 'รูปแบบอีเมลไม่ถูกต้อง'],
    [/contactEmail/i, 'กรุณากรอกอีเมลติดต่อให้ถูกต้อง'],
    [/At least one photo/i, 'ต้องแนบรูปอย่างน้อย 1 รูป'],
    [/is not a JPEG/i, 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP'],
    [/File too large/i, 'รูปแต่ละรูปต้องไม่เกิน 5 MB'],
    [/Too many files|Unexpected field/i, 'แนบรูปได้ไม่เกิน 5 รูป'],
    [/departmentId must be a UUID/i, 'กรุณาเลือกหน่วยงาน'],
    [/(category|location|description|reason).*(required|empty|missing)|Missing/i, 'กรุณากรอกข้อมูลให้ครบ'],
  ];
  const hit = known.find(([re]) => re.test(raw));
  return hit ? hit[1] : raw || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const snapshot = tokenStore.snapshot();
  const token = snapshot.token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(init.json); }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบว่า backend ทำงานอยู่');
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const raw = typeof data === 'object' && data ? [data.message].flat().join(', ') : String(data ?? '');
    if (res.status === 401 && token && !path.startsWith('/auth/') && tokenStore.isCurrent(snapshot)) onUnauthorized();
    throw new ApiError(res.status, friendly(res.status, raw));
  }
  return data as T;
}

export interface AnalyticsReport {
  total: number; resolvedCount: number; mttrHours: number | null; closedRate: number; generatedAt: string;
  byStatus: { name: string; count: number }[]; byCategory: { name: string; count: number }[];
  hotspots: { name: string; count: number }[]; daily: { date: string; count: number }[];
  byDepartment: { id: string; name: string; count: number; mttrHours: number | null }[];
}
export const Api = {
  updateUser: (id: string, body: { role?: 'REPORTER' | 'STAFF' | 'ADMIN'; departmentId?: string; active?: boolean }) => api<PublicUser>(`/auth/users/${id}`, { method: 'PUT', json: body }),
  changePassword: (currentPassword: string, password: string) => api('/auth/password', { method: 'POST', json: { currentPassword, password } }),
  forgotPassword: (email: string) => api('/auth/forgot-password', { method: 'POST', json: { email } }),
  resetPassword: (token: string, password: string) => api('/auth/reset-password', { method: 'POST', json: { token, password } }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  routingRules: () => api<RoutingRule[]>('/routing-rules'),
  createRoutingRule: (rule: Omit<RoutingRule, 'id'>) => api<RoutingRule>('/routing-rules', { method: 'POST', json: rule }),
  updateRoutingRule: (id: string, rule: Partial<Omit<RoutingRule, 'id'>>) => api<RoutingRule>(`/routing-rules/${id}`, { method: 'PUT', json: rule }),
  retryRouting: (id: string) => api<Ticket>(`/tickets/${id}/retry-routing`, { method: 'POST' }),
  users: () => api<PublicUser[]>('/auth/users'),
  analytics: (q: Record<string, string>) => api<AnalyticsReport>('/analytics?' + new URLSearchParams(q)),
  notifications: () => api<{ eventId: string; ticketId: string; status: Status; recipientEmail: string; recipientDepartmentId?: string; delivery: string; receivedAt: string; read: boolean }[]>('/notifications'),
  readNotification: (id: string) => api(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' }),
  recategorize: (id: string, category: string) => api<Ticket>(`/tickets/${id}/category`, { method: 'POST', json: { category } }),
  login: (email: string, password: string) => api<{ accessToken: string; user: PublicUser }>('/auth/login', { method: 'POST', json: { email, password } }),
  register: (email: string, password: string) => api<PublicUser>('/auth/register', { method: 'POST', json: { email, password } }),
  guest: () => api<{ accessToken: string }>('/auth/guest', { method: 'POST' }),
  createUser: (b: { email: string; password: string; role: 'STAFF' | 'ADMIN'; departmentId?: string }) => api<PublicUser>('/auth/users', { method: 'POST', json: b }),

  listTickets: (q: Record<string, string> = {}) => api<{ tickets?: Ticket[] }>(`/tickets?${new URLSearchParams(q)}`).then((r) => r.tickets ?? []),
  history: (id: string) => api<{ ticket: Ticket; history?: HistoryEntry[] }>(`/tickets/${encodeURIComponent(id)}/history`).then((r) => ({ ticket: r.ticket, history: r.history ?? [] })),
  createTicket: (form: FormData, submissionKey?: string) => api<Ticket>('/tickets', { method: 'POST', body: form, ...(submissionKey && { headers: { 'Idempotency-Key': submissionKey } }) }),
  cancel: (id: string) => api<Ticket>(`/tickets/${id}`, { method: 'DELETE' }),
  assign: (id: string, departmentId: string) => api<Ticket>(`/tickets/${id}/assign`, { method: 'POST', json: { departmentId } }),
  reject: (id: string, reason: string) => api<Ticket>(`/tickets/${id}/reject`, { method: 'POST', json: { reason } }),
  start: (id: string) => api<Ticket>(`/tickets/${id}/start`, { method: 'POST' }),
  resolve: (id: string, photos: File[]) => { const f = new FormData(); photos.forEach((p) => f.append('photos', p)); return api<Ticket>(`/tickets/${id}/resolve`, { method: 'POST', body: f }); },
  confirm: (id: string) => api<Ticket>(`/tickets/${id}/confirm`, { method: 'POST' }),
  reopen: (id: string, reason: string) => api<Ticket>(`/tickets/${id}/reopen`, { method: 'POST', json: { reason } }),

  departments: (includeInactive = false) => api<Department[]>(`/departments${includeInactive ? '?includeInactive=true' : ''}`),
  createDepartment: (d: Omit<Department, 'id'>) => api<Department>('/departments', { method: 'POST', json: d }),
  updateDepartment: (id: string, d: Partial<Omit<Department, 'id'>>) => api<Department>(`/departments/${id}`, { method: 'PUT', json: d }),
  deleteDepartment: (id: string) => api<unknown>(`/departments/${id}`, { method: 'DELETE' }),
};
