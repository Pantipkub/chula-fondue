import { Api } from '../lib/api';
import { Button, Empty, ErrorBox, Skeleton, useLoad } from '../components/ui';
import { PageHead } from '../components/layouts';
import { fmtDate, shortId, STATUS } from '../lib/format';
export function Notifications() {
  const load = useLoad(Api.notifications);
  return <div className="page"><PageHead title="การแจ้งเตือน" sub="ประวัติการเปลี่ยนสถานะและผลการส่งอีเมล"><Button onClick={load.reload} kind="outline">รีเฟรช</Button></PageHead><ErrorBox error={load.error} />
    {load.loading && !load.data ? <Skeleton h={300} /> : !load.data?.length ? <Empty title="ยังไม่มีการแจ้งเตือน" icon="mail" /> : <div className="table"><table><thead><tr><th>เรื่อง</th><th>สถานะ</th><th>ผู้รับ</th><th>การส่ง</th><th>เวลา</th></tr></thead><tbody>{load.data.map(n => <tr key={n.eventId}><td>{shortId(n.ticketId)}</td><td>{STATUS[n.status]?.label ?? n.status}</td><td>{n.recipientEmail}</td><td>{({ RECORDED: 'บันทึกแล้ว (โหมดสาธิต)', PENDING: 'รอส่ง', SENT: 'ส่งแล้ว', RETRY: 'รอลองใหม่', FAILED: 'ส่งไม่สำเร็จ', SENDING: 'กำลังส่ง' } as Record<string, string>)[n.delivery] ?? n.delivery}</td><td>{fmtDate(n.receivedAt)}</td></tr>)}</tbody></table></div>}
  </div>;
}
