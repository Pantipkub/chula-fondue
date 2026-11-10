import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { Department, PublicUser, Status } from '../lib/api';
import { CATEGORIES, ago, categoryOf, fmtDate, isRoutingPending, shortId } from '../lib/format';
import { RoutingNotice } from '../components/routing';
import { RoutingRules } from '../components/routing-rules';
import { Badge, Bubble, Button, Drawer, Empty, ErrorBox, Gallery, Icon, IconButton, Input, Meta, Modal, Note, PasswordInput, Photo, Select, Skeleton, Textarea, Timeline, VSteps, useLoad, useToast } from '../components/ui';
import { AppShell, Crumb, PageHead } from '../components/layouts';
import { KV, Kpi } from './reporter';

export function AdminFrame() {
  const loc = useLocation();
  const load = useLoad(() => Api.listTickets({ status: 'SUBMITTED' }), [loc.pathname], (tickets) => tickets.some(isRoutingPending));
  return <AppShell role="ADMIN" counts={{ '/admin': load.data?.length ?? 0 }} />;
}

// ---------------------------------------------------------------- inbox
const ATABS: [string, Status[] | null][] = [['ทั้งหมด', null], ['รอรับเรื่อง', ['SUBMITTED']], ['รับเรื่องแล้ว', ['ASSIGNED']], ['กำลังซ่อม', ['IN_PROGRESS']], ['รอตรวจรับ', ['RESOLVED']], ['ปิดงาน', ['CLOSED']], ['ไม่รับเรื่อง / ยกเลิก', ['REJECTED', 'CANCELLED']]];
const ROLE_LABEL: Record<string, string> = { REPORTER: 'ผู้แจ้ง', STAFF: 'เจ้าหน้าที่', ADMIN: 'ผู้ดูแลระบบ' };
export function Inbox() {
  const nav = useNavigate();
  const load = useLoad(() => Promise.all([Api.listTickets({ includeCancelled: 'true' }), Api.departments()]), [], ([tickets]) => tickets.some(isRoutingPending));
  const [tab, setTab] = useState(1);
  // Clicking the selected summary card again goes back to "ทั้งหมด".
  const pickTab = (i: number) => setTab((t) => (t === i ? 0 : i));
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const [tickets, depts] = load.data ?? [[], []];
  const n = (s: Status[]) => tickets.filter((t) => s.includes(t.status)).length;
  const pending = tickets.filter(isRoutingPending).length;
  const review = tickets.filter((t) => t.status === 'SUBMITTED' && !isRoutingPending(t)).length;
  const rows = useMemo(() => tickets.filter((t) => (!ATABS[tab][1] || ATABS[tab][1]!.includes(t.status)) && (!dept || t.departmentId === dept) && (!q || `${t.id} ${t.location} ${t.description} ${t.reporterEmail}`.toLowerCase().includes(q.toLowerCase()))), [tickets, tab, dept, q]);
  return (
    <>
      <PageHead title="งานแจ้งซ่อม" sub="รับเรื่องและส่งต่อหน่วยงานที่รับผิดชอบ"><IconButton icon="refresh" label="รีเฟรช" onClick={load.reload} busy={load.loading} /></PageHead>
      <div className="kpis">
        <Kpi icon="inbox" n={review} label="รอรับเรื่อง" hl={review > 0} selected={tab === 1} onClick={() => pickTab(1)} />
        <Kpi icon="route" n={n(['ASSIGNED'])} label="รับเรื่องแล้ว" selected={tab === 2} onClick={() => pickTab(2)} />
        <Kpi icon="wrench" n={n(['IN_PROGRESS'])} label="กำลังซ่อม" selected={tab === 3} onClick={() => pickTab(3)} />
        <Kpi icon="check" n={n(['RESOLVED'])} label="รอตรวจรับ" selected={tab === 4} onClick={() => pickTab(4)} />
      </div>
      {pending > 0 && <Note icon="route">กำลังส่งต่ออัตโนมัติ {pending} งาน · รอรับเรื่อง {review} งาน</Note>}
      <div className="row between wrap">
        <div className="tabs">{ATABS.map(([l, s], i) => <button key={l} className={`tab${tab === i ? ' on' : ''}`} onClick={() => setTab(i)}>{l}<span className="count">{s ? n(s) : tickets.length}</span></button>)}</div>
        <div className="row inbox-filters"><div><Input id="aq" icon="search" placeholder="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" /></div>
          <div><Select id="dept" icon="filter" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="หน่วยงาน"><option value="">ทุกหน่วยงาน</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div></div>
      </div>
      <ErrorBox error={load.error} />
      {load.loading && !load.data ? <Skeleton h={400} /> : rows.length === 0 ? <div className="card"><Empty title="ไม่มีงานในสถานะนี้" icon="inbox">{tab === 1 && <span className="small">รับเรื่องครบทุกงานแล้ว</span>}</Empty></div> : (
        <div className="table">
          <table>
            <thead><tr><th>งานซ่อม</th><th>สถานที่</th><th>ผู้แจ้ง</th><th>หน่วยงาน</th><th>สถานะ</th><th>แจ้งเมื่อ</th><th aria-label="เปิด" /></tr></thead>
            <tbody>{rows.map((t, i) => {
              const c = categoryOf(t.category);
              return (
                <tr key={t.id} onClick={() => nav(`/admin/tickets/${t.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/admin/tickets/${t.id}`)}>
                  <td><div className="row"><Photo src={t.photoUrls[0]} tone={i} className="thumb" /><div style={{ minWidth: 0, maxWidth: 260 }}><div className="strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div><div className="xs muted"><span className="tid">{shortId(t.id)}</span> · {c.label}</div></div></div></td>
                  <td style={{ maxWidth: 200 }}>{t.location}</td>
                  <td>{t.reporterEmail}</td>
                  <td className={t.departmentName ? '' : 'muted'}>{t.departmentName || (isRoutingPending(t) ? 'กำลังส่งต่ออัตโนมัติ' : 'รอส่งต่อ')}</td>
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
  if (!load.data) return <ErrorBox error={load.error ?? 'ไม่พบรายการนี้'} />;
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
      <Crumb to="/admin" label="งานแจ้งซ่อม" current={shortId(t.id)} />
      <RoutingNotice ticket={t} />
      <div className="stack" style={{ ['--gap' as string]: '8px' }}><div className="row wrap"><Badge status={t.status} /><span className="small muted tid">{shortId(t.id)}</span><span className="small muted">· {fmtDate(t.createdAt)}</span></div><h1>{t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description}</h1></div>
      <div className="split review-split">
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <Gallery urls={t.photoUrls} />
          <div className="card lg stack"><h3>รายละเอียด</h3><p style={{ lineHeight: 1.7 }}>{t.description}</p><hr className="divider" />
            <div className="two"><KV icon={c.icon} k="หมวด" v={c.label} /><KV icon="pin" k="สถานที่" v={t.location} /><KV icon="calendar" k="แจ้งเมื่อ" v={fmtDate(t.createdAt)} /><KV icon="mail" k="ผู้แจ้ง" v={t.reporterEmail} /></div>
          </div>
          {t.completionPhotoUrls.length > 0 && <div className="card stack"><h3>รูปหลังซ่อม</h3><div className="thumbs-row">{t.completionPhotoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 160 }}><Photo src={u} tone={i + 2} /></a>)}</div></div>}
        </div>
        <div className="stack" style={{ ['--gap' as string]: '20px' }}>
          <ErrorBox error={err} />
          {['SUBMITTED', 'ASSIGNED'].includes(t.status) && <div className="card stack"><h3>หมวดงาน</h3>
            <Select id="recategorize" label="หมวดงาน" icon={categoryOf(category || t.category).icon} value={category || t.category} onChange={e => setCategory(e.target.value)}>
              {!CATEGORIES.some((x) => x.value === t.category) && <option value={t.category}>{t.category}</option>}
              {CATEGORIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </Select>
            <Button kind="outline" busy={busy} disabled={!category || category === t.category} onClick={() => act(() => Api.recategorize(t.id, category || t.category), 'เปลี่ยนหมวดงานแล้ว')}>เปลี่ยนหมวด</Button></div>}
          {t.status === 'SUBMITTED' && (
            <>
              <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
                <h3>ส่งต่อหน่วยงาน</h3><p className="small muted">งานจะเข้าคิวของหน่วยงานที่เลือกทันที</p>
                {depts.length === 0 ? <Note>ยังไม่มีหน่วยงาน เพิ่มได้ที่เมนู “หน่วยงาน”</Note> : <>
                  <Select id="dept" label="หน่วยงาน" icon="building" value={chosen} onChange={(e) => setDept(e.target.value)}><option value="" disabled>เลือกหน่วยงาน</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
                  <Button icon="route" block busy={busy} disabled={!chosen} onClick={() => act(() => Api.assign(t.id, chosen), `ส่งต่อให้${deptName(chosen)}แล้ว`)}>ส่งต่อ</Button>
                </>}
              </div>
              {t.routingStatus === 'REVIEW' && <div className="card stack"><h3>ส่งต่ออัตโนมัติอีกครั้ง</h3><p className="small muted">ใช้หลังเลือกหน่วยงานรับงานของหมวดนี้แล้ว หรือเมื่อระบบหน่วยงานกลับมาใช้งานได้</p><Button kind="outline" icon="refresh" busy={busy} onClick={() => act(() => Api.retryRouting(t.id), 'สั่งส่งต่ออีกครั้งแล้ว')}>ส่งต่ออีกครั้ง</Button></div>}
              <div className="card lg stack" style={{ ['--gap' as string]: '12px' }}><h3>ไม่รับเรื่อง</h3><p className="small muted">เช่น ไม่ใช่งานซ่อม หรือแจ้งซ้ำ ผู้แจ้งจะได้รับเหตุผลทางอีเมล</p><Button kind="outline" icon="x" block onClick={() => setRejectOpen(true)}>ไม่รับเรื่อง</Button></div>
            </>
          )}
          {t.status === 'ASSIGNED' && (
            <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
              <h3>เปลี่ยนหน่วยงาน</h3>
              <div className="kv" style={{ padding: 12, borderRadius: 12, background: 'var(--pink-50)' }}><Icon name="building" /><div><div className="xs muted">หน่วยงานปัจจุบัน</div><div className="strong small">{t.departmentName}</div></div></div>
              <Select id="dept" label="ส่งต่อให้" icon="route" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">เลือกหน่วยงานใหม่</option>{depts.filter((d) => d.id !== t.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              <Note>เปลี่ยนได้จนกว่าช่างจะเริ่มซ่อม</Note>
              <Button icon="route" block busy={busy} disabled={!dept} onClick={() => act(() => Api.assign(t.id, dept), `ส่งต่อให้${deptName(dept)}แล้ว`)}>เปลี่ยนหน่วยงาน</Button>
            </div>
          )}
          {t.status === 'ASSIGNED' && <Button kind="outline" icon="x" onClick={() => setRejectOpen(true)}>ไม่รับเรื่อง</Button>}
          <div className="card lg stack"><div className="row between"><h3>สถานะ</h3><Badge status={t.status} /></div><VSteps status={t.status} />{t.departmentName && t.status !== 'ASSIGNED' && <Meta icon="building">{t.departmentName}</Meta>}</div>
          <div className="card lg stack"><h3>ความคืบหน้า</h3><Timeline history={history} /></div>
        </div>
      </div>
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} label="ไม่รับเรื่อง">
        <div className="row" style={{ ['--gap' as string]: '14px' }}><Bubble icon="x" tone="red" size={48} iconSize={22} /><div><h2>ไม่รับเรื่อง</h2><div className="small muted"><span className="tid">{shortId(t.id)}</span> · {t.location}</div></div></div>
        <div className="row wrap" style={{ ['--gap' as string]: '8px' }}>{['ไม่ใช่งานซ่อม', 'แจ้งซ้ำ', 'ข้อมูลไม่เพียงพอ'].map((x) => <button type="button" key={x} className={`chip${reason.startsWith(x) ? ' on' : ''}`} onClick={() => setReason(x + ' — ')}>{x}</button>)}</div>
        <Textarea id="rr" label="เหตุผล" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} help="ผู้แจ้งจะเห็นข้อความนี้" autoFocus />
        <Note>ทำได้จนกว่าช่างจะเริ่มซ่อม</Note>
        <ErrorBox error={err} />
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button kind="ghost" onClick={() => setRejectOpen(false)}>ยกเลิก</Button><Button kind="danger" icon="x" busy={busy} disabled={!reason.trim()} onClick={() => act(() => Api.reject(t.id, reason.trim()), 'บันทึกไม่รับเรื่องแล้ว')}>ยืนยันไม่รับเรื่อง</Button></div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- departments (UC-08)
const DEPT_ICONS = ['zap', 'droplet', 'wind', 'wifi', 'building', 'wrench'];
const DEPT_TONES = ['honey', 'sage', 'lilac', 'pink', 'gray', 'pink'];
export function Departments() {
  const toast = useToast();
  const load = useLoad(() => Promise.all([Api.departments(true), Api.listTickets()]));
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
      <PageHead title="หน่วยงาน" sub="หน่วยงานรับงานซ่อม และการส่งต่องานตามหมวด"><Button icon="plus" onClick={() => { setErr(''); setEdit({ name: '', contactEmail: '', buildings: [] }); }}>เพิ่มหน่วยงาน</Button></PageHead>
      <ErrorBox error={load.error} />
      <RoutingRules departments={depts} />
      {load.loading && !load.data ? <div className="cards3"><Skeleton h={220} /><Skeleton h={220} /><Skeleton h={220} /></div> : (
        <div className="cards3">
          {depts.map((d, i) => (
            <div key={d.id} className="card stack" style={{ ['--gap' as string]: '12px' }}>
              <div className="row between"><Bubble icon={DEPT_ICONS[i % 6]} tone={DEPT_TONES[i % 6]} size={44} iconSize={22} /><div className="row" style={{ ['--gap' as string]: '8px' }}><IconButton icon="pencil" label={`แก้ไข ${d.name}`} title="แก้ไข" onClick={() => { setErr(''); setEdit({ ...d }); }} />{d.active !== false && <IconButton icon="x" className="danger" label={`ปิดใช้งาน ${d.name}`} title="ปิดใช้งาน" onClick={() => { setErr(''); setDel(d); }} />}</div></div>
              <h3>{d.name}</h3>{d.active === false && <span className="tag">ปิดใช้งานแล้ว</span>}<Meta icon="mail">{d.contactEmail}</Meta>
              <div className="row wrap" style={{ ['--gap' as string]: '6px' }}>{d.buildings.length ? d.buildings.map((b) => <span key={b} className="tag">{b}</span>) : <span className="xs muted">ยังไม่ระบุอาคาร</span>}</div>
              <hr className="divider" />
              <div className="row between"><span className="small muted">งานค้าง</span><span className="count" style={{ background: 'var(--pink-100)', color: 'var(--pink-800)' }}>{open(d.id)}</span></div>
              {d.active === false && <Button kind="outline" busy={busy} onClick={async () => { setBusy(true); try { await Api.updateDepartment(d.id, { active: true }); toast('เปิดใช้งานหน่วยงานแล้ว'); load.reload(); } catch (x) { toast((x as Error).message, 'red'); } finally { setBusy(false); } }}>เปิดใช้งานอีกครั้ง</Button>}
            </div>
          ))}
          <button className="card stack" style={{ ['--gap' as string]: '10px', alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--pink-300)', background: 'var(--pink-50)', boxShadow: 'none', cursor: 'pointer', minHeight: 220 }} onClick={() => { setErr(''); setEdit({ name: '', contactEmail: '', buildings: [] }); }}>
            <Bubble icon="plus" size={44} iconSize={22} /><span className="strong" style={{ color: 'var(--pink-800)' }}>เพิ่มหน่วยงานใหม่</span><span className="xs muted">ชื่อ อีเมลติดต่อ และอาคารที่ดูแล</span>
          </button>
        </div>
      )}
      <Drawer open={!!edit} onClose={() => setEdit(null)} label="แก้ไขหน่วยงาน">
        {edit && <form onSubmit={save} className="stack" style={{ ['--gap' as string]: '20px', flex: 1 }}>
          <div className="row between"><h2>{edit.id ? 'แก้ไขหน่วยงาน' : 'เพิ่มหน่วยงาน'}</h2><IconButton icon="x" label="ปิด" onClick={() => setEdit(null)} /></div>
          <p className="small muted">ใช้กับงานที่ส่งต่อหลังบันทึก</p>
          <ErrorBox error={err} />
          <Input id="dn" label="ชื่อหน่วยงาน" required icon="building" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น ฝ่ายไฟฟ้า" />
          <Input id="de" label="อีเมลติดต่อ" required type="email" icon="mail" value={edit.contactEmail ?? ''} onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })} help="รับอีเมลแจ้งเตือนเมื่อมีงานใหม่เข้าหน่วยงาน" />
          <div className="field"><span className="label">อาคารที่ดูแล</span>
            <div className="control" style={{ flexWrap: 'wrap', padding: 10, gap: 6 }}>
              {(edit.buildings ?? []).map((b) => <span key={b} className="tag">{b}<button type="button" aria-label={`ลบ ${b}`} onClick={() => setEdit({ ...edit, buildings: edit.buildings!.filter((x) => x !== b) })}><Icon name="x" size={12} /></button></span>)}
              <input style={{ padding: 4, minWidth: 160 }} value={newB} onChange={(e) => setNewB(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addBuilding(); } }} onBlur={addBuilding} placeholder="พิมพ์ชื่ออาคารแล้วกด Enter" aria-label="เพิ่มอาคาร" />
            </div>
            <span className="help">ใช้เป็นข้อมูลอ้างอิง การส่งต่ออัตโนมัติดูจากหมวดงาน</span>
          </div>
          <div style={{ flex: 1 }} />
          <hr className="divider" />
          <div className="row" style={{ justifyContent: 'flex-end' }}><Button kind="outline" type="button" onClick={() => setEdit(null)}>ยกเลิก</Button><Button icon="check" busy={busy} type="submit">บันทึก</Button></div>
        </form>}
      </Drawer>
      <Modal open={!!del} onClose={() => setDel(null)} label="ปิดใช้งานหน่วยงาน">
        <Bubble icon="trash" tone="red" size={56} iconSize={26} />
        <div className="stack" style={{ ['--gap' as string]: '6px' }}><h2>ปิดใช้งาน “{del?.name}”</h2><p className="small muted">ประวัติงานเดิมยังเก็บไว้ แต่จะส่งต่องานให้หน่วยงานนี้ไม่ได้ ก่อนปิดใช้งาน กรุณาย้ายบัญชีเจ้าหน้าที่ เคลียร์งานค้าง และยกเลิกการส่งต่ออัตโนมัติของหน่วยงานนี้</p></div>
        {del && open(del.id) > 0 && <Note tone="red" icon="alert">ยังมีงานค้าง {open(del.id)} งาน</Note>}
        <ErrorBox error={err} />
        <div className="two"><Button kind="outline" onClick={() => setDel(null)}>ยกเลิก</Button><Button kind="danger" icon="x" busy={busy} disabled={!!del && open(del.id) > 0} onClick={async () => { setBusy(true); setErr(''); try { await Api.deleteDepartment(del!.id); toast('ปิดใช้งานหน่วยงานแล้ว'); setDel(null); load.reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>ปิดใช้งาน</Button></div>
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
  const [editing, setEditing] = useState<{ user: PublicUser; role: 'REPORTER' | 'STAFF' | 'ADMIN'; departmentId: string; active: boolean } | null>(null);
  const [editError, setEditError] = useState('');
  const saveAccount = async (e: FormEvent) => {
    e.preventDefault(); if (!editing) return;
    setBusy(true); setEditError('');
    try {
      await Api.updateUser(editing.user.id, { role: editing.role, active: editing.active, ...(editing.role === 'STAFF' ? { departmentId: editing.departmentId } : {}) });
      toast('บันทึกบัญชีแล้ว'); setEditing(null); accounts.reload();
    } catch (x) { setEditError((x as Error).message); } finally { setBusy(false); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const u = await Api.createUser({ email: f.email.trim(), password: f.password, role: f.role, ...(f.role === 'STAFF' ? { departmentId: f.departmentId } : {}) });
      accounts.reload();
      toast(`สร้างบัญชี ${u.email} แล้ว`);
      setF({ ...f, email: '', password: '' });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const role = (icon: string, tone: string, name: string, caps: string[]) => (
    <div className="stack" style={{ ['--gap' as string]: '8px', padding: 16, borderRadius: 12, border: '1px solid var(--line-200)' }}>
      <span className="row strong small"><Bubble icon={icon} tone={tone} size={32} iconSize={16} />{name}</span>
      {caps.map((c) => <span key={c} className="row xs muted" style={{ ['--gap' as string]: '8px' }}><Icon name="check" size={14} />{c}</span>)}
    </div>
  );
  return (
    <>
      <PageHead title="บัญชีผู้ใช้" sub="สร้างบัญชีเจ้าหน้าที่ กำหนดบทบาทและหน่วยงาน" />
      <div className="split users-split">
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <form className="card lg stack" style={{ ['--gap' as string]: '18px' }} onSubmit={submit}>
            <h3>สร้างบัญชีใหม่</h3>
            <ErrorBox error={err} />
            <Input id="ue" label="อีเมล" required type="email" icon="mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@chula.ac.th" />
            <PasswordInput id="up" label="รหัสผ่านเริ่มต้น" required minLength={8} maxLength={128} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} help="อย่างน้อย 8 ตัวอักษร ส่งให้เจ้าหน้าที่ผ่านช่องทางที่ปลอดภัย" autoComplete="new-password" />
            <div className="field"><span className="label">บทบาท <span className="req">*</span></span>
              <div className="seg" role="radiogroup" aria-label="บทบาท">{(['STAFF', 'ADMIN'] as const).map((r) => <button type="button" role="radio" aria-checked={f.role === r} key={r} className={f.role === r ? 'on' : ''} onClick={() => setF({ ...f, role: r })}><Icon name={r === 'STAFF' ? 'wrench' : 'shield'} size={16} />{ROLE_LABEL[r]}</button>)}</div>
            </div>
            {f.role === 'STAFF' && <Select id="ud" label="หน่วยงาน" required icon="building" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })} help="เจ้าหน้าที่จะเห็นเฉพาะงานของหน่วยงานนี้"><option value="" disabled>เลือกหน่วยงาน</option>{(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
            <div className="row" style={{ justifyContent: 'flex-end' }}><Button icon="plus" busy={busy} type="submit">สร้างบัญชี</Button></div>
          </form>
          <ErrorBox error={accounts.error} />
          {!!accounts.data?.length && (
            <div className="card stack"><h3>บัญชีในระบบ</h3>
              {accounts.data.map((c) => <div key={c.email} className="row between account-row" style={{ padding: '10px 0', borderTop: '1px solid var(--line-200)' }}>
                <span className="row grow small" style={{ overflowWrap: 'anywhere' }}><span className="avatar">{c.email.slice(0, 2)}</span><span className="stack" style={{ ['--gap' as string]: '2px' }}><span className="strong">{c.email}</span><span className="xs muted">{ROLE_LABEL[c.role] ?? c.role}{c.departmentId && ` · ${depts.data?.find(d => d.id === c.departmentId)?.name ?? ''}`}{c.active === false && ' · ปิดใช้งาน'}</span></span></span>
                <IconButton icon="pencil" label={`จัดการบัญชี ${c.email}`} title="จัดการบัญชี" onClick={() => { setEditError(''); setEditing({ user: c, role: c.role as 'REPORTER' | 'STAFF' | 'ADMIN', departmentId: c.departmentId, active: c.active !== false }); }} />
              </div>)}
            </div>
          )}
        </div>
        <div className="card lg stack" style={{ ['--gap' as string]: '12px' }}>
          <h3>สิทธิ์ตามบทบาท</h3>
          {role('eye', 'honey', 'ผู้เยี่ยมชม', ['เปิดดูหน้าแจ้งซ่อมได้ แต่ต้องเข้าสู่ระบบก่อนส่ง', 'ติดตามรายการเดิมได้จากเบราว์เซอร์ที่ใช้แจ้ง'])}
          {role('user', 'pink', 'ผู้แจ้ง · ลงทะเบียนเอง', ['แจ้งซ่อม ดูและยกเลิกรายการของตนเอง', 'ตรวจรับงาน หรือส่งกลับให้แก้ไข'])}
          {role('wrench', 'lilac', 'เจ้าหน้าที่', ['เห็นเฉพาะงานของหน่วยงานตนเอง', 'เริ่มซ่อม และส่งงานพร้อมรูปหลังซ่อม'])}
          {role('shield', 'sage', 'ผู้ดูแลระบบ', ['รับเรื่อง ส่งต่อ หรือไม่รับเรื่อง', 'จัดการหน่วยงานและบัญชีผู้ใช้'])}
        </div>
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} label="จัดการบัญชี">
        {editing && <form onSubmit={saveAccount} className="stack" style={{ gap: 18 }}>
          <h2>จัดการบัญชี</h2><p className="small" style={{ overflowWrap: 'anywhere' }}>{editing.user.email}</p>
          <Note>เมื่อเปลี่ยนบทบาท หน่วยงาน หรือสถานะ ผู้ใช้ต้องเข้าสู่ระบบใหม่</Note>
          <Select id="account-role" label="บทบาท" value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value as typeof editing.role })}><option value="REPORTER">ผู้แจ้ง</option><option value="STAFF">เจ้าหน้าที่</option><option value="ADMIN">ผู้ดูแลระบบ</option></Select>
          {editing.role === 'STAFF' && <Select id="account-department" label="หน่วยงาน" required value={editing.departmentId} onChange={e => setEditing({ ...editing, departmentId: e.target.value })}><option value="">เลือกหน่วยงาน</option>{(depts.data ?? []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
          <label className="check"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />เปิดใช้งานบัญชี</label>
          <ErrorBox error={editError} /><div className="two"><Button kind="outline" type="button" onClick={() => setEditing(null)}>ยกเลิก</Button><Button type="submit" busy={busy}>บันทึกบัญชี</Button></div>
        </form>}
      </Modal>
    </>
  );
}
