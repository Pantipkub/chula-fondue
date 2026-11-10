import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { Ticket } from '../lib/api';
import { ago, categoryOf, fmtDate, fmtShort, shortId } from '../lib/format';
import { Badge, Bubble, Button, Empty, ErrorBox, Gallery, Icon, IconButton, Input, Note, Photo, PhotoPicker, Select, Skeleton, Timeline, useLoad, useToast } from '../components/ui';
import { AppShell, Crumb, PageHead } from '../components/layouts';
import { KeyValue } from './reporter';
import { emptyQueueCopy, filterQueue, queueCounts, queuePage, queueResultLabel, updateQueueParams } from '../lib/staff-queue';

const QUEUE_STATUSES = [
  { value: 'ACTIVE', label: 'งานค้าง', icon: 'list', tone: 'pink' },
  { value: 'ASSIGNED', label: 'รอเริ่มซ่อม', icon: 'inbox', tone: 'pink' },
  { value: 'IN_PROGRESS', label: 'กำลังซ่อม', icon: 'wrench', tone: 'lilac' },
  { value: 'RESOLVED', label: 'รอตรวจรับ', icon: 'check', tone: 'sage' },
  { value: 'CLOSED', label: 'ปิดงานแล้ว', icon: 'done', tone: 'gray' },
  { value: 'ALL', label: 'งานทั้งหมด', icon: 'ticket', tone: 'gray' },
];
const NO_TICKETS: Ticket[] = [];
const countLabel = (value: number) => value.toLocaleString('th-TH');

export function StaffFrame() {
  const loc = useLocation();
  const load = useLoad(() => Api.listTickets({ status: 'ASSIGNED' }), [loc.pathname]);
  return <AppShell role="STAFF" counts={{ '/staff': load.data?.length ?? 0 }} />;
}

export function Queue() {
  const toast = useToast();
  const load = useLoad(() => Api.listTickets({ includeCancelled: 'true' }));
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const submitting = useRef(false);
  const previous = useRef<Ticket[]>();
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (load.data) { previous.current = load.data; } }, [load.data]);
  const all = load.data ?? previous.current ?? NO_TICKETS;
  const hasData = load.data !== undefined || previous.current !== undefined;
  const dept = all.find((t) => t.departmentName)?.departmentName;
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const status = QUEUE_STATUSES.some((item) => item.value === params.get('status')) ? params.get('status')! : 'ACTIVE';
  const sort = ['oldest', 'newest', 'updated'].includes(params.get('sort') ?? '') ? params.get('sort')! : 'oldest';
  const counts = useMemo(() => queueCounts(all), [all]);
  const categories = useMemo(() => Array.from(new Set([...all.map((ticket) => ticket.category), ...(category ? [category] : [])])).sort((a, b) => categoryOf(a).label.localeCompare(categoryOf(b).label, 'th')), [all, category]);
  const rows = useMemo(() => filterQueue(all, { query, category, status, sort }), [all, query, category, status, sort]);
  const { size, pageCount, page } = queuePage(params, rows.length);
  const visible = rows.slice((page - 1) * size, page * size);
  const filtered = query.trim() !== '' || category !== '' || status !== 'ACTIVE';
  const empty = emptyQueueCopy(all.length, filtered);
  const update = (values: Record<string, string>, resetPage = true) => {
    setParams(current => updateQueueParams(current, values, resetPage), { replace: true });
  };
  const reset = () => update({ q: '', category: '', status: 'ACTIVE' });
  const changePage = (next: number) => {
    update({ page: String(next) }, false);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: 'start' });
  };
  const start = async (t: Ticket) => {
    if (submitting.current) { return; }
    submitting.current = true;
    setBusy(t.id);
    try { await Api.start(t.id); toast('เริ่มซ่อมแล้ว'); load.reload(); } catch (error_) { toast((error_ as Error).message, 'red'); } finally { submitting.current = false; setBusy(''); }
  };
  const pageNumbers = Array.from(new Set([1, page - 1, page, page + 1, pageCount])).filter((number) => number >= 1 && number <= pageCount).sort((a, b) => a - b);
  return (
    <>
      <PageHead title="คิวงานซ่อม" sub={dept ?? 'งานที่ส่งถึงหน่วยงานของคุณ'}><IconButton icon="refresh" label="รีเฟรช" onClick={load.reload} busy={load.loading} /></PageHead>
      <div className="queue-summary" aria-label="สรุปคิวงานและกรองสถานะ">
        {QUEUE_STATUSES.slice(0, 4).map((item) => <button key={item.value} type="button" className={`queue-summary-item${status === item.value ? ' selected' : ''}`} aria-pressed={status === item.value} onClick={() => update({ status: item.value })}>
          <Bubble icon={item.icon} tone={item.tone} size={40} iconSize={19} /><span className="queue-summary-label">{item.label}</span><strong>{hasData ? countLabel(counts[item.value] ?? 0) : '—'}</strong>
        </button>)}
      </div>
      <section className="queue-workspace" aria-label="รายการงาน">
        <div className={`queue-toolbar${filtersOpen ? ' expanded' : ''}`}>
          <Input id="staff-queue-search" label="ค้นหางาน" icon="search" placeholder="เลขที่ รายละเอียด สถานที่ หรือผู้แจ้ง" value={query} onChange={(event) => update({ q: event.target.value })} />
          <Button className="queue-filter-toggle" kind="outline" icon="filter" aria-label={filtersOpen ? 'ซ่อนตัวกรอง' : 'แสดงตัวกรอง'} aria-expanded={filtersOpen} aria-controls="staff-queue-status-field staff-queue-category-field staff-queue-sort-field" onClick={() => setFiltersOpen((open) => !open)}><span>ตัวกรอง</span></Button>
          <div id="staff-queue-status-field"><Select id="staff-queue-status" label="สถานะ" value={status} onChange={(event) => update({ status: event.target.value })}>{QUEUE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></div>
          <div id="staff-queue-category-field"><Select id="staff-queue-category" label="หมวดหมู่" value={category} onChange={(event) => update({ category: event.target.value })}><option value="">ทุกหมวดหมู่</option>{categories.map((value) => <option key={value} value={value}>{categoryOf(value).label}</option>)}</Select></div>
          <div id="staff-queue-sort-field"><Select id="staff-queue-sort" label="เรียงตาม" value={sort} onChange={(event) => update({ sort: event.target.value })}><option value="oldest">เก่าที่สุดก่อน</option><option value="newest">ใหม่ที่สุดก่อน</option><option value="updated">อัปเดตล่าสุดก่อน</option></Select></div>
        </div>
        <div className="queue-results-heading">
          <div><h2 ref={resultsHeading} tabIndex={-1}>รายการงาน</h2><output className="small muted">{queueResultLabel(hasData, load.loading, rows.length, page, size)}</output></div>
          {filtered && <Button kind="ghost" sm icon="x" onClick={reset}>ล้างตัวกรอง</Button>}
        </div>
        {load.error && <div className="queue-load-error"><ErrorBox error={load.error} />{hasData ? <p className="small muted">โหลดข้อมูลใหม่ไม่สำเร็จ กำลังแสดงข้อมูลล่าสุด</p> : <Button kind="outline" icon="refresh" onClick={load.reload}>ลองโหลดอีกครั้ง</Button>}</div>}
        {(load.loading && !hasData) && (<div className="queue-loading" aria-label="กำลังโหลด"><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /></div>)}{!(load.loading && !hasData) && (hasData && rows.length === 0 ? (
          <Empty icon={all.length === 0 ? 'inbox' : 'search'} title={empty.title}>
            <p className="small">{empty.detail}</p>
            {filtered ? <Button kind="outline" onClick={reset}>ล้างตัวกรอง</Button> : all.length > 0 && <Button kind="outline" onClick={() => update({ status: 'ALL' })}>ดูงานทั้งหมด</Button>}
          </Empty>
        ) : hasData && (
          <div className="queue-table-wrap" aria-busy={load.loading}>
            <table className="queue-table">
              <caption className="sr-only">งานของหน่วยงาน หน้า {page} จาก {pageCount}</caption>
              <thead><tr><th scope="col">งานซ่อม</th><th scope="col">สถานที่</th><th scope="col">สถานะ</th><th scope="col">แจ้งเมื่อ</th><th scope="col"><span className="sr-only">จัดการ</span></th></tr></thead>
              <tbody>{visible.map((ticket) => {
                const c = categoryOf(ticket.category);
                const to = `/staff/tickets/${ticket.id}`;
                const state = { queueSearch: location.search };
                return <tr key={ticket.id}>
                  <td className="queue-ticket-cell"><Link className="queue-ticket-link" to={to} state={state}>
                    {ticket.photoUrls[0] ? <Photo src={ticket.photoUrls[0]} className="queue-thumb" /> : <Bubble icon={c.icon} tone={c.tone} size={42} iconSize={20} />}
                    <span className="queue-ticket-text"><span className="queue-ticket-name" title={ticket.description}>{ticket.description}</span><span className="xs muted"><span className="tid">{shortId(ticket.id)}</span><span className="queue-category"> · {c.label}</span></span></span>
                  </Link></td>
                  <td className="queue-location-cell" data-label="สถานที่"><span title={ticket.location}>{ticket.location}</span></td>
                  <td className="queue-status-cell" data-label="สถานะ"><Badge status={ticket.status} /></td>
                  <td className="queue-date-cell" data-label="แจ้งเมื่อ"><time dateTime={ticket.createdAt} title={fmtDate(ticket.createdAt)}>{fmtShort(ticket.createdAt)}</time><span className="xs muted">อัปเดต {ago(ticket.updatedAt)}</span></td>
                  <td className="queue-actions-cell"><div className="queue-row-actions">
                    {ticket.status === 'ASSIGNED' && <Button sm icon="play" busy={busy === ticket.id} disabled={!!busy || load.loading} onClick={() => start(ticket)}>เริ่มซ่อม<span className="sr-only"> {shortId(ticket.id)}</span></Button>}
                    {ticket.status === 'IN_PROGRESS' && <Link to={to} state={state} className="btn success sm"><Icon name="check" size={16} />ส่งงาน<span className="sr-only"> {shortId(ticket.id)}</span></Link>}
                    <Link to={to} state={state} className="queue-detail-link" title="ดูรายละเอียด" aria-label={`ดูรายละเอียด ${shortId(ticket.id)}`}><Icon name="right" size={18} /></Link>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ))}
        {hasData && rows.length > 0 && <footer className="queue-pagination">
          <Select id="staff-queue-size" label="รายการต่อหน้า" value={size} onChange={(event) => update({ size: event.target.value })}>{[10, 20, 50].map((value) => <option key={value} value={value}>{value} รายการ</option>)}</Select>
          <nav className="queue-page-controls" aria-label="เลขหน้า">
            <IconButton icon="left" label="ก่อนหน้า" disabled={page === 1} onClick={() => changePage(page - 1)} />
            <div className="queue-page-numbers">{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span className="queue-page-gap">…</span>}<button type="button" className={`queue-page-number${number === page ? ' current' : ''}`} aria-current={number === page ? 'page' : undefined} aria-label={`หน้า ${number}`} onClick={() => changePage(number)}>{number}</button></span>)}</div>
            <span className="queue-page-position small muted">หน้า {countLabel(page)} / {countLabel(pageCount)}</span>
            <IconButton icon="right" label="ถัดไป" disabled={page === pageCount} onClick={() => changePage(page + 1)} />
          </nav>
        </footer>}
      </section>
    </>
  );
}

export function Work() {
  const { id = '' } = useParams();
  const location = useLocation();
  const queueSearch = location.state?.queueSearch;
  const queueTo = '/staff' + (typeof queueSearch === 'string' && queueSearch.startsWith('?') ? queueSearch : '');
  const toast = useToast();
  const load = useLoad(() => Api.history(id), [id]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (load.loading && !load.data) { return <><Skeleton h={60} /><Skeleton h={420} /></>; }
  if (!load.data) { return <ErrorBox error={load.error ?? 'ไม่พบรายการนี้'} />; }
  const { ticket: t, history } = load.data;
  const c = categoryOf(t.category);
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr('');
    try { await fn(); toast(msg); setPhotos([]); load.reload(); } catch (error_) { setErr((error_ as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <Crumb to={queueTo} label="คิวงาน" current={shortId(t.id)} />
      <div className="stack" style={{ ['--gap' as string]: '8px' }}><div className="row wrap"><Badge status={t.status} /><span className="small muted tid">{shortId(t.id)}</span><span className="small muted">· แจ้งเมื่อ {fmtDate(t.createdAt)}</span></div><h1>{t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description}</h1></div>
      <div className="split">
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <Gallery urls={t.photoUrls} />
          <div className="card lg stack"><h3>รายละเอียด</h3><p style={{ lineHeight: 1.7 }}>{t.description}</p><hr className="divider" />
            <div className="two"><KeyValue icon={c.icon} k="หมวด" v={c.label} /><KeyValue icon="pin" k="สถานที่" v={t.location} /><KeyValue icon="calendar" k="แจ้งเมื่อ" v={fmtDate(t.createdAt)} /><KeyValue icon="mail" k="ติดต่อผู้แจ้ง" v={t.reporterEmail} /></div>
          </div>
          <div className="card lg stack"><h3>ความคืบหน้า</h3><Timeline history={history} /></div>
        </div>
        <div className="stack" style={{ ['--gap' as string]: '20px' }}>
          <ErrorBox error={err} />
          {t.status === 'ASSIGNED' && (
            <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
              <div className="row"><Bubble icon="play" size={44} iconSize={22} /><div><h3>เริ่มซ่อม</h3><div className="small muted">ผู้แจ้งจะเห็นสถานะ “กำลังซ่อม”</div></div></div>
              <Button icon="play" block busy={busy} onClick={() => act(() => Api.start(t.id), 'เริ่มซ่อมแล้ว')}>เริ่มซ่อม</Button>
            </div>
          )}
          {t.status === 'IN_PROGRESS' && (
            <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
              <div className="row"><Bubble icon="camera" tone="sage" size={44} iconSize={22} /><div><h3>ส่งงาน</h3><div className="small muted">แนบรูปหลังซ่อม 1–5 รูป</div></div></div>
              {history.at(-1)?.fromStatus === 'RESOLVED' && <Note tone="lilac" icon="undo">ผู้แจ้งส่งกลับแก้ไข: “{t.reason}”</Note>}
              <PhotoPicker files={photos} onChange={setPhotos} compact />
              <Note tone="sage">ผู้แจ้งจะดูรูปเหล่านี้ประกอบการตรวจรับงาน</Note>
              <Button kind="success" icon="check" block busy={busy} disabled={!photos.length} onClick={() => act(() => Api.resolve(t.id, photos), 'ส่งงานแล้ว รอผู้แจ้งตรวจรับ')}>ส่งงาน</Button>
            </div>
          )}
          {t.completionPhotoUrls.length > 0 && <div className="card stack"><h3>รูปหลังซ่อม</h3><div className="thumbs-row">{t.completionPhotoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 150 }}><Photo src={u} tone={i + 2} /></a>)}</div></div>}
          {['RESOLVED', 'CLOSED'].includes(t.status) && <Note tone={t.status === 'CLOSED' ? 'sage' : 'honey'} icon={t.status === 'CLOSED' ? 'done' : 'clock'}>{t.status === 'CLOSED' ? 'ผู้แจ้งตรวจรับงานแล้ว' : 'ส่งงานแล้ว รอผู้แจ้งตรวจรับ'}</Note>}
        </div>
      </div>
    </>
  );
}
