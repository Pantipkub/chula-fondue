# Demo cues — ใช้ผลจริงจาก verification

ใช้ cue sheet นี้คู่กับ [script](script-th.md) และ [storyboard](storyboard.md) ผลล่าสุดอยู่ใน `docs/evidence/20261027t084152z-c1ab/`; โครงการ compose ของ runner ปิดแล้วและเก็บ named volumes ไว้ การรันใหม่ต้องสร้าง fixtures ใหม่ อย่าอ้างว่าข้อมูลเก่ากำลังรันอยู่

## ก่อนอัด

1. เปิด proposal PDF ที่ `docs/proposal.pdf`, ภาพ `docs/diagrams/deployment.png` และ `docs/diagrams/architecture.png`
2. เปิด `docs/evidence/20261027t084152z-c1ab/report.md`, `failure.json`, `discovery.json` และ summary ของสอง endpoint ไว้พร้อมแสดง
3. หากต้องการ live demo ให้เริ่ม Compose แยกตาม [NFR guide](../nfr-verification.md) หรือใช้ retained fixture เฉพาะเมื่อ Docker ยังมี images/volumes นั้นจริง ตรวจ `docker compose ps` ก่อนอัด
4. ใช้ port 31320 ตาม evidence; ถ้าถูกใช้แล้ว เลือก port ว่าง และปรับ `GATEWAY_PORT`/curl ให้ตรงกัน
5. ปิด `.env` และ shell history ที่อาจมี secrets; ใช้ fixture/test emails เท่านั้น

## Cues ตามลำดับคลิป

| เวลาประมาณ | หน้าจอ / คำสั่ง | สิ่งที่ควรปรากฏ / คำพูด |
| --- | --- | --- |
| 0:00 | `docs/diagrams/architecture.png` | ไฮไลต์สาม services; อย่าอ้าง UI หรือ integrations ที่ยังเป็น proposed |
| 0:25 | `docs/diagrams/deployment.png`; Compose env/addresses ใน `docs/discovery.md` | host เรียก Gateway; service callers ใช้ `department-service:3001`, `ticket-service:50051` ภายใน network |
| 0:50 | DNS evidence ใน `docs/evidence/20261027t084152z-c1ab/discovery.json` หรือคำสั่งด้านล่างใน Gateway | DNS resolve ชื่อ service; address อาจเหมือนเดิมหลัง recreate |
| 1:35 | NFR table ใน `docs/proposal.pdf` | p95 27.68 ms / 23.37 ms, error 0%; local test เท่านั้น |
| 2:45 | `docker compose ps`, DNS, GET endpoints | ถ้า demo สด: project/port/fixtures ที่ตรวจพร้อมแล้วเท่านั้น; ถ้าไม่พร้อม ให้แสดง recorded evidence |
| 3:15 | `discovery.json` / screenshot response ก่อนและหลัง recreate | ID, status, history ตรงกัน; persistence ผ่าน |
| 3:40 | `failure.json` / `findings.md` | Ticket stopped: HTTP 504, 3,027.05 ms; expected 503; **FAIL** |
| 4:00 | `tickets-list-summary.json`, `ticket-history-summary.json` | Requests 67,200 / 69,113; p95 ตามตาราง; errors 0% |
| 4:15 | closing slide | 1,000-user capacity, 99.5% uptime, multi-host HA, security assessment = NOT_RUN |

## คำสั่งสำหรับ live discovery (ถ้า services พร้อม)

คำสั่งเหล่านี้ต้องรันจาก repo root. `exec` ทำ DNS check ภายใน Gateway container:

```bash
docker compose -p chula-fondue-person3-20261027t084152z-c1ab exec -T api-gateway node /app/docker/discovery-demo.mjs dns
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:31320/departments
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:31320/tickets
```

คำสั่งตรวจ persistence ที่ fixture ใช้ snapshot ใน Gateway container เดิม:

```bash
docker compose -p chula-fondue-person3-20261027t084152z-c1ab exec -T api-gateway node /app/docker/discovery-demo.mjs verify
```

ถ้า retained project ไม่อยู่ ให้ใช้ evidence ที่บันทึกไว้ หรือตั้ง Compose project ใหม่ตาม `docs/discovery.md`; helper `seed` เขียนข้อมูลใหม่และปฏิเสธ snapshot ที่ซ้ำ จึงไม่ควรรันซ้ำโดยไม่กำหนด snapshot path ใหม่

## Failure cue

Failure ล่าสุดเป็นผลจาก full runner ไม่ใช่คำสั่งเดี่ยวใน shell:

- Evidence: `docs/evidence/20261027t084152z-c1ab/failure.json` และ `findings.md`
- Readiness เมื่อ Ticket หยุด: 503; `/tickets`: 504 หลัง 3,027.05 ms; suite status: FAIL
- Ticket frozen: 504 ประมาณ 3,017 ms ตามคาด; Department stopped/slow และ restoration ผ่าน
- อย่ารัน `node scripts/verification/run.mjs` ระหว่างอัด: full run ใช้ประมาณ 3 นาที 30 วินาที และจบด้วย exit failure ที่ finding นี้โดยตั้งใจเก็บไว้
- อย่าหยุด production/shared project; ถ้าทำ live fault demo ใน isolated setup ให้คืน Ticket ด้วย `docker compose -p <isolated-project> start ticket-service`, ตรวจ readiness และหยุดโปรเจกต์ด้วย `docker compose -p <isolated-project> down` โดยไม่ใส่ `-v`
