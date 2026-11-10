import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { Status, Ticket } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BUILDINGS, CATEGORIES, ago, categoryOf, fmtDate, isRoutingPending, recentTickets, shortId } from '../lib/format';
import { RoutingNotice } from '../components/routing';
import { Badge, Bubble, Button, Empty, ErrorBox, Gallery, Icon, IconButton, Input, Meta, Modal, Note, Photo, PhotoPicker, Skeleton, Textarea, Timeline, VSteps, useLoad, useToast } from '../components/ui';
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
  const submissionKey = useMemo(() => crypto.randomUUID(), [category, description, building, spot, photos]);
  const submitting = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (guest) { return setNeedLogin(true); } // Enter key path
    if (!photos.length) { return setErr('กรุณาแนบรูปอย่างน้อย 1 รูป'); }
    if (!location) { return setErr('กรุณาระบุสถานที่'); }
    if (submitting.current) { return; }
    submitting.current = true;
    setBusy(true); setErr('');
    try {
      const f = new FormData();
      f.append('category', category); f.append('location', location); f.append('description', description.trim());
      photos.forEach((p) => f.append('photos', p));
      const t = await Api.createTicket(f, submissionKey);
      recentTickets.add(t.id);
      nav(`/report/done/${t.id}`, { state: { ticket: t } });
    } catch (error_) { setErr((error_ as Error).message); setBusy(false); } finally { submitting.current = false; }
  };
  const c = categoryOf(category);
  return (
    <form className="page" onSubmit={submit}>
      <Link to={guest ? '/' : '/my'} className="crumb"><Icon name="back" size={16} />{guest ? 'หน้าแรก' : 'รายการแจ้งซ่อม'}</Link>
      <PageHead title="แจ้งซ่อม" sub="กรอกข้อมูลให้ครบ 3 ส่วน แล้วกดส่ง" />
      {guest && <div className="note tone-pink note-action" style={{ alignItems: 'center', padding: '14px 16px' }}><Icon name="lock" size={20} /><div className="grow"><div className="strong">กรุณาเข้าสู่ระบบก่อนแจ้งซ่อม</div><div className="small">เพื่อติดตามสถานะและตรวจรับงานได้จากทุกอุปกรณ์</div></div><Button kind="outline" sm type="button" onClick={() => nav('/login', { state: { from: '/report' } })}>เข้าสู่ระบบ</Button></div>}
      <div className="split">
        <div className="card lg stack report-fields" style={{ ['--gap' as string]: '20px' }}>
          <Sec n="1" t="อาการชำรุด" d="เลือกหมวดที่ตรงที่สุด" />
          <div className="cat-grid" role="radiogroup" aria-label="หมวดงาน">
            {CATEGORIES.map((x) => (
              <button type="button" key={x.value} role="radio" aria-checked={category === x.value} className={`cat${category === x.value ? ' on' : ''}`} onClick={() => setCategory(x.value)}>
                <Bubble icon={x.icon} tone={x.tone} size={44} iconSize={22} />{x.label}{category === x.value && <span className="tick"><Icon name="check" size={12} /></span>}
              </button>
            ))}
          </div>
          <Textarea id="desc" label="รายละเอียด" required maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="เช่น ไฟเพดานกะพริบ บางหลอดไม่ติด" help={`อาการที่พบ และความเร่งด่วน · ${description.length}/500`} />
          <hr className="divider" />
          <Sec n="2" t="สถานที่" d="ระบุอาคารและจุดที่ชำรุด" />
          <div className="two">
            <Input id="building" label="อาคาร" required icon="building" list="buildings" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="พิมพ์หรือเลือกอาคาร" />
            <Input id="spot" label="ชั้น / ห้อง / จุดสังเกต" icon="pin" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="เช่น ชั้น 4 ห้อง 401" />
            <datalist id="buildings">{BUILDINGS.map((b) => <option key={b} value={b} />)}</datalist>
          </div>
          <hr className="divider" />
          <Sec n="3" t="รูปถ่าย" d="แนบ 1–5 รูป" />
          <PhotoPicker files={photos} onChange={setPhotos} />
        </div>
        <div className="stack report-summary" style={{ ['--gap' as string]: '20px' }}>
          <div className="card stack" style={{ ['--gap' as string]: '14px' }}>
            <h3>สรุปการแจ้งซ่อม</h3>
            {[[c.icon, 'หมวด', c.label], ['pin', 'สถานที่', location || '—'], ['image', 'รูปถ่าย', `${photos.length} รูป`], ['user', 'ผู้แจ้ง', guest ? 'ยังไม่ได้เข้าสู่ระบบ' : session.email]].map(([i, a, b]) => <KeyValue key={a} icon={i} k={a} v={b} />)}
            <hr className="divider" />
            <ErrorBox error={err} />
            {/* onClick runs before the browser's required-field check, so guests see the login prompt even on an empty form. */}
            <Button icon="send" block busy={busy} type="submit" onClick={(e) => { if (guest) { e.preventDefault(); setNeedLogin(true); } }}>ส่งแจ้งซ่อม</Button>
          </div>
          <div className="note tone-honey stack" style={{ display: 'flex', flexDirection: 'column', padding: 20, borderRadius: 16, ['--gap' as string]: '10px' }}>
            <span className="row strong" style={{ ['--gap' as string]: '8px' }}><Icon name="info" />ข้อแนะนำ</span>
            {['ถ่ายให้เห็นจุดที่ชำรุดและบริเวณรอบ ๆ', 'บอกจุดสังเกต เช่น ข้างลิฟต์ หรือหมายเลขโต๊ะ', 'เหตุเร่งด่วน เช่น ไฟฟ้าลัดวงจร น้ำรั่ว กรุณาโทรแจ้งเจ้าหน้าที่อาคารทันที'].map((t) => <span key={t} className="row small" style={{ ['--gap' as string]: '8px', color: 'var(--ink-900)', alignItems: 'flex-start' }}><Icon name="check" size={16} />{t}</span>)}
          </div>
        </div>
      </div>
      <Modal open={needLogin} onClose={() => setNeedLogin(false)} label="ต้องเข้าสู่ระบบ">
        <Bubble icon="lock" tone="pink" size={56} iconSize={26} />
        <div className="stack" style={{ ['--gap' as string]: '6px' }}><h2>กรุณาเข้าสู่ระบบก่อนแจ้งซ่อม</h2><p className="small muted">เพื่อติดตามสถานะและตรวจรับงานได้จากทุกอุปกรณ์</p></div>
        <div className="two"><Button kind="outline" type="button" onClick={() => nav('/register')}>ลงทะเบียน</Button><Button type="button" onClick={() => nav('/login', { state: { from: '/report' } })}>เข้าสู่ระบบ</Button></div>
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
        <span className="bubble" style={{ width: 64, height: 64, background: 'var(--sage-500)', color: '#fff' }}><Icon name="check" size={32} /></span>
        <h1>แจ้งซ่อมเรียบร้อย</h1>
        <p className="muted">ใช้เลขที่ด้านล่างติดตามสถานะงานได้</p>
        {load.data && <RoutingNotice ticket={load.data.ticket} />}
        <ErrorBox error={load.error} />
        <div className="row between ticket-id" style={{ width: '100%', padding: '16px 20px', borderRadius: 16, background: 'var(--pink-50)', border: '1px solid var(--pink-200)', textAlign: 'left' }}>
          <div className="grow"><div className="xs muted">เลขที่แจ้งซ่อม</div><div className="tid" style={{ fontWeight: 600, fontSize: 26, color: 'var(--pink-800)' }}>{shortId(id)}</div><div className="xs muted tid" style={{ wordBreak: 'break-all' }}>{id}</div></div>
          <IconButton icon="copy" label="คัดลอกเลขที่แจ้งซ่อม" onClick={() => navigator.clipboard?.writeText(id).then(() => toast('คัดลอกแล้ว'))} />
        </div>
        {guest && <Note tone="honey">กรุณาจดเลขที่แจ้งซ่อมไว้ เบราว์เซอร์นี้จะจำรายการที่แจ้งไว้ให้</Note>}
        <div className="stack" style={{ width: '100%', textAlign: 'left', ['--gap' as string]: '10px' }}>
          <span className="strong small" style={{ color: 'var(--pink-800)' }}>ขั้นตอนถัดไป</span>
          {['งานจะส่งถึงหน่วยงานที่ดูแล', 'ช่างเข้าซ่อมและอัปเดตสถานะ', 'ตรวจรับงานเมื่อซ่อมเสร็จ'].map((t, i) => <span key={t} className="row small"><span className="count" style={{ minWidth: 24, height: 24, background: 'var(--pink-100)', color: 'var(--pink-800)' }}>{i + 1}</span>{t}</span>)}
        </div>
        <div className="two" style={{ width: '100%' }}>
          <Button kind="outline" icon="plus" onClick={() => nav('/report')}>แจ้งซ่อมเพิ่ม</Button>
          <Button icon="eye" onClick={() => nav(guest ? `/track/${id}` : `/tickets/${id}`)}>ติดตามสถานะ</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- my tickets
const TABS: [string, Status[] | null][] = [['ทั้งหมด', null], ['รอรับเรื่อง', ['SUBMITTED']], ['รับเรื่องแล้ว', ['ASSIGNED']], ['กำลังซ่อม', ['IN_PROGRESS']], ['รอตรวจรับ', ['RESOLVED']], ['ปิดงาน', ['CLOSED']], ['ยกเลิก / ไม่รับเรื่อง', ['CANCELLED', 'REJECTED']]];

export function MyTickets() {
  const nav = useNavigate();
  const toast = useToast();
  const load = useLoad(() => Api.listTickets({ includeCancelled: 'true' }), [], (tickets) => tickets.some(isRoutingPending));
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');
  const all = load.data ?? [];
  const n = (s: Status[]) => all.filter((t) => s.includes(t.status)).length;
  const list = useMemo(() => all.filter((t) => (!TABS[tab][1] || TABS[tab][1].includes(t.status)) && (!q || `${t.id} ${t.location} ${t.description}`.toLowerCase().includes(q.toLowerCase()))), [all, tab, q]);
  const confirm = async (t: Ticket) => {
    setBusyId(t.id);
    try { await Api.confirm(t.id); toast('ตรวจรับงานแล้ว'); load.reload(); } catch (error_) { toast((error_ as Error).message, 'red'); } finally { setBusyId(''); }
  };
  return (
    <div className="page">
      <PageHead title="รายการแจ้งซ่อม" sub="ประวัติการแจ้งซ่อมของคุณ"><Button icon="plus" onClick={() => nav('/report')}>แจ้งซ่อม</Button></PageHead>
      <div className="kpis">
        <Kpi icon="ticket" n={all.filter((t) => t.status !== 'CANCELLED').length} label="ทั้งหมด" />
        <Kpi icon="wrench" n={n(['ASSIGNED', 'IN_PROGRESS'])} label="อยู่ระหว่างซ่อม" />
        <Kpi icon="check" n={n(['RESOLVED'])} label="รอตรวจรับ" hl={n(['RESOLVED']) > 0} />
        <Kpi icon="done" n={n(['CLOSED'])} label="ปิดงานแล้ว" />
      </div>
      <div className="row between wrap">
        <div className="tabs">{TABS.map(([l, s], i) => <button key={l} className={`tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}>{l}<span className="count">{s ? n(s) : all.length}</span></button>)}</div>
        <div style={{ width: 280 }}><Input id="q" icon="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่ หรือสถานที่" aria-label="ค้นหา" /></div>
      </div>
      <ErrorBox error={load.error} />
      {(load.loading && !load.data) && (<div className="cards3"><Skeleton h={320} /><Skeleton h={320} /><Skeleton h={320} /></div>)}{!(load.loading && !load.data) && (list.length === 0 ? <div className="card"><Empty icon="ticket" title={all.length ? 'ไม่มีรายการในสถานะนี้' : 'ยังไม่มีรายการแจ้งซ่อม'}>{!all.length && <Button icon="plus" onClick={() => nav('/report')}>แจ้งซ่อม</Button>}</Empty></div>
        : <div className="cards3">{list.map((t, i) => (
          <TicketCard key={t.id} t={t} i={i} to={`/tickets/${t.id}`}>
            {t.status === 'RESOLVED' && (
              <div className="note tone-honey" style={{ flexDirection: 'column' }}>
                <span className="row strong small" style={{ ['--gap' as string]: '8px' }}><Icon name="info" size={16} />ซ่อมเสร็จแล้ว กรุณาตรวจรับงาน</span>
                <div className="two" style={{ gap: 8, width: '100%' }}><Button kind="success" sm icon="check" busy={busyId === t.id} onClick={() => confirm(t)}>ตรวจรับ</Button><Button kind="outline" sm onClick={() => nav(`/tickets/${t.id}?reopen=1`)}>ส่งกลับแก้ไข</Button></div>
              </div>
            )}
          </TicketCard>
        ))}</div>)}
    </div>
  );
}
export const Kpi = ({ icon, n, label, hl, selected, onClick }: { icon: string; n: number | string; label: string; hl?: boolean; selected?: boolean; onClick?: () => void }) => {
  const body = <>
    <div className="lbl"><Icon name={icon} size={16} />{label}</div>
    <div className="num">{n}</div>
    {hl && <span className="flag">ต้องดำเนินการ</span>}
  </>;
  return onClick
    ? <button type="button" className={`card kpi kpi-btn${hl ? ' hl' : ''}${selected ? ' selected' : ''}`} aria-pressed={!!selected} onClick={onClick}>{body}</button>
    : <div className={`card kpi${hl ? ' hl' : ''}`}>{body}</div>;
};
export function TicketCard({ t, i, to, children }: Readonly<{ t: Ticket; i: number; to: string; children?: React.ReactNode }>) {
  const c = categoryOf(t.category);
  return (
    <article className="card tcard">
      <Link to={to} className="tcard-main">
      <Photo src={t.photoUrls[0]} tone={i} />
      <div className="body">
        <div className="row between"><Badge status={t.status} /><span className="xs muted tid">{shortId(t.id)}</span></div>
        <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</h3>
        <Meta icon="pin">{t.location}</Meta>
        <div className="row between"><Meta icon={c.icon}>{c.label}</Meta><Meta icon="clock">{ago(t.updatedAt)}</Meta></div>
      </div>
      </Link>
      {children}
    </article>
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
  const close = () => { setModal(null); setErr(''); if (sp.get('reopen')) { setSp({}, { replace: true }); } };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr('');
    try { await fn(); toast(msg); close(); load.reload(); } catch (error_) { setErr((error_ as Error).message); } finally { setBusy(false); }
  };
  if (load.loading && !load.data) { return <div className="page"><Skeleton h={60} /><Skeleton h={420} /></div>; }
  if (load.error || !load.data) { return <div className="page"><ErrorBox error={load.error ?? 'ไม่พบรายการนี้'} /><Link to="/my">กลับไปรายการแจ้งซ่อม</Link></div>; }
  const { ticket: t, history } = load.data;
  const c = categoryOf(t.category);
  return (
    <div className="page">
      <Crumb to="/my" label="รายการแจ้งซ่อม" current={shortId(t.id)} />
      <RoutingNotice ticket={t} />
      <div className="pagehead">
        <div className="stack" style={{ ['--gap' as string]: '8px' }}><div className="row wrap"><Badge status={t.status} /><span className="small muted tid">{shortId(t.id)}</span><span className="small muted">· {fmtDate(t.createdAt)}</span></div><h1>{t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description}</h1></div>
        <div className="actions">
          {['SUBMITTED', 'ASSIGNED'].includes(t.status) && <Button kind="outline" icon="x" onClick={() => setModal('cancel')}>ยกเลิกการแจ้งซ่อม</Button>}
          {t.status === 'RESOLVED' && <><Button kind="outline" icon="undo" onClick={() => setModal('reopen')}>ส่งกลับแก้ไข</Button><Button kind="success" icon="check" busy={busy} onClick={() => act(() => Api.confirm(t.id), 'ตรวจรับงานแล้ว')}>ตรวจรับงาน</Button></>}
        </div>
      </div>
      <div className="split">
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <Gallery urls={t.photoUrls} />
          <div className="card lg stack">
            <h3>รายละเอียด</h3><p style={{ lineHeight: 1.7 }}>{t.description}</p><hr className="divider" />
            <div className="two"><KeyValue icon={c.icon} k="หมวด" v={c.label} /><KeyValue icon="pin" k="สถานที่" v={t.location} /><KeyValue icon="calendar" k="แจ้งเมื่อ" v={fmtDate(t.createdAt)} /><KeyValue icon="building" k="หน่วยงาน" v={t.departmentName || 'รอส่งต่อหน่วยงาน'} /></div>
          </div>
          {t.completionPhotoUrls.length > 0 && (
            <div className="card lg stack" style={{ background: 'var(--sage-100)', borderColor: 'var(--sage-300)' }}>
              <div className="row"><span className="bubble" style={{ width: 40, height: 40, background: 'var(--sage-500)', color: '#fff' }}><Icon name="check" size={20} /></span><div><div className="strong" style={{ color: 'var(--sage-800)' }}>ซ่อมเสร็จแล้ว{t.departmentName ? ` · ${t.departmentName}` : ''}</div><div className="xs" style={{ color: 'var(--sage-800)' }}>รูปหลังซ่อม {t.completionPhotoUrls.length} รูป</div></div></div>
              <div className="thumbs-row">{t.completionPhotoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 180 }}><Photo src={u} tone={i + 2} /></a>)}</div>
            </div>
          )}
        </div>
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <div className="card lg stack"><div className="row between"><h3>สถานะ</h3><Badge status={t.status} /></div><VSteps status={t.status} />
            {['SUBMITTED', 'ASSIGNED'].includes(t.status) && <Note>ยกเลิกได้ก่อนช่างเริ่มซ่อม</Note>}
            {t.status === 'RESOLVED' && <Note>กรุณาตรวจดูหน้างาน แล้วกดตรวจรับ หรือส่งกลับให้แก้ไข</Note>}
            {t.status === 'REJECTED' && t.reason && <Note tone="red" icon="x">เหตุผล: {t.reason}</Note>}
          </div>
          <div className="card lg stack"><h3>ความคืบหน้า</h3><Timeline history={history} reporterLabel="คุณ" /></div>
        </div>
      </div>

      <Modal open={modal === 'cancel'} onClose={close} label="ยกเลิกการแจ้งซ่อม">
        <Bubble icon="alert" tone="red" size={56} iconSize={26} />
        <div className="stack" style={{ ['--gap' as string]: '6px' }}><h2>ยกเลิกการแจ้งซ่อม</h2><p className="muted small">ยกเลิกแล้วเรียกคืนไม่ได้ หากยังต้องการซ่อม กรุณาแจ้งใหม่</p></div>
        <div className="row" style={{ padding: 12, borderRadius: 12, background: 'var(--pink-50)' }}><Photo src={t.photoUrls[0]} w={64} /><div className="grow"><div className="strong small">{t.description.slice(0, 40)}</div><div className="xs muted"><span className="tid">{shortId(t.id)}</span> · {t.location}</div></div></div>
        <ErrorBox error={err} />
        <div className="two"><Button kind="outline" onClick={close}>ปิด</Button><Button kind="danger" icon="trash" busy={busy} onClick={() => act(() => Api.cancel(t.id), 'ยกเลิกการแจ้งซ่อมแล้ว')}>ยืนยันยกเลิก</Button></div>
      </Modal>
      <Modal open={modal === 'reopen'} onClose={close} label="ส่งกลับแก้ไข">
        <div className="row" style={{ ['--gap' as string]: '14px' }}><Bubble icon="undo" size={48} iconSize={22} /><div><h2>ส่งกลับแก้ไข</h2><div className="small muted"><span className="tid">{shortId(t.id)}</span> · {t.location}</div></div></div>
        <p className="muted small">แจ้งสิ่งที่ยังไม่เรียบร้อย งานจะกลับไปที่หน่วยงานเดิม</p>
        <div className="row wrap" style={{ ['--gap' as string]: '8px' }}>{['ยังใช้งานไม่ได้', 'ซ่อมไม่ครบ', 'มีจุดชำรุดเพิ่ม'].map((x) => <button type="button" key={x} className={`chip${reason.startsWith(x) ? ' on' : ''}`} onClick={() => setReason(x + ' — ')}>{x}</button>)}</div>
        <Textarea id="reason" label="รายละเอียด" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} help={`${reason.length}/500`} autoFocus />
        <ErrorBox error={err} />
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button kind="ghost" onClick={close}>ยกเลิก</Button><Button icon="send" busy={busy} disabled={!reason.trim()} onClick={() => act(() => Api.reopen(t.id, reason.trim()), 'ส่งกลับให้หน่วยงานแก้ไขแล้ว')}>ส่งกลับ</Button></div>
      </Modal>
    </div>
  );
}
export const KeyValue = ({ icon, k, v }: { icon: string; k: string; v: string }) => <div className="kv"><Icon name={icon} /><div className="grow"><div className="xs muted">{k}</div><div className="small strong" style={{ wordBreak: 'break-word' }}>{v}</div></div></div>;
