import { profile } from './profile.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const format = (value, digits = 2) => finite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const phaseName = name => ({ baseline: 'Baseline', stress: 'Stress', peak: 'Peak', recovery: 'Recovery' })[name] || name;
const colors = { average: '#2563eb', stress: '#ea580c', baseline: '#2563eb', peak: '#dc2626', recovery: '#0d9488' };
const phaseColor = (phase, type) => colors[phase.name] || colors[type];
const seconds = value => { const rounded = Math.round(value); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`; };

function chart(svg, label) {
  return `<div class="chart-scroll"><svg class="chart-svg" role="img" aria-label="${escape(label)}" ${svg}</svg></div><small class="scroll-hint">เลื่อนซ้าย–ขวาเพื่อดูกราฟครบ ↔</small>`;
}

function bars(items, unit, { limit, label = unit } = {}) {
  if (!items.length) return '<p class="empty">ยังไม่มีข้อมูลสำหรับกราฟนี้</p>';
  const maximum = Math.max(1, ...items.map(item => finite(item.value) ? item.value : 0), limit || 0) * 1.12;
  const left = 174, width = 462, top = 34, row = 36, bottom = top + items.length * row;
  let svg = `viewBox="0 0 740 ${bottom + 34}">`;
  for (let i = 0; i <= 4; i++) {
    const x = left + width * i / 4;
    svg += `<line class="grid-line" x1="${x}" y1="20" x2="${x}" y2="${bottom}"/><text class="axis-text" x="${x}" y="${bottom + 23}" text-anchor="middle">${format(maximum * i / 4, maximum > 20 ? 0 : 1)}</text>`;
  }
  items.forEach((item, i) => {
    const y = top + i * row, size = finite(item.value) ? Math.max(0, item.value) / maximum * width : 0;
    svg += `<text class="chart-label" x="${left - 14}" y="${y + 15}" text-anchor="end">${escape(item.label)}</text><rect x="${left}" y="${y}" width="${size}" height="23" rx="5" fill="${item.color || '#2563eb'}"/><text class="chart-value" x="${left + size + 9}" y="${y + 16}">${format(item.value, unit === 'requests' ? 0 : 2)}${unit === '%' ? '%' : ''}</text>`;
  });
  if (finite(limit)) {
    const x = left + limit / maximum * width;
    svg += `<line class="limit-line" x1="${x}" y1="17" x2="${x}" y2="${bottom}"/><text class="limit-label" x="${x}" y="12" text-anchor="middle">${format(limit, 0)} ${escape(unit)}</text>`;
  }
  return chart(svg, label);
}

function latencyChart(phases) {
  const series = [{ key: 'p50', color: '#93c5fd' }, { key: 'p95', color: '#2563eb' }, { key: 'p99', color: '#7c3aed' }];
  const maximum = Math.max(1, ...phases.flatMap(p => series.map(s => p.latencyMs[s.key] || 0))) * 1.18;
  const left = 100, width = 530, top = 28, row = 70, bottom = top + phases.length * row;
  let svg = `viewBox="0 0 740 ${bottom + 29}">`;
  for (let i = 0; i <= 4; i++) {
    const x = left + width * i / 4;
    svg += `<line class="grid-line" x1="${x}" y1="14" x2="${x}" y2="${bottom}"/><text class="axis-text" x="${x}" y="${bottom + 21}" text-anchor="middle">${format(maximum * i / 4, 0)}</text>`;
  }
  phases.forEach((p, i) => {
    svg += `<text class="chart-label" x="${left - 12}" y="${top + i * row + 26}" text-anchor="end">${escape(phaseName(p.name))}</text>`;
    series.forEach((s, j) => {
      const value = p.latencyMs[s.key], y = top + i * row + j * 17;
      const size = finite(value) ? value / maximum * width : 0;
      svg += `<rect x="${left}" y="${y}" width="${size}" height="12" rx="3" fill="${s.color}"/><text class="chart-value small" x="${left + size + 6}" y="${y + 10}">${format(value)}</text>`;
    });
  });
  return `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.key}</span>`).join('')}<span class="muted">หน่วย: ms · ต่ำกว่าดีกว่า</span></div>${chart(svg, 'Latency p50 p95 p99 by phase')}`;
}

function loadShape(config) {
  const phases = profile(config), end = phases.at(-1).end, maximum = Math.max(...phases.map(p => p.vus));
  const x = t => 42 + t / end * 654, y = vus => 139 - vus / maximum * 105;
  let points = `${x(0)},${y(0)}`;
  const shades = phases.map(p => {
    points += ` ${x(p.end)},${y(p.vus)}`;
    const result = p.measured ? `<rect x="${x(p.start)}" y="25" width="${x(p.end) - x(p.start)}" height="114" fill="${phaseColor(p, config.type)}" opacity=".08"/><text class="axis-text" x="${(x(p.start) + x(p.end)) / 2}" y="18" text-anchor="middle">${phaseName(p.name)}</text>` : '';
    return result;
  }).join('');
  let grid = '';
  for (let i = 0; i <= 4; i++) grid += `<line class="grid-line" x1="42" y1="${y(maximum * i / 4)}" x2="696" y2="${y(maximum * i / 4)}"/><text class="axis-text" x="33" y="${y(maximum * i / 4) + 4}" text-anchor="end">${format(maximum * i / 4, 0)}</text><text class="axis-text" x="${x(end * i / 4)}" y="162" text-anchor="middle">${seconds(end * i / 4)}</text>`;
  return chart(`viewBox="0 0 740 180">${grid}${shades}<polyline points="${points}" fill="none" stroke="${colors[config.type]}" stroke-width="3" stroke-linejoin="round"/>`, 'Configured virtual users over time');
}

function outcomes(phases) {
  return `<div class="outcomes">${phases.map(p => {
    const success = finite(p.errorRate) ? Math.max(0, Math.min(100, (1 - p.errorRate) * 100)) : null;
    return `<div class="outcome-row"><div><strong>${escape(phaseName(p.name))}</strong><span class="${p.errorRate > 0 ? 'bad-text' : 'good-text'}">${finite(p.errorRate) ? format(p.errorRate * 100) + '% failed' : 'ไม่มีข้อมูล'}</span></div><div class="outcome-track">${success === null ? '' : `<span style="width:${success}%"></span>`}</div><small>สำเร็จ ${format(success)}% · response ผิดรูปแบบ ${finite(p.invalidContentRate) ? format(p.invalidContentRate * 100) + '%' : '—'} · timeout ${format(p.timeouts, 0)}</small></div>`;
  }).join('')}</div>`;
}

function resourceName(name) {
  return name.includes('fondue-k6-') ? 'k6 · load generator' : name.replace(/^.*?-(?=(?:api-gateway|ticket-service|auth-service|department-service|notification-service|analytics-service|postgres|mongo|rabbitmq|frontend)-)/, '').replace(/-\d+$/, '');
}

function resourcesChart(run, memory = false) {
  const items = (run.resources || []).map(r => ({ label: resourceName(r.name),
    value: memory ? (finite(r.memoryBytes) ? r.memoryBytes / 1048576 : null) : r.cpuPercent,
    color: r.name.includes('fondue-k6-') ? '#7c3aed' : '#64748b' }));
  return bars(items, memory ? 'MiB' : '%', { label: memory ? 'Maximum sampled memory in MiB by container' : 'Maximum sampled CPU percentage by container' });
}

function card(title, subtitle, body, extra = '') {
  return `<section class="card ${extra}"><div class="card-head"><div><h3>${title}</h3><p>${subtitle}</p></div></div>${body}</section>`;
}

function kpi(label, value, unit, detail, className = '') {
  return `<div class="kpi ${className}"><span>${label}</span><strong>${value}<small>${unit}</small></strong><p>${detail}</p></div>`;
}

function recovery(phases) {
  const baseline = phases.find(p => p.name === 'baseline'), after = phases.find(p => p.name === 'recovery');
  if (!baseline || !after) return '';
  const latency = baseline.latencyMs.p95 > 0 && finite(after.latencyMs.p95) ? (after.latencyMs.p95 / baseline.latencyMs.p95 - 1) * 100 : null;
  const throughput = baseline.requestsPerSecond > 0 && finite(after.requestsPerSecond) ? (after.requestsPerSecond / baseline.requestsPerSecond - 1) * 100 : null;
  const delta = n => finite(n) ? `${n >= 0 ? '+' : ''}${format(n)}%` : '—';
  return card('Recovery vs baseline', 'เทียบที่จำนวน VUs เท่ากัน ภายใน Stress test รอบเดียวกัน', `<div class="recovery-grid"><div><span>การเปลี่ยนแปลง p95</span><strong class="${latency > 0 ? 'warn-text' : 'good-text'}">${delta(latency)}</strong><small>${format(baseline.latencyMs.p95)} → ${format(after.latencyMs.p95)} ms · ต่ำกว่าดีกว่า</small></div><div><span>การเปลี่ยนแปลง throughput</span><strong class="${throughput < 0 ? 'warn-text' : 'good-text'}">${delta(throughput)}</strong><small>${format(baseline.requestsPerSecond)} → ${format(after.requestsPerSecond)} req/s · สูงกว่าดีกว่า</small></div></div><p class="footnote">${after.sloPassed ? 'Recovery กลับเข้าเกณฑ์ SLO แล้ว แต่ไม่ได้แปลว่าทุก metric กลับมาเท่า baseline' : 'Recovery ยังไม่ผ่านเกณฑ์ SLO ของ baseline'} · เป็นผลรวมทั้งช่วง ไม่ใช่เวลาที่ใช้ฟื้นตัว</p>`, 'recovery-card');
}

function table(phases) {
  return `<div class="table-scroll"><table><thead><tr>${['ช่วงวัด', 'VUs', 'วัด (s)', 'Requests', 'req/s', 'p50 ms', 'p95 ms', 'p99 ms', 'max ms', 'Failed', 'Timeout', 'SLO'].map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${phases.map(p => `<tr><td><span class="dot" style="background:${phaseColor(p)}"></span>${escape(phaseName(p.name))}<small>${p.required ? 'เกณฑ์บังคับ' : 'สังเกตโหลดสูง'}</small></td><td>${format(p.vus, 0)}</td><td>${format(p.seconds, 0)}</td><td>${format(p.requests, 0)}</td><td>${format(p.requestsPerSecond)}</td><td>${format(p.latencyMs.p50)}</td><td><strong>${format(p.latencyMs.p95)}</strong></td><td>${format(p.latencyMs.p99)}</td><td>${format(p.latencyMs.max)}</td><td>${finite(p.errorRate) ? format(p.errorRate * 100) + '%' : '—'}</td><td>${format(p.timeouts, 0)}</td><td><span class="badge ${p.sloPassed ? 'pass' : 'fail'}">${p.sloPassed ? 'PASS' : 'FAIL'}</span></td></tr>`).join('')}</tbody></table></div>`;
}

function runView(run, type, index) {
  const summary = run.summary;
  if (!summary) return `<article data-run="${index}" ${index ? 'hidden' : ''}><div class="notice error">${escape(run.name)} ไม่มี summary กรุณาตรวจ console.log ของรอบนี้</div></article>`;
  const phases = summary.phases, peak = type === 'stress' ? phases.find(p => p.name === 'peak') : phases[0];
  const config = summary.config, total = phases.reduce((sum, p) => sum + p.requests, 0);
  const complete = summary.passed && run.exitCode === 0 && !run.monitorError;
  return `<article data-run="${index}" ${index ? 'hidden' : ''}>
    ${summary.validationOnly ? '<div class="notice warning">QUICK VALIDATION ONLY · รอบนี้ใช้ตรวจ script เท่านั้น ไม่ใช้สรุป performance</div>' : ''}
    ${run.monitorError ? `<div class="notice error">ข้อมูลทรัพยากรไม่ครบ: ${escape(run.monitorError)}</div>` : ''}
    <div class="run-status"><span class="badge ${complete ? 'pass' : 'fail'}">${complete ? 'เกณฑ์บังคับผ่าน' : 'ตรวจสอบผลรอบนี้'}</span><span>p95 &lt; ${format(config.p95LimitMs, 0)} ms · failed reads &lt; ${format(config.errorLimit * 100)}%</span><span class="muted">${escape(run.name)}</span></div>
    <div class="kpis">${kpi(type === 'stress' ? 'Peak p95 latency' : 'p95 latency', format(peak?.latencyMs.p95), 'ms', type === 'stress' ? `ที่ ${peak?.vus || '—'} VUs · ดู percentile อื่นด้านล่าง` : '95% ของคำขอใช้เวลาไม่เกินค่านี้')}${kpi(type === 'stress' ? 'Peak throughput' : 'Throughput', format(peak?.requestsPerSecond), 'req/s', 'จำนวนคำขอต่อวินาทีในช่วงวัด')}${kpi('Failed reads', finite(peak?.errorRate) ? format(peak.errorRate * 100) : '—', '%', type === 'stress' ? 'ค่าของช่วง Peak' : 'รวม HTTP error, network และ response ผิด')}${kpi('Measured requests', format(total, 0), '', `${phases.length} ช่วงวัด · ไม่รวม warm-up / ramp`)}</div>
    ${card('Load profile', 'จำนวนผู้ใช้จำลอง (VUs) ตามเวลาที่ตั้งไว้ · พื้นที่สีคือช่วงที่นำมาวัดผล', loadShape(config), 'profile-card')}
    <div class="chart-grid">${card('Response time', 'เปรียบเทียบ p50 / p95 / p99 แยกตามช่วงวัด', latencyChart(phases))}${card('Throughput', 'คำขอต่อวินาที · สูงกว่าดีกว่า เมื่อ workload เท่ากัน', bars(phases.map(p => ({ label: phaseName(p.name), value: p.requestsPerSecond, color: phaseColor(p, type) })), 'req/s', { label: 'Requests per second by phase' }))}${card('p95 vs SLO', 'เส้นประคือเกณฑ์ p95 · ดูระยะห่างจากขีดจำกัด', bars(phases.map(p => ({ label: phaseName(p.name), value: p.latencyMs.p95, color: p.sloPassed ? phaseColor(p, type) : '#dc2626' })), 'ms', { limit: config.p95LimitMs, label: 'p95 latency compared with SLO limit' }))}${card('Successful & failed reads', 'response ถูกต้องหรือไม่ · ดู timeout และข้อมูลผิดรูปแบบควบคู่กัน', outcomes(phases))}</div>
    ${type === 'stress' ? recovery(phases) : ''}
    <div class="section-heading"><div><h3>Resource usage</h3><p>ค่าสูงสุดที่สุ่มวัดตลอดรอบ รวม setup และ ramp · ไม่ใช่ค่า CPU/RAM แยกรายช่วง</p></div><span class="legend-label"><i style="background:#7c3aed"></i>k6 = ตัวสร้างโหลด</span></div>
    <div class="chart-grid">${card('CPU by container', 'หน่วย % · ประมาณ 100% ต่อหนึ่งคอร์ จึงเกิน 100% ได้', resourcesChart(run))}${card('Memory by container', 'หน่วย MiB · ค่าสูงสุดที่บันทึกได้', resourcesChart(run, true))}</div>
    ${card('ตัวเลขทุกช่วงวัด', 'ใช้ตรวจค่าจริงประกอบกราฟ · ช่วง Stress/Peak อาจผิด SLO ได้แม้เกณฑ์บังคับผ่าน', table(phases), 'data-card')}
  </article>`;
}

function panel(type, runs, selected) {
  const title = type === 'average' ? 'Average-load test' : 'Stress test';
  return `<section id="panel-${type}" class="test-panel ${type}" role="tabpanel" aria-labelledby="tab-${type}" ${selected ? '' : 'hidden'}><div class="panel-heading"><div><span class="eyebrow">${type === 'average' ? 'NORMAL LOAD' : 'HIGH LOAD & RECOVERY'}</span><h2>${title}</h2><p>${type === 'average' ? 'วัดการตอบสนองเมื่อคงโหลดไว้ที่ baseline' : 'เพิ่มโหลด แล้วกลับมาที่ baseline เพื่อดูการฟื้นตัว'}</p></div>${runs.length ? `<label class="run-picker">เลือกรอบทดสอบ<select data-run-picker>${runs.map((run, i) => `<option value="${i}">รอบที่ ${i + 1} · ${escape(run.name)}</option>`).join('')}</select></label>` : ''}</div>${runs.length ? runs.map((run, i) => runView(run, type, i)).join('') : '<div class="notice">ยังไม่มีผลทดสอบประเภทนี้ในชุดข้อมูล</div>'}</section>`;
}

export function reportHtml(runs, metadata = {}) {
  const groups = { average: runs.filter(r => r.summary?.type === 'average' || (!r.summary && r.name?.includes('average'))), stress: runs.filter(r => r.summary?.type === 'stress' || (!r.summary && r.name?.includes('stress'))) };
  const selected = groups.average.length ? 'average' : 'stress';
  const date = metadata.generatedAt ? new Date(metadata.generatedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }) : 'ไม่ระบุเวลา';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CU Fondue · Load Test Dashboard</title><style>${styles}</style></head><body>
    <header class="page-header"><div class="brand"><span class="brand-mark">CF</span><span>CU FONDUE <small>PERFORMANCE LAB</small></span></div><a class="data-link" href="runs.json" download>ดาวน์โหลดข้อมูล JSON ↗</a></header>
    <main><div class="page-title"><div><span class="eyebrow">LOAD TEST RESULTS</span><h1>ดูประสิทธิภาพ<br class="mobile-break"> แยกตามการทดสอบ</h1><p>อ่านประวัติคำร้องผ่าน API Gateway · JWT → gRPC → PostgreSQL</p></div><div class="meta-chip"><span class="dot"></span><span>ผลการวัด · ${escape(date)}<small>${groups.average.length} Average / ${groups.stress.length} Stress runs</small></span></div></div>
    <nav class="test-tabs" role="tablist" aria-label="ประเภทการทดสอบ">${['average', 'stress'].map(type => `<button id="tab-${type}" class="test-tab ${type}" role="tab" type="button" aria-controls="panel-${type}" aria-selected="${selected === type}" tabindex="${selected === type ? 0 : -1}"><span class="tab-icon">${type === 'average' ? '01' : '02'}</span><span><strong>${type === 'average' ? 'Average-load' : 'Stress test'}</strong><small>${type === 'average' ? 'โหลดคงที่ · baseline' : 'Baseline → Stress → Peak → Recovery'}</small></span><span class="tab-count">${groups[type].length} รอบ</span></button>`).join('')}</nav>
    ${panel('average', groups.average, selected === 'average')}${panel('stress', groups.stress, selected === 'stress')}
    <details class="context"><summary>สภาพแวดล้อมและวิธีอ่านผล</summary><div><p><strong>เครื่องทดสอบ:</strong> ${escape(metadata.host?.cpu || 'ไม่ระบุ')} · ${format(metadata.host?.logicalCpus, 0)} logical CPUs · Docker ${escape(metadata.docker?.version || '—')}</p><p><strong>ชุดระบบ:</strong> ${escape(metadata.project || '—')} · source ${escape(metadata.commit?.slice(0, 12) || '—')} · ${escape(metadata.k6Image || 'k6')}</p><ul><li>VUs คือผู้ใช้จำลอง ไม่ใช่จำนวนผู้ใช้งานจริงของระบบ</li><li>p50 / p95 / p99 คือเวลาที่คำขอ 50% / 95% / 99% เสร็จภายในค่านั้น หน่วยเป็น ms</li><li>แต่ละกราฟเป็นค่ารวมของช่วงวัด ไม่ใช่ time series ของ response time; Load profile เป็นแผนการสร้างโหลด</li><li>ผล CPU/RAM เป็นค่าสูงสุดที่สุ่มวัดตลอดรอบ และรวมช่วงเตรียมข้อมูล ตัวสร้างโหลดใช้เครื่องเดียวกับระบบ</li><li>เกณฑ์บังคับคือ baseline/recovery ส่วน SLO ของช่วงโหลดสูงดูแยกในตาราง การผ่านถึง Peak ไม่ได้ระบุขีดจำกัดสูงสุดของระบบ</li><li>ผลนี้ครอบคลุมการอ่าน history ไม่ได้วัดหน้าเว็บ การอัปโหลดรูป งานเขียน หรือ throughput ของ message broker</li><li>ผลแต่ละรอบแสดงแยกกัน ไม่ได้นำ percentile หลายรอบมาเฉลี่ยรวม</li></ul><a href="environment.json" download>ดาวน์โหลด environment.json</a></div></details>
    <footer>CU Fondue · ผลการทดสอบที่บันทึกไว้ ไม่ใช่ live monitoring · เปิดไฟล์นี้แบบ offline ได้</footer></main><script>${interaction}</script></body></html>`;
}

const interaction = `
const tabs = [...document.querySelectorAll('[role="tab"]')];
function activate(tab, focus) {
  tabs.forEach(button => { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; document.getElementById(button.getAttribute('aria-controls')).hidden = !active; });
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activate(tab, false));
  tab.addEventListener('keydown', event => { let next; if (event.key === 'ArrowRight') next = (index + 1) % tabs.length; if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = tabs.length - 1; if (next !== undefined) { event.preventDefault(); activate(tabs[next], true); } });
});
document.querySelectorAll('[data-run-picker]').forEach(select => select.addEventListener('change', () => { select.closest('.test-panel').querySelectorAll('[data-run]').forEach(run => { run.hidden = run.dataset.run !== select.value; }); }));
`;

const styles = `
:root{font-family:Inter,"Segoe UI",Tahoma,sans-serif;color:#16243d;background:#f4f6fa;font-synthesis:none;--muted:#64748b;--border:#e2e8f0}*{box-sizing:border-box}body{margin:0}[hidden]{display:none!important}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}button,select{font:inherit}button:focus-visible,select:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #93c5fd;outline-offset:4px}.page-header{max-width:1360px;margin:auto;padding:25px 36px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.brand{display:flex;align-items:center;gap:12px;font-size:13px;font-weight:800;letter-spacing:.08em}.brand small{display:block;font-size:9px;letter-spacing:.15em;color:var(--muted);margin-top:4px}.brand-mark{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#172b4d;color:white;font-size:15px;letter-spacing:0}.data-link{font-size:12px;font-weight:600}main{max-width:1360px;margin:auto;padding:0 36px}.page-title{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:36px 0 28px}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.13em;color:var(--muted)}h1{font-size:32px;letter-spacing:-1px;line-height:1.35;margin:8px 0 9px}h2{font-size:24px;letter-spacing:-.5px;margin:5px 0 7px}h3{font-size:15px;margin:0;color:#1e293b}.page-title p,.panel-heading p{font-size:13px;color:var(--muted);margin:0;line-height:1.7}.meta-chip{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--border);padding:13px 17px;border-radius:12px;font-size:11px;white-space:nowrap}.meta-chip small{display:block;color:var(--muted);margin-top:5px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#2563eb;margin-right:7px;flex-shrink:0}.test-tabs{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:30px}.test-tab{display:flex;align-items:center;gap:13px;text-align:left;padding:18px 22px;border:1px solid #dae1eb;border-radius:14px;background:#fff;color:#64748b;cursor:pointer;transition:border-color .15s,background .15s}.test-tab[aria-selected=true].average{background:#eff6ff;border-color:#3b82f6;color:#1e40af;box-shadow:0 0 0 1px #3b82f6}.test-tab[aria-selected=true].stress{background:#fff7ed;border-color:#f97316;color:#9a3412;box-shadow:0 0 0 1px #f97316}.tab-icon{font-size:12px;font-weight:800;display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#f1f5f9}.test-tab[aria-selected=true] .tab-icon{background:#fff}.test-tab strong{display:block;font-size:16px}.test-tab small{display:block;font-size:11px;font-weight:400;margin-top:5px}.tab-count{margin-left:auto;font-size:11px;white-space:nowrap}.panel-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}.average .eyebrow{color:#2563eb}.stress .eyebrow{color:#c2410c}.run-picker{font-size:10px;color:var(--muted);display:grid;gap:6px;min-width:170px}select{font-size:12px;background:#fff;border:1px solid #cbd5e1;border-radius:9px;padding:10px;color:#334155}.run-status{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11px;color:#64748b;margin-bottom:18px}.run-status>.muted{margin-left:auto}.badge{display:inline-flex;align-items:center;white-space:nowrap;padding:5px 9px;border-radius:6px;font-size:10px;font-weight:700}.pass{background:#e8f7f0;color:#087f5b}.fail{background:#fef2f2;color:#b91c1c}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:20px}.kpi{background:#fff;border:1px solid var(--border);border-radius:13px;padding:18px 19px}.kpi>span{font-size:11px;color:var(--muted);font-weight:600}.kpi>strong{display:block;font-size:30px;letter-spacing:-.8px;font-variant-numeric:tabular-nums;margin-top:11px;line-height:1.15}.kpi strong small{font-size:11px;font-weight:500;letter-spacing:0;color:var(--muted);margin-left:7px}.kpi p{font-size:10px;line-height:1.6;color:var(--muted);margin:9px 0 0}.card{background:white;border:1px solid var(--border);border-radius:15px;padding:20px;min-width:0}.card-head{margin-bottom:17px}.card-head p,.section-heading p{font-size:11px;line-height:1.6;color:var(--muted);margin:6px 0 0}.profile-card{margin-bottom:20px}.chart-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;margin-bottom:20px;align-items:start}.chart-scroll{overflow:auto;max-width:100%}.chart-svg{display:block;width:100%;min-width:510px}.profile-card .chart-svg{min-width:640px}.scroll-hint{display:none;color:#94a3b8;font-size:10px;margin-top:7px}.grid-line{stroke:#e8edf5;stroke-width:1}.axis-text{font-size:11px;fill:#94a3b8;font-family:inherit}.chart-label{font-size:12px;fill:#475569;font-family:inherit}.chart-value{font-size:12px;font-weight:600;fill:#334155;font-family:inherit}.chart-value.small{font-size:11px;font-weight:500}.limit-line{stroke:#dc2626;stroke-width:1.5;stroke-dasharray:5 5;opacity:.65}.limit-label{font-size:10px;fill:#b91c1c}.legend{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0 0 6px;font-size:11px}.legend i,.legend-label i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px}.muted{color:var(--muted)}.outcomes{display:grid;gap:20px;padding:8px 2px 15px}.outcome-row>div:first-child{display:flex;justify-content:space-between;font-size:12px;gap:12px}.outcome-row strong{font-weight:600}.outcome-row small{font-size:10px;color:var(--muted)}.outcome-track{height:9px;background:#fecaca;border-radius:5px;overflow:hidden;margin:9px 0 5px}.outcome-track span{display:block;height:100%;background:#10b981;border-radius:5px}.good-text{color:#07805e}.bad-text{color:#b91c1c}.warn-text{color:#c2410c}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin:29px 0 16px}.legend-label{font-size:10px;white-space:nowrap;color:var(--muted)}.recovery-card{margin-bottom:20px;border-color:#b9e1d9;background:#f8fdfa}.recovery-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.recovery-grid>div{display:grid;gap:8px}.recovery-grid span{font-size:12px;color:#475569}.recovery-grid strong{font-size:29px;letter-spacing:-.7px}.recovery-grid small{font-size:11px;color:var(--muted)}.footnote{font-size:11px;line-height:1.7;color:var(--muted);margin-bottom:0}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}th{text-align:right;color:#64748b;font-weight:600;background:#f8fafc;padding:12px 11px;border-bottom:1px solid var(--border)}td{text-align:right;padding:13px 11px;border-bottom:1px solid #edf2f7}th:first-child,td:first-child{text-align:left}td small{display:block;color:#94a3b8;font-size:9px;margin:5px 0 0 14px}tbody tr:last-child td{border-bottom:0}.notice{padding:15px 18px;margin-bottom:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;font-size:12px}.notice.warning{background:#fffbeb;border-color:#fcd34d;color:#92400e}.notice.error{background:#fef2f2;border-color:#fecaca;color:#991b1b}.empty{font-size:12px;color:var(--muted);padding:20px 0}.context{margin:26px 0;background:#eef2f7;border:1px solid var(--border);border-radius:12px;padding:17px 20px;color:#475569;font-size:12px}.context summary{cursor:pointer;font-weight:600}.context p,.context li{line-height:1.8}.context ul{padding-left:20px}.context>div{padding-top:8px}footer{font-size:10px;color:#94a3b8;text-align:center;padding:10px 0 30px}.mobile-break{display:none}@media(min-width:1000px){.chart-grid>.card{height:100%}}@media(max-width:760px){.scroll-hint{display:block}main{padding:0 16px}.page-header{padding:18px 16px}.page-title{align-items:flex-start;flex-direction:column;padding:26px 0 22px;gap:16px}h1{font-size:26px}.meta-chip{width:100%;white-space:normal}.test-tabs{gap:8px;margin-bottom:24px}.test-tab{padding:14px 12px;gap:8px}.tab-icon{display:none}.test-tab strong{font-size:14px}.test-tab small{font-size:9px;line-height:1.5}.tab-count{display:none}.panel-heading{align-items:flex-start}.panel-heading h2{font-size:21px}.panel-heading p{font-size:11px}.run-picker{min-width:116px;max-width:130px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.kpi{padding:15px}.kpi>strong{font-size:26px}.chart-grid{grid-template-columns:minmax(0,1fr);gap:14px}.card{padding:16px}.section-heading{align-items:flex-start}.section-heading .legend-label{display:none}.run-status>.muted{margin-left:0}.recovery-grid{gap:12px}.recovery-grid strong{font-size:24px}.recovery-grid small{font-size:10px}.data-link{font-size:10px}.brand{font-size:11px}.brand-mark{width:34px;height:34px}.mobile-break{display:block}}
`;
