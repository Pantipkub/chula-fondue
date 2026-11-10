# Load tests

ใช้ k6 ทดสอบการอ่าน `GET /tickets/:id/history` ผ่าน Gateway → JWT/ownership → gRPC → PostgreSQL ทั้ง Average-load และ Stress ใช้ workload เดียวกัน: 5 บัญชี, 25 tickets ใหม่ต่อ test, พัก 100 ms ต่อ request ไม่รวมการสร้างข้อมูลในผลวัด

## รัน

เปิด Docker stack ตาม README และมี image `grafana/k6:1.8.2` แล้วเลือกคำสั่ง:

```powershell
npm run test:load                 # Average 1 รอบ ~4m15s + setup
npm run test:stress               # Stress 1 รอบ ~10m45s + setup
npm run test:perf                 # Average แล้ว Stress ~15m + setup
npm run test:perf -- --repeat 3    # อย่างละ 3 รอบ เรียงกัน ~45m + setup
npm run test:perf -- --quick      # ตรวจ script แบบสั้น ไม่ใช่ผล performance
```

ใช้ `node scripts/run-load-tests.mjs all` ได้หากไม่ผ่าน npm ตัว runner ไม่เปิด/ปิดแอปหรือ build image ให้ ต้องใช้ image ของแอปตรงกับ source ที่ต้องการวัด ค่าเริ่มต้นคือ `.env.demo` / project `fondue-demo` หากใช้ชุดทดสอบแยกที่เคยสร้างไว้:

```powershell
docker compose --env-file .env.load -p fondue-load up -d --wait
$env:PERF_PROJECT = 'fondue-load'
$env:PERF_ENV_FILE = '.env.load'
npm run test:perf
```

การทดสอบสร้างบัญชีและคำร้องจริงในฐานข้อมูล local และไม่ลบทิ้ง อย่ารันหลายชุดพร้อมกันบน stack เดียวกัน หรือใช้ฐานข้อมูลจริง การรันแบบ quick เว้นช่วงระหว่าง test เพื่อไม่ให้การเตรียมบัญชีชน login rate limit

## รูปแบบโหลดและเกณฑ์

| ช่วง | Average-load | Stress |
| --- | --- | --- |
| Warm-up / ramp | 0 → 10 → 50 VUs รวม 60s | เหมือนกัน |
| Baseline | 50 VUs, 180s | 50 VUs, 120s |
| Stress / Peak | — | 100 และ 200 VUs ช่วงละ 120s |
| Recovery | — | กลับมา 50 VUs, 120s |
| เปลี่ยนระดับ / จบ | ลดโหลด 15s | เปลี่ยนระดับครั้งละ 30s; ลดโหลดสุดท้าย 15s |

วัดเฉพาะช่วงคงที่ ไม่รวม setup/warm-up/ramp ตรวจทั้ง HTTP 200, ticket ID และ history เกณฑ์ baseline/recovery คือ **p95 < 1,000 ms, failed reads < 1%, ไม่มี successful response ที่ผิดรูปแบบ** และต้องมีจำนวน sample เพียงพอ ช่วงโหลดสูงที่ผิด SLO ยังรันต่อเพื่อวัด recovery; ดูผลแต่ละช่วงในกราฟ/ตาราง ไม่ดูเพียง exit code

50 VUs เป็น baseline ที่กำหนดเพื่อทดลอง ไม่ใช่ปริมาณผู้ใช้งานจริง โมเดลนี้รอ response ก่อนพักและส่ง request ถัดไป จึงมี throughput ลดลงเมื่อ response ช้าลง Recovery หมายถึงผลรวมของช่วงสองนาที ไม่ใช่เวลาที่ระบบใช้ฟื้นตัวโดยละเอียด

## ดูกราฟ

ตอนรันจะแสดง `Evidence: ...` และเมื่อจบจะแสดง path ของ **`report.html`** ผลใหม่อยู่ `test-results/load/<UTC timestamp>/` ไม่เขียนทับรอบเดิม เปิด HTML ใน browser ได้โดยไม่ต้องมี web server:

- แยกแท็บ **Average-load / Stress** และเลือกรอบหากใช้ `--repeat`
- มี load profile, p50/p95/p99, throughput, p95 เทียบ SLO, successful/failed reads, CPU และ RAM
- Stress มีการเทียบ recovery กับ baseline ภายในรอบเดียวกัน
- CPU/RAM เป็นค่าสูงสุดที่สุ่มวัดตลอด test รวม setup/ramp ไม่ใช่รายช่วง; ประมาณ 100% CPU ต่อหนึ่งคอร์ และ k6 ใช้ host เดียวกับระบบ
- กราฟแสดงแต่ละรอบแยกกัน ไม่เฉลี่ย percentile หลายรอบรวมกัน

เก็บข้อมูลหลักเพียง `runs.json` (ผลทดสอบ) กับ `environment.json` (เครื่อง/รุ่นโค้ด/config) และ `report.html` (กราฟ) ส่วนแต่ละ test มี `summary.json`, `console.log`, `resources.ndjson` สำหรับ debug ใน `test-results/` ที่ถูก gitignore ไม่สร้างรายงาน Markdown หรือ metrics JSON ซ้ำอีก

ตัวอย่างผลจริงที่เก็บไว้: [เปิดกราฟ](../perf/evidence/2026-11-10/report.html) ข้อมูลการวัดเดิมยังคงเดิม แม้ปรับรูปแบบหน้ากราฟแล้ว ผลนี้วัด read API เท่านั้น ไม่ยืนยันความเร็วหน้าเว็บ/upload/write, RabbitMQ throughput, uptime หรือขีดจำกัดจำนวนผู้ใช้จริง

## ตัวเลือก

กำหนด environment variable ก่อนรัน: `BASELINE_VUS` / `STRESS_VUS` / `PEAK_VUS` (50/100/200), `HOLD_SECONDS` (180 สำหรับ Average, 120 สำหรับ Stress), `THINK_MS` (100), `PERF_REPORTERS` / `TICKETS_PER_REPORTER` (5/5), `P95_LIMIT_MS` (1000), `PERF_PROJECT` / `PERF_ENV_FILE` (fondue-demo/.env.demo), `K6_IMAGE` (grafana/k6:1.8.2)

CPU/RAM และข้อมูล environment ถูกเก็บโดย Node runner; การเรียก k6 โดยตรงจะได้เฉพาะผล request ใน `summary.json` ดู [k6 test types](https://grafana.com/docs/k6/latest/testing-guides/test-types/) สำหรับความหมายของแต่ละประเภท
