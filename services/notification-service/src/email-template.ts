// Builds the notification email: a subject, a plain-text part and an HTML part, wrapped as one MIME message.
// Pure functions only (no Nest imports), so the template can be unit-tested and previewed on its own.
// HTML email rules: tables + inline styles, no external CSS/JS/fonts, max width 600px, every user value escaped.

import { LOGO_PNG_BASE64 } from './logo.js';

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
const STEP_INDEX: Record<string, number> = { SUBMITTED: 0, ASSIGNED: 1, IN_PROGRESS: 2, RESOLVED: 3, CLOSED: 5 };

export const shortId = (id: string) => '#' + id.slice(0, 8).toUpperCase();
const escapeHtml = (value: string | number | null | undefined) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value);
const categoryLabel = (value = '') => CATEGORY[value.trim().toLowerCase()] ?? value;
const httpsImage = (urls?: string[]) => urls?.find((url) => /^https:\/\//i.test(url));

function formatTime(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) { return ''; }
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date) + ' น.';
}

// Who this copy is for decides the wording. Ticket Service sends assignment, reopening and
// cancellation to the department, rejection to both sides, and every other change to the reporter.
function audienceOf(event: EmailEvent): Audience {
  if (event.status === 'ASSIGNED' || event.status === 'CANCELLED') { return 'department'; }
  if (event.status === 'IN_PROGRESS' && event.fromStatus === 'RESOLVED') { return 'department'; }
  if (event.status === 'REJECTED' && event.reporterEmail &&
      event.recipientEmail.toLowerCase() !== event.reporterEmail.toLowerCase()) { return 'department'; }
  return 'reporter';
}

function copyFor(event: EmailEvent, audience: Audience) {
  const autoClosed = event.status === 'CLOSED' && /automatic/i.test(event.note ?? '');
  const reopened = event.status === 'IN_PROGRESS' && event.fromStatus === 'RESOLVED';
  if (audience === 'department') {
    if (event.status === 'ASSIGNED') { return { title: 'มีงานแจ้งซ่อมใหม่ถึงหน่วยงานของคุณ', lead: 'กรุณาตรวจสอบรายละเอียด และกด “เริ่มซ่อม” เมื่อช่างเข้าดำเนินการ' }; }
    if (reopened) { return { title: 'ผู้แจ้งส่งงานกลับให้แก้ไข', lead: 'ผู้แจ้งตรวจหน้างานแล้วยังพบปัญหา งานกลับมาอยู่ในสถานะกำลังซ่อม' }; }
    if (event.status === 'CANCELLED') { return { title: 'ผู้แจ้งยกเลิกการแจ้งซ่อม', lead: 'ไม่ต้องดำเนินการต่อสำหรับงานนี้' }; }
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


// Colours mirror the web tokens in frontend/src/styles.css so the email reads as the same product.
const SAGE = '#8EA66B';
const LINE_STRONG = '#E6CACA';
const BRAND_DARK = '#7A3B45';
const LOGO_CID = 'logo@chula-fondue';
const WEB_URL = () => {
  const value = process.env.WEB_PUBLIC_URL ?? 'http://localhost:8080';
  let end = value.length;
  while (value[end - 1] === '/') end--;
  return value.slice(0, end);
};

function stepStyles(done: boolean, now: boolean) {
  if (done) return { dot: `background:${SAGE};border:1px solid ${SAGE};color:#ffffff;`, text: `color:${INK};` };
  if (now) return { dot: `background:${BRAND};border:1px solid ${BRAND};color:#ffffff;`, text: `font-weight:600;color:${BRAND_DARK};` };
  return { dot: `background:#ffffff;border:1px solid ${LINE_STRONG};color:${MUTED};`, text: `color:${MUTED};` };
}

/** Same five steps as the web's HSteps: green ticks behind, a pink current dot, outlined steps ahead. */
function stepsHtml(status: string) {
  const current = STEP_INDEX[status];
  if (current === undefined) { return ''; }
  const bar = (on: boolean, hidden = false) => {
    const color = on ? SAGE : LINE_STRONG;
    return `<td style="width:50%;padding:0;"><div style="height:2px;background:${hidden ? 'transparent' : color};font-size:0;line-height:0;">&nbsp;</div></td>`;
  };
  const cells = STEPS.map((label, i) => {
    const done = i < current;
    const now = i === current;
    const { dot, text } = stepStyles(done, now);
    return `<td width="20%" valign="top" align="center" style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${bar(i <= current, i === 0)}
        <td width="28" style="padding:0;"><div style="width:26px;height:26px;border-radius:14px;${dot}text-align:center;font:600 13px/26px ${FONT};">${done ? '&#10003;' : i + 1}</div></td>
        ${bar(i < current, i === STEPS.length - 1)}
      </tr></table>
      <div style="padding:8px 2px 0;font:400 12px/1.4 ${FONT};${text}">${label}</div></td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>${cells}</tr></table>`;
}

/** One label/value pair, styled like the web's KV block: small muted label above a medium-weight value. */
const kv = (label: string, value: string, colspan = 1) =>
  `<td valign="top" colspan="${colspan}" style="padding:0 12px 16px 0;width:${colspan === 2 ? '100%' : '50%'};">
    <div style="font:400 12px/1.5 ${FONT};color:${MUTED};">${label}</div>
    <div style="padding-top:2px;font:500 14px/1.55 ${FONT};color:${INK};">${value}</div></td>`;

const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;"><tr><td style="border-radius:10px;background:${BRAND};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:0 22px;font:500 15px/44px ${FONT};color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;

/** Page frame shared by every email: logo header, white card, footer. */
function layout({ title, preheader, card, footnote }: { title: string; preheader: string; card: string; footnote: string }) {
  return `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="padding:0 4px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="Chula Fondue" style="display:block;width:40px;height:40px;border:0;border-radius:10px;"></td>
      <td style="padding-left:10px;font:600 20px/1.2 ${FONT};color:${BRAND_DARK};">Chula Fondue</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:28px;">${card}</td></tr>
  <tr><td style="padding:18px 8px 0;text-align:center;font:400 12px/1.7 ${FONT};color:${MUTED};">${footnote}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface BuiltEmail { subject: string; text: string; html: string }

function detailsRows(event: EmailEvent, when: string, description: string) {
  const pairs = [
    event.category ? kv('หมวด', escapeHtml(categoryLabel(event.category))) : '',
    event.location ? kv('สถานที่', escapeHtml(event.location)) : '',
    event.departmentName ? kv('หน่วยงาน', escapeHtml(event.departmentName)) : '',
    when ? kv('อัปเดตเมื่อ', escapeHtml(when)) : '',
  ].filter(Boolean);
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) rows.push(`<tr>${pairs[i]}${pairs[i + 1] ?? '<td></td>'}</tr>`);
  if (description) rows.push(`<tr>${kv('รายละเอียด', escapeHtml(description).replaceAll('\n', '<br>'), 2)}</tr>`);
  return rows.join('');
}

export function buildEmail(event: EmailEvent): BuiltEmail {
  const audience = audienceOf(event);
  const copy = copyFor(event, audience);
  const status = STATUS[event.status] ?? { label: event.status, tone: STATUS.CLOSED.tone };
  const id = shortId(event.ticketId);
  const when = formatTime(event.changedAt);
  const reasonShown = (event.status === 'REJECTED' || (event.status === 'IN_PROGRESS' && event.fromStatus === 'RESOLVED')) && event.reason;
  const photo = event.status === 'RESOLVED' ? httpsImage(event.completionPhotoUrls) : httpsImage(event.photoUrls);
  const description = clip(event.description ?? '', 400);
  const link = `${WEB_URL()}${audience === 'department' ? '/staff/tickets/' : '/tickets/'}${encodeURIComponent(event.ticketId)}`;

  const rows = detailsRows(event, when, description);

  const card = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0;"><span style="display:inline-block;padding:3px 12px;border-radius:999px;background:${status.tone.bg};color:${status.tone.fg};font:500 12px/1.7 ${FONT};">&#9679;&nbsp;${escapeHtml(status.label)}</span></td>
      <td align="right" style="padding:0;font:500 13px/1.5 Consolas,Menlo,monospace;letter-spacing:.5px;color:${MUTED};">${escapeHtml(id)}</td>
    </tr></table>
    <h1 style="margin:16px 0 6px;font:600 22px/1.4 ${FONT};color:${INK};">${escapeHtml(copy.title)}</h1>
    <p style="margin:0 0 24px;font:400 15px/1.7 ${FONT};color:${MUTED};">${escapeHtml(copy.lead)}</p>
    ${stepsHtml(event.status)}
    ${reasonShown ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
      <td style="background:${status.tone.bg};border-radius:12px;padding:12px 14px;font:400 14px/1.6 ${FONT};color:${INK};">
      <strong style="font-weight:600;color:${status.tone.fg};">เหตุผล:</strong> ${escapeHtml(clip(String(event.reason), 500))}</td></tr></table>` : ''}
    <div style="height:1px;background:${LINE};font-size:0;line-height:0;margin:0 0 20px;">&nbsp;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${photo ? `<img src="${escapeHtml(photo)}" alt="รูปจุดชำรุด" width="542" style="display:block;width:100%;max-width:542px;height:auto;border-radius:12px;margin:4px 0 20px;">` : ''}
    ${button(link, 'ดูรายละเอียด')}`;

  const html = layout({
    title: copy.title, preheader: `${id} · ${copy.lead}`, card,
    footnote: `อีเมลนี้ส่งอัตโนมัติจาก Chula Fondue กรุณาอย่าตอบกลับ<br><span style="color:#B3A1A3;">อ้างอิง ${escapeHtml(event.eventId.slice(0, 8))}</span>`,
  });

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
    `\nดูรายละเอียด: ${link}`,
    '', '— Chula Fondue (อีเมลอัตโนมัติ กรุณาอย่าตอบกลับ)',
  ].filter((line) => line !== null).join('\n');

  return { subject: `[Chula Fondue ${id}] ${copy.title}`, text, html };
}

// RFC 2045 asks for base64 lines of at most 76 characters.
const wrap76 = (base64: string) => (base64.match(/.{1,76}/g) ?? []).join('\r\n');
const base64Lines = (value: string) => wrap76(Buffer.from(value, 'utf8').toString('base64'));
const encodedWord = (value: string) => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

/** The whole message (headers + multipart body with the inline logo) as Gmail's `raw` field: base64url. */
export function mimeMessage(event: EmailEvent, from: string) {
  return mimeParts(event, from, buildEmail(event));
}

export interface RecoveryEmail {
  kind: 'PASSWORD_RESET'; eventId: string; recipientEmail: string; resetUrl: string; expiresAt: string;
}
export function recoveryMessage(event: RecoveryEmail, from: string) {
  const subject = 'ตั้งรหัสผ่านใหม่ — Chula Fondue';
  const text = `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ\n\n${event.resetUrl}\n\nลิงก์ใช้ได้ครั้งเดียวและหมดอายุภายใน 30 นาที หากคุณไม่ได้ร้องขอ ให้ข้ามอีเมลนี้`;
  const card = `
    <h1 style="margin:0 0 6px;font:600 22px/1.4 ${FONT};color:${INK};">ตั้งรหัสผ่านใหม่</h1>
    <p style="margin:0 0 20px;font:400 15px/1.7 ${FONT};color:${MUTED};">มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กดปุ่มด้านล่างเพื่อตั้งรหัสผ่าน</p>
    ${button(event.resetUrl, 'ตั้งรหัสผ่านใหม่')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;"><tr>
      <td style="background:#FFF9D6;border-radius:12px;padding:12px 14px;font:400 13px/1.6 ${FONT};color:#8A6A12;">ลิงก์ใช้ได้ครั้งเดียวและหมดอายุภายใน 30 นาที หากคุณไม่ได้ร้องขอ ให้ข้ามอีเมลนี้</td>
    </tr></table>`;
  const html = layout({ title: 'ตั้งรหัสผ่านใหม่', preheader: 'ลิงก์ตั้งรหัสผ่านใหม่ ใช้ได้ภายใน 30 นาที', card, footnote: 'อีเมลนี้ส่งอัตโนมัติจาก Chula Fondue กรุณาอย่าตอบกลับ' });
  return mimeParts(event, from, { subject, text, html });
}

// multipart/related carries the logo as an inline cid: image; Gmail blocks data: URIs and may not load remote images.
function mimeParts(event: { eventId: string; recipientEmail: string }, from: string, parts: { subject: string; text: string; html: string }) {
  if ([from, event.recipientEmail].some((value) => /[\r\n]/.test(value))) { throw new Error('Invalid email header'); }
  const { subject, text, html } = parts;
  const id = event.eventId.replace(/[^\w-]/g, '');
  const related = `fondue-rel-${id}`;
  const alternative = `fondue-${id}`;
  return Buffer.from([
    `From: Chula Fondue <${from}>`, `To: ${event.recipientEmail}`, `Subject: ${encodedWord(subject)}`,
    `Message-ID: <${event.eventId}@chula-fondue.local>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${related}"; type="multipart/alternative"`, '',
    `--${related}`, `Content-Type: multipart/alternative; boundary="${alternative}"`, '',
    `--${alternative}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(text),
    `--${alternative}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(html),
    `--${alternative}--`, '',
    `--${related}`, 'Content-Type: image/png; name="chula-fondue.png"', 'Content-Transfer-Encoding: base64',
    `Content-ID: <${LOGO_CID}>`, 'Content-Disposition: inline; filename="chula-fondue.png"', '', wrap76(LOGO_PNG_BASE64),
    `--${related}--`, '',
  ].join('\r\n')).toString('base64url');
}
