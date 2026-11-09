import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { Status, Ticket } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BUILDINGS, CATEGORIES, ago, categoryOf, fmtDate, isRoutingPending, recentTickets, shortId } from '../lib/format';
import { RoutingNotice } from '../components/routing';
import { Badge, Bubble, Button, Empty, ErrorBox, Gallery, Icon, Input, Meta, Modal, Note, Photo, PhotoPicker, Skeleton, Textarea, Timeline, VSteps, useLoad, useToast } from '../components/ui';
import { Crumb, PageHead } from '../components/layouts';

// ---------------------------------------------------------------- report form (Reporter or Guest)
export function ReportForm() {
  const { session } = useAuth();
  const nav = useNavigate();
  // Guest tickets are bound to one anonymous token and lost with it, so only signed-in reporters may submit.
  const guest = !session || session.role === 'GUEST';
  const [needLogin, setNeedLogin] = useState(false);
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [description, setDescription] = useState('');
  const [building, setBuilding] = useState('');
  const [spot, setSpot] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const location = [building.trim(), spot.trim()].filter(Boolean).join(' · ');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (guest) return setNeedLogin(true); // Enter key path
    if (!photos.length) return setErr('ต้องแนบรูปอย่างน้อย 1 รูป');
    if (!location) return setErr('กรุณาระบุสถานที่');
    setBusy(true); setErr('');
    try {
      const f = new FormData();
      f.append('category', category); f.append('location', location); f.append('description', description.trim());
      photos.forEach((p) => f.append('photos', p));
      const t = await Api.createTicket(f);
      recentTickets.add(t.id);
      nav(`/report/done/${t.id}`, { state: { ticket: t } });
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  const c = categoryOf(category);
  return (
    <form className="page" onSubmit={submit}>
      <Link to={guest ? '/' : '/my'} className="crumb"><Icon name="back" size={16} />{guest ? 'กลับหน้าหลัก' : 'เรื่องของฉัน'}</Link>
      <PageHead title="แจ้งปัญหาใหม่" sub="กรอก 3 ขั้นตอนสั้น ๆ ใช้เวลาไม่ถึง 1 นาที" />
      {guest && <div className="note tone-pink note-action" style={{ alignItems: 'center', padding: '14px 18px' }}><Icon name="info" size={20} /><div className="grow"><div className="strong">ต้องเข้าสู่ระบบก่อนส่งเรื่อง</div><div className="small">เรื่องที่แจ้งจะผูกกับบัญชีของคุณ จึงติดตามสถานะ ยืนยันผล หรือขอแก้ไขใหม่ได้จากทุกเครื่อง</div></div><Button kind="outline" sm type="button" onClick={() => nav('/login', { state: { from: '/report' } })}>เข้าสู่ระบบ</Button></div>}
      <div className="split">
        <div className="card lg stack report-fields" style={{ ['--gap' as string]: '20px' }}>
          <Sec n="1" t="ปัญหาคืออะไร" d="เลือกหมวดที่ใกล้เคียงที่สุด" />
          <div className="cat-grid" role="radiogroup" aria-label="หมวดปัญหา">
            {CATEGORIES.map((x) => (
              <button type="button" key={x.value} role="radio" aria-checked={category === x.value} className={`cat${category === x.value ? ' on' : ''}`} onClick={() => setCategory(x.value)}>
                <Bubble icon={x.icon} tone={x.tone} size={44} iconSize={22} />{x.label}{category === x.value && <span className="tick"><Icon name="check" size={12} /></span>}
              </button>
            ))}
          </div>
          <Textarea id="desc" label="รายละเอียดปัญหา" required maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="เช่น ไฟเพดานกระพริบตลอดเวลา บางหลอดดับ" help={`${description.length}/500 ตัวอักษร · อธิบายอาการ เวลาที่เกิด และความเร่งด่วน`} />
          <hr className="divider" />
          <Sec n="2" t="อยู่ที่ไหน" d="ระบุให้ละเอียด ช่างจะหาเจอเร็วขึ้น" />
          <div className="two">
            <Input id="building" label="อาคาร" required icon="building" list="buildings" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="พิมพ์หรือเลือกอาคาร" />
            <Input id="spot" label="ชั้น / ห้อง / จุดสังเกต" icon="pin" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="เช่น ชั้น 4 ห้อง 401" />
            <datalist id="buildings">{BUILDINGS.map((b) => <option key={b} value={b} />)}</datalist>
          </div>
          <hr className="divider" />
          <Sec n="3" t="แนบรูปถ่าย" d="ต้องมีอย่างน้อย 1 รูป สูงสุด 5 รูป" />
          <PhotoPicker files={photos} onChange={setPhotos} />
        </div>
        <div className="stack report-summary" style={{ ['--gap' as string]: '20px' }}>
          <div className="card stack" style={{ ['--gap' as string]: '14px' }}>
            <h3>สรุปก่อนส่ง</h3>
            {[[c.icon, 'หมวด', c.label], ['pin', 'สถานที่', location || '—'], ['image', 'รูปถ่าย', `${photos.length} รูป`], ['user', 'ผู้แจ้ง', guest ? 'ยังไม่ได้เข้าสู่ระบบ' : session!.email]].map(([i, a, b]) => (
              <div key={a} className="row"><Bubble icon={i} size={32} iconSize={16} tone="pink" /><div className="grow"><div className="xs muted">{a}</div><div className="small strong" style={{ wordBreak: 'break-word' }}>{b}</div></div></div>
            ))}
            <hr className="divider" />
            <ErrorBox error={err} />
            {/* onClick runs before the browser's required-field check, so guests see the login prompt even on an empty form. */}
            <Button icon="send" block busy={busy} type="submit" onClick={(e) => { if (guest) { e.preventDefault(); setNeedLogin(true); } }}>ส่งเรื่อง</Button>
          </div>
          <div className="note tone-honey stack" style={{ display: 'flex', flexDirection: 'column', padding: 20, borderRadius: 20, ['--gap' as string]: '10px' }}>
            <span className="row strong" style={{ ['--gap' as string]: '8px' }}><Icon name="sparkles" />เคล็ดลับให้เรื่องถึงเร็ว</span>
            {['ถ่ายรูปให้เห็นจุดที่เสียและบริเวณรอบ ๆ', 'บอกจุดสังเกต เช่น ใกล้ลิฟต์ หรือเลขโต๊ะ', 'ถ้าอันตราย (ไฟช็อต น้ำท่วม) แจ้งเจ้าหน้าที่อาคารทันทีด้วย'].map((t) => <span key={t} className="row small" style={{ ['--gap' as string]: '8px', color: 'var(--ink-900)', alignItems: 'flex-start' }}><Icon name="check" size={16} />{t}</span>)}
          </div>
        </div>
      </div>
      <Modal open={needLogin} onClose={() => setNeedLogin(false)} label="ต้องเข้าสู่ระบบ">
        <Bubble icon="lock" tone="pink" size={56} iconSize={26} />
        <div className="stack" style={{ ['--gap' as string]: '6px' }}><h2>เข้าสู่ระบบก่อนส่งเรื่อง</h2><p className="small muted">เรื่องที่แจ้งจะผูกกับบัญชีของคุณ จึงติดตามสถานะและยืนยันผลได้จากทุกเครื่อง</p></div>
        <div className="two"><Button kind="outline" type="button" onClick={() => nav('/register')}>สมัครสมาชิก</Button><Button type="button" onClick={() => nav('/login', { state: { from: '/report' } })}>เข้าสู่ระบบ</Button></div>
      </Modal>
    </form>
  );
}
const Sec = ({ n, t, d }: { n: string; t: string; d: string }) => <div className="row" style={{ ['--gap' as string]: '14px' }}><span className="secnum">{n}</span><div><h3>{t}</h3><div className="small muted">{d}</div></div></div>;

// ---------------------------------------------------------------- success
export function ReportDone() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const guest = !session || session.role === 'GUEST';
  const load = useLoad(() => Api.history(id), [id], (result) => isRoutingPending(result.ticket));
  return (
    <div className="page narrow report-done">
      <div className="card lg stack center success-card" style={{ ['--gap' as string]: '18px' }}>
        <span className="bubble tone-sage" style={{ width: 112, height: 112 }}><span className="bubble" style={{ width: 76, height: 76, background: 'var(--sage-500)', color: '#fff' }}><Icon name="check" size={40} /></span></span>
        <h1>ส่งเรื่องเรียบร้อยแล้ว!</h1>
        <p className="muted">ระบบได้รับเรื่องของคุณแล้ว ติดตามหน่วยงานที่รับผิดชอบและความคืบหน้าได้จากเลขที่เรื่องนี้</p>
        {load.data && <RoutingNotice ticket={load.data.ticket} />}
        <ErrorBox error={load.error} />
        <div className="row between ticket-id" style={{ width: '100%', padding: '16px 20px', borderRadius: 18, background: 'var(--pink-50)', border: '1px solid var(--pink-200)', textAlign: 'left' }}>
          <div className="grow"><div className="xs muted">เลขที่เรื่องของคุณ</div><div style={{ fontFamily: 'var(--head)', fontWeight: 700, fontSize: 28, color: 'var(--pink-800)' }}>{shortId(id)}</div><div className="xs muted" style={{ wordBreak: 'break-all' }}>{id}</div></div>
          <Button kind="secondary" sm icon="copy" onClick={() => navigator.clipboard?.writeText(id).then(() => toast('คัดลอกเลขที่เรื่องแล้ว'))}>คัดลอก</Button>
        </div>
        {guest && <Note tone="honey">ผู้เยี่ยมชมไม่มีหน้ารายการเรื่อง เก็บเลขเต็มด้านบนหรือบุ๊กมาร์กหน้าติดตามไว้ เครื่องนี้จะจำเรื่องที่แจ้งไว้ให้ด้วย</Note>}
        <div className="stack" style={{ width: '100%', textAlign: 'left', ['--gap' as string]: '10px' }}>
          <span className="strong small" style={{ color: 'var(--pink-800)' }}>ขั้นตอนต่อไป</span>
          {['ส่งต่อให้หน่วยงานตามกฎ หรือให้ผู้ดูแลตรวจสอบกรณีที่ต้องเลือกหน่วยงาน', 'เจ้าหน้าที่เริ่มดำเนินการ — สถานะในไทม์ไลน์จะเปลี่ยนตาม', 'เมื่อแก้ไขเสร็จ กดยืนยันผล หรือขอให้แก้ไขใหม่'].map((t, i) => <span key={t} className="row small"><span className="count" style={{ minWidth: 26, height: 26, background: 'var(--pink-100)', color: 'var(--pink-800)' }}>{i + 1}</span>{t}</span>)}
        </div>
        <div className="two" style={{ width: '100%' }}>
          <Button kind="outline" icon="plus" onClick={() => nav('/report')}>แจ้งเรื่องอื่น</Button>
          <Button icon="eye" onClick={() => nav(guest ? `/track/${id}` : `/tickets/${id}`)}>ติดตามสถานะ</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- my tickets
const TABS: [string, Status[] | null][] = [['ทั้งหมด', null], ['ส่งเรื่องแล้ว', ['SUBMITTED']], ['มอบหมายแล้ว', ['ASSIGNED']], ['กำลังดำเนินการ', ['IN_PROGRESS']], ['รอยืนยัน', ['RESOLVED']], ['ปิดแล้ว', ['CLOSED']], ['ยกเลิก/ปฏิเสธ', ['CANCELLED', 'REJECTED']]];

export function MyTickets() {
  const { session } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const load = useLoad(() => Api.listTickets({ includeCancelled: 'true' }), [], (tickets) => tickets.some(isRoutingPending));
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');
  const all = load.data ?? [];
  const n = (s: Status[]) => all.filter((t) => s.includes(t.status)).length;
  const list = useMemo(() => all.filter((t) => (!TABS[tab][1] || TABS[tab][1]!.includes(t.status)) && (!q || `${t.id} ${t.location} ${t.description}`.toLowerCase().includes(q.toLowerCase()))), [all, tab, q]);
  const confirm = async (t: Ticket) => {
    setBusyId(t.id);
    try { await Api.confirm(t.id); toast('ยืนยันผลแล้ว ปิดเรื่องเรียบร้อย'); load.reload(); } catch (x) { toast((x as Error).message, 'red'); } finally { setBusyId(''); }
  };
  return (
    <div className="page">
      <PageHead eyebrow={`สวัสดี ${session?.email.split('@')[0]}`} title="เรื่องของฉัน" sub="ติดตามทุกเรื่องที่คุณแจ้งไว้ และยืนยันผลเมื่อแก้ไขเสร็จ"><Button icon="plus" onClick={() => nav('/report')}>แจ้งปัญหาใหม่</Button></PageHead>
      <div className="kpis">
        <Kpi icon="ticket" tone="pink" n={all.filter((t) => t.status !== 'CANCELLED').length} label="เรื่องทั้งหมด" />
        <Kpi icon="wrench" tone="lilac" n={n(['ASSIGNED', 'IN_PROGRESS'])} label="กำลังดำเนินการ" />
        <Kpi icon="check" tone="honey" n={n(['RESOLVED'])} label="รอคุณยืนยันผล" hl={n(['RESOLVED']) > 0} />
        <Kpi icon="heart" tone="sage" n={n(['CLOSED'])} label="ปิดเรื่องแล้ว" />
      </div>
      <div className="row between wrap">
        <div className="tabs">{TABS.map(([l, s], i) => <button key={l} className={`tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}>{l}<span className="count">{s ? n(s) : all.length}</span></button>)}</div>
        <div style={{ width: 280 }}><Input id="q" icon="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่เรื่อง / สถานที่" aria-label="ค้นหา" /></div>
      </div>
      <ErrorBox error={load.error} />
      {load.loading && !load.data ? <div className="cards3"><Skeleton h={320} /><Skeleton h={320} /><Skeleton h={320} /></div>
        : list.length === 0 ? <div className="card"><Empty icon="ticket" title={all.length ? 'ไม่มีเรื่องในหมวดนี้' : 'ยังไม่มีเรื่องที่แจ้ง'}>{!all.length && <Button icon="plus" onClick={() => nav('/report')}>แจ้งปัญหาแรกของคุณ</Button>}</Empty></div>
        : <div className="cards3">{list.map((t, i) => (
          <TicketCard key={t.id} t={t} i={i} to={`/tickets/${t.id}`}>
            {t.status === 'RESOLVED' && (
              <div className="note tone-honey" style={{ flexDirection: 'column' }} onClick={(e) => e.preventDefault()}>
                <span className="row strong small" style={{ ['--gap' as string]: '8px' }}><Icon name="info" size={16} />แก้ไขเสร็จแล้ว รอคุณยืนยันผล</span>
                <div className="two" style={{ gap: 8, width: '100%' }}><Button kind="success" sm icon="check" busy={busyId === t.id} onClick={() => confirm(t)}>ยืนยัน</Button><Button kind="outline" sm onClick={() => nav(`/tickets/${t.id}?reopen=1`)}>ขอแก้ไขใหม่</Button></div>
              </div>
            )}
          </TicketCard>
        ))}</div>}
    </div>
  );
}
export const Kpi = ({ icon, tone, n, label, hl, sub }: { icon: string; tone: string; n: number | string; label: string; hl?: boolean; sub?: string }) => (
  <div className="card kpi" style={hl ? { background: 'var(--cream-100)', borderColor: 'var(--cream-300)' } : undefined}>
    <div className="row between"><Bubble icon={icon} tone={tone} size={44} iconSize={22} />{hl && <span className="xs strong" style={{ color: 'var(--honey-700)' }}>ต้องดำเนินการ</span>}</div>
    <div><div className="num">{n}{sub && <span className="small muted" style={{ fontFamily: 'var(--body)', fontWeight: 400 }}> {sub}</span>}</div><div className="small muted">{label}</div></div>
  </div>
);
export function TicketCard({ t, i, to, children }: { t: Ticket; i: number; to: string; children?: React.ReactNode }) {
  const c = categoryOf(t.category);
  return (
    <Link to={to} className="card tcard">
      <Photo src={t.photoUrls[0]} tone={i} />
      <div className="body">
        <div className="row between"><Badge status={t.status} /><span className="xs muted strong">{shortId(t.id)}</span></div>
        <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</h3>
        <Meta icon="pin">{t.location}</Meta>
        <div className="row between"><Meta icon={c.icon}>{c.label}</Meta><Meta icon="clock">{ago(t.updatedAt)}</Meta></div>
      </div>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- detail (cancel / confirm / reopen)
export function TicketDetail() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const load = useLoad(() => Api.history(id), [id], (result) => isRoutingPending(result.ticket));
  const [modal, setModal] = useState<'cancel' | 'reopen' | null>(sp.get('reopen') ? 'reopen' : null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const close = () => { setModal(null); setErr(''); if (sp.get('reopen')) setSp({}, { replace: true }); };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr('');
    try { await fn(); toast(msg); close(); load.reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  if (load.loading && !load.data) return <div className="page"><Skeleton h={60} /><Skeleton h={420} /></div>;
  if (load.error || !load.data) return <div className="page"><ErrorBox error={load.error ?? 'ไม่พบเรื่องนี้'} /><Link to="/my">กลับเรื่องของฉัน</Link></div>;
  const { ticket: t, history } = load.data;
  const c = categoryOf(t.category);
  return (
    <div className="page">
      <Crumb to="/my" label="เรื่องของฉัน" current={shortId(t.id)} />
      <RoutingNotice ticket={t} />
      <div className="pagehead">
        <div className="stack" style={{ ['--gap' as string]: '8px' }}><div className="row wrap"><Badge status={t.status} /><span className="small muted strong">{shortId(t.id)}</span><span className="small muted">· {fmtDate(t.createdAt)}</span></div><h1>{t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description}</h1></div>
        <div className="actions">
          {['SUBMITTED', 'ASSIGNED'].includes(t.status) && <Button kind="outline" icon="x" onClick={() => setModal('cancel')}>ยกเลิกเรื่อง</Button>}
          {t.status === 'RESOLVED' && <><Button kind="outline" icon="undo" onClick={() => setModal('reopen')}>ขอให้แก้ไขใหม่</Button><Button kind="success" icon="check" busy={busy} onClick={() => act(() => Api.confirm(t.id), 'ยืนยันผลแล้ว ปิดเรื่องเรียบร้อย')}>ยืนยันว่าแก้ไขแล้ว</Button></>}
        </div>
      </div>
      <div className="split">
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <Gallery urls={t.photoUrls} />
          <div className="card lg stack">
            <h3>รายละเอียด</h3><p style={{ lineHeight: 1.65 }}>{t.description}</p><hr className="divider" />
            <div className="two"><KV icon={c.icon} k="หมวด" v={c.label} /><KV icon="pin" k="สถานที่" v={t.location} /><KV icon="calendar" k="แจ้งเมื่อ" v={fmtDate(t.createdAt)} /><KV icon="building" k="หน่วยงานที่รับผิดชอบ" v={t.departmentName || 'รอส่งต่อหน่วยงาน'} /></div>
          </div>
          {t.completionPhotoUrls.length > 0 && (
            <div className="card lg stack" style={{ background: 'var(--sage-100)', borderColor: 'var(--sage-300)' }}>
              <div className="row"><span className="bubble" style={{ width: 40, height: 40, background: 'var(--sage-500)', color: '#fff' }}><Icon name="check" size={20} /></span><div><div className="strong" style={{ color: 'var(--sage-800)' }}>แก้ไขเสร็จแล้ว{t.departmentName ? ` · ${t.departmentName}` : ''}</div><div className="xs" style={{ color: 'var(--sage-800)' }}>รูปหลังแก้ไขที่เจ้าหน้าที่แนบมา {t.completionPhotoUrls.length} รูป</div></div></div>
              <div className="thumbs-row">{t.completionPhotoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 180 }}><Photo src={u} tone={i + 2} /></a>)}</div>
            </div>
          )}
        </div>
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <div className="card lg stack"><div className="row between"><h3>สถานะ</h3><Badge status={t.status} /></div><VSteps status={t.status} />
            {['SUBMITTED', 'ASSIGNED'].includes(t.status) && <Note>ยกเลิกได้ก่อนเจ้าหน้าที่เริ่มดำเนินการ</Note>}
            {t.status === 'RESOLVED' && <Note>ตรวจดูหน้างานแล้วกดยืนยัน หรือขอให้แก้ไขใหม่พร้อมเหตุผล</Note>}
            {t.status === 'REJECTED' && t.reason && <Note tone="red" icon="x">เหตุผล: {t.reason}</Note>}
          </div>
          <div className="card lg stack"><h3>ไทม์ไลน์</h3><Timeline history={history} reporterLabel="คุณ" /></div>
        </div>
      </div>

      <Modal open={modal === 'cancel'} onClose={close} label="ยกเลิกเรื่อง">
        <Bubble icon="alert" tone="red" size={56} iconSize={26} />
        <div className="stack" style={{ ['--gap' as string]: '6px' }}><h2>ยกเลิกเรื่องนี้?</h2><p className="muted small">เรื่องจะเปลี่ยนเป็น “ยกเลิกแล้ว” และย้อนกลับไม่ได้ หากปัญหายังอยู่ต้องแจ้งเรื่องใหม่</p></div>
        <div className="row" style={{ padding: 12, borderRadius: 16, background: 'var(--pink-50)' }}><Photo src={t.photoUrls[0]} w={64} /><div className="grow"><div className="strong small">{t.description.slice(0, 40)}</div><div className="xs muted">{shortId(t.id)} · {t.location}</div></div></div>
        <ErrorBox error={err} />
        <div className="two"><Button kind="outline" onClick={close}>ไม่ใช่ตอนนี้</Button><Button kind="danger" icon="trash" busy={busy} onClick={() => act(() => Api.cancel(t.id), 'ยกเลิกเรื่องแล้ว')}>ยืนยันยกเลิก</Button></div>
      </Modal>
      <Modal open={modal === 'reopen'} onClose={close} label="ขอให้แก้ไขใหม่">
        <div className="row" style={{ ['--gap' as string]: '14px' }}><Bubble icon="undo" size={52} iconSize={24} /><div><h2>ขอให้แก้ไขใหม่</h2><div className="small muted">{shortId(t.id)} · {t.location}</div></div></div>
        <p className="muted small">บอกเราว่ายังมีปัญหาอะไร เรื่องจะกลับไปเป็น “กำลังดำเนินการ” ที่หน่วยงานเดิม</p>
        <div className="row wrap" style={{ ['--gap' as string]: '8px' }}>{['ยังเสียอยู่', 'แก้ไม่ครบ', 'เกิดปัญหาใหม่'].map((x) => <button type="button" key={x} className={`chip${reason.startsWith(x) ? ' on' : ''}`} onClick={() => setReason(x + ' — ')}>{x}</button>)}</div>
        <Textarea id="reason" label="เหตุผล" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} help={`จำเป็นต้องกรอก · ${reason.length}/500 ตัวอักษร`} autoFocus />
        <ErrorBox error={err} />
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button kind="ghost" onClick={close}>ยกเลิก</Button><Button icon="send" busy={busy} disabled={!reason.trim()} onClick={() => act(() => Api.reopen(t.id, reason.trim()), 'ส่งคำขอแก้ไขใหม่แล้ว')}>ส่งคำขอแก้ไข</Button></div>
      </Modal>
    </div>
  );
}
export const KV = ({ icon, k, v }: { icon: string; k: string; v: string }) => <div className="row" style={{ alignItems: 'flex-start' }}><Bubble icon={icon} tone="pink" size={36} iconSize={18} /><div className="grow"><div className="xs muted">{k}</div><div className="small strong" style={{ wordBreak: 'break-word' }}>{v}</div></div></div>;
