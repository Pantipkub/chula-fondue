import type { Ticket } from '../lib/api';
import { isRoutingPending, routingReason } from '../lib/format';
import { Note } from './ui';

export function RoutingNotice({ ticket: t }: { ticket: Ticket }) {
  if (['CANCELLED', 'REJECTED'].includes(t.status)) { return null; }
  let text = '';
  if (t.assignmentSource === 'AUTO') text = `ส่งต่ออัตโนมัติถึง ${t.departmentName}`;
  else if (t.status === 'SUBMITTED') {
    text = routingReason(t.routingReason);
    if (isRoutingPending(t) && t.routingStatus !== 'RETRY') text = 'กำลังส่งต่อหน่วยงานที่รับผิดชอบ';
  }
  return text ? <output aria-atomic="true"><Note tone={t.assignmentSource === 'AUTO' ? 'sage' : 'honey'} icon="route">{text}</Note></output> : null;
}
