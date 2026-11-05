import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Api } from '../lib/api';
import type { Ticket } from '../lib/api';
import { ago, categoryOf, fmtDate, shortId } from '../lib/format';
import { Badge, Bubble, Button, Empty, ErrorBox, Gallery, Icon, Meta, Note, Photo, PhotoPicker, Skeleton, Timeline, useLoad, useToast } from '../components/ui';
import { AppShell, Crumb, PageHead } from '../components/layouts';
import { KV, Kpi } from './reporter';

export function StaffFrame() {
  const loc = useLocation();
  const load = useLoad(() => Api.listTickets({ status: 'ASSIGNED' }), [loc.pathname]);
  return <AppShell role="STAFF" counts={{ '/staff': load.data?.length ?? 0 }} />;
}

export function Queue() {
  const toast = useToast();
  const load = useLoad(() => Api.listTickets());
  const [busy, setBusy] = useState('');
  const all = load.data ?? [];
  const dept = all.find((t) => t.departmentName)?.departmentName;
  const col = (s: Ticket['status']) => all.filter((t) => t.status === s);
  const start = async (t: Ticket) => {
    setBusy(t.id);
    try { await Api.start(t.id); toast('เริ่มดำเนินการแล้ว'); load.reload(); } catch (x) { toast((x as Error).message, 'red'); } finally { setBusy(''); }
  };
  const card = (t: Ticket, i: number, action: React.ReactNode) => (
    <div key={t.id} className="card stack" style={{ padding: 12, borderRadius: 20, ['--gap' as string]: '10px' }}>
      <Link to={`/staff/tickets/${t.id}`}><Photo src={t.photoUrls[0]} tone={i} /></Link>
      <div className="row between"><Badge status={t.status} /><span className="xs muted strong">{shortId(t.id)}</span></div>
      <Link to={`/staff/tickets/${t.id}`} style={{ color: 'inherit' }}><h3 style={{ fontSize: 16 }}>{t.description}</h3></Link>
      <Meta icon="pin">{t.location}</Meta><Meta icon="clock">อัปเดต {ago(t.updatedAt)}</Meta>
      {action}
    </div>
  );
  const columns: [string, string, Ticket[], (t: Ticket, i: number) => React.ReactNode][] = [
    ['มอบหมายแล้ว · รอเริ่ม', 'var(--pink-600)', col('ASSIGNED'), (t, i) => card(t, i, <Button sm block icon="play" busy={busy === t.id} onClick={() => start(t)}>เริ่มดำเนินการ</Button>)],
    ['กำลังดำเนินการ', 'var(--lilac-700)', col('IN_PROGRESS'), (t, i) => card(t, i, <Link to={`/staff/tickets/${t.id}`} className="btn success sm block"><Icon name="check" size={16} />ส่งงานว่าแก้ไขเสร็จ</Link>)],
    ['แก้ไขเสร็จ · รอยืนยัน', 'var(--sage-500)', col('RESOLVED'), (t, i) => card(t, i, <div className="note tone-honey" style={{ alignItems: 'center' }}><Icon name="clock" size={16} />รอผู้แจ้งยืนยันผล</div>)],
  ];
  return (
    <>
      <PageHead title={`คิวงาน${dept ? ` · ${dept}` : ''}`} sub="เห็นเฉพาะเรื่องที่มอบหมายให้หน่วยงานของคุณ"><Button kind="outline" icon="undo" onClick={load.reload} busy={load.loading}>รีเฟรช</Button></PageHead>
      <div className="kpis k3">
        <Kpi icon="inbox" tone="pink" n={col('ASSIGNED').length} label="รอเริ่มงาน" hl={col('ASSIGNED').length > 0} />
        <Kpi icon="wrench" tone="lilac" n={col('IN_PROGRESS').length} label="กำลังดำเนินการ" />
        <Kpi icon="check" tone="sage" n={col('RESOLVED').length} label="รอผู้แจ้งยืนยัน" />
      </div>
      <ErrorBox error={load.error} />
      {load.loading && !load.data ? <div className="board"><Skeleton h={360} /><Skeleton h={360} /><Skeleton h={360} /></div> : (
        <div className="board">
          {columns.map(([title, dot, list, render]) => (
            <div key={title} className="column">
              <div className="row" style={{ padding: '4px 6px' }}><span style={{ width: 10, height: 10, borderRadius: 5, background: dot }} /><span className="strong grow">{title}</span><span className="count" style={{ background: '#fff', color: 'var(--ink-600)' }}>{list.length}</span></div>
              {list.length ? list.map(render) : <p className="small muted center" style={{ padding: 20 }}>ไม่มีงาน</p>}
            </div>
          ))}
        </div>
      )}
      {!load.loading && all.length === 0 && !load.error && <div className="card"><Empty icon="wrench" title="ยังไม่มีงานที่มอบหมายให้หน่วยงานของคุณ" /></div>}
    </>
  );
}

export function Work() {
  const { id = '' } = useParams();
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
      <Crumb to="/staff" label="คิวงาน" current={shortId(t.id)} />
      <div className="stack" style={{ ['--gap' as string]: '8px' }}><div className="row"><Badge status={t.status} /><span className="small muted strong">{shortId(t.id)}</span><span className="small muted">· แจ้งเมื่อ {fmtDate(t.createdAt)}</span></div><h1>{t.description.length > 70 ? t.description.slice(0, 70) + '…' : t.description}</h1></div>
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
