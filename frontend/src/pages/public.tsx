import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { HistoryEntry, Ticket } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { CATEGORIES, STATUS, UUID_RE, categoryOf, fmtDate, isRoutingPending, recentTickets, shortId } from '../lib/format';
import { RoutingNotice } from '../components/routing';
import { Badge, Bubble, Button, ErrorBox, HSteps, Icon, Input, Logo, Meta, Note, Photo, Timeline, useLoad } from '../components/ui';

// ---------------------------------------------------------------- landing
export function Landing() {
  const nav = useNavigate();
  return (
    <>
      <section className="hero">
        <div className="stack" style={{ ['--gap' as string]: '28px' }}>
          <span className="eyebrow"><Bubble icon="sparkles" tone="honey" size={26} iconSize={14} />ระบบแจ้งซ่อมอาคารของจุฬาฯ ในที่เดียว</span>
          <h1>เจอปัญหาในอาคาร?<br /><em>แจ้งเราได้ในไม่กี่คลิก</em></h1>
          <p className="muted hero-description">ถ่ายรูป ระบุตำแหน่ง แล้วกดส่ง ระบบจะส่งต่อให้หน่วยงานที่รับผิดชอบ และแสดงความคืบหน้าให้คุณเห็นทุกขั้นตอน — ไม่ต้องโทรตาม ไม่ต้องรอคิว</p>
          <div className="row wrap hero-actions"><Button icon="camera" onClick={() => nav('/report')}>แจ้งปัญหาตอนนี้</Button><Button kind="outline" icon="search" onClick={() => nav('/track')}>ติดตามด้วยเลขที่เรื่อง</Button></div>
          <div className="row wrap hero-stats" style={{ ['--gap' as string]: '28px' }}>
            <div className="stat"><b>1–5 รูป</b><span>แนบหลักฐานได้ทันที</span></div><span className="vbar" />
            <div className="stat"><b>7 สถานะ</b><span>รู้ว่าเรื่องอยู่ขั้นไหน</span></div><span className="vbar" />
            <div className="stat"><b>ไม่ต้องสมัคร</b><span>แจ้งแบบผู้เยี่ยมชมได้</span></div>
          </div>
        </div>
        <div className="hero-vis" aria-hidden>
          <div className="backdrop" />
          <div className="blob" style={{ width: 200, height: 200, right: 0, bottom: 20, background: 'rgba(196,211,172,.7)' }} />
          <div className="blob" style={{ width: 180, height: 180, left: 40, top: 0, background: 'rgba(216,162,162,.55)' }} />
          <div className="card float stack" style={{ left: 110, top: 70, width: 340, padding: 22, borderRadius: 24, boxShadow: 'var(--shadow-lifted)', ['--gap' as string]: '12px' }}>
            <Photo />
            <div className="row between"><Badge status="IN_PROGRESS" /><span className="xs muted">#3F9A2C1E</span></div>
            <h3>ไฟกระพริบ ห้อง 401</h3>
            <Meta icon="pin">อาคารวิศวฯ 4 · ชั้น 4</Meta>
          </div>
          <div className="card float stack" style={{ right: 0, top: 320, width: 240, padding: 20, boxShadow: 'var(--shadow-lifted)', ['--gap' as string]: '12px' }}>
            <span className="strong small" style={{ color: 'var(--pink-800)' }}>ความคืบหน้า</span>
            {[['check', 'sage', 'ส่งเรื่องแล้ว', '09:12'], ['check', 'sage', 'มอบหมายฝ่ายไฟฟ้า', '09:40'], ['clock', 'lilac', 'กำลังดำเนินการ', '10:05']].map(([i, t, a, b]) => <div key={a} className="row" style={{ ['--gap' as string]: '10px' }}><Bubble icon={i} tone={t} size={28} iconSize={14} /><div><div className="small strong">{a}</div><div className="xs muted">{b}</div></div></div>)}
          </div>
          <div className="card float row" style={{ left: 0, top: 440, padding: '14px 18px', borderRadius: 18, boxShadow: 'var(--shadow-lifted)' }}>
            <Bubble icon="bell" size={36} iconSize={18} /><div><div className="small strong">อัปเดตเรื่องของคุณ</div><div className="xs muted">ช่างเริ่มดำเนินการแล้ว</div></div>
          </div>
        </div>
      </section>
      <section className="section stack" style={{ background: '#fff', ['--gap' as string]: '40px', alignItems: 'center' }}>
        <div className="stack center" style={{ ['--gap' as string]: '8px' }}><span className="small strong" style={{ color: 'var(--pink-600)' }}>วิธีใช้งาน</span><h1>แจ้งซ่อมง่าย ๆ ใน 3 ขั้นตอน</h1></div>
        <div className="cards3" style={{ width: '100%', maxWidth: 1280 }}>
          {[['01', 'camera', 'ถ่ายรูปและบอกตำแหน่ง', 'เลือกหมวดปัญหา ระบุอาคาร/ห้อง และแนบรูปได้สูงสุด 5 รูป (ไม่เกิน 5 MB ต่อรูป)'], ['02', 'route', 'ส่งต่อหน่วยงาน', 'ระบบส่งต่ออัตโนมัติตามกฎของหมวดปัญหา และให้ผู้ดูแลตรวจสอบเรื่องที่ยังเลือกหน่วยงานไม่ได้'], ['03', 'check', 'ติดตามและยืนยันผล', 'ดูไทม์ไลน์ทุกขั้นตอน เมื่อแก้ไขเสร็จกดยืนยันปิดเรื่อง หรือขอให้แก้ไขใหม่ได้']].map(([n, i, t, d]) => (
            <div key={n} className="card lg stack" style={{ ['--gap' as string]: '14px' }}><div className="row between"><Bubble icon={i} size={52} iconSize={24} /><span style={{ fontFamily: 'var(--head)', fontWeight: 700, fontSize: 32, color: 'var(--pink-200)' }}>{n}</span></div><h3>{t}</h3><p className="muted small">{d}</p></div>
          ))}
        </div>
      </section>
      <section className="section" style={{ maxWidth: 1440, margin: '0 auto' }}>
        <div className="two" style={{ gap: 24 }}>
          <div className="card lg stack" style={{ ['--gap' as string]: '12px', alignSelf: 'start' }}>
            <h2>หมวดปัญหาที่รับแจ้ง</h2><p className="muted small">เลือกหมวดให้ตรง เรื่องจะถึงหน่วยงานได้เร็วขึ้น</p>
            <div className="row wrap">{CATEGORIES.map((c) => <span key={c.value} className="row" style={{ border: '1px solid var(--line-200)', borderRadius: 16, padding: '10px 16px 10px 10px' }}><Bubble icon={c.icon} tone={c.tone} /><span className="strong small">{c.label}</span></span>)}</div>
          </div>
          <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
            <h2>ทุกเรื่องมีสถานะชัดเจน</h2>
            {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => <div key={s} className="row status-description"><span><Badge status={s} /></span><span className="muted small grow">{STATUS[s].desc}</span></div>)}
          </div>
        </div>
      </section>
      <div className="band">
        <div className="stack" style={{ ['--gap' as string]: '8px' }}><h1 style={{ color: '#fff' }}>พร้อมแจ้งปัญหาแล้วหรือยัง?</h1><p style={{ color: 'var(--pink-100)' }}>ใช้ได้ทั้งนิสิต บุคลากร และผู้เยี่ยมชม — บนมือถือหรือคอมพิวเตอร์</p></div>
        <div className="row wrap"><Button kind="outline" onClick={() => nav('/login')}>เข้าสู่ระบบ</Button><Button kind="secondary" icon="plus" onClick={() => nav('/report')}>แจ้งปัญหาเลย</Button></div>
      </div>
      <footer className="row between wrap site-footer">
        <Logo /><span className="small muted">โครงงานวิชา Software Architecture · คณะวิศวกรรมศาสตร์ จุฬาลงกรณ์มหาวิทยาลัย</span>
      </footer>
    </>
  );
}

// ---------------------------------------------------------------- auth
export function AuthFrame({ title, sub, aside, children }: { title: string; sub: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="brand">
        <Logo />
        <div className="stack" style={{ ['--gap' as string]: '14px' }}>
          {[['RESOLVED', 'ท่อน้ำรั่วห้องน้ำชาย', 'จามจุรี 9 · ชั้น 2', 2, 0], ['IN_PROGRESS', 'แอร์ไม่เย็น ห้อง 305', 'อาคารมหิตลาธิเบศร', 1, 90], ['ASSIGNED', 'Wi-Fi หลุดบ่อย', 'หอสมุดกลาง · โซน B', 0, 30]].map(([s, t, l, tone, x]) => (
            <div key={t as string} className="mini" style={{ marginLeft: x as number }}><Photo tone={tone as number} /><div className="grow"><div className="strong small">{t}</div><div className="xs muted">{l}</div></div><Badge status={s as 'RESOLVED'} /></div>
          ))}
        </div>
        <div className="stack" style={{ ['--gap' as string]: '14px' }}><h1 style={{ fontSize: 40, color: 'var(--pink-800)', whiteSpace: 'pre-line' }}>{title}</h1><p>{sub}</p>{aside}</div>
      </div>
      <div className="form"><div className="auth-mobile-logo"><Logo /></div>{children}</div>
    </div>
  );
}

export function Login() {
  const { login, ensureToken, session, sessionNotice } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string; registered?: string } };
  const [email, setEmail] = useState(loc.state?.registered ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const s = await login(email, password); nav(loc.state?.from && s.role !== 'GUEST' ? loc.state.from : homeFor(s.role), { replace: true }); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <AuthFrame title={'ทุกปัญหาในอาคาร\nมีคนรับผิดชอบเสมอ'} sub="เข้าสู่ระบบเพื่อดูประวัติเรื่องที่แจ้ง ยืนยันผลการซ่อม หรือขอให้แก้ไขใหม่">
      <form onSubmit={submit} className="stack" style={{ width: 'min(440px, 100%)', ['--gap' as string]: '20px' }}>
        <div className="stack" style={{ ['--gap' as string]: '6px' }}><h1>เข้าสู่ระบบ</h1><p className="muted small">ใช้อีเมลที่ลงทะเบียนไว้ เพื่อดูและจัดการเรื่องที่คุณแจ้ง</p></div>
        {loc.state?.registered && <Note tone="sage" icon="check">สมัครสมาชิกเรียบร้อย เข้าสู่ระบบได้เลย</Note>}
        {sessionNotice === 'replaced' && <div role="status"><Note>ออกจากระบบแล้ว เนื่องจากมีการเข้าสู่ระบบในแท็บอื่น กรุณาเข้าสู่ระบบอีกครั้ง</Note></div>}
        <ErrorBox error={err} />
        <Input id="email" label="อีเมล" icon="mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@chula.ac.th" />
        <Input id="pw" label="รหัสผ่าน" icon="lock" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />แสดงรหัสผ่าน</label>
        <Button block busy={busy} type="submit">เข้าสู่ระบบ</Button>
        <Link to="/forgot-password" className="center small">ลืมรหัสผ่าน?</Link>
        <div className="row"><hr className="divider" /><span className="small muted">หรือ</span><hr className="divider" /></div>
        <Button kind="outline" icon="user" block type="button" onClick={async () => { if (!session) await ensureToken(); nav('/report'); }}>ดำเนินการต่อแบบผู้เยี่ยมชม</Button>
        <Note>บัญชีเจ้าหน้าที่ (Staff) และผู้ดูแลระบบ (Admin) สร้างโดยผู้ดูแลระบบเท่านั้น</Note>
        <p className="center small muted">ยังไม่มีบัญชี? <Link to="/register" className="strong">สมัครสมาชิก</Link></p>
      </form>
    </AuthFrame>
  );
}

export function Register() {
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = f.confirm.length > 0 && f.confirm !== f.password;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) return setErr('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    if (mismatch) return;
    setBusy(true); setErr('');
    try { await Api.register(f.email, f.password); nav('/login', { state: { registered: f.email } }); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const rule = (ok: boolean, t: string) => <span className="row xs" style={{ ['--gap' as string]: '6px', color: ok ? 'var(--sage-800)' : 'var(--ink-600)' }}><Icon name={ok ? 'check' : 'x'} size={14} />{t}</span>;
  return (
    <AuthFrame title={'สมัครครั้งเดียว\nติดตามได้ทุกเรื่อง'} sub="บัญชีผู้แจ้ง (Reporter) ทำได้มากกว่าผู้เยี่ยมชม"
      aside={<div className="stack" style={{ ['--gap' as string]: '10px' }}>{['ดูรายการเรื่องที่แจ้งทั้งหมดในที่เดียว', 'ยกเลิกเรื่องก่อนเจ้าหน้าที่เริ่มงาน', 'ยืนยันผลการซ่อม หรือขอแก้ไขใหม่พร้อมเหตุผล'].map((t) => <span key={t} className="row small strong"><Bubble icon="check" tone="sage" size={24} iconSize={14} />{t}</span>)}</div>}>
      <form onSubmit={submit} className="stack" style={{ width: 'min(440px, 100%)', ['--gap' as string]: '18px' }}>
        <div className="stack" style={{ ['--gap' as string]: '6px' }}><h1>สร้างบัญชีผู้แจ้ง</h1><p className="muted small">สมัครฟรี ใช้อีเมลมหาวิทยาลัยได้เลย</p></div>
        <ErrorBox error={err} />
        <Input id="email" label="อีเมล" icon="mail" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@student.chula.ac.th" />
        <Input id="pw" label="รหัสผ่าน" icon="lock" type="password" autoComplete="new-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <div className="row wrap" style={{ ['--gap' as string]: '16px', marginTop: -8 }}>{rule(f.password.length >= 8, 'อย่างน้อย 8 ตัวอักษร')}{rule(f.password.length > 0 && f.password.length <= 128, 'ไม่เกิน 128 ตัวอักษร')}</div>
        <Input id="pw2" label="ยืนยันรหัสผ่าน" icon="lock" type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} error={mismatch ? 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' : undefined} />
        <Button block busy={busy} type="submit">สมัครสมาชิก</Button>
        <p className="center small muted">มีบัญชีอยู่แล้ว? <Link to="/login" className="strong">เข้าสู่ระบบ</Link></p>
      </form>
    </AuthFrame>
  );
}

// ---------------------------------------------------------------- track (guest-friendly)
export function TicketSummary({ ticket, history, children }: { ticket: Ticket; history: HistoryEntry[]; children?: React.ReactNode }) {
  const c = categoryOf(ticket.category);
  return (
    <div className="card lg stack" style={{ ['--gap' as string]: '20px' }}>
      <div className="row wrap ticket-summary" style={{ ['--gap' as string]: '24px', alignItems: 'flex-start' }}>
        <Photo src={ticket.photoUrls[0]} className="summary-photo" alt="รูปประกอบ" />
        <div className="stack grow summary-details" style={{ ['--gap' as string]: '10px' }}>
          <div className="row"><Badge status={ticket.status} /><span className="small muted strong">{shortId(ticket.id)}</span></div>
          <h2>{ticket.description.length > 60 ? ticket.description.slice(0, 60) + '…' : ticket.description}</h2>
          <div className="row wrap" style={{ ['--gap' as string]: '20px' }}>
            <Meta icon="pin">{ticket.location}</Meta><Meta icon={c.icon}>{c.label}</Meta>
            {ticket.departmentName && <Meta icon="building">{ticket.departmentName}</Meta>}
            <Meta icon="calendar">แจ้งเมื่อ {fmtDate(ticket.createdAt)}</Meta>
          </div>
        </div>
      </div>
      <hr className="divider" />
      <HSteps status={ticket.status} />
      {ticket.reason && ticket.status === 'REJECTED' && <Note tone="red" icon="x">เหตุผลที่ปฏิเสธ: {ticket.reason}</Note>}
      {ticket.completionPhotoUrls.length > 0 && (
        <div className="stack" style={{ ['--gap' as string]: '10px' }}><span className="strong small" style={{ color: 'var(--sage-800)' }}>รูปหลังแก้ไข</span><div className="thumbs-row">{ticket.completionPhotoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 150 }}><Photo src={u} tone={i + 2} /></a>)}</div></div>
      )}
      <hr className="divider" />
      <h3>ไทม์ไลน์</h3>
      <Timeline history={history} />
      {children}
    </div>
  );
}

export function Track() {
  const { id: param } = useParams();
  const nav = useNavigate();
  const { ensureToken, session } = useAuth();
  const [q, setQ] = useState(param ?? '');
  const valid = !!param && UUID_RE.test(param);
  const load = useLoad(async () => { if (!valid) return null; await ensureToken(); return Api.history(param!); }, [param], (result) => !!result && isRoutingPending(result.ticket));
  const recent = recentTickets.list();
  const submit = (e: FormEvent) => { e.preventDefault(); const v = q.trim(); if (v) nav(`/track/${v}`); };
  return (
    <div className="page narrow">
      <div className="stack center" style={{ ['--gap' as string]: '8px', alignItems: 'center' }}><Bubble icon="search" size={56} iconSize={26} /><h1>ติดตามสถานะเรื่อง</h1><p className="muted">กรอกเลขที่เรื่องของคุณ ใช้บัญชีหรือเบราว์เซอร์เดิมที่แจ้งเรื่อง</p></div>
      <form className="card lg stack" style={{ ['--gap' as string]: '10px' }} onSubmit={submit}>
        <div className="row track-search">
          <div className="grow"><Input id="tid" label="เลขที่เรื่อง (Ticket ID)" icon="ticket" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เช่น 3f9a2c1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f" /></div>
          <Button icon="search" type="submit">ค้นหา</Button>
        </div>
        <span className="xs muted">เลขที่เรื่องเต็มอยู่ในหน้าส่งเรื่องสำเร็จ — คัดลอกเก็บไว้เพื่อใช้ติดตาม</span>
      </form>
      {param && !valid && <ErrorBox error="รูปแบบเลขที่เรื่องไม่ถูกต้อง ต้องเป็นเลขเต็ม 36 ตัวอักษร" />}
      {load.loading && valid && <div className="skeleton" style={{ height: 320 }} />}
      <ErrorBox error={load.error} />
      {load.data && (
        <TicketSummary ticket={load.data.ticket} history={load.data.history}>
          <RoutingNotice ticket={load.data.ticket} />
          {session?.role === 'REPORTER' && session.email === load.data.ticket.reporterEmail
            ? <Button kind="outline" icon="eye" onClick={() => nav(`/tickets/${load.data!.ticket.id}`)}>เปิดในเรื่องของฉัน</Button>
            : (!session || session.role === 'GUEST') && <div className="note tone-pink note-action" style={{ alignItems: 'center' }}><Icon name="heart" /><span className="grow strong">เรื่องผู้เยี่ยมชมติดตามได้ด้วยเซสชันเดิม กรุณาเก็บเซสชันนี้ไว้ การสมัครสมาชิกใหม่ไม่โอนสิทธิ์เรื่องเดิม</span><Button sm onClick={() => nav('/register')}>สมัครสมาชิก</Button></div>}
        </TicketSummary>
      )}
      {!param && recent.length > 0 && (
        <div className="card stack" style={{ ['--gap' as string]: '10px' }}>
          <h3>เรื่องที่แจ้งจากเครื่องนี้</h3>
          {recent.map((r) => <Link key={r.id} to={`/track/${r.id}`} className="row between" style={{ padding: '10px 0', borderTop: '1px solid var(--line-200)' }}><span className="strong small">{shortId(r.id)}</span><span className="xs muted">{fmtDate(r.at)}</span></Link>)}
        </div>
      )}
    </div>
  );
}
