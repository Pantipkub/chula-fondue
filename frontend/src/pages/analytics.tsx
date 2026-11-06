import { useState } from 'react';
import { Api } from '../lib/api';
import { categoryOf } from '../lib/format';
import { Button, Empty, ErrorBox, Input, Select, Skeleton, useLoad } from '../components/ui';
import { PageHead } from '../components/layouts';
import { Kpi } from './reporter';

export function Analytics() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departmentId, setDepartment] = useState('');
  const [category, setCategory] = useState('');
  const departments = useLoad(Api.departments);
  const load = useLoad(() => Api.analytics({ from, to, departmentId, category }), [from, to, departmentId, category]);
  const s = load.data;
  const hours = (value: number | null) => value === null ? '—' : value >= 24 ? `${(value / 24).toFixed(1)} วัน` : `${value.toFixed(1)} ชม.`;
  return <>
    <PageHead title="รายงานวิเคราะห์" sub="ข้อมูลจาก Analytics Service • เวลาแก้ไขวัดจนถึงสถานะแก้ไขเสร็จ"><Button kind="outline" onClick={load.reload} busy={load.loading}>รีเฟรช</Button></PageHead>
    <div className="card analytics-filters">
      <Input id="from" type="date" label="ตั้งแต่วันที่" value={from} onChange={e => setFrom(e.target.value)} />
      <Input id="to" type="date" label="ถึงวันที่" value={to} onChange={e => setTo(e.target.value)} />
      <Select id="analytics-dept" label="หน่วยงาน" value={departmentId} onChange={e => setDepartment(e.target.value)}><option value="">ทั้งหมด</option>{departments.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      <Input id="analytics-category" label="หมวดหมู่" placeholder="ทั้งหมด" value={category} onChange={e => setCategory(e.target.value)} />
    </div>
    <ErrorBox error={load.error || departments.error} />
    {!s ? load.loading ? <Skeleton h={300} /> : null : <>
      <div className="kpis">
        <Kpi icon="ticket" tone="pink" n={s.total} label="เรื่องทั้งหมด" />
        <Kpi icon="clock" tone="lilac" n={hours(s.mttrHours)} label="เวลาเฉลี่ยจนแก้ไขเสร็จ (MTTR)" />
        <Kpi icon="check" tone="sage" n={s.resolvedCount} label="แก้ไขเสร็จ / ปิดแล้ว" />
        <Kpi icon="chart" tone="honey" n={`${s.closedRate.toFixed(1)}%`} label="สัดส่วนปิดเรื่อง" />
      </div>
      {s.total === 0 ? <div className="card"><Empty title="ยังไม่มีข้อมูลในช่วงที่เลือก" icon="chart" /></div> : <>
        <div className="two">
          <div className="card lg stack"><h3>จุดที่แจ้งบ่อย</h3>{s.hotspots.map((r, i) => <div className="row" key={r.name}><span className="count">{i + 1}</span><span className="grow">{r.name}</span><strong>{r.count}</strong></div>)}</div>
          <div className="card lg stack"><h3>หมวดหมู่ปัญหา</h3>{s.byCategory.map(r => <div key={r.name}><div className="row between"><span>{categoryOf(r.name).label}</span><strong>{r.count}</strong></div><div className="track"><i style={{ width: `${r.count / s.total * 100}%`, background: 'var(--pink-500)' }} /></div></div>)}</div>
        </div>
        <div className="card lg stack"><h3>ประสิทธิภาพตามหน่วยงาน</h3><div className="table"><table><thead><tr><th>หน่วยงาน</th><th>จำนวนเรื่อง</th><th>MTTR</th></tr></thead><tbody>{s.byDepartment.map(d => <tr key={d.id}><td>{d.name}</td><td>{d.count}</td><td>{hours(d.mttrHours)}</td></tr>)}</tbody></table></div></div>
        <div className="card lg stack"><h3>จำนวนเรื่องตามวันแจ้ง</h3><div className="bars">{s.daily.slice(-30).map(d => <div key={d.date} title={`${d.date}: ${d.count}`}><i style={{ height: `${Math.max(4, d.count / Math.max(...s.daily.map(r => r.count)) * 150)}px` }} /><span>{d.date.slice(5)}</span></div>)}</div></div>
      </>}
      <p className="xs muted">อัปเดต {new Date(s.generatedAt).toLocaleString('th-TH')} • ข้อมูลอาจตามหลังรายการเรื่องเล็กน้อยระหว่างประมวลผลคิว</p>
    </>}
  </>;
}
