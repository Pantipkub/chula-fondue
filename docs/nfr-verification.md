# Verification และผล NFR — คนที่ 3

ใช้ `node scripts/verification/run.mjs` จาก root repository เพื่อ build โค้ดปัจจุบันและทดสอบผ่าน Gateway บน Compose project ใหม่ที่แยก network/volumes จากงานคนที่ 1–2 และฐานข้อมูล local ของผู้ใช้ ไม่ต้องเพิ่ม npm dependency หรือเปลี่ยน `.env` เดิม

## เริ่มใช้งาน

ต้องมี Node >=22.13 ที่รองรับ `process.loadEnvFile` และ Docker Engine/Desktop พร้อม Compose v2 ที่รองรับ `--wait` การ build ครั้งแรกต้องดาวน์โหลด image และ dependencies ใช้ loopback port 31320 เป็นค่าเริ่มต้น

```bash
node scripts/verification/run.mjs
node scripts/verification/run.mjs --help
```

Default คือ `--mode all` และใช้ profile ที่ README กำหนด: **100 tickets, warm-up 10 วินาที, 20 concurrent workers, measurement 60 วินาทีต่อ endpoint** วัด `/tickets` ก่อน แล้ววัด `/tickets/:id/history` แยกอีกครั้ง รวม warm-up/measurement อย่างน้อย 140 วินาที ยังไม่รวม build, seed และ fault checks

| ตัวเลือก | ความหมาย |
| --- | --- |
| `--mode all` | Build/start, seed, performance, functional, discovery/persistence, failure และ correlation |
| `--mode performance` | วัดสอง endpoint ด้วย 100 tickets โดยไม่เพิ่ม functional fixtures |
| `--mode functional` | Workflow, history, filters, errors และ correlation; ไม่มี performance claim |
| `--mode discovery` | DNS, recreate Department/Ticket, persistence, Gateway เดิม และ shared probes |
| `--mode failure` | Department/Ticket หยุดและค้าง, timeout/status, non-mutation, restoration |
| `--port 31321` | เปลี่ยน host port; container ports และ service DNS คงเดิม |
| `--project chula-fondue-person3-rerun01` | ชื่อ project ใหม่เท่านั้น; ปฏิเสธถ้ามี container หรือ volume ของชื่อนั้นอยู่แล้ว |
| `--warmup 1 --duration 2 --concurrency 2` | ตรวจ runner แบบสั้น; ติดป้าย exploratory และใช้แทน baseline ไม่ได้ |
| `--keep-up` | หลังจบคืน services ให้พร้อมและเก็บ containers ไว้; ปกติ runner ใช้ `down` โดยเก็บ named volumes |

อ่าน root `.env` ด้วย Node โดยไม่พิมพ์ค่า environment และให้ shell environment มีสิทธิ์ก่อน ค่า `VERIFICATION_PORT` เป็น default ของ `--port` แยกจาก `GATEWAY_PORT` local; runner ตั้ง host port ให้ Compose ของตนเท่านั้น Compose ยังใช้ internal endpoints ตาม contract เดิม

Exit code: `0` เมื่อทุก check ที่เลือกผ่าน, `1` เมื่อมี FAIL, `2` เมื่อ arguments ไม่ถูกต้อง งานที่ไม่เลือกหรือถูกขัดขวางระบุ `NOT_RUN` การเลือก mode ย่อยที่ผ่านไม่ได้แปลว่า baseline ทั้งหมดผ่าน

## Fixtures และลำดับทดสอบ

1. ตรวจว่า port ว่างและ project ไม่มี containers/volumes เดิม ก่อนเริ่ม build/start ใช้ project name ที่ขึ้นต้น `chula-fondue-person3-` เท่านั้น
2. ตรวจ `/ready` แล้วสร้าง Department และ tickets ด้วย API จริง บันทึก ID และ snapshot ทุก history ใน `fixtures.json`
3. ในโหมด all/performance สร้าง **100 tickets**: 20 ASSIGNED (history 2 entries) และ 80 SUBMITTED (history 1 entry), reporters 4 กลุ่ม ไม่มี cancelled tickets ณ เวลาวัด ตรวจทั้งจำนวนและ ID ให้ตรงก่อนยิงโหลด
4. วัดสอง endpoint แบบ read-only ก่อนเพิ่ม fixtures อื่น `/tickets` คืนทั้งหมด 100 รายการทุก request; history หมุนวนครบ 100 IDs ข้อมูลไม่ถูกแก้ระหว่างวัด
5. Functional เพิ่มอีก 4 tickets รวม 104 หลังวัด (103 visible เพราะ 1 CANCELLED) ตรวจ full workflow ผ่าน RESOLVED/reopen ถึง CLOSED, cancel, reject, ordered history, invalid transition 409, validation 400, not found 404, assignment ไป Department ที่ไม่มีต้องไม่แก้ state/history และ filters 5 แบบ รวม filters ร่วมกัน
6. Resolve DNS ภายใน Gateway และตรวจ client URLs จริง จากนั้น recreate Department และ Ticket ทีละตัวโดยคง volumes ตรวจว่า container ID เปลี่ยน แต่ Gateway ID เดิม และข้อมูล Department/ticket/history เท่ากับ snapshot ทุก field จบด้วย shared application probes ทั้ง 3 services
7. Fault checks ใช้ ticket SUBMITTED ของ runner จับ snapshot ก่อนจำลอง Department stopped/frozen และ Ticket stopped/frozen แล้วคืน service ใน `finally` ของแต่ละ phase ทดสอบ readiness/liveness และ independent routes พร้อม status/เวลาของ request; Department assignment ที่ล้มเหลวต้องไม่เปลี่ยน state/history ทั้งระหว่าง fault และหลังคืน service
8. ตรวจ request ID เดียวกันจาก Gateway → Ticket → Department ด้วย actual structured logs โดยเก็บก่อน recreate เพราะ logs อยู่กับ container เดิม รองรับ JSON ที่มี ANSI color ของ Nest หุ้มอยู่ และตรวจ final readiness ก่อน shutdown

Modes ที่ไม่วัด performance ใช้ seed เพียง 2 tickets (1 ASSIGNED/1 SUBMITTED) และ functional เพิ่ม 4 ตามเดิม `docker pause` จำลอง peer ที่ไม่ตอบสนอง ไม่ใช่การเติม network delay หรือ packet loss

## วิธีคำนวณ performance

- ใช้ Node built-ins บน host เป็น load generator และยิง HTTP ไป Gateway ที่ publish loopback; 20 asynchronous workers แต่ละ worker รอ request เสร็จก่อนส่งใหม่ ไม่มี think time เป็น **closed-loop workload**
- Warm-up แยกต่อ endpoint และไม่อยู่ในตัวเลข/CSV เริ่ม measurement ใหม่หลัง warm-up
- ส่ง request ใหม่เฉพาะก่อนครบ 60 วินาที แต่รอ in-flight requests ที่เหลือให้จบ นับทุก attempt เหล่านี้ทั้งใน samples และจำนวน requests ใช้เวลารวมถึง drain เป็น denominator ของ throughput (req/s)
- Client latency เริ่มก่อน fetch จนอ่าน body ครบ, parse JSON และตรวจ payload เสร็จ รวม HTTP/Gateway/gRPC/SQLite และงาน validation ของ load generator ไว้ด้วย จึงไม่ใช่ latency ภายใน service เพียงอย่างเดียว
- ตรวจ payload จริงทุกครั้ง: list เปรียบเทียบ tickets ครบทุก field หลังเรียง ID; history เปรียบเทียบ ticket/history กับ snapshot ของ ID นั้น ไม่ใช่ตรวจแค่ HTTP 200
- p50/p95/p99 ใช้ nearest-rank ของ latency ทุก measured attempt รวม errors: `sorted[ceil(p × N) - 1]` Error คือ HTTP ไม่ใช่ 200, transport/client timeout หรือ payload ไม่ตรง ใช้ timeout ฝั่ง runner 6 วินาที
- เกณฑ์รอบนี้: **p95 <1,000 ms และ error rate <1%** ต่อ endpoint เป็น target เบื้องต้นสำหรับ workload นี้ การเปลี่ยน load flags ทำให้เป็น exploratory แม้ผ่านตัวเลขเป้าหมาย

Raw CSV ระบุ worker, path, start/end offsets, latency, HTTP status, response bytes และ error ตรวจซ้ำจาก `*-summary.json` ได้ ค่าในเอกสารปัดทศนิยมเพื่ออ่าน ส่วน JSON/CSV เก็บค่าละเอียด

## หลักฐานและผลล่าสุด

รอบล่าสุด [20261027t084152z-c1ab](evidence/20261027t084152z-c1ab/report.md) รันจริงวันที่ **27 ต.ค. 2026 เวลา 15:41:52–15:45:22 น. (Asia/Bangkok)** ด้วย `node scripts/verification/run.mjs` ผลรวม **FAIL** เพราะ Ticket stopped ตอบ 504 แทน 503 หนึ่งกรณี ส่วน performance, functional, correlation, discovery/persistence, Department faults, Ticket frozen และ restoration ผ่านทั้งหมด ไม่ปรับเกณฑ์เพื่อให้ผลผ่าน

| Endpoint | Requests | Throughput req/s | p50 ms | p95 ms | p99 ms | Error | Target |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /tickets` | 67,200 | 1,119.31 | 13.42 | 27.68 | 72.86 | 0% | PASS |
| `GET /tickets/:id/history` | 69,113 | 1,151.57 | 9.42 | 23.37 | 54.97 | 0% | PASS |

ทั้งสอง endpoint ใช้ dataset 100 tickets, warm-up 10s, 20 workers, measurement 60s ตามที่กำหนด; รวม drain เป็น 60.037s / 60.016s ตามลำดับ ผลนี้ผ่าน **p95** <1s และ error <1% แต่ไม่ได้แปลว่าทุก request ต่ำกว่า 1s: maximum client latency ที่พบคือ **1,070.51 ms / 3,681.71 ms** ตามลำดับ ยังไม่ได้แยกสาเหตุ outlier ระหว่าง host/load generator กับ service

| Verification | Result | Observed |
| --- | --- | --- |
| Raw evidence audit | PASS | คำนวณจำนวน/percentiles/throughput/errors ซ้ำได้จากทุก CSV row; 20 workers และ history ครบ 100 IDs |
| Workflow / filters / errors | PASS | Lifecycle ถึง CLOSED ผ่าน reopen, cancel/reject, history, filters 5 แบบ และ 400/404/409 |
| Request correlation | PASS | 5 log records มี request ID เดียวกันครบ Gateway/Ticket/Department |
| DNS / recreate / persistence | PASS | Department/Ticket container เปลี่ยน, Gateway เดิม; fixture Department และ ticket/history คงเดิม; probes ทั้ง 3 ผ่าน |
| Department stopped | PASS | Readiness 503 ใน 14.72ms; proxy 503 ใน 13.56ms; assign 503 ใน 84.94ms; ticket/history คงเดิม |
| Department frozen | PASS | Readiness 503 ใน 757.80ms; proxy 504 ใน 2,010.14ms; assign 504 ใน 2,061.19ms; ticket/history คงเดิม |
| Ticket stopped | **FAIL** | Readiness 503 ใน 763.95ms; `/tickets` **504 ใน 3,027.05ms** แทน expected 503 |
| Ticket frozen | PASS | Readiness 503 ใน 761.80ms; `/tickets` 504 ใน 3,017.00ms |
| Final restoration / shutdown | PASS | ทุก fault คืน service ได้, readiness 200 ทั้ง dependencies up; ปิดเฉพาะ project นี้โดยเก็บ named volumes |

อ่าน [finding และการส่งต่อให้คนที่ 2](evidence/20261027t084152z-c1ab/findings.md) ก่อนอ้างว่า stopped dependency ตอบ 503 เสมอ รอบก่อน [20261027t083522z-e1d3](evidence/20261027t083522z-e1d3/report.md) เก็บไว้ครบ รวม FAIL ของตัว runner เรื่อง trace/restoration ที่แก้แล้ว และ Ticket stopped 504 ที่ยังพบซ้ำ รอบแรกผ่าน performance เช่นกัน แต่ไม่ใช้แทนผลรวมของรอบล่าสุด

Environment ล่าสุด: Apple M3 arm64 8 logical CPUs / RAM 16 GiB, Docker VM 8 CPUs / RAM ประมาณ 11.67 GiB, Docker Engine 27.4.0, Compose 2.31.0-desktop.2, host Node v24.4.1, container Node v22.23.4 และ SQLite มี Compose projects อื่นรันร่วม (`chula-fondue-person1`, `chula-fondue-person2`, `ocr`, `backend`) รายละเอียดและ fingerprint อยู่ใน environment file หลักฐานแต่ละรอบเก็บใน `docs/evidence/<run-id>/` แยกจากกัน ไม่เขียนทับรอบเดิม

| ไฟล์ | ใช้ตรวจอะไร |
| --- | --- |
| `report.md`, `summary.json`, `checks.json` | ผล PASS/FAIL/NOT_RUN, เงื่อนไข, คำสั่ง, วันเวลา และข้อจำกัด |
| `environment.json` | Host/Docker CPU, memory, architecture, Node/Compose versions, image IDs, Git HEAD/dirty flag และ SHA-256 ของ source/config/scripts |
| `fixtures.json` | Dataset IDs, records และ history snapshots ณ ก่อนวัด |
| `tickets-list-samples.csv`, `ticket-history-samples.csv` | ทุก measured attempt ที่ใช้คำนวณ percentile/error/throughput |
| `tickets-list-summary.json`, `ticket-history-summary.json` | ผลแยก endpoint และเกณฑ์ที่ใช้ |
| `audit.json` | คำนวณจำนวน requests/errors, response bytes, percentile, throughput, workers และ history paths ซ้ำจาก raw CSV |
| `functional.json`, `discovery.json`, `failure.json` | Workflow/filter, DNS/container IDs/persistence และ fault status/เวลา/non-mutation |
| `request-correlation.json` | Structured log records ที่มี request ID เดียวกันทั้ง 3 services |
| `events.jsonl`, `commands.log` | HTTP events, คำสั่ง/exit codes และ stdout/stderr ที่รันจริง |
| `final-containers.jsonl` | Container state ก่อน shutdown หลังคืน dependency พร้อมใช้งาน |

Git HEAD ยังอาจเป็น initial commit เมื่อ working tree มีโค้ดใหม่ จึงบันทึก dirty flag, source SHA-256 และ image IDs เพิ่ม ไม่อ้างว่า HEAD เพียงอย่างเดียวคือโค้ดที่วัด

ตรวจตัวเลขซ้ำแบบ offline โดยไม่ใช้ Docker และไม่สร้าง request ใหม่ได้ด้วย:

```bash
node scripts/verification/audit.mjs docs/evidence/<run-id>
```

Runner เรียก audit ให้อัตโนมัติหลังวัดครบทั้งสอง endpoint การตรวจ offline จะเขียน `audit.json` ใน evidence directory นั้น และใช้ tolerance 0.001 ms เพราะ CSV ปัด latency เป็นทศนิยม 3 ตำแหน่ง

## การคืนสภาพและข้อมูลที่เก็บไว้

Runner ไม่เรียก `down -v` และไม่แตะ project ของคนอื่น แต่ละ fault มี `finally` สำหรับ start/unpause, รอบทั้งหมดมี final restoration/unpause/readiness และปกติจบด้วย `docker compose down` ของ project ตนเอง โดยเก็บ named volumes ไว้สำหรับ review เมื่อ rerun จะสร้าง project/fixtures ใหม่เสมอ

หากเลือก `--keep-up` ให้ใช้ project/port ที่อยู่ใน summary เปิดข้อมูลหรือหยุดตามนี้ (แทน placeholder ด้วยค่าจริง):

```bash
GATEWAY_PORT=<port> docker compose -p <project> up -d --wait --wait-timeout 120
docker compose -p <project> ps
docker compose -p <project> down
```

การ start project เก่าข้างต้นมีไว้ inspect retained fixture ไม่ใช่คำสั่ง rerun measurement ถ้ากระบวนการถูก `SIGKILL`, host crash หรือ Docker daemon หยุดจน cleanup ทำงานไม่ได้ ให้ตรวจ paused/stopped services แล้ว restore เองจาก project ใน evidence; signal SIGINT/SIGTERM มี cleanup ตามปกติ แต่ไม่สามารถรับประกันการกู้คืนขณะที่ daemon ใช้ไม่ได้

## ขอบเขตที่ยังไม่มีผลยืนยัน

- `NOT_RUN`: 1,000 active-user capacity, workload มี think time/arrival rate, sustained soak และ 99.5% uptime observation
- `NOT_RUN`: Concurrent write/mutation load, retry/idempotency, network delay/packet loss และ deadline หลัง commit ที่ผลลัพธ์ไม่แน่นอน
- `NOT_RUN`: Multi-host discovery, load balancing/HA, cloud deployment, backup/restore และ disaster recovery
- `NOT_RUN`: Authentication/authorization/security assessment และ integration จริงกับ photo storage, broker หรือ notification delivery

Baseline เป็นการวัดบน local Docker/SQLite มี load generator อยู่เครื่องเดียวกัน และมี Compose projects อื่นรันร่วมอยู่ (รายชื่อจริงอยู่ใน `environment.json`) จึงไม่ใช่เครื่อง benchmark ที่แยก resources ไม่แปลงผลเป็น production capacity หรือ uptime SLA ให้คนที่ 4 ใช้ตารางผลพร้อมเงื่อนไขและข้อจำกัด ส่วนคนที่ 5 ใช้ workflow/discovery/failure ที่มี evidence ไปประกอบคลิป
