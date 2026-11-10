import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { HistoryEntry, Ticket } from '../lib/api';
import { homeFor, useAuth } from '../lib/auth';
import { CATEGORIES, STATUS, UUID_RE, categoryOf, fmtDate, isRoutingPending, recentTickets, shortId } from '../lib/format';
import { RoutingNotice } from '../components/routing';
import { Badge, Bubble, Button, ErrorBox, HSteps, Icon, Input, Logo, Meta, Note, PasswordInput, Photo, Timeline, useLoad } from '../components/ui';

// ---------------------------------------------------------------- landing
export function Landing() {
  const nav = useNavigate();
  return (
    <>
      <section className="hero">
        <div className="stack" style={{ ['--gap' as string]: '28px' }}>
          <h1>แจ้งซ่อมออนไลน์<br /><em>ติดตามสถานะได้ทุกขั้นตอน</em></h1>
          <p className="muted hero-description">ถ่ายรูปจุดชำรุด ระบุอาคารและห้อง แล้วกดส่ง งานจะถึงหน่วยงานที่ดูแลโดยตรง พร้อมแจ้งสถานะทางอีเมลจนปิดงาน</p>
          <div className="row wrap hero-actions"><Button icon="camera" onClick={() => nav('/report')}>แจ้งซ่อม</Button><Button kind="outline" icon="search" onClick={() => nav('/track')}>ติดตามสถานะ</Button></div>
          <div className="row wrap hero-stats" style={{ ['--gap' as string]: '28px' }}>
            <div className="stat"><b>6 หมวดงาน</b><span>ส่งถึงหน่วยงานตามหมวด</span></div><span className="vbar" />
            <div className="stat"><b>7 สถานะ</b><span>รู้ว่างานอยู่ขั้นไหน</span></div><span className="vbar" />
            <div className="stat"><b>5 รูป</b><span>แนบได้ต่อการแจ้ง</span></div>
          </div>
        </div>
        <div className="hero-vis" aria-hidden>
          <div className="backdrop" />
          <div className="card float stack" style={{ left: 110, top: 70, width: 340, padding: 20, boxShadow: 'var(--shadow-lifted)', ['--gap' as string]: '12px' }}>
            <Photo />
            <div className="row between"><Badge status="IN_PROGRESS" /><span className="xs muted tid">#3F9A2C1E</span></div>
            <h3>ไฟเพดานกะพริบ ห้อง 401</h3>
            <Meta icon="pin">อาคารวิศวฯ 4 · ชั้น 4</Meta>
          </div>
          <div className="card float stack" style={{ right: 0, top: 320, width: 240, padding: 20, boxShadow: 'var(--shadow-lifted)', ['--gap' as string]: '12px' }}>
            <span className="strong small" style={{ color: 'var(--pink-800)' }}>ความคืบหน้า</span>
            {[['check', 'sage', 'แจ้งซ่อม', '09:12'], ['check', 'sage', 'ส่งต่อฝ่ายไฟฟ้า', '09:40'], ['clock', 'lilac', 'กำลังซ่อม', '10:05']].map(([i, t, a, b]) => <div key={a} className="row" style={{ ['--gap' as string]: '10px' }}><Bubble icon={i} tone={t} size={28} iconSize={14} /><div><div className="small strong">{a}</div><div className="xs muted tid">{b}</div></div></div>)}
          </div>
          <div className="card float row" style={{ left: 0, top: 440, padding: '12px 16px', boxShadow: 'var(--shadow-lifted)' }}>
            <Bubble icon="bell" size={36} iconSize={18} /><div><div className="small strong">ช่างเริ่มซ่อมแล้ว</div><div className="xs muted tid">#3F9A2C1E · 10:05</div></div>
          </div>
        </div>
      </section>
      <section className="section stack" style={{ background: '#fff', ['--gap' as string]: '40px', alignItems: 'center' }}>
        <div className="stack center" style={{ ['--gap' as string]: '8px' }}><span className="small strong" style={{ color: 'var(--pink-700)' }}>ขั้นตอนการแจ้งซ่อม</span><h2 style={{ fontSize: 30 }}>แจ้งซ่อมใน 3 ขั้นตอน</h2></div>
        <div className="cards3" style={{ width: '100%', maxWidth: 1280 }}>
          {[['01', 'camera', 'แจ้งซ่อม', 'เลือกหมวด ระบุอาคารและห้อง แนบรูปได้สูงสุด 5 รูป'], ['02', 'route', 'ส่งต่อหน่วยงาน', 'งานจะถึงหน่วยงานที่ดูแลหมวดนั้นทันที ถ้าระบุหน่วยงานไม่ได้ ผู้ดูแลระบบจะส่งต่อให้'], ['03', 'check', 'ตรวจรับงาน', 'เมื่อซ่อมเสร็จ ตรวจดูหน้างานแล้วกดตรวจรับ หรือส่งกลับให้แก้ไข']].map(([n, i, t, d]) => (
            <div key={n} className="card lg stack" style={{ ['--gap' as string]: '12px' }}><div className="row between"><Bubble icon={i} size={48} iconSize={22} /><span className="stepnum">{n}</span></div><h3>{t}</h3><p className="muted small">{d}</p></div>
          ))}
        </div>
      </section>
      <section className="section" style={{ maxWidth: 1440, margin: '0 auto' }}>
        <div className="two" style={{ gap: 24 }}>
          <div className="card lg stack" style={{ ['--gap' as string]: '12px', alignSelf: 'start' }}>
            <h2>หมวดงานซ่อม</h2><p className="muted small">เลือกหมวดให้ตรง งานจะถึงหน่วยงานได้เร็วขึ้น</p>
            <div className="row wrap">{CATEGORIES.map((c) => <span key={c.value} className="row" style={{ border: '1px solid var(--line-200)', borderRadius: 12, padding: '8px 16px 8px 8px', ['--gap' as string]: '10px' }}><Bubble icon={c.icon} tone={c.tone} size={36} iconSize={18} /><span className="strong small">{c.label}</span></span>)}</div>
          </div>
          <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
            <h2>สถานะงานซ่อม</h2>
            {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => <div key={s} className="row status-description"><span><Badge status={s} /></span><span className="muted small grow">{STATUS[s].desc}</span></div>)}
          </div>
        </div>
      </section>
      <div className="band">
        <div className="stack" style={{ ['--gap' as string]: '8px' }}><h2>พบจุดชำรุดในอาคาร</h2><p className="muted">นิสิตและบุคลากรแจ้งซ่อมได้ทั้งจากมือถือและคอมพิวเตอร์</p></div>
        <div className="row wrap"><Button kind="outline" onClick={() => nav('/login')}>เข้าสู่ระบบ</Button><Button icon="plus" onClick={() => nav('/report')}>แจ้งซ่อม</Button></div>
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
        <div className="stack" style={{ ['--gap' as string]: '14px' }}><h2 style={{ fontSize: 36, lineHeight: 1.3, color: 'var(--pink-800)', whiteSpace: 'pre-line' }}>{title}</h2><p className="muted">{sub}</p>{aside}</div>
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
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const s = await login(email, password); nav(loc.state?.from && s.role !== 'GUEST' ? loc.state.from : homeFor(s.role), { replace: true }); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <AuthFrame title={'แจ้งซ่อมออนไลน์\nติดตามสถานะได้ทันที'} sub="ดูรายการแจ้งซ่อม ตรวจรับงาน หรือส่งกลับให้แก้ไข">
      <form onSubmit={submit} className="stack" style={{ width: 'min(440px, 100%)', ['--gap' as string]: '20px' }}>
        <div className="stack" style={{ ['--gap' as string]: '4px' }}><h1>เข้าสู่ระบบ</h1><p className="muted small">ใช้อีเมลที่ลงทะเบียนไว้</p></div>
        {loc.state?.registered && <Note tone="sage" icon="check">ลงทะเบียนแล้ว กรุณาเข้าสู่ระบบ</Note>}
        {sessionNotice === 'replaced' && <div role="status"><Note>ออกจากระบบแล้ว เนื่องจากมีการเข้าสู่ระบบในแท็บอื่น กรุณาเข้าสู่ระบบอีกครั้ง</Note></div>}
        <ErrorBox error={err} />
        <Input id="email" label="อีเมล" icon="mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@chula.ac.th" />
        <div className="stack" style={{ ['--gap' as string]: '8px' }}>
          <PasswordInput id="pw" label="รหัสผ่าน" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Link to="/forgot-password" className="small" style={{ alignSelf: 'flex-end' }}>ลืมรหัสผ่าน</Link>
        </div>
        <Button block busy={busy} type="submit">เข้าสู่ระบบ</Button>
        <div className="row"><hr className="divider" /><span className="small muted">หรือ</span><hr className="divider" /></div>
        <Button kind="outline" icon="user" block type="button" onClick={async () => { if (!session) await ensureToken(); nav('/report'); }}>เข้าใช้งานแบบผู้เยี่ยมชม</Button>
        <p className="center small muted">ยังไม่มีบัญชี <Link to="/register" className="strong">ลงทะเบียน</Link></p>
        <p className="center xs muted">เจ้าหน้าที่ใช้บัญชีที่ผู้ดูแลระบบสร้างให้</p>
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
    <AuthFrame title={'ลงทะเบียน\nเพื่อแจ้งซ่อม'} sub="เมื่อมีบัญชีแล้ว คุณสามารถ"
      aside={<div className="stack" style={{ ['--gap' as string]: '10px' }}>{['แจ้งซ่อมและดูประวัติการแจ้งทั้งหมด', 'ยกเลิกได้ก่อนช่างเริ่มซ่อม', 'ตรวจรับงาน หรือส่งกลับให้แก้ไข'].map((t) => <span key={t} className="row small" style={{ ['--gap' as string]: '10px' }}><Icon name="check" size={16} />{t}</span>)}</div>}>
      <form onSubmit={submit} className="stack" style={{ width: 'min(440px, 100%)', ['--gap' as string]: '18px' }}>
        <div className="stack" style={{ ['--gap' as string]: '4px' }}><h1>ลงทะเบียน</h1><p className="muted small">ใช้อีเมลนี้เข้าสู่ระบบและรับแจ้งสถานะงาน</p></div>
        <ErrorBox error={err} />
        <Input id="email" label="อีเมล" icon="mail" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@student.chula.ac.th" />
        <PasswordInput id="pw" label="รหัสผ่าน" autoComplete="new-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <div className="row wrap" style={{ ['--gap' as string]: '16px', marginTop: -8 }}>{rule(f.password.length >= 8, 'อย่างน้อย 8 ตัวอักษร')}{rule(f.password.length > 0 && f.password.length <= 128, 'ไม่เกิน 128 ตัวอักษร')}</div>
        <PasswordInput id="pw2" label="ยืนยันรหัสผ่าน" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} error={mismatch ? 'รหัสผ่านไม่ตรงกัน' : undefined} />
        <Button block busy={busy} type="submit">ลงทะเบียน</Button>
        <p className="center small muted">มีบัญชีแล้ว <Link to="/login" className="strong">เข้าสู่ระบบ</Link></p>
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
          <div className="row"><Badge status={ticket.status} /><span className="small muted tid">{shortId(ticket.id)}</span></div>
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
      {ticket.reason && ticket.status === 'REJECTED' && <Note tone="red" icon="x">เหตุผลที่ไม่รับเรื่อง: {ticket.reason}</Note>}
      {ticket.completionPhotoUrls.length > 0 && (
        <div className="stack" style={{ ['--gap' as string]: '10px' }}><span className="strong small" style={{ color: 'var(--sage-800)' }}>รูปหลังซ่อม</span><div className="thumbs-row">{ticket.completionPhotoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 150 }}><Photo src={u} tone={i + 2} /></a>)}</div></div>
      )}
      <hr className="divider" />
      <h3>ความคืบหน้า</h3>
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
      <div className="stack center" style={{ ['--gap' as string]: '8px', alignItems: 'center' }}><Bubble icon="search" size={56} iconSize={26} /><h1>ติดตามสถานะ</h1><p className="muted">ใช้บัญชีหรือเบราว์เซอร์เดียวกับตอนแจ้งซ่อม</p></div>
      <form className="card lg stack" style={{ ['--gap' as string]: '10px' }} onSubmit={submit}>
        <div className="row track-search">
          <div className="grow"><Input id="tid" label="เลขที่แจ้งซ่อม" icon="ticket" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เช่น 3f9a2c1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f" /></div>
          <Button icon="search" type="submit">ค้นหา</Button>
        </div>
        <span className="xs muted">ดูเลขเต็ม 36 หลักได้จากหน้ายืนยันการแจ้งซ่อม</span>
      </form>
      {param && !valid && <ErrorBox error="เลขที่แจ้งซ่อมไม่ถูกต้อง กรุณากรอกเลขเต็ม 36 หลัก" />}
      {load.loading && valid && <div className="skeleton" style={{ height: 320 }} />}
      <ErrorBox error={load.error} />
      {load.data && (
        <TicketSummary ticket={load.data.ticket} history={load.data.history}>
          <RoutingNotice ticket={load.data.ticket} />
          {session?.role === 'REPORTER' && session.email === load.data.ticket.reporterEmail
            ? <Button kind="outline" icon="eye" onClick={() => nav(`/tickets/${load.data!.ticket.id}`)}>ดูในรายการแจ้งซ่อม</Button>
            : (!session || session.role === 'GUEST') && <div className="note tone-pink note-action" style={{ alignItems: 'center' }}><Icon name="info" /><span className="grow">รายการนี้ดูได้จากเบราว์เซอร์นี้เท่านั้น หากลงทะเบียนภายหลัง รายการจะไม่ย้ายไปที่บัญชี</span><Button sm onClick={() => nav('/register')}>ลงทะเบียน</Button></div>}
        </TicketSummary>
      )}
      {!param && recent.length > 0 && (
        <div className="card stack" style={{ ['--gap' as string]: '10px' }}>
          <h3>แจ้งซ่อมจากเบราว์เซอร์นี้</h3>
          {recent.map((r) => <Link key={r.id} to={`/track/${r.id}`} className="row between" style={{ padding: '10px 0', borderTop: '1px solid var(--line-200)' }}><span className="small tid">{shortId(r.id)}</span><span className="row xs muted" style={{ ['--gap' as string]: '6px' }}>{fmtDate(r.at)}<Icon name="right" size={16} /></span></Link>)}
        </div>
      )}
    </div>
  );
}
