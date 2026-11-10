import { useState } from 'react';
import { Api } from '../lib/api';
import { CATEGORIES, categoryOf } from '../lib/format';
import { Empty, ErrorBox, IconButton, Input, Select, Skeleton, useLoad } from '../components/ui';
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
  const hours = (value: number | null) => value === null ? '—' : value >= 24 ? `${(value / 24).toFixed(1)} วัน` : `${value.toFixed(1)} ชั่วโมง`;
  return <>
    <PageHead title="รายงาน" sub="เวลาซ่อมเฉลี่ยนับจากวันที่แจ้งถึงวันที่ซ่อมเสร็จ"><IconButton icon="refresh" label="รีเฟรช" onClick={load.reload} busy={load.loading} /></PageHead>
    <div className="card analytics-filters">
      <Input id="from" type="date" label="ตั้งแต่วันที่" value={from} onChange={e => setFrom(e.target.value)} />
      <Input id="to" type="date" label="ถึงวันที่" value={to} onChange={e => setTo(e.target.value)} />
      <Select id="analytics-dept" label="หน่วยงาน" value={departmentId} onChange={e => setDepartment(e.target.value)}><option value="">ทุกหน่วยงาน</option>{departments.data?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      <Select id="analytics-category" label="หมวดหมู่" value={category} onChange={e => setCategory(e.target.value)}><option value="">ทุกหมวดหมู่</option>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>
    </div>
    <ErrorBox error={load.error || departments.error} />
    {!s ? load.loading ? <Skeleton h={300} /> : null : <>
      <div className="kpis">
        <Kpi icon="ticket" n={s.total} label="งานทั้งหมด" />
        <Kpi icon="clock" n={hours(s.mttrHours)} label="เวลาซ่อมเฉลี่ย" />
        <Kpi icon="check" n={s.resolvedCount} label="ซ่อมเสร็จ" />
        <Kpi icon="chart" n={`${s.closedRate.toFixed(1)}%`} label="อัตราปิดงาน" />
      </div>
      {s.total === 0 ? <div className="card"><Empty title="ไม่มีข้อมูลในช่วงที่เลือก" icon="chart" /></div> : <>
        <div className="two">
          <div className="card lg stack"><h3>จุดที่แจ้งบ่อย</h3>{s.hotspots.map((r, i) => <div className="row" key={r.name}><span className="count">{i + 1}</span><span className="grow small">{r.name}</span><span className="strong tid">{r.count}</span></div>)}</div>
          <div className="card lg stack"><h3>แยกตามหมวดงาน</h3>{s.byCategory.map(r => <div key={r.name} className="stack" style={{ ['--gap' as string]: '6px' }}><div className="row between small"><span>{categoryOf(r.name).label}</span><span className="strong tid">{r.count}</span></div><div className="track"><i style={{ width: `${r.count / s.total * 100}%`, background: 'var(--pink-500)' }} /></div></div>)}</div>
        </div>
        <div className="card lg stack"><h3>แยกตามหน่วยงาน</h3><div className="table" style={{ boxShadow: 'none' }}><table><thead><tr><th>หน่วยงาน</th><th style={{ textAlign: 'right' }}>จำนวนงาน</th><th style={{ textAlign: 'right' }}>เวลาซ่อมเฉลี่ย</th></tr></thead><tbody>{s.byDepartment.map(d => <tr key={d.id}><td>{d.name}</td><td className="tid" style={{ textAlign: 'right' }}>{d.count}</td><td style={{ textAlign: 'right' }}>{hours(d.mttrHours)}</td></tr>)}</tbody></table></div></div>
        <div className="card lg stack"><h3>จำนวนแจ้งซ่อมรายวัน</h3><div className="bars">{s.daily.slice(-30).map(d => <div key={d.date} title={`${d.date}: ${d.count} งาน`}><i style={{ height: `${Math.max(4, d.count / Math.max(...s.daily.map(r => r.count)) * 150)}px` }} /><span className="tid">{d.date.slice(5)}</span></div>)}</div></div>
      </>}
      <p className="xs muted">ข้อมูล ณ {new Date(s.generatedAt).toLocaleString('th-TH')}</p>
    </>}
  </>;
}
