# Chula Fondue demo

Three small NestJS services for the REST + gRPC CRUD demo.

**งาน Progress รอบนี้:** คลิปอธิบาย Service Discovery และ NFR ความยาวต่ำกว่า 5 นาที พร้อม proposal ที่อัปเดต ADRs, microservice design และ diagrams เริ่มงานตาม [บทบาทคนที่ 1-5](#team-roles) ได้โดยบอก AI ว่า `ผมเป็นคนที่ 1` ถึง `ผมเป็นคนที่ 5` หลังให้ AI อ่าน README นี้

| App | Protocol | Port | Purpose |
| --- | --- | --- | --- |
| `department-service` | REST | 3001 | CRUD on departments |
| `ticket-service` | gRPC | 50051 | CRUD on tickets; calls `department-service` over REST when assigning |
| `api-gateway` | REST | 3000 | Routes to the two services; deadlines, health and request correlation |

## 1. Prerequisites and install

- Node.js 22.13 or newer (tested on 22.13.1) and npm
- Git Bash (or any bash) and `curl` for the demo scripts

```
npm run install:all
```

## 2. Configure and start everything

On a fresh checkout, copy the example configuration to the repository root:

```bash
cp .env.example .env
```

Edit `.env` for your machine, then start all three services:

```
npm run dev
```

This compiles and starts all three services in one terminal with `[department]`, `[ticket]` and `[gateway]` log prefixes. Wait for three "successfully started" lines.

All three services automatically load the root `.env` when started with `npm run dev` or `npm start -w <service-name>`. They use Node's built-in [`--env-file-if-exists`](https://nodejs.org/download/release/v22.13.1/docs/api/cli.html#--env-file-if-existsconfig) option; no extra package is needed. Exported environment variables take precedence over `.env`. If `.env` is absent, the existing defaults still apply. Restart the services after changing `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_PORT` | `3000` | API Gateway REST port |
| `DEPARTMENT_PORT` | `3001` | Department Service REST port |
| `TICKET_GRPC_URL` | `0.0.0.0:50051` | Ticket Service gRPC listener |
| `TICKET_SERVICE_URL` | `localhost:50051` | gRPC address used by Gateway and the gRPC demo |
| `DEPARTMENT_SERVICE_URL` | `http://localhost:3001` | REST address used by Gateway, Ticket Service, and demos |
| `GATEWAY_URL` | `http://localhost:3000` | REST address used by the Gateway demo |
| `DEPARTMENT_DB_PATH` | `services/department-service/department.sqlite` (absolute internally) | Optional Department SQLite path; parent directories are created automatically |
| `TICKET_DB_PATH` | `services/ticket-service/ticket.sqlite` (absolute internally) | Optional Ticket SQLite path; parent directories are created automatically |

When changing a port, update its matching client URL too. For example, changing `DEPARTMENT_PORT` to `3101` also requires `DEPARTMENT_SERVICE_URL=http://localhost:3101`. `TICKET_GRPC_URL` is the listener address; clients should use a reachable hostname such as `localhost` in `TICKET_SERVICE_URL`.

Commit `.env.example` as the shared template. `.env` and other `.env.*` files are ignored by Git. The current SQLite databases are created automatically and do not need database credentials.

### Run with Docker Compose

With Docker Desktop running, start the container setup from the repository root:

```bash
docker compose up --build -d --wait
```

Open [http://localhost:3000/departments](http://localhost:3000/departments) or [http://localhost:3000/tickets](http://localhost:3000/tickets). Compose overrides local service URLs with internal DNS names and stores the two SQLite databases in separate named volumes. The Gateway host port follows `GATEWAY_PORT`; the internal ports remain 3000/3001/50051. Stop a local Gateway first if it uses the same host port, or use `GATEWAY_PORT=3100 docker compose up --build -d --wait`.

```bash
docker compose ps
docker compose logs --tail=50
docker compose down
```

The normal `down` command preserves named volumes. See [Service Discovery guide](docs/discovery.md) for DNS, recreate/persistence checks, health-probe integration and demo commands. The existing `demo/rest-demo.sh` and direct gRPC demo target the npm/local setup; the Compose guide uses the Gateway so internal ports can stay private.

### Application health and resilience

Gateway and Department expose `GET /health` for process liveness and `GET /ready` for readiness. Gateway readiness reports Department and Ticket separately and returns 503 if either is not ready; independent routes and liveness can still work. Ticket provides the application-specific gRPC `TicketService.CheckHealth` RPC with `SERVING`/`NOT_SERVING` status and a DB check.

REST dependency calls have a 2-second budget and Gateway -> Ticket calls use a native 3-second gRPC deadline. Unavailable dependencies map to HTTP 503 and timed-out calls to 504. The same `x-request-id` is propagated across HTTP/gRPC hops and returned in HTTP response headers. See [Resilience guide](docs/resilience.md) and [Person 2 handoff](docs/handoffs/person-2.md) for contracts, limits and measured checks.

```bash
curl -i http://localhost:3000/health
curl -i -H 'x-request-id: demo-health-001' http://localhost:3000/ready
```

After rebuilding images, the Compose health wrapper delegates to `scripts/healthcheck.mjs`, which checks application readiness. The older Person 1 test project at port 31300 may still be running bootstrap-probe images; the Person 2 project at port 31310 is separate.

## 3. Run the demo scripts

Run them from a second terminal, in this order, against fresh data (see section 4):

```
bash demo/rest-demo.sh      # R1-R8: REST CRUD on department-service
bash demo/grpc-demo.sh      # G1-G8: gRPC CRUD on ticket-service
bash demo/gateway-demo.sh   # W1-W4: the same services through the gateway
```

All three shell scripts read the root `.env` automatically and respect exported environment variables. Each script prints every command before its output, followed by the status it got and the status it expected. `rest-demo.sh` saves the two department ids to `demo/.ids`, and the other two scripts read them from there.

During G3, the `npm run dev` terminal shows the two log lines for the cross-service call:

```
[TicketService] {"event":"dependency_call","service":"ticket-service","dependency":"department-service","requestId":"...","operation":"GetDepartment","grpcCode":0,"durationMs":...}
[NotificationStub] to=<email> ticket=<id> status=ASSIGNED
```

## 4. Reset the data

Stop `npm run dev` (Ctrl+C), then delete the two database files. They are recreated on the next start.

```
rm -f services/department-service/department.sqlite services/ticket-service/ticket.sqlite
```

## 5. What is real and what is a stub

Real:

- REST CRUD on departments, stored in SQLite (`department.sqlite`)
- gRPC CRUD on tickets with status history, stored in SQLite (`ticket.sqlite`)
- The REST call from `ticket-service` to `department-service` when a ticket is assigned
- The gateway, including the routes for the optional status changes (`POST /tickets/:id/reject`, `/start`, `/resolve`, `/confirm`, `/reopen`)
- Docker Compose service-name discovery, application readiness, bounded REST/gRPC calls and request correlation
- Repeatable verification and recorded local NFR evidence; see [NFR report](docs/nfr-verification.md) for per-check results and the open FAIL

Stub or not built:

- Notifications are logged only; no email is sent
- Photos are URL strings only; nothing is uploaded or stored
- No authentication, login or roles
- No Analytics Service
- React UI, Cloudinary uploads, PostgreSQL migration, RabbitMQ and a MongoDB-backed Notification Service remain target work; Gmail and seven-day automatic closure remain future work

**Revised submission document:** [Proposal PDF](docs/proposal.pdf), [editable proposal](docs/proposal.md), [11 ADRs](docs/adr/README.md) and [Person 4 handoff](docs/handoffs/person-4.md). The report includes three rendered diagrams and actual NFR results; the complete verification suite still records the stopped-Ticket 504-versus-503 finding.

## Differences from the spec

- `grpcurl` is not installed on this machine, so `demo/grpc-demo.sh` runs `demo/grpc-demo.js`, a small Node script that loads the same `proto/ticket.proto`.
- The SQLite driver is `better-sqlite3`. The current TypeORM (1.x) no longer supports the `sqlite3` package.
- `demo/gateway-demo.sh` and `demo/lib.sh` are extra files. The gateway checks must run after the gRPC checks, so they could not go into `rest-demo.sh`.
- The services are an npm workspace, so `npm run install:all` is a single `npm install` at the root.
- Services are compiled with `tsc` and run with `node`. The Nest CLI is not used because its current version crashes on Node 22.13.

<a id="team-roles"></a>

## 6. แบ่งงาน Progress สำหรับคนที่ 1-5

ส่วนนี้เป็นคำสั่งเริ่มงานสำหรับสมาชิกและ AI ที่ช่วยสมาชิกแต่ละคน ให้ยึดหน้าที่และข้อตกลงด้านล่างเป็นหลัก รายละเอียดเวลาและ storyboard เพิ่มเติมอยู่ใน [แผนรอบนี้](docs/weekly-progress-plan.md)

### 6.1 วิธีเริ่มจาก prompt สั้น

เปิด repo นี้ใน AI coding assistant หรือส่ง README นี้เป็น context แล้วพิมพ์อย่างใดอย่างหนึ่ง:

```text
ผมเป็นคนที่ 1
```

เปลี่ยนเลขเป็น `2`, `3`, `4` หรือ `5` ได้เลย ถ้า AI ยังไม่ได้อ่าน repo ให้ใช้:

```text
อ่าน README.md แล้วทำงานส่วนคนที่ 3 ให้ครบตามขอบเขตและเกณฑ์จบงาน
```

**คำสั่งสำหรับ AI:** เมื่อผู้ใช้ระบุว่าเป็นคนที่ N ให้รับบทบาท N อ่านข้อตกลงร่วมและรายละเอียดของบทบาทนั้น ตรวจสถานะไฟล์จริง แล้วลงมือทำงานทันทีจนได้ผลลัพธ์ตามเกณฑ์ ไม่ต้องถามซ้ำว่าจะเริ่มงานไหน การเลือกเลขบทบาทไม่ใช่คำสั่งให้ทำงานครบทั้งห้าคนหรือสร้าง agent/แชตเพิ่ม ถ้าเป็นแชตที่เข้าถึงได้เฉพาะ README ให้ระบุเฉพาะไฟล์ของบทบาทที่ต้องใช้เพิ่มเติม และทำส่วนที่มีข้อมูลพอได้ก่อน

| คน | งานหลัก | ผลลัพธ์หลัก | เริ่มทำได้เมื่อไร |
| --- | --- | --- | --- |
| [1](#role-1) | Docker, Service Discovery และ persistent volumes | Compose ที่รัน 3 services ผ่าน DNS ได้ + deployment diagram | ทันที |
| [2](#role-2) | Health/readiness, timeout/deadline และ error handling | Services ที่ตรวจสุขภาพและรับมือ dependency ล่มได้ + sequence diagram | ทันที โดยใช้ contract ร่วม |
| [3](#role-3) | Verification, performance และหลักฐาน NFR | สคริปต์รันซ้ำได้ + รายงานผลจริง | เขียนสคริปต์ได้ทันที; รันทดสอบรวมเมื่อ 1/2 พร้อม |
| [4](#role-4) | Proposal, ADRs และภาพรวม architecture | Proposal Markdown/PDF + ADRs + diagrams ฉบับรวม | ร่างได้ทันที; เติมผลจาก 1/2/3 ภายหลัง |
| [5](#role-5) | สคริปต์คลิป, storyboard, demo และตรวจงานส่ง | ชุดพร้อมอัด + คลิปจริงต่ำกว่า 5 นาทีเมื่อบันทึกได้ | เตรียมได้ทันที; อัดฉบับสุดท้ายหลังผลทดสอบนิ่ง |

### 6.2 Context ที่ต้องรู้โดยไม่อาศัยประวัติแชต

- Chula Fondue เป็นระบบแจ้งปัญหาในมหาวิทยาลัย Reporter ส่งเรื่อง, Central Admin จ่ายงาน, Department Staff แก้ไข และ Reporter ยืนยันปิดหรือเปิดงานใหม่
- โค้ดเริ่มต้นมี API Gateway, Department Service และ Ticket Service ตามส่วน 1-5 ด้านบน ให้ตรวจสถานะปัจจุบันอีกครั้งก่อนลงมือ เพราะสมาชิกคนอื่นอาจทำส่วนของตนเสร็จแล้ว
- Auth/JWT/RBAC, frontend, Cloudinary, RabbitMQ และ Notification Service/MongoDB ยังเป็นงานที่ต้องทำตามแบบ ให้เขียนสถานะตามหลักฐานจริง การแบ่งงานรอบนี้เน้น discovery และ NFR บน 3 services เดิม
- Analytics, Gmail delivery และ auto-close 7 วันเป็น future iteration ตาม proposal เดิม
- เอกสารต้นฉบับอยู่ใน repo เพื่อให้ทุกคนใช้ context เดียวกัน: [Project description and ADRs](docs/references/project-description-and-adrs.pdf) และ [Microservice architecture](docs/references/microservice-architecture.pdf) ใช้เป็น requirements และ design references
- ไฟล์/endpoint ที่ระบุว่าให้สร้างด้านล่างเป็นงานที่มอบหมาย ไม่ใช่การยืนยันว่ามีหรือทำเสร็จแล้ว

### 6.3 ข้อตกลงร่วมก่อนแก้โค้ด

| รายการ | Contract ที่ใช้ร่วมกัน |
| --- | --- |
| Local development | คง `npm run dev` และ root `.env` แบบ localhost ให้ใช้งานได้ |
| Compose services | ชื่อ `api-gateway`, `department-service`, `ticket-service`; service-to-service traffic ใช้ชื่อเหล่านี้ใน network เดียวกัน |
| Container endpoints | `TICKET_SERVICE_URL=ticket-service:50051`, `DEPARTMENT_SERVICE_URL=http://department-service:3001`; ให้ Compose override ค่า local โดยไม่เขียนทับ `.env` ของผู้ใช้ |
| Host access | เปิด Gateway ที่ `localhost:3000` เป็นทางเข้าหลักของเดโม; พอร์ตภายในเปิดเพิ่มเฉพาะเมื่อจำเป็นและระบุเหตุผล |
| Persistent DB paths | คนที่ 2 เพิ่มการอ่าน `DEPARTMENT_DB_PATH` และ `TICKET_DB_PATH` โดยคง SQLite path เดิมเป็น default; คนที่ 1 ตั้ง path `/data/department.sqlite` และ `/data/ticket.sqlite` กับ named volume แยก service |
| HTTP health | คนที่ 2 เพิ่ม `GET /health` สำหรับ liveness และ `GET /ready` สำหรับ readiness ใน Gateway/Department; readiness ใช้ 503 เมื่อ dependency ที่ตรวจไม่พร้อม และแสดงรายละเอียดแต่ละ dependency |
| Ticket health | คนที่ 2 เพิ่ม `TicketService.CheckHealth` แบบ unary ใน `proto/ticket.proto` โดยไม่เปลี่ยน RPC/field เดิม; response มี `status` เป็น `SERVING` หรือ `NOT_SERVING` และตรวจ DB readiness |
| Compose health probe | คนที่ 2 สร้าง `scripts/healthcheck.mjs <service-name>`: exit 0 เมื่อพร้อม, non-zero เมื่อไม่พร้อม; Compose เรียก `docker/healthcheck.mjs` ของคนที่ 1 ซึ่ง delegate ไป probe นี้เมื่อมีใน image ระหว่างที่ยังไม่มีใช้ bootstrap read probes ผ่าน REST/gRPC และต้องระบุว่า application health/readiness ยังรอคนที่ 2 |
| Failure budget | เสนอ REST timeout 2 วินาที, gRPC deadline 3 วินาที และแปลง unavailable/timeout เป็น HTTP 503/504 ให้สื่อความหมาย; ใช้ budget รวมที่ไม่ทำให้ request ค้าง |
| Data correctness | ถ้า Department lookup ล้มเหลวก่อน commit สถานะ ticket ต้องคงเดิม; client หมด deadline ไม่ได้แปลว่า server rollback แล้ว; คง transaction ของ ticket/history |
| Verification entry point | คนที่ 3 สร้าง `node scripts/verification/run.mjs` และระบุ modes/flags ในคู่มือของตน; ใช้ API จริงและแยกผลที่ยังรันไม่ได้ |
| Evidence/status | ใช้ `NOT_RUN`, `PASS`, `FAIL` สำหรับการทดสอบ และ Implemented / Proposed / Future สำหรับแบบระบบ; ห้ามใช้ค่าที่สมมติเป็นผลการทดลอง |

ทำงานหลักในไฟล์ที่บทบาทตนเป็นเจ้าของตามรายละเอียดด้านล่าง ถ้าต้องแก้ไฟล์ร่วมเพื่อให้ส่วนตนใช้งานได้ ให้แก้เฉพาะสิ่งจำเป็น รักษางานคนอื่นและความเข้ากันได้ แล้วบันทึกเหตุผลใน handoff ของตน ถ้าจะเปลี่ยน contract ให้ตรวจทุก caller ที่ได้รับผลและอัปเดตข้อความร่วมให้ตรงกัน

ก่อนเริ่มให้ตรวจ `git status` และอ่าน handoff ที่มีอยู่ ห้าม reset/ลบงานสมาชิกอื่นหรือฐานข้อมูลจริง การทดสอบที่สร้าง/แก้ข้อมูลต้องใช้ fixture หรือข้อมูลที่ script สร้างและระบุวิธี cleanup ของตัวเอง

<a id="role-1"></a>

### คนที่ 1 — Docker, Service Discovery และ Persistence Setup

**เป้าหมาย:** เปิดระบบ 3 services ผ่าน Compose ได้ โดยเรียกกันด้วยชื่อ service และมีที่เก็บ SQLite ที่อยู่ต่อหลัง recreate

**อ่านก่อน:** ส่วน 1-6 ของ README, `package.json`, `services/*/package.json`, `services/*/tsconfig.json`, `.env.example`, `docs/handoffs/person-2.md` ถ้ามี

**ไฟล์หลักที่รับผิดชอบ:** `Dockerfile`, `.dockerignore`, `compose.yaml`, `.env.example`, `.gitignore`, root/workspace `package.json` และ lockfile เมื่อจำเป็น, `docs/discovery.md`, `docs/diagrams/deployment.mmd`, `docs/handoffs/person-1.md`

**ลงมือทำตามลำดับ:**

1. สร้าง Docker build/run ที่รองรับ npm workspaces, TypeScript build, gRPC proto และ SQLite driver ของโปรเจกต์นี้ โดยเก็บ dependencies ที่ runtime ใช้ครบ
2. สร้าง Compose network และ 3 services ด้วยชื่อ/ports ตาม contract; inject internal endpoints ผ่าน environment; ให้ผู้ใช้ยังรันแบบ npm/local ได้
3. ผูก named volumes แยกกันที่ `/data` และตั้ง DB path ตาม contract โดยตรวจร่วมกับการรองรับ env ของคนที่ 2
4. ใช้ health probe ของคนที่ 2 ใน healthchecks/ลำดับเริ่มต้น; ถ้างานนั้นยังไม่มา ให้เตรียม integration ไว้และระบุส่วนที่ยังทดสอบไม่ได้
5. สาธิต resolve DNS จากภายใน container และเรียก `/departments` ผ่าน Gateway; recreate Department Service แล้วเรียกผ่านชื่อเดิมอีกครั้งโดยไม่แก้ URL พร้อมตรวจ reconnect
6. เขียน `docs/discovery.md` ให้มี prerequisites, คำสั่ง build/up/check/recreate/stop, การดู logs และข้อจำกัด; ให้คำสั่งหยุดปกติคง volumes ไว้
7. วาด deployment diagram ใน `docs/diagrams/deployment.mmd` พร้อม network boundary, host/internal ports, DNS names และ volumes

**เกณฑ์จบ:** `docker compose config` ผ่าน, images build และ 3 services ทำงานจริง, request ผ่าน Gateway สำเร็จหลัง readiness, resolve service names ได้ และ recreate โดยคง volume แล้วข้อมูลยังอยู่ เก็บ command/output จริงใน handoff; DNS ไม่ได้ยืนยันว่า IP จะต้องเปลี่ยนทุกครั้งหรือระบบได้ HA แล้ว

**ส่งต่อ:** คำสั่งและผลให้คนที่ 3 ตรวจซ้ำ; discovery guide/diagram ให้คนที่ 4/5 ใช้ ถ้าเครื่องไม่มี Docker/daemon ให้ทำไฟล์และตรวจส่วนที่ทำได้ พร้อมระบุ runtime checks เป็น `NOT_RUN`

<a id="role-2"></a>

### คนที่ 2 — Health, Resilience และ Service Configuration

**เป้าหมาย:** ตรวจได้ว่า service พร้อมใช้งานหรือไม่ และเมื่อ dependency ล่ม/ช้า request จบภายใน budget พร้อม error ที่ถูกต้อง

**อ่านก่อน:** contract ส่วน 6.3, source ทั้ง 3 services, `proto/ticket.proto`, `docs/discovery.md` และ handoff ของคนที่ 1 ถ้ามี

**ไฟล์หลักที่รับผิดชอบ:** `services/*/src/**`, `proto/ticket.proto`, `scripts/healthcheck.mjs`, `docs/resilience.md`, `docs/diagrams/assign-ticket-sequence.mmd`, `docs/handoffs/person-2.md`

**ลงมือทำตามลำดับ:**

1. รองรับ `DEPARTMENT_DB_PATH`/`TICKET_DB_PATH` ใน TypeORM config โดยคงค่า default สำหรับ npm/local และเตรียม parent directory เมื่อจำเป็น
2. เพิ่ม HTTP `/health` กับ `/ready`, gRPC `CheckHealth` และ health probe ตาม contract; ใช้ bounded checks และแสดง dependency status โดยไม่เปิดเผย secret
3. เพิ่ม timeout ให้ REST calls ทั้ง Gateway -> Department และ Ticket -> Department และ deadline ให้ Gateway -> Ticket; แปลง error เป็น HTTP/gRPC code ที่สอดคล้องกัน
4. ยืนยันว่า lookup หน่วยงานไม่สำเร็จก่อน commit ไม่เปลี่ยน ticket/history และคง business rules เดิม; เริ่มต้นโดยไม่มี automatic retry สำหรับ create/assign/status mutation
5. เก็บ error/duration ที่ช่วยตรวจ failure; เพิ่ม request correlation เมื่อทำได้ภายในรอบนี้ โดยกำหนด metadata/header ให้ครบทุก hop ที่อ้างว่ารองรับ
6. เพิ่ม focused checks สำหรับ healthy/unavailable/slow dependency และ existing happy path; ประสานคนที่ 3 ผ่านคู่มือและ handoff
7. เขียน `docs/resilience.md` ระบุ health semantics, budget, mappings และข้อจำกัด พร้อม sequence diagram ที่มี success/timeout branches

**เกณฑ์จบ:** ทั้ง 3 services build ได้, health/probe ตรวจปกติและ dependency ไม่พร้อมได้, กรณีช้า/ล่มไม่ค้างเกิน budget พร้อมส่วนเผื่อที่บันทึกไว้, state/history ไม่เสียเมื่อ lookup fail และ CRUD/workflow เดิมยังทำงาน

**ส่งต่อ:** ระบุ endpoints/RPC, รูป response, error mappings, commands และผลจริงให้คนที่ 1/3/4/5 อ่านจาก `docs/resilience.md` และ handoff

<a id="role-3"></a>

### คนที่ 3 — Verification, NFR Measurement และ Evidence

**เป้าหมาย:** มีสคริปต์ตรวจซ้ำและหลักฐานที่แยก target ออกจาก measured result ได้ชัดเจน

**อ่านก่อน:** ส่วน 6.3, source/routes/proto ที่มีจริง, `docs/discovery.md`, `docs/resilience.md`, handoff ของคนที่ 1/2 ถ้ามี

**ไฟล์หลักที่รับผิดชอบ:** `scripts/verification/**`, `docs/nfr-verification.md`, `docs/evidence/**`, `docs/handoffs/person-3.md`

**ลงมือทำตามลำดับ:**

1. สร้าง runner `node scripts/verification/run.mjs` พร้อม modes/flags ที่อธิบายไว้ ใช้ dependencies เดิมหรือ Node built-ins เมื่อเพียงพอ อ่าน environment โดยไม่พิมพ์ secrets
2. เตรียม fixtures ที่แยกจากข้อมูลผู้ใช้ สำหรับ happy path, filters/history, invalid transition และ failure; รันผ่าน Gateway เป็นหลัก และใช้ internal probe ตาม contract เมื่อต้องตรวจ gRPC/DNS
3. ทดสอบ discovery/recreate และ persistence บน Compose จริง โดยคง volumes และไม่ใช้ `down -v` กับข้อมูลจริง
4. ทดสอบ Department หยุดและตอบช้า พร้อมวัดเวลา/error และตรวจว่าสถานะ ticket คงเดิมเมื่อ lookup fail; คืน service ให้พร้อมหลังจบ
5. วัด GET `/tickets` กับ history แยกกัน: dataset 100 tickets, warm-up 10 วินาที, 20 concurrent clients นาน 60 วินาที; รายงานจำนวน requests, throughput, p50/p95/p99 และ error rate ตามสภาพที่วัดจริง
6. ใช้เป้าหมายเบื้องต้น p95 < 1 วินาทีและ error < 1% โดยระบุว่าเป็นเกณฑ์รอบนี้; เก็บ environment, commit ถ้ามี, dataset และคำสั่งเพื่อรันซ้ำ ห้ามสรุปจากการทดสอบนี้ว่าได้ 1,000 active users หรือ uptime 99.5% แล้ว
7. เขียน `docs/nfr-verification.md` และ evidence ที่มีวันเวลา คำสั่ง เงื่อนไข ผล และ PASS/FAIL/NOT_RUN; ถ้าคนที่ 1/2 ยังไม่พร้อม ให้ส่ง runner/คู่มือก่อน และระบุผลที่ยังไม่ได้รันอย่างชัดเจน

**เกณฑ์จบ:** runner และคู่มือพร้อมให้คนอื่นใช้, มีผลทดสอบจริงที่ทำซ้ำได้สำหรับ environment ที่เข้าถึงได้, ไม่มีผลสมมติ, failure tests คืนสภาพระบบ และรายการที่ยังทดสอบไม่ได้ถูกแยกไว้

**ส่งต่อ:** ตารางผลและ evidence ให้คนที่ 4 ใส่ proposal และคนที่ 5 ใส่คลิป การทดสอบ FAIL เป็นผลทดลองที่ต้องรายงานและส่งข้อมูลให้เจ้าของส่วนแก้ ไม่ใช่เปลี่ยนเป็น PASS เพื่อส่งงาน

**ผลที่รันแล้ว:** [NFR verification และวิธีรันซ้ำ](docs/nfr-verification.md), [evidence index](docs/evidence/README.md), [handoff คนที่ 3](docs/handoffs/person-3.md) — performance ผ่านเกณฑ์รอบ local นี้; ผลรวมยัง FAIL กรณี Ticket stopped ตอบ 504 แทน 503

<a id="role-4"></a>

### คนที่ 4 — Proposal, ADRs และ Diagrams ฉบับรวม

**เป้าหมาย:** ได้ proposal ที่ตอบโจทย์งาน มี design decisions และหลักฐานตรงกับ implementation ล่าสุด

**อ่านก่อน:** `docs/references/*.pdf`, แผนรอบนี้, README, source ล่าสุด, guides/handoffs ของคนที่ 1-3 และ evidence ที่มี

**ไฟล์หลักที่รับผิดชอบ:** `docs/proposal.md`, `docs/proposal.pdf`, `docs/adr/**`, `docs/diagrams/architecture.mmd`, ภาพ render จาก diagram sources, `docs/handoffs/person-4.md`; อัปเดตส่วนสถานะ/คำอธิบายใน README เมื่อมีหลักฐานรองรับ

**ลงมือทำตามลำดับ:**

1. ร่าง proposal จากเอกสารต้นฉบับ โดยรักษา problem, actors, use cases และ NFR เดิม; เพิ่ม progress scope และ service catalog: responsibility, operations, protocol, owned data, dependencies
2. อัปเดต ADR-004/005/006 ให้ RabbitMQ target ตรงกัน และแก้ UC-05 ที่ยังพูดถึง Gmail เป็นงานปัจจุบัน; แยก PostgreSQL target ตาม ADR-007 ออกจาก SQLite prototype และบอก implementation status ของ JWT/RBAC ตาม ADR-008
3. ร่าง ADR-009 Service Discovery, ADR-010 Resilience/Health และ ADR-011 NFR Verification/Observability พร้อม Context, Alternatives, Decision, Consequences, Verification และสถานะ; คำว่า Accepted ต้องตรงกับการตัดสินใจจริงของทีม
4. ทำ logical architecture ที่มี legend Implemented / Proposed / Future; รวม deployment diagram จากคนที่ 1 และ sequence diagram จากคนที่ 2 โดยตรวจชื่อ service, ports และ protocols ให้ตรงกัน
5. ใส่ NFR matrix ที่แยก requirement, target, mechanism, verification, measured result และ limitation; ถ้ายังไม่มี evidence ให้ลง `NOT_RUN`/pending และกลับมาเติมเมื่อได้รับผลจริง
6. Export เป็น PDF แล้วเปิดตรวจทุกหน้าให้ข้อความ/diagram อ่านได้; เก็บ Markdown/ADR/diagram sources ให้แก้ต่อได้ ใช้ skill สำหรับ PDF/document หาก environment มี
7. ระบุ remaining work และ references; source PDF ใน `docs/references/` ให้เก็บเป็น snapshot เดิม ส่วนฉบับแก้ไขอยู่ที่ `docs/proposal.*`

**เกณฑ์จบ:** มี Markdown และ PDF ฉบับอัปเดต, ADRs ครบและไม่ขัดกัน, diagrams อย่างน้อย 3 ภาพที่ render อ่านได้, ไม่อ้าง feature/NFR ว่าทำสำเร็จโดยไม่มีหลักฐาน และบอกสถานะส่วนที่รอผลอย่างชัดเจน

**ส่งต่อ:** proposal, diagrams และประเด็นสรุปให้คนที่ 5 ใช้ในคลิป; ถ้า PDF export ยังทำไม่ได้ ให้ส่ง source ที่ครบพร้อมขั้นตอน export และระบุส่วนที่ยังขาด

**ผลงานที่มีแล้ว:** [Proposal PDF](docs/proposal.pdf), [Markdown](docs/proposal.md), [ADR register](docs/adr/README.md), ภาพ SVG/PNG ทั้ง 3 ใน `docs/diagrams`, [วิธี export](docs/build/README.md) และ [handoff คนที่ 4](docs/handoffs/person-4.md)

<a id="role-5"></a>

### คนที่ 5 — Video, Storyboard และ Final Submission Review

**เป้าหมาย:** คลิปต่ำกว่า 5 นาทีที่อธิบาย Service Discovery และ NFR โดยใช้ภาพและหลักฐานจากระบบ/เอกสารชุดเดียวกัน

**อ่านก่อน:** README, `docs/proposal.md`, diagrams, `docs/discovery.md`, `docs/resilience.md`, `docs/nfr-verification.md` และ handoffs ที่มี; เริ่มจากร่างได้แม้งานอื่นยังไม่ครบ

**ไฟล์หลักที่รับผิดชอบ:** `docs/video/script-th.md`, `docs/video/storyboard.md`, `docs/video/demo-cues.md`, `docs/video/submission-checklist.md`, ไฟล์คลิปใน `output/video/`, `docs/handoffs/person-5.md`

**ลงมือทำตามลำดับ:**

1. ร่างสคริปต์พูดภาษาไทยและ storyboard รวมประมาณ 4:40 นาที: ภาพรวม 0:00-0:25, discovery 0:25-1:35, NFR 1:35-2:45, demo 2:45-4:15, trade-offs/งานต่อ 4:15-4:40
2. ทำ cue sheet ที่มีหน้าจอ/ภาพ คำพูด คำสั่งเดโม และผลที่คาดให้เห็น โดยใช้คำสั่งที่เจ้าของงานตรวจแล้ว; ช่วงรอผลให้ใช้ placeholder ที่ระบุว่า pending ชัดเจน
3. เลือกเดโม discovery/recreate และ dependency failure เป็นหลัก; ใช้ตาราง evidence จริงสำหรับ performance/persistence และแสดงข้อจำกัดของผลวัด
4. ซ้อมจับเวลารวม title/outro ปรับเนื้อหาให้ต่ำกว่า 5 นาทีและไม่แสดง secret; ตรวจว่า diagram กับ narration ตรง proposal ล่าสุด
5. บันทึกและตัดต่อคลิปจริงเมื่อ environment/tools รองรับ แล้วตรวจ duration, เสียง, ความชัดของ terminal และ playback; ไม่สร้างไฟล์ปลอมหรือระบุว่ามีคลิปแล้วจากการมีเพียง script
6. ถ้าบันทึกจอ/เสียงไม่ได้ใน environment นี้ ให้ทำชุดพร้อมอัดให้ครบและระบุขั้นตอนที่สมาชิกต้องอัดด้วยตัวเองอย่างตรงไปตรงมา พร้อมแยกสถานะ `recording pending` ออกจาก `video complete`
7. ตรวจไฟล์ส่งสองรายการ: คลิป < 5 นาที และ proposal PDF ที่มี updated ADRs/revised design/diagrams; บันทึกชื่อไฟล์ เวอร์ชัน และรายการที่ยังรอ โดยยังไม่ upload/ส่งข้อความแทนสมาชิกหากไม่ได้รับคำสั่ง

**เกณฑ์จบ:** script/storyboard/demo-cues/checklist พร้อมใช้และอิงหลักฐานจริง; เมื่อรายงานว่า video complete ต้องมีไฟล์คลิปที่เล่นได้และตรวจความยาวแล้ว ส่วนการส่งงานสำเร็จต้องมีทั้งคลิปและ PDF ที่เปิดได้

### 6.4 รูปแบบ handoff เมื่อจบงานแต่ละคน

แต่ละคนสร้างหรืออัปเดตไฟล์ของตนเท่านั้นที่ `docs/handoffs/person-N.md` เพื่อให้คนถัดไปและ AI ในแชตใหม่ต่อได้โดยไม่อาศัยประวัติแชต ใช้โครงนี้:

```markdown
# Person N handoff
- Status: IN_PROGRESS / READY / NEEDS_INTEGRATION
- Completed: งานที่ลงมือเสร็จจริง
- Files changed: รายการไฟล์และเหตุผล
- How to run: คำสั่งจาก repository root
- Verification: คำสั่ง + PASS/FAIL/NOT_RUN + ที่อยู่ evidence
- Contract changes: ไม่มี / รายละเอียดและ caller ที่ตรวจแล้ว
- Remaining dependencies: งานหรือไฟล์จากคนอื่นที่ยังต้องใช้
- Next person: สิ่งที่คนรับช่วงต้องทำต่อ
```

หาก dependency ยังมาไม่ครบ ให้ทำงานอิสระของบทบาทตนจนพร้อมส่งต่อแล้วระบุสิ่งที่รอใน handoff ห้ามอ้างว่าทดสอบรวมผ่านหรือส่งงานครบแล้วถ้ายังไม่มีผลจริง ทุกคนอ่านผลล่าสุดก่อนรวมงานและรักษาไฟล์ที่คนอื่นแก้ไว้
