import { useState } from 'react';
import { Api } from '../lib/api';
import type { Department, RoutingRule } from '../lib/api';
import { CATEGORIES } from '../lib/format';
import { Button, ErrorBox, Note, Select, Skeleton, useLoad, useToast } from './ui';

export function RoutingRules({ departments }: { departments: Department[] }) {
  const load = useLoad(Api.routingRules);
  const rules = load.data ?? [];
  return <section className="card lg stack" aria-label="กฎส่งต่ออัตโนมัติ">
    <div><h2>กฎส่งต่ออัตโนมัติ</h2><p className="small muted">เลือกหน่วยงานที่รับผิดชอบแต่ละหมวด กฎมีผลกับการส่งต่อครั้งถัดไป เรื่องที่มอบหมายแล้วคงหน่วยงานเดิม</p></div>
    <ErrorBox error={load.error} />
    {load.error && <Button kind="outline" onClick={load.reload} busy={load.loading}>โหลดกฎอีกครั้ง</Button>}
    {!load.data ? <Skeleton h={160} /> : CATEGORIES.filter((c) => c.value !== 'Other').map((category) => {
      const rule = rules.find((r) => r.category === category.value && r.enabled)
        ?? rules.find((r) => r.category === category.value);
      return <RuleRow key={`${category.value}-${rule?.id}-${rule?.departmentId}-${rule?.enabled}`} category={category.value} label={category.label} departments={departments} rule={rule} saved={load.reload} />;
    })}
    <Note>หมวด “อื่น ๆ” และเรื่องที่ไม่มีกฎจะเข้าคิวผู้ดูแล การส่งต่ออัตโนมัติเริ่มทำงานเมื่อเปิดใช้งานระบบแล้ว</Note>
  </section>;
}
function RuleRow({ category, label, departments, rule, saved }: { category: string; label: string; departments: Department[]; rule?: RoutingRule; saved: () => void }) {
  const [departmentId, setDepartment] = useState(rule?.departmentId ?? '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const dirty = departmentId !== (rule?.departmentId ?? '') || enabled !== (rule?.enabled ?? false);
  return <form className="stack" style={{ paddingTop: 16, borderTop: '1px solid var(--line-200)', ['--gap' as string]: '10px' }} onSubmit={async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { category, departmentId, enabled };
      if (rule) await Api.updateRoutingRule(rule.id, body); else await Api.createRoutingRule(body);
      toast(`บันทึกกฎ${label}แล้ว`); saved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <div className="row wrap" style={{ alignItems: 'flex-end', gap: 16 }}>
      <div className="grow" style={{ minWidth: 180 }}><Select id={`rule-${category.replaceAll(/\W/g, '-')}`} label={label} value={departmentId} onChange={(e) => setDepartment(e.target.value)} required disabled={busy}>
        <option value="">เลือกหน่วยงาน</option>{departments.filter(d => d.active !== false || d.id === departmentId).map((d) => <option key={d.id} value={d.id} disabled={d.active === false}>{d.name}{d.active === false ? ' · ปิดใช้งาน' : ''}</option>)}
      </Select></div>
      <label className="row small" style={{ minHeight: 44, gap: 8 }}><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={busy} />เปิดใช้กฎ{label}</label>
      <Button type="submit" kind="outline" busy={busy} disabled={!departmentId || !dirty}>บันทึก{label}</Button>
    </div>
    <ErrorBox error={error} />
  </form>;
}
