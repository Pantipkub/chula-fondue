import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { Ticket } from '../lib/api';
import { ago, categoryOf, fmtDate, fmtShort, shortId } from '../lib/format';
import { Badge, Bubble, Button, Empty, ErrorBox, Gallery, Icon, Input, Note, Photo, PhotoPicker, Select, Skeleton, Timeline, useLoad, useToast } from '../components/ui';
import { AppShell, Crumb, PageHead } from '../components/layouts';
import { KV } from './reporter';

const QUEUE_STATUSES = [
  { value: 'ACTIVE', label: 'งานที่ต้องติดตาม', icon: 'list', tone: 'pink' },
  { value: 'ASSIGNED', label: 'รอเริ่มงาน', icon: 'inbox', tone: 'pink' },
  { value: 'IN_PROGRESS', label: 'กำลังดำเนินการ', icon: 'wrench', tone: 'lilac' },
  { value: 'RESOLVED', label: 'รอผู้แจ้งยืนยัน', icon: 'check', tone: 'sage' },
  { value: 'CLOSED', label: 'ปิดเรื่องแล้ว', icon: 'heart', tone: 'gray' },
  { value: 'ALL', label: 'งานทั้งหมด', icon: 'ticket', tone: 'gray' },
];
const ACTIVE_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED'];
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
  useEffect(() => { if (load.data) previous.current = load.data; }, [load.data]);
  const all = load.data ?? previous.current ?? NO_TICKETS;
  const hasData = load.data !== undefined || previous.current !== undefined;
  const dept = all.find((t) => t.departmentName)?.departmentName;
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const status = QUEUE_STATUSES.some((item) => item.value === params.get('status')) ? params.get('status')! : 'ACTIVE';
  const sort = ['oldest', 'newest', 'updated'].includes(params.get('sort') ?? '') ? params.get('sort')! : 'oldest';
  const size = [10, 20, 50].includes(Number(params.get('size'))) ? Number(params.get('size')) : 20;
  const counts = useMemo(() => {
    const result: Record<string, number> = { ACTIVE: 0, ALL: all.length };
    for (const ticket of all) {
      result[ticket.status] = (result[ticket.status] ?? 0) + 1;
      if (ACTIVE_STATUSES.includes(ticket.status)) result.ACTIVE++;
    }
    return result;
  }, [all]);
  const categories = useMemo(() => Array.from(new Set([...all.map((ticket) => ticket.category), ...(category ? [category] : [])])).sort((a, b) => categoryOf(a).label.localeCompare(categoryOf(b).label, 'th')), [all, category]);
  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('th');
    return all.filter((ticket) => {
      const statusMatches = status === 'ALL' || (status === 'ACTIVE' ? ACTIVE_STATUSES.includes(ticket.status) : ticket.status === status);
      return statusMatches && (!category || ticket.category === category) && (!search || `${ticket.id} ${shortId(ticket.id)} ${ticket.description} ${ticket.location} ${ticket.reporterEmail} ${categoryOf(ticket.category).label}`.toLocaleLowerCase('th').includes(search));
    }).sort((a, b) => {
      const time = (ticket: Ticket) => Date.parse(sort === 'updated' ? ticket.updatedAt : ticket.createdAt) || 0;
      const difference = sort === 'oldest' ? time(a) - time(b) : time(b) - time(a);
      return difference || a.id.localeCompare(b.id);
    });
  }, [all, query, category, status, sort]);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const requestedPage = Number(params.get('page'));
  const page = Math.min(pageCount, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const visible = rows.slice((page - 1) * size, page * size);
  const filtered = query.trim() !== '' || category !== '' || status !== 'ACTIVE';
  const update = (values: Record<string, string>, resetPage = true) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (resetPage) next.delete('page');
      for (const [key, value] of Object.entries(values)) {
        if (!value || (key === 'status' && value === 'ACTIVE') || (key === 'sort' && value === 'oldest') || (key === 'size' && value === '20') || (key === 'page' && value === '1')) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  };
  const reset = () => update({ q: '', category: '', status: 'ACTIVE' });
  const changePage = (next: number) => {
    update({ page: String(next) }, false);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: 'start' });
  };
  const start = async (t: Ticket) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(t.id);
    try { await Api.start(t.id); toast('เริ่มดำเนินการแล้ว'); load.reload(); } catch (x) { toast((x as Error).message, 'red'); } finally { submitting.current = false; setBusy(''); }
  };
  const pageNumbers = Array.from(new Set([1, page - 1, page, page + 1, pageCount])).filter((number) => number >= 1 && number <= pageCount).sort((a, b) => a - b);
  return (
    <>
      <PageHead title="คิวงานของหน่วยงาน" sub={dept ?? 'คำร้องที่มอบหมายให้หน่วยงานของคุณ'}><Button kind="outline" icon="undo" onClick={load.reload} busy={load.loading}>รีเฟรช</Button></PageHead>
      <div className="queue-summary" aria-label="สรุปคิวงานและกรองสถานะ">
        {QUEUE_STATUSES.slice(0, 4).map((item) => <button key={item.value} type="button" className={`queue-summary-item${status === item.value ? ' selected' : ''}`} aria-pressed={status === item.value} onClick={() => update({ status: item.value })}>
          <Bubble icon={item.icon} tone={item.tone} size={40} iconSize={19} /><span className="queue-summary-label">{item.label}</span><strong>{hasData ? countLabel(counts[item.value] ?? 0) : '—'}</strong>
        </button>)}
      </div>
      <section className="queue-workspace" aria-label="จัดการคำร้อง">
        <div className={`queue-toolbar${filtersOpen ? ' expanded' : ''}`}>
          <Input id="staff-queue-search" label="ค้นหาคำร้อง" icon="search" placeholder="เลขคำร้อง เรื่อง สถานที่ หรือผู้แจ้ง" value={query} onChange={(event) => update({ q: event.target.value })} />
          <Button className="queue-filter-toggle" kind="outline" icon="filter" aria-label={filtersOpen ? 'ซ่อนตัวกรองคำร้อง' : 'แสดงตัวกรองคำร้อง'} aria-expanded={filtersOpen} aria-controls="staff-queue-status-field staff-queue-category-field staff-queue-sort-field" onClick={() => setFiltersOpen((open) => !open)}><span>ตัวกรอง</span></Button>
          <div id="staff-queue-status-field"><Select id="staff-queue-status" label="สถานะ" value={status} onChange={(event) => update({ status: event.target.value })}>{QUEUE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></div>
          <div id="staff-queue-category-field"><Select id="staff-queue-category" label="หมวดหมู่" value={category} onChange={(event) => update({ category: event.target.value })}><option value="">ทุกหมวดหมู่</option>{categories.map((value) => <option key={value} value={value}>{categoryOf(value).label}</option>)}</Select></div>
          <div id="staff-queue-sort-field"><Select id="staff-queue-sort" label="เรียงตาม" value={sort} onChange={(event) => update({ sort: event.target.value })}><option value="oldest">แจ้งนานที่สุดก่อน</option><option value="newest">แจ้งล่าสุดก่อน</option><option value="updated">อัปเดตล่าสุดก่อน</option></Select></div>
        </div>
        <div className="queue-results-heading">
          <div><h2 ref={resultsHeading} tabIndex={-1}>รายการคำร้อง</h2><p className="small muted" role="status">{!hasData ? load.loading ? 'กำลังโหลดคิวงาน…' : 'ยังโหลดข้อมูลไม่สำเร็จ' : `${countLabel(rows.length)} รายการ${rows.length ? ` · แสดง ${countLabel((page - 1) * size + 1)}–${countLabel(Math.min(page * size, rows.length))}` : ''}`}</p></div>
          {filtered && <Button kind="ghost" sm icon="x" onClick={reset}>ล้างตัวกรอง</Button>}
        </div>
        {load.error && <div className="queue-load-error"><ErrorBox error={load.error} />{hasData ? <p className="small muted">แสดงข้อมูลล่าสุดที่โหลดสำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง</p> : <Button kind="outline" icon="undo" onClick={load.reload}>ลองโหลดอีกครั้ง</Button>}</div>}
        {load.loading && !hasData ? <div className="queue-loading" aria-label="กำลังโหลดคำร้อง"><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /></div> : hasData && rows.length === 0 ? (
          <Empty icon={all.length === 0 ? 'inbox' : 'search'} title={all.length === 0 ? 'ยังไม่มีงานที่มอบหมายให้หน่วยงานของคุณ' : filtered ? 'ไม่พบคำร้องที่ตรงกับตัวกรอง' : 'ไม่มีงานที่ต้องติดตาม'}>
            <p className="small">{all.length === 0 ? 'คำร้องใหม่จะแสดงที่นี่เมื่อได้รับมอบหมาย' : filtered ? 'ลองเปลี่ยนคำค้น สถานะ หรือหมวดหมู่' : 'ดูประวัติงานที่เสร็จแล้วได้จากตัวกรองสถานะ'}</p>
            {filtered ? <Button kind="outline" onClick={reset}>ล้างตัวกรอง</Button> : all.length > 0 && <Button kind="outline" onClick={() => update({ status: 'ALL' })}>ดูงานทั้งหมด</Button>}
          </Empty>
        ) : hasData && (
          <div className="queue-table-wrap" aria-busy={load.loading}>
            <table className="queue-table">
              <caption className="sr-only">คำร้องของหน่วยงาน หน้า {page} จาก {pageCount}</caption>
              <thead><tr><th scope="col">คำร้อง</th><th scope="col">สถานที่</th><th scope="col">สถานะ</th><th scope="col">แจ้งเมื่อ</th><th scope="col">จัดการ</th></tr></thead>
              <tbody>{visible.map((ticket) => {
                const c = categoryOf(ticket.category);
                const to = `/staff/tickets/${ticket.id}`;
                const state = { queueSearch: location.search };
                return <tr key={ticket.id}>
                  <td className="queue-ticket-cell"><Link className="queue-ticket-link" to={to} state={state}>
                    {ticket.photoUrls[0] ? <Photo src={ticket.photoUrls[0]} className="queue-thumb" /> : <Bubble icon={c.icon} tone={c.tone} size={42} iconSize={20} />}
                    <span className="queue-ticket-text"><span className="queue-ticket-name" title={ticket.description}>{ticket.description}</span><span className="xs muted">{shortId(ticket.id)}<span className="queue-category"> · {c.label}</span></span></span>
                  </Link></td>
                  <td className="queue-location-cell" data-label="สถานที่"><span title={ticket.location}>{ticket.location}</span></td>
                  <td className="queue-status-cell" data-label="สถานะ"><Badge status={ticket.status} /></td>
                  <td className="queue-date-cell" data-label="แจ้งเมื่อ"><time dateTime={ticket.createdAt} title={fmtDate(ticket.createdAt)}>{fmtShort(ticket.createdAt)}</time><span className="xs muted">อัปเดต {ago(ticket.updatedAt)}</span></td>
                  <td className="queue-actions-cell"><div className="queue-row-actions">
                    {ticket.status === 'ASSIGNED' && <Button sm icon="play" busy={busy === ticket.id} disabled={!!busy || load.loading} onClick={() => start(ticket)}>เริ่มงาน<span className="sr-only"> {shortId(ticket.id)}</span></Button>}
                    {ticket.status === 'IN_PROGRESS' && <Link to={to} state={state} className="btn success sm"><Icon name="check" size={16} />ส่งงาน<span className="sr-only"> {shortId(ticket.id)}</span></Link>}
                    <Link to={to} state={state} className="queue-detail-link" title="ดูรายละเอียด" aria-label={`ดูรายละเอียด ${shortId(ticket.id)}`}><span className={['ASSIGNED', 'IN_PROGRESS'].includes(ticket.status) ? 'sr-only' : undefined}>รายละเอียด</span><Icon name={['ASSIGNED', 'IN_PROGRESS'].includes(ticket.status) ? 'eye' : 'right'} size={17} /></Link>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {hasData && rows.length > 0 && <footer className="queue-pagination">
          <Select id="staff-queue-size" label="รายการต่อหน้า" value={size} onChange={(event) => update({ size: event.target.value })}>{[10, 20, 50].map((value) => <option key={value} value={value}>{value} รายการ</option>)}</Select>
          <nav className="queue-page-controls" aria-label="หน้ารายการคำร้อง">
            <Button kind="outline" sm icon="back" disabled={page === 1} onClick={() => changePage(page - 1)}>ก่อนหน้า</Button>
            <div className="queue-page-numbers">{pageNumbers.map((number, index) => <span key={number}>{index > 0 && number - pageNumbers[index - 1] > 1 && <span className="queue-page-gap">…</span>}<button type="button" className={`queue-page-number${number === page ? ' current' : ''}`} aria-current={number === page ? 'page' : undefined} aria-label={`หน้า ${number}`} onClick={() => changePage(number)}>{number}</button></span>)}</div>
            <span className="queue-page-position small muted">หน้า {countLabel(page)} / {countLabel(pageCount)}</span>
            <Button kind="outline" sm disabled={page === pageCount} onClick={() => changePage(page + 1)}>ถัดไป<Icon name="right" size={16} /></Button>
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
  if (load.loading && !load.data) return <><Skeleton h={60} /><Skeleton h={420} /></>;
  if (!load.data) return <ErrorBox error={load.error ?? 'ไม่พบเรื่องนี้'} />;
  const { ticket: t, history } = load.data;
  const c = categoryOf(t.category);
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setErr('');
    try { await fn(); toast(msg); setPhotos([]); load.reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <Crumb to={queueTo} label="คิวงาน" current={shortId(t.id)} />
      <div className="stack" style={{ ['--gap' as string]: '8px' }}><div className="row wrap"><Badge status={t.status} /><span className="small muted strong">{shortId(t.id)}</span><span className="small muted">· แจ้งเมื่อ {fmtDate(t.createdAt)}</span></div><h1>{t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description}</h1></div>
      <div className="split">
        <div className="stack" style={{ ['--gap' as string]: '24px' }}>
          <Gallery urls={t.photoUrls} />
          <div className="card lg stack"><h3>รายละเอียด</h3><p style={{ lineHeight: 1.65 }}>{t.description}</p><hr className="divider" />
            <div className="two"><KV icon={c.icon} k="หมวด" v={c.label} /><KV icon="pin" k="สถานที่" v={t.location} /><KV icon="calendar" k="แจ้งเมื่อ" v={fmtDate(t.createdAt)} /><KV icon="mail" k="ติดต่อผู้แจ้ง" v={t.reporterEmail} /></div>
          </div>
          <div className="card lg stack"><h3>ไทม์ไลน์</h3><Timeline history={history} /></div>
        </div>
        <div className="stack" style={{ ['--gap' as string]: '20px' }}>
          <ErrorBox error={err} />
          {t.status === 'ASSIGNED' && (
            <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
              <div className="row"><Bubble icon="play" size={44} iconSize={22} /><div><h3>พร้อมเริ่มงาน?</h3><div className="small muted">ผู้แจ้งจะเห็นสถานะ “กำลังดำเนินการ”</div></div></div>
              <Button icon="play" block busy={busy} onClick={() => act(() => Api.start(t.id), 'เริ่มดำเนินการแล้ว')}>เริ่มดำเนินการ</Button>
            </div>
          )}
          {t.status === 'IN_PROGRESS' && (
            <div className="card lg stack" style={{ ['--gap' as string]: '14px' }}>
              <div className="row"><Bubble icon="camera" tone="sage" size={44} iconSize={22} /><div><h3>ส่งงานว่าแก้ไขเสร็จ</h3><div className="small muted">แนบรูปหลังแก้ไข 1–5 รูป</div></div></div>
              {history.at(-1)?.fromStatus === 'RESOLVED' && <Note tone="lilac" icon="undo">ผู้แจ้งขอให้แก้ไขใหม่: “{t.reason}”</Note>}
              <PhotoPicker files={photos} onChange={setPhotos} compact />
              <Note tone="sage">ผู้แจ้งจะเห็นรูปเหล่านี้ และกดยืนยันผลหรือขอแก้ไขใหม่</Note>
              <Button kind="success" icon="check" block busy={busy} disabled={!photos.length} onClick={() => act(() => Api.resolve(t.id, photos), 'ส่งงานแล้ว รอผู้แจ้งยืนยัน')}>ยืนยันว่าแก้ไขเสร็จ</Button>
            </div>
          )}
          {t.completionPhotoUrls.length > 0 && <div className="card stack"><h3>รูปหลังแก้ไข</h3><div className="thumbs-row">{t.completionPhotoUrls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ width: 150 }}><Photo src={u} tone={i + 2} /></a>)}</div></div>}
          {['RESOLVED', 'CLOSED'].includes(t.status) && <Note tone={t.status === 'CLOSED' ? 'sage' : 'honey'} icon={t.status === 'CLOSED' ? 'heart' : 'clock'}>{t.status === 'CLOSED' ? 'ผู้แจ้งยืนยันผลแล้ว ปิดเรื่องเรียบร้อย' : 'ส่งงานแล้ว รอผู้แจ้งยืนยันผล'}</Note>}
        </div>
      </div>
    </>
  );
}
