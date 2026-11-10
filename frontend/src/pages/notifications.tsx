import { Api } from '../lib/api';
import { Empty, ErrorBox, IconButton, Skeleton, useLoad } from '../components/ui';
import { PageHead } from '../components/layouts';
import { fmtDate, shortId, STATUS } from '../lib/format';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const DELIVERY: Record<string, string> = { RECORDED: 'บันทึกแล้ว (สาธิต)', PENDING: 'รอส่ง', SENT: 'ส่งแล้ว', RETRY: 'รอส่งใหม่', FAILED: 'ส่งไม่สำเร็จ', SENDING: 'กำลังส่ง' };

export function Notifications() {
  const load = useLoad(Api.notifications);
  const { session } = useAuth();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const prefix = session?.role === 'ADMIN' ? '/admin/tickets/' : session?.role === 'STAFF' ? '/staff/tickets/' : '/tickets/';
  const mark = async (id: string) => {
    setBusy(id); setError('');
    try { await Api.readNotification(id); load.reload(); }
    catch (x) { setError((x as Error).message); } finally { setBusy(''); }
  };
  return <div className="page"><PageHead title="การแจ้งเตือน" sub={session?.role === 'STAFF' ? 'การแจ้งเตือนของคุณและของหน่วยงาน' : 'อัปเดตสถานะงานซ่อมและผลการส่งอีเมล'}><IconButton icon="refresh" label="รีเฟรช" onClick={load.reload} busy={load.loading} /></PageHead><ErrorBox error={load.error || error} />
    {load.loading && !load.data ? <Skeleton h={300} /> : !load.data?.length ? <div className="card"><Empty title="ยังไม่มีการแจ้งเตือน" icon="bell" /></div> : <>
      <p className="small muted" role="status">ยังไม่อ่าน {load.data.filter(n => !n.read).length} จาก {load.data.length} รายการ</p>
      <div className="table"><table><thead><tr><th>เลขที่</th><th>สถานะ</th><th>ผู้รับ</th><th>การส่ง</th><th>เวลา</th><th><span className="sr-only">การอ่าน</span></th></tr></thead><tbody>{load.data.map(n => <tr key={n.eventId} style={n.read ? undefined : { background: 'var(--pink-50)' }}>
        <td><Link className={`tid${n.read ? '' : ' strong'}`} to={prefix + encodeURIComponent(n.ticketId)} onClick={() => { if (!n.read) void mark(n.eventId); }}>{shortId(n.ticketId)}</Link></td>
        <td>{STATUS[n.status]?.label ?? n.status}</td>
        <td>{n.recipientDepartmentId ? 'หน่วยงาน' : n.recipientEmail}</td>
        <td>{DELIVERY[n.delivery] ?? n.delivery}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(n.receivedAt)}</td>
        <td style={{ textAlign: 'right' }}>{n.read ? <span className="small muted">อ่านแล้ว</span> : <IconButton icon="check" label={`อ่านแล้ว ${shortId(n.ticketId)}`} title="ทำเครื่องหมายว่าอ่านแล้ว" busy={busy === n.eventId} disabled={!!busy} onClick={() => void mark(n.eventId)} />}</td>
      </tr>)}</tbody></table></div>
    </>}
  </div>;
}
