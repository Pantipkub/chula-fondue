// Builds the notification email: a subject, a plain-text part and an HTML part, wrapped as one MIME message.
// Pure functions only (no Nest imports), so the template can be unit-tested and previewed on its own.
// HTML email rules: tables + inline styles, no external CSS/JS/fonts, max width 600px, every user value escaped.

export interface EmailEvent {
  eventId: string;
  ticketId: string;
  recipientEmail: string;
  status: string;
  description: string;
  fromStatus?: string;
  reporterEmail?: string;
  reporterId?: string;
  category?: string;
  location?: string;
  departmentName?: string;
  reason?: string;
  note?: string;
  changedAt?: string;
  photoUrls?: string[];
  completionPhotoUrls?: string[];
}

type Audience = 'reporter' | 'department';
interface Tone { bg: string; fg: string }

const BRAND = '#A85565';
const INK = '#3A2A2D';
const MUTED = '#7D676A';
const LINE = '#F0DCDC';
const CANVAS = '#FFF8F6';
const FONT = "'IBM Plex Sans Thai','Leelawadee UI','Thonburi',Tahoma,Arial,sans-serif";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  SUBMITTED: { label: 'รอรับเรื่อง', tone: { bg: '#FFF9D6', fg: '#8A6A12' } },
  ASSIGNED: { label: 'รับเรื่องแล้ว', tone: { bg: '#FFDCDC', fg: '#8F4553' } },
  IN_PROGRESS: { label: 'กำลังซ่อม', tone: { bg: '#EEE6F6', fg: '#6B4E9B' } },
  RESOLVED: { label: 'รอตรวจรับ', tone: { bg: '#E9F0DE', fg: '#4F6638' } },
  CLOSED: { label: 'ปิดงาน', tone: { bg: '#F4EFEF', fg: '#6E5F61' } },
  REJECTED: { label: 'ไม่รับเรื่อง', tone: { bg: '#FBE3E0', fg: '#A63A33' } },
  CANCELLED: { label: 'ยกเลิก', tone: { bg: '#F4EFEF', fg: '#6E5F61' } },
};
const CATEGORY: Record<string, string> = {
  electrical: 'ไฟฟ้า', plumbing: 'ประปา', 'air conditioning': 'เครื่องปรับอากาศ', 'it / network': 'ไอที / เครือข่าย', building: 'อาคารสถานที่', other: 'อื่น ๆ',
};
const STEPS = ['แจ้งซ่อม', 'รับเรื่อง', 'กำลังซ่อม', 'ตรวจรับงาน', 'ปิดงาน'];
const STEP_INDEX: Record<string, number> = { SUBMITTED: 0, ASSIGNED: 1, IN_PROGRESS: 2, RESOLVED: 3, CLOSED: 4 };

export const shortId = (id: string) => '#' + id.slice(0, 8).toUpperCase();
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value);
const categoryLabel = (value = '') => CATEGORY[value.trim().toLowerCase()] ?? value;
const httpsImage = (urls?: string[]) => urls?.find((url) => /^https:\/\//i.test(url));

function formatTime(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date) + ' น.';
}

// Who this copy is for decides the wording. Ticket Service sends assignment, reopening and
// cancellation to the department, rejection to both sides, and every other change to the reporter.
function audienceOf(event: EmailEvent): Audience {
  if (event.status === 'ASSIGNED' || event.status === 'CANCELLED') return 'department';
  if (event.status === 'IN_PROGRESS' && event.fromStatus === 'RESOLVED') return 'department';
  if (event.status === 'REJECTED' && event.reporterEmail &&
      event.recipientEmail.toLowerCase() !== event.reporterEmail.toLowerCase()) return 'department';
  return 'reporter';
}

function copyFor(event: EmailEvent, audience: Audience) {
  const autoClosed = event.status === 'CLOSED' && /automatic/i.test(event.note ?? '');
  const reopened = event.status === 'IN_PROGRESS' && event.fromStatus === 'RESOLVED';
  if (audience === 'department') {
    if (event.status === 'ASSIGNED') return { title: 'มีงานแจ้งซ่อมใหม่ถึงหน่วยงานของคุณ', lead: 'กรุณาตรวจสอบรายละเอียด และกด “เริ่มซ่อม” เมื่อช่างเข้าดำเนินการ' };
    if (reopened) return { title: 'ผู้แจ้งส่งงานกลับให้แก้ไข', lead: 'ผู้แจ้งตรวจหน้างานแล้วยังพบปัญหา งานกลับมาอยู่ในสถานะกำลังซ่อม' };
    if (event.status === 'CANCELLED') return { title: 'ผู้แจ้งยกเลิกการแจ้งซ่อม', lead: 'ไม่ต้องดำเนินการต่อสำหรับงานนี้' };
    return { title: 'ผู้ดูแลระบบยกเลิกงานนี้', lead: 'งานนี้ไม่อยู่ในขอบเขตงานซ่อม ไม่ต้องดำเนินการต่อ' };
  }
  switch (event.status) {
    case 'IN_PROGRESS': return { title: 'ช่างเริ่มซ่อมแล้ว', lead: 'หน่วยงานที่รับผิดชอบกำลังดำเนินการตามที่คุณแจ้ง' };
    case 'RESOLVED': return { title: 'ซ่อมเสร็จแล้ว กรุณาตรวจรับงาน', lead: 'กรุณาตรวจหน้างาน แล้วกด “ตรวจรับ” หรือ “ส่งกลับแก้ไข” หากไม่ตรวจรับภายใน 7 วัน ระบบจะปิดงานให้อัตโนมัติ' };
    case 'CLOSED': return { title: 'ปิดงานเรียบร้อย', lead: autoClosed ? 'ระบบปิดงานให้อัตโนมัติ เนื่องจากครบ 7 วันหลังซ่อมเสร็จ' : 'ขอบคุณที่ตรวจรับงาน' };
    case 'REJECTED': return { title: 'ไม่รับเรื่องแจ้งซ่อมของคุณ', lead: 'ผู้ดูแลระบบตรวจสอบแล้ว โปรดดูเหตุผลด้านล่าง' };
    default: return { title: 'สถานะงานซ่อมของคุณมีการเปลี่ยนแปลง', lead: 'เข้าสู่ระบบเพื่อดูรายละเอียด' };
  }
}

function progressHtml(status: string) {
  const current = STEP_INDEX[status];
  if (current === undefined) return '';
  const cells = STEPS.map((label, index) => {
    const done = index <= current;
    const dot = done ? BRAND : '#E6CACA';
    const text = index === current ? INK : done ? MUTED : '#B3A1A3';
    return `<td align="center" valign="top" style="width:20%;padding:0 2px;">
      <div style="height:6px;border-radius:3px;background:${dot};font-size:0;line-height:0;">&nbsp;</div>
      <div style="padding-top:6px;font:${index === current ? 600 : 400} 12px/1.4 ${FONT};color:${text};">${label}</div></td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;"><tr>${cells}</tr></table>`;
}

function row(label: string, value: string) {
  return `<tr><td valign="top" style="padding:8px 12px 8px 0;width:96px;font:400 13px/1.5 ${FONT};color:${MUTED};white-space:nowrap;">${label}</td>
    <td valign="top" style="padding:8px 0;font:500 14px/1.5 ${FONT};color:${INK};">${value}</td></tr>`;
}

export interface BuiltEmail { subject: string; text: string; html: string }

export function buildEmail(event: EmailEvent): BuiltEmail {
  const audience = audienceOf(event);
  const copy = copyFor(event, audience);
  const status = STATUS[event.status] ?? { label: event.status, tone: STATUS.CLOSED.tone };
  const id = shortId(event.ticketId);
  const when = formatTime(event.changedAt);
  const reasonShown = (event.status === 'REJECTED' || (event.status === 'IN_PROGRESS' && event.fromStatus === 'RESOLVED')) && event.reason;
  const photo = event.status === 'RESOLVED' ? httpsImage(event.completionPhotoUrls) : httpsImage(event.photoUrls);
  const description = clip(event.description ?? '', 400);

  const details = [
    row('เลขที่แจ้งซ่อม', `<span style="font-family:Consolas,Menlo,monospace;letter-spacing:.5px;">${escapeHtml(id)}</span>`),
    event.category ? row('หมวด', escapeHtml(categoryLabel(event.category))) : '',
    event.location ? row('สถานที่', escapeHtml(event.location)) : '',
    event.departmentName ? row('หน่วยงาน', escapeHtml(event.departmentName)) : '',
    description ? row('รายละเอียด', escapeHtml(description).replace(/\n/g, '<br>')) : '',
    when ? row('อัปเดตเมื่อ', escapeHtml(when)) : '',
  ].join('');

  const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(copy.title)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(`${id} · ${copy.lead}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="padding:0 4px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:36px;height:36px;border-radius:10px;background:${BRAND};text-align:center;font:700 18px/36px ${FONT};color:#fff;">F</td>
      <td style="padding-left:10px;font:700 17px/1.2 ${FONT};color:${INK};">Chula Fondue</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:20px;padding:28px 28px 24px;">
    <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${status.tone.bg};color:${status.tone.fg};font:600 12px/1.6 ${FONT};">● ${escapeHtml(status.label)}</span>
    <h1 style="margin:14px 0 8px;font:700 22px/1.35 ${FONT};color:${INK};">${escapeHtml(copy.title)}</h1>
    <p style="margin:0 0 22px;font:400 15px/1.65 ${FONT};color:${MUTED};">${escapeHtml(copy.lead)}</p>
    ${progressHtml(event.status)}
    ${reasonShown ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr>
      <td style="border-left:4px solid ${status.tone.fg};background:${status.tone.bg};border-radius:8px;padding:12px 14px;font:400 14px/1.6 ${FONT};color:${INK};">
      <strong style="color:${status.tone.fg};">เหตุผล:</strong> ${escapeHtml(clip(String(event.reason), 500))}</td></tr></table>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};">${details}</table>
    ${photo ? `<img src="${escapeHtml(photo)}" alt="รูปประกอบ" width="544" style="display:block;width:100%;max-width:544px;height:auto;border-radius:12px;margin:24px 0 0;">` : ''}
  </td></tr>
  <tr><td style="padding:18px 8px 0;text-align:center;font:400 12px/1.7 ${FONT};color:${MUTED};">
    อีเมลนี้ส่งอัตโนมัติจาก Chula Fondue กรุณาอย่าตอบกลับ<br>
    <span style="color:#B3A1A3;">อ้างอิง ${escapeHtml(event.eventId.slice(0, 8))}</span>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    copy.title, '', copy.lead, '',
    `สถานะ: ${status.label}`,
    `เลขที่แจ้งซ่อม: ${id}`,
    event.category ? `หมวด: ${categoryLabel(event.category)}` : null,
    event.location ? `สถานที่: ${event.location}` : null,
    event.departmentName ? `หน่วยงาน: ${event.departmentName}` : null,
    reasonShown ? `เหตุผล: ${event.reason}` : null,
    description ? `\nรายละเอียด:\n${description}` : null,
    when ? `\nอัปเดตเมื่อ: ${when}` : null,
    '', '— Chula Fondue (อีเมลอัตโนมัติ กรุณาอย่าตอบกลับ)',
  ].filter((line) => line !== null).join('\n');

  return { subject: `[Chula Fondue ${id}] ${copy.title}`, text, html };
}

// RFC 2045 asks for base64 lines of at most 76 characters.
const base64Lines = (value: string) => (Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
const encodedWord = (value: string) => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

/** The whole message (headers + multipart/alternative body) as Gmail's `raw` field: base64url. */
export function mimeMessage(event: EmailEvent, from: string) {
  return mimeParts(event, from, buildEmail(event));
}

export interface RecoveryEmail {
  kind: 'PASSWORD_RESET'; eventId: string; recipientEmail: string; resetUrl: string; expiresAt: string;
}
export function recoveryMessage(event: RecoveryEmail, from: string) {
  const subject = 'ตั้งรหัสผ่านใหม่ — Chula Fondue';
  const text = `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ\n\n${event.resetUrl}\n\nลิงก์ใช้ได้ครั้งเดียวและหมดอายุภายใน 30 นาที หากคุณไม่ได้ร้องขอ ให้ข้ามอีเมลนี้`;
  const html = `<div style="font-family:${FONT};max-width:600px;margin:auto;padding:24px;color:${INK}"><h1>ตั้งรหัสผ่านใหม่</h1><p>มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</p><p><a href="${escapeHtml(event.resetUrl)}">ตั้งรหัสผ่านใหม่</a></p><p>ลิงก์ใช้ได้ครั้งเดียวและหมดอายุภายใน 30 นาที หากคุณไม่ได้ร้องขอ ให้ข้ามอีเมลนี้</p></div>`;
  return mimeParts(event, from, { subject, text, html });
}
function mimeParts(event: { eventId: string; recipientEmail: string }, from: string, parts: { subject: string; text: string; html: string }) {
  if ([from, event.recipientEmail].some((value) => /[\r\n]/.test(value))) throw new Error('Invalid email header');
  const { subject, text, html } = parts;
  const boundary = `fondue-${event.eventId.replace(/[^\w-]/g, '')}`;
  return Buffer.from([
    `From: Chula Fondue <${from}>`, `To: ${event.recipientEmail}`, `Subject: ${encodedWord(subject)}`,
    `Message-ID: <${event.eventId}@chula-fondue.local>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(html),
    `--${boundary}--`, '',
  ].join('\r\n')).toString('base64url');
}
