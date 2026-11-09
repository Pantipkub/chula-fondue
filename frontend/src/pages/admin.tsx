import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { Department, Status } from '../lib/api';
import { ago, categoryOf, fmtDate, isRoutingPending, shortId } from '../lib/format';
import { RoutingNotice } from '../components/routing';
import { RoutingRules } from '../components/routing-rules';
import { Badge, Bubble, Button, Drawer, Empty, ErrorBox, Gallery, Icon, Input, Meta, Modal, Note, Photo, Select, Skeleton, Textarea, Timeline, VSteps, useLoad, useToast } from '../components/ui';
import { AppShell, Crumb, PageHead } from '../components/layouts';
import { KV, Kpi } from './reporter';

export function AdminFrame() {
  const loc = useLocation();
  const load = useLoad(() => Api.listTickets({ status: 'SUBMITTED' }), [loc.pathname], (tickets) => tickets.some(isRoutingPending));
  return <AppShell role="ADMIN" counts={{ '/admin': load.data?.length ?? 0 }} />;
}

// ---------------------------------------------------------------- inbox
const ATABS: [string, Status[] | null][] = [['ทั้งหมด', null], ['รอตรวจสอบ', ['SUBMITTED']], ['มอบหมายแล้ว', ['ASSIGNED']], ['กำลังดำเนินการ', ['IN_PROGRESS']], ['รอยืนยัน', ['RESOLVED']], ['ปิดแล้ว', ['CLOSED']], ['ปฏิเสธ/ยกเลิก', ['REJECTED', 'CANCELLED']]];
export function Inbox() {
  const nav = useNavigate();
  const load = useLoad(() => Promise.all([Api.listTickets({ includeCancelled: 'true' }), Api.departments()]), [], ([tickets]) => tickets.some(isRoutingPending));
  const [tab, setTab] = useState(1);
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const [tickets, depts] = load.data ?? [[], []];
  const n = (s: Status[]) => tickets.filter((t) => s.includes(t.status)).length;
  const pending = tickets.filter(isRoutingPending).length;
  const review = tickets.filter((t) => t.status === 'SUBMITTED' && !isRoutingPending(t)).length;
  const rows = useMemo(() => tickets.filter((t) => (!ATABS[tab][1] || ATABS[tab][1]!.includes(t.status)) && (!dept || t.departmentId === dept) && (!q || `${t.id} ${t.location} ${t.description} ${t.reporterEmail}`.toLowerCase().includes(q.toLowerCase()))), [tickets, tab, dept, q]);
  return (
    <>
      <PageHead title="กล่องเรื่องเข้า" sub="ติดตามการส่งต่ออัตโนมัติ และตรวจสอบเรื่องที่ต้องให้ผู้ดูแลจัดการ"><Button kind="outline" icon="undo" onClick={load.reload} busy={load.loading}>รีเฟรช</Button></PageHead>
      <div className="kpis">
        <Kpi icon="inbox" tone="honey" n={review} label="ต้องตรวจสอบ" hl={review > 0} />
        <Kpi icon="route" tone="pink" n={n(['ASSIGNED'])} label="มอบหมายแล้ว" />
        <Kpi icon="wrench" tone="lilac" n={n(['IN_PROGRESS'])} label="กำลังดำเนินการ" />
        <Kpi icon="check" tone="sage" n={n(['RESOLVED'])} label="รอผู้แจ้งยืนยัน" />
      </div>
      {pending > 0 && <Note icon="route">กำลังส่งต่ออัตโนมัติ {pending} เรื่อง · ต้องให้ผู้ดูแลตรวจสอบ {review} เรื่อง</Note>}
      <div className="row between wrap">
        <div className="tabs">{ATABS.map(([l, s], i) => <button key={l} className={`tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}>{l}<span className="count">{s ? n(s) : tickets.length}</span></button>)}</div>
        <div className="row inbox-filters"><div><Input id="aq" icon="search" placeholder="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" /></div>
          <div><Select id="dept" icon="filter" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="หน่วยงาน"><option value="">ทุกหน่วยงาน</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div></div>
      </div>
      <ErrorBox error={load.error} />
      {load.loading && !load.data ? <Skeleton h={400} /> : rows.length === 0 ? <div className="card"><Empty title="ไม่มีเรื่องในหมวดนี้" icon="inbox">{tab === 1 && <span className="small">เรื่องใหม่ทั้งหมดถูกจัดการแล้ว</span>}</Empty></div> : (
        <div className="table">
          <table>
            <thead><tr><th>เรื่อง</th><th>สถานที่</th><th>ผู้แจ้ง</th><th>หน่วยงาน</th><th>สถานะ</th><th>แจ้งเมื่อ</th><th aria-label="เปิด" /></tr></thead>
            <tbody>{rows.map((t, i) => {
              const c = categoryOf(t.category);
              return (
                <tr key={t.id} onClick={() => nav(`/admin/tickets/${t.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/admin/tickets/${t.id}`)}>
                  <td><div className="row"><Photo src={t.photoUrls[0]} tone={i} className="thumb" /><div style={{ minWidth: 0, maxWidth: 260 }}><div className="strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div><div className="xs muted">{shortId(t.id)} · {c.label}</div></div></div></td>
                  <td style={{ maxWidth: 200 }}>{t.location}</td>
                  <td>{t.reporterEmail}</td>
                  <td className={t.departmentName ? '' : 'muted'}>{t.departmentName || (isRoutingPending(t) ? 'กำลังส่งต่ออัตโนมัติ' : 'รอผู้ดูแลเลือก')}</td>
                  <td><Badge status={t.status} /></td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{ago(t.createdAt)}</td>
                  <td><Icon name="right" /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- review: assign / reject / re-route
export function Review() {
  const { id = '' } = useParams();
  const toast = useToast();
  const load = useLoad(() => Promise.all([Api.history(id), Api.departments()]), [id], ([result]) => isRoutingPending(result.ticket));
  const [dept, setDept] = useState('');
  const [category, setCategory] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (load.loading && !load.data) return <><Skeleton h={60} /><Skeleton h={420} /></>;
  if (!load.data) return <ErrorBox error={load.error ?? 'ไม่พบเรื่องนี้'} />;
  const [{ ticket: t, history }, depts] = load.data;
  const c = categoryOf(t.category);
  const chosen = dept;
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr('');
    try { await fn(); toast(msg); setRejectOpen(false); setDept(''); load.reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const deptName = (d: string) => depts.find((x) => x.id === d)?.name ?? '';
  return (
    <>
      <Crumb to="/admin" label="กล่องเรื่องเข้า" current={shortId(t.id)} />
      <RoutingNotice ticket={t} />
      <div className="stack" style={{ ['--gap' as string]: '8px' }}><div className="row wrap"><Badge status={t.status} /><span className="small muted strong">{shortId(t.id)}</span><span className="small muted">· {fmtDate(t.createdAt)}</span></div><h1>{t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description}</h1></div>
      <div className="split review-split">
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <Gallery urls={t.photoUrls} />
          <div className="card lg stack"><h3>รายละเอียด</h3><p style={{ lineHeight: 1.65 }}>{t.description}</p><hr className="divider" />
            <div className="two"><KV icon={c.icon} k="หมวด" v={c.label} /><KV icon="pin" k="สถานที่" v={t.location} /><KV icon="calendar" k="แจ้งเมื่อ" v={fmtDate(t.createdAt)} /><KV icon="mail" k="ผู้แจ้ง" v={t.reporterEmail} /></div>
          </div>
          {t.completionPhotoUrls.length > 0 && <div className="card stack"><h3>รูปหลังแก้ไข</h3><div className="thumbs-row">{t.completionPhotoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 160 }}><Photo src={u} tone={i + 2} /></a>)}</div></div>}
        </div>
        <div className="stack" style={{ ['--gap' as string]: '20px' }}>
          <ErrorBox error={err} />
          {['SUBMITTED', 'ASSIGNED'].includes(t.status) && <div className="card stack"><h3>แก้ไขหมวดหมู่</h3><Input id="recategorize" label="หมวดหมู่" value={category || t.category} onChange={e => setCategory(e.target.value)} /><Button busy={busy} onClick={() => act(() => Api.recategorize(t.id, category || t.category), 'เปลี่ยนหมวดหมู่แล้ว')}>บันทึกหมวดหมู่</Button></div>}
          {t.status === 'SUBMITTED' && (
            <>
              <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
                <h3>มอบหมายหน่วยงาน</h3><p className="small muted">เลือกหน่วยงานที่รับผิดชอบ เรื่องจะเข้าคิวงานของหน่วยงานนั้นทันที</p>
                {depts.length === 0 ? <Note>ยังไม่มีหน่วยงาน — เพิ่มที่เมนู “หน่วยงาน” ก่อน</Note> : <>
                  <Select id="dept" label="หน่วยงาน" icon="building" value={chosen} onChange={(e) => setDept(e.target.value)}><option value="" disabled>เลือกหน่วยงาน</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
                  <Button icon="route" block busy={busy} disabled={!chosen} onClick={() => act(() => Api.assign(t.id, chosen), `มอบหมายให้${deptName(chosen)}แล้ว`)}>มอบหมายงาน</Button>
                </>}
              </div>
              {t.routingStatus === 'REVIEW' && <div className="card stack"><h3>ลองส่งต่ออัตโนมัติอีกครั้ง</h3><p className="small muted">ใช้หลังแก้กฎหรือเมื่อบริการหน่วยงานกลับมาพร้อม</p><Button kind="outline" icon="undo" busy={busy} onClick={() => act(() => Api.retryRouting(t.id), 'ส่งให้ระบบลองใหม่แล้ว')}>ลองส่งต่ออัตโนมัติอีกครั้ง</Button></div>}
              <div className="card lg stack" style={{ ['--gap' as string]: '12px' }}><h3>ไม่รับเรื่องนี้?</h3><p className="small muted">เช่น ไม่ใช่งานซ่อม หรือแจ้งซ้ำ ผู้แจ้งจะเห็นเหตุผลในไทม์ไลน์</p><Button kind="outline" icon="x" block onClick={() => setRejectOpen(true)}>ปฏิเสธพร้อมเหตุผล</Button></div>
            </>
          )}
          {t.status === 'ASSIGNED' && (
            <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
              <h3>เปลี่ยนหน่วยงาน (Re-route)</h3>
              <div className="row" style={{ padding: 12, borderRadius: 14, background: 'var(--pink-50)' }}><Bubble icon="building" size={36} iconSize={18} /><div><div className="xs muted">หน่วยงานปัจจุบัน</div><div className="strong small">{t.departmentName}</div></div></div>
              <Select id="dept" label="ส่งต่อให้" icon="route" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">เลือกหน่วยงานใหม่</option>{depts.filter((d) => d.id !== t.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              <Note>เปลี่ยนได้เฉพาะตอนสถานะ “มอบหมายแล้ว” ก่อนเจ้าหน้าที่เริ่มดำเนินการ</Note>
              <Button icon="route" block busy={busy} disabled={!dept} onClick={() => act(() => Api.assign(t.id, dept), `ส่งต่อให้${deptName(dept)}แล้ว`)}>ยืนยันเปลี่ยนหน่วยงาน</Button>
            </div>
          )}
          {t.status === 'ASSIGNED' && <Button kind="outline" icon="x" onClick={() => setRejectOpen(true)}>ปฏิเสธพร้อมเหตุผล</Button>}
          <div className="card lg stack"><div className="row between"><h3>สถานะ</h3><Badge status={t.status} /></div><VSteps status={t.status} />{t.departmentName && t.status !== 'ASSIGNED' && <Meta icon="building">{t.departmentName}</Meta>}</div>
          <div className="card lg stack"><h3>ไทม์ไลน์</h3><Timeline history={history} /></div>
        </div>
      </div>
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} label="ปฏิเสธเรื่อง">
        <div className="row" style={{ ['--gap' as string]: '14px' }}><Bubble icon="x" tone="red" size={52} iconSize={24} /><div><h2>ปฏิเสธเรื่องนี้</h2><div className="small muted">{shortId(t.id)} · {t.location}</div></div></div>
        <div className="row wrap" style={{ ['--gap' as string]: '8px' }}>{['ไม่ใช่งานซ่อม', 'แจ้งซ้ำ', 'ข้อมูลไม่พอ'].map((x) => <button type="button" key={x} className={`chip${reason.startsWith(x) ? ' on' : ''}`} onClick={() => setReason(x + ' — ')}>{x}</button>)}</div>
        <Textarea id="rr" label="เหตุผลที่ปฏิเสธ" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} help="จำเป็นต้องกรอก · ผู้แจ้งจะเห็นข้อความนี้" autoFocus />
        <Note>ปฏิเสธได้เฉพาะเรื่องที่ยังไม่ได้มอบหมายหน่วยงาน</Note>
        <ErrorBox error={err} />
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button kind="ghost" onClick={() => setRejectOpen(false)}>ยกเลิก</Button><Button kind="danger" icon="x" busy={busy} disabled={!reason.trim()} onClick={() => act(() => Api.reject(t.id, reason.trim()), 'ปฏิเสธเรื่องแล้ว')}>ปฏิเสธเรื่อง</Button></div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- departments (UC-08)
const DEPT_ICONS = ['zap', 'droplet', 'wind', 'wifi', 'building', 'wrench'];
const DEPT_TONES = ['honey', 'sage', 'lilac', 'pink', 'gray', 'pink'];
export function Departments() {
  const toast = useToast();
  const load = useLoad(() => Promise.all([Api.departments(), Api.listTickets()]));
  const [edit, setEdit] = useState<Partial<Department> | null>(null);
  const [del, setDel] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newB, setNewB] = useState('');
  const [depts, tickets] = load.data ?? [[], []];
  const open = (d: string) => tickets.filter((t) => t.departmentId === d && ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'].includes(t.status)).length;
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!edit) return;
    setBusy(true); setErr('');
    const body = { name: edit.name?.trim() ?? '', contactEmail: edit.contactEmail?.trim() ?? '', buildings: edit.buildings ?? [] };
    try { if (edit.id) await Api.updateDepartment(edit.id, body); else await Api.createDepartment(body); toast(edit.id ? 'บันทึกหน่วยงานแล้ว' : 'เพิ่มหน่วยงานแล้ว'); setEdit(null); load.reload(); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const addBuilding = () => { const b = newB.trim(); if (b && edit && !edit.buildings?.includes(b)) setEdit({ ...edit, buildings: [...(edit.buildings ?? []), b] }); setNewB(''); };
  return (
    <>
      <PageHead title="หน่วยงาน" sub="หน่วยงานที่รับเรื่องซ่อม · ใช้เป็นตัวเลือกตอนมอบหมายงาน"><Button icon="plus" onClick={() => { setErr(''); setEdit({ name: '', contactEmail: '', buildings: [] }); }}>เพิ่มหน่วยงาน</Button></PageHead>
      <ErrorBox error={load.error} />
      <RoutingRules departments={depts} />
      {load.loading && !load.data ? <div className="cards3"><Skeleton h={220} /><Skeleton h={220} /><Skeleton h={220} /></div> : (
        <div className="cards3">
          {depts.map((d, i) => (
            <div key={d.id} className="card stack" style={{ ['--gap' as string]: '12px' }}>
              <div className="row between"><Bubble icon={DEPT_ICONS[i % 6]} tone={DEPT_TONES[i % 6]} size={48} iconSize={24} /><div className="row" style={{ ['--gap' as string]: '8px' }}><button className="icon-btn" aria-label={`แก้ไข ${d.name}`} onClick={() => { setErr(''); setEdit({ ...d }); }}><Icon name="pencil" /></button><button className="icon-btn danger" aria-label={`ลบ ${d.name}`} onClick={() => { setErr(''); setDel(d); }}><Icon name="trash" /></button></div></div>
              <h3>{d.name}</h3><Meta icon="mail">{d.contactEmail}</Meta>
              <div className="row wrap" style={{ ['--gap' as string]: '6px' }}>{d.buildings.length ? d.buildings.map((b) => <span key={b} className="tag">{b}</span>) : <span className="xs muted">ยังไม่ระบุอาคาร</span>}</div>
              <hr className="divider" />
              <div className="row between"><span className="small muted">งานที่ยังเปิดอยู่</span><span className="count" style={{ background: 'var(--pink-100)', color: 'var(--pink-800)' }}>{open(d.id)}</span></div>
            </div>
          ))}
          <button className="card stack" style={{ ['--gap' as string]: '10px', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--pink-300)', background: 'var(--pink-50)', boxShadow: 'none', cursor: 'pointer', minHeight: 220 }} onClick={() => { setErr(''); setEdit({ name: '', contactEmail: '', buildings: [] }); }}>
            <Bubble icon="plus" size={48} iconSize={24} /><span className="strong" style={{ color: 'var(--pink-800)' }}>เพิ่มหน่วยงานใหม่</span><span className="xs muted">ชื่อ อีเมลติดต่อ และอาคารที่ดูแล</span>
          </button>
        </div>
      )}
      <Drawer open={!!edit} onClose={() => setEdit(null)} label="แก้ไขหน่วยงาน">
        {edit && <form onSubmit={save} className="stack" style={{ ['--gap' as string]: '20px', flex: 1 }}>
          <div className="row between"><h2>{edit.id ? 'แก้ไขหน่วยงาน' : 'เพิ่มหน่วยงาน'}</h2><button type="button" className="icon-btn" aria-label="ปิด" onClick={() => setEdit(null)}><Icon name="x" /></button></div>
          <p className="small muted">การแก้ไขมีผลกับการมอบหมายครั้งถัดไป เรื่องที่มอบหมายไปแล้วไม่เปลี่ยน</p>
          <ErrorBox error={err} />
          <Input id="dn" label="ชื่อหน่วยงาน" required icon="building" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น ฝ่ายไฟฟ้า" />
          <Input id="de" label="อีเมลติดต่อ" required type="email" icon="mail" value={edit.contactEmail ?? ''} onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })} help="ใช้เป็นผู้รับการแจ้งเตือนเมื่อมีงานใหม่ของหน่วยงาน" />
          <div className="field"><span className="label">อาคารที่ดูแล</span>
            <div className="control" style={{ flexWrap: 'wrap', padding: 10, gap: 6 }}>
              {(edit.buildings ?? []).map((b) => <span key={b} className="tag">{b}<button type="button" aria-label={`ลบ ${b}`} onClick={() => setEdit({ ...edit, buildings: edit.buildings!.filter((x) => x !== b) })}><Icon name="x" size={12} /></button></span>)}
              <input style={{ padding: 4, minWidth: 160 }} value={newB} onChange={(e) => setNewB(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addBuilding(); } }} onBlur={addBuilding} placeholder="พิมพ์ชื่ออาคารแล้วกด Enter" aria-label="เพิ่มอาคาร" />
            </div>
            <span className="help">ข้อมูลพื้นที่รับผิดชอบของหน่วยงาน · กฎส่งต่ออัตโนมัติปัจจุบันเลือกตามหมวดปัญหา</span>
          </div>
          <div style={{ flex: 1 }} />
          <hr className="divider" />
          <div className="row" style={{ justifyContent: 'flex-end' }}><Button kind="outline" type="button" onClick={() => setEdit(null)}>ยกเลิก</Button><Button icon="check" busy={busy} type="submit">บันทึก</Button></div>
        </form>}
      </Drawer>
      <Modal open={!!del} onClose={() => setDel(null)} label="ลบหน่วยงาน">
        <Bubble icon="trash" tone="red" size={56} iconSize={26} />
        <div className="stack" style={{ ['--gap' as string]: '6px' }}><h2>ลบ “{del?.name}”?</h2><p className="small muted">หน่วยงานนี้จะไม่อยู่ในตัวเลือกตอนมอบหมายงานอีก{del && open(del.id) > 0 ? ` · ตอนนี้ยังมีงานเปิดอยู่ ${open(del.id)} เรื่อง` : ''}</p></div>
        <ErrorBox error={err} />
        <div className="two"><Button kind="outline" onClick={() => setDel(null)}>ยกเลิก</Button><Button kind="danger" icon="trash" busy={busy} onClick={async () => { setBusy(true); setErr(''); try { await Api.deleteDepartment(del!.id); toast('ลบหน่วยงานแล้ว'); setDel(null); load.reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>ลบหน่วยงาน</Button></div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- staff / admin accounts
export function Users() {
  const toast = useToast();
  const depts = useLoad(() => Api.departments());
  const accounts = useLoad(Api.users);
  const [f, setF] = useState({ email: '', password: '', role: 'STAFF' as 'STAFF' | 'ADMIN', departmentId: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const u = await Api.createUser({ email: f.email.trim(), password: f.password, role: f.role, ...(f.role === 'STAFF' ? { departmentId: f.departmentId } : {}) });
      accounts.reload();
      toast(`สร้างบัญชี ${u.email} เรียบร้อย`);
      setF({ ...f, email: '', password: '' });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const role = (icon: string, tone: string, name: string, caps: string[]) => (
    <div className="stack" style={{ ['--gap' as string]: '8px', padding: 16, borderRadius: 16, border: '1px solid var(--line-200)' }}>
      <span className="row strong small"><Bubble icon={icon} tone={tone} size={32} iconSize={16} />{name}</span>
      {caps.map((c) => <span key={c} className="row xs muted" style={{ ['--gap' as string]: '8px' }}><Icon name="check" size={14} />{c}</span>)}
    </div>
  );
  return (
    <>
      <PageHead title="บัญชีเจ้าหน้าที่" sub="สร้างบัญชี Staff และ Admin · ผู้แจ้งสมัครเองได้ที่หน้าสมัครสมาชิก" />
      <div className="split users-split">
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <form className="card lg stack" style={{ ['--gap' as string]: '18px' }} onSubmit={submit}>
            <h3>สร้างบัญชีใหม่</h3>
            <ErrorBox error={err} />
            <Input id="ue" label="อีเมล" required type="email" icon="mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@chula.ac.th" />
            <Input id="up" label="รหัสผ่านเริ่มต้น" required minLength={8} type="text" icon="lock" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} help="อย่างน้อย 8 ตัวอักษร · แจ้งเจ้าหน้าที่ผ่านช่องทางที่ปลอดภัย" autoComplete="off" />
            <div className="field"><span className="label">บทบาท <span className="req">*</span></span>
              <div className="seg" role="radiogroup">{(['STAFF', 'ADMIN'] as const).map((r) => <button type="button" role="radio" aria-checked={f.role === r} key={r} className={f.role === r ? 'on' : ''} onClick={() => setF({ ...f, role: r })}><Icon name={r === 'STAFF' ? 'wrench' : 'shield'} size={16} />{r === 'STAFF' ? 'Staff · เจ้าหน้าที่' : 'Admin · ผู้ดูแลระบบ'}</button>)}</div>
            </div>
            {f.role === 'STAFF' && <Select id="ud" label="หน่วยงาน" required icon="building" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} help="Staff จะเห็นและทำงานได้เฉพาะเรื่องของหน่วยงานนี้"><option value="" disabled>เลือกหน่วยงาน</option>{(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
            <div className="row" style={{ justifyContent: 'flex-end' }}><Button icon="plus" busy={busy} type="submit">สร้างบัญชี</Button></div>
          </form>
          <ErrorBox error={accounts.error} />
          {!!accounts.data?.length && (
            <div className="card stack"><h3>บัญชีในระบบ</h3>
              {accounts.data.map((c) => <div key={c.email} className="row between account-row" style={{ padding: '10px 0', borderTop: '1px solid var(--line-200)' }}><span className="row small strong"><span className="avatar">{c.email.slice(0, 2)}</span>{c.email}</span><span className={`rolechip ${c.role === 'ADMIN' ? 'tone-pink' : 'tone-lilac'}`}>{c.role}{c.departmentId && ` · ${depts.data?.find(d => d.id === c.departmentId)?.name ?? ''}`}</span></div>)}
              <span className="xs muted">ข้อมูลบัญชีจาก Auth Service</span>
            </div>
          )}
        </div>
        <div className="card lg stack" style={{ ['--gap' as string]: '12px' }}>
          <h3>สิทธิ์ตามบทบาท</h3>
          {role('user', 'honey', 'ผู้เยี่ยมชม (Guest)', ['แจ้งปัญหาพร้อมอีเมลติดต่อ', 'ติดตามด้วยเลขที่เรื่อง'])}
          {role('heart', 'pink', 'ผู้แจ้ง (Reporter) — สมัครเอง', ['ดูเรื่องของตัวเอง · ยกเลิกก่อนเจ้าหน้าที่เริ่มงาน', 'ยืนยันผล หรือขอแก้ไขใหม่พร้อมเหตุผล'])}
          {role('wrench', 'lilac', 'เจ้าหน้าที่ (Staff)', ['เห็นเฉพาะงานของหน่วยงานตัวเอง', 'เริ่มงาน และส่งงานพร้อมรูปหลังแก้ไข'])}
          {role('shield', 'sage', 'ผู้ดูแลระบบ (Admin)', ['มอบหมาย · ปฏิเสธ · เปลี่ยนหน่วยงาน', 'จัดการหน่วยงานและบัญชีเจ้าหน้าที่'])}
        </div>
      </div>
    </>
  );
}
