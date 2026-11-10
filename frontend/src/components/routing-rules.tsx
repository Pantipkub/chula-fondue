import { useState } from 'react';
import { Api } from '../lib/api';
import type { Department, RoutingRule } from '../lib/api';
import { CATEGORIES } from '../lib/format';
import { Button, ErrorBox, Icon, IconButton, Note, Select, Skeleton, useLoad, useToast } from './ui';

export function RoutingRules({ departments }: { departments: Department[] }) {
  const load = useLoad(Api.routingRules);
  const rules = load.data ?? [];
  return <section className="card lg stack" aria-label="ส่งต่องานอัตโนมัติ">
    <div><h2>ส่งต่องานอัตโนมัติ</h2><p className="small muted">แจ้งซ่อมใหม่จะส่งถึงหน่วยงานที่เลือกไว้ของแต่ละหมวดทันที</p></div>
    <ErrorBox error={load.error} />
    {load.error && <Button kind="outline" icon="refresh" onClick={load.reload} busy={load.loading}>โหลดอีกครั้ง</Button>}
    {!load.data ? <Skeleton h={160} /> : CATEGORIES.filter((c) => c.value !== 'Other').map((category) => {
      const rule = rules.find((r) => r.category === category.value && r.enabled)
        ?? rules.find((r) => r.category === category.value);
      return <RuleRow key={`${category.value}-${rule?.id}-${rule?.departmentId}-${rule?.enabled}`} category={category.value} label={category.label} icon={category.icon} departments={departments} rule={rule} saved={load.reload} />;
    })}
    <Note>หมวด “อื่น ๆ” และหมวดที่ยังไม่เลือกหน่วยงาน ผู้ดูแลระบบจะส่งต่อเอง</Note>
  </section>;
}
function RuleRow({ category, label, icon, departments, rule, saved }: { category: string; label: string; icon: string; departments: Department[]; rule?: RoutingRule; saved: () => void }) {
  const [departmentId, setDepartment] = useState(rule?.departmentId ?? '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const dirty = departmentId !== (rule?.departmentId ?? '') || enabled !== (rule?.enabled ?? false);
  const id = `rule-${category.replaceAll(/\W/g, '-')}`;
  return <form className="stack" style={{ ['--gap' as string]: '8px' }} onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { category, departmentId, enabled };
      if (rule) await Api.updateRoutingRule(rule.id, body); else await Api.createRoutingRule(body);
      toast(`บันทึกหมวด${label}แล้ว`); saved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <div className="rule-row">
      <label className="rule-name" htmlFor={id}><Icon name={icon} />{label}</label>
      <Select id={id} value={departmentId} onChange={(e) => setDepartment(e.target.value)} required disabled={busy}>
        <option value="">เลือกหน่วยงาน</option>{departments.filter(d => d.active !== false || d.id === departmentId).map((d) => <option key={d.id} value={d.id} disabled={d.active === false}>{d.name}{d.active === false ? ' · ปิดใช้งาน' : ''}</option>)}
      </Select>
      <label className="check small"><input type="checkbox" aria-label={`เปิดส่งต่ออัตโนมัติ ${label}`} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={busy} />เปิดใช้</label>
      <IconButton type="submit" icon="check" label={`บันทึก${label}`} title="บันทึก" busy={busy} disabled={!departmentId || !dirty} className={dirty ? 'active' : ''} />
    </div>
    <ErrorBox error={error} />
  </form>;
}
