import { Api } from '../lib/api';
import { Button, Empty, ErrorBox, Skeleton, useLoad } from '../components/ui';
import { PageHead } from '../components/layouts';
import { fmtDate, shortId, STATUS } from '../lib/format';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
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
  return <div className="page"><PageHead title="การแจ้งเตือน" sub={session?.role === 'STAFF' ? 'แจ้งเตือนส่วนตัวและงานของหน่วยงาน · สถานะอ่านแยกตามบัญชี' : 'ประวัติการเปลี่ยนสถานะและผลการส่งอีเมล'}><Button onClick={load.reload} kind="outline">รีเฟรช</Button></PageHead><ErrorBox error={load.error || error} />
    {load.loading && !load.data ? <Skeleton h={300} /> : !load.data?.length ? <Empty title="ยังไม่มีการแจ้งเตือน" icon="mail" /> : <>
      <p className="small muted" role="status">ยังไม่อ่าน {load.data.filter(n => !n.read).length} รายการ จาก {load.data.length} รายการล่าสุด</p>
      <div className="table"><table><thead><tr><th>เรื่อง</th><th>สถานะ</th><th>ผู้รับ</th><th>การส่ง</th><th>เวลา</th><th>การอ่าน</th></tr></thead><tbody>{load.data.map(n => <tr key={n.eventId}><td><Link className="strong" to={prefix + encodeURIComponent(n.ticketId)} onClick={() => { if (!n.read) void mark(n.eventId); }}>{shortId(n.ticketId)}</Link></td><td>{STATUS[n.status]?.label ?? n.status}</td><td>{n.recipientDepartmentId ? 'หน่วยงาน' : n.recipientEmail}</td><td>{({ RECORDED: 'บันทึกแล้ว (โหมดสาธิต)', PENDING: 'รอส่ง', SENT: 'ส่งแล้ว', RETRY: 'รอลองใหม่', FAILED: 'ส่งไม่สำเร็จ', SENDING: 'กำลังส่ง' } as Record<string, string>)[n.delivery] ?? n.delivery}</td><td>{fmtDate(n.receivedAt)}</td><td>{n.read ? <span className="small muted">อ่านแล้ว</span> : <Button sm kind="outline" busy={busy === n.eventId} disabled={!!busy} aria-label={`อ่านแล้ว ${shortId(n.ticketId)}`} onClick={() => void mark(n.eventId)}>ทำเครื่องหมายว่าอ่านแล้ว</Button>}</td></tr>)}</tbody></table></div>
    </>}
  </div>;
}
