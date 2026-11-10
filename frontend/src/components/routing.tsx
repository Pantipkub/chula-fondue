import type { Ticket } from '../lib/api';
import { isRoutingPending, routingReason } from '../lib/format';
import { Note } from './ui';

export function RoutingNotice({ ticket: t }: { ticket: Ticket }) {
  if (['CANCELLED', 'REJECTED'].includes(t.status)) return null;
  const text = t.assignmentSource === 'AUTO' ? `ส่งต่ออัตโนมัติถึง ${t.departmentName}`
    : t.status !== 'SUBMITTED' ? '' : isRoutingPending(t)
      ? t.routingStatus === 'RETRY' ? routingReason(t.routingReason) : 'กำลังส่งต่อหน่วยงานที่รับผิดชอบ'
      : routingReason(t.routingReason);
  return text ? <div role="status" aria-atomic="true"><Note tone={t.assignmentSource === 'AUTO' ? 'sage' : 'honey'} icon="route">{text}</Note></div> : null;
}
