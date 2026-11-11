<div align="center">

<img src="frontend/public/logo.png" alt="Chula Fondue logo" width="96" />

# Chula Fondue

**แจ้งซ่อมออนไลน์ ติดตามสถานะได้ทันที**<br/>
ระบบแจ้งซ่อมภายในมหาวิทยาลัย ตั้งแต่ถ่ายรูปจุดชำรุด ส่งต่อหน่วยงาน ซ่อม จนผู้แจ้งตรวจรับและปิดงาน

![React](https://img.shields.io/badge/React_18-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![gRPC](https://img.shields.io/badge/gRPC-244c5a?logo=grpc&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_18-4169E1?logo=postgresql&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB_8-47A248?logo=mongodb&logoColor=white)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ_4-FF6600?logo=rabbitmq&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker_Compose-2496ED?logo=docker&logoColor=white)

<img src="docs/images/01-login.webp" alt="หน้าเข้าสู่ระบบ Chula Fondue" width="100%" />

</div>

---

## Chula Fondue ทำอะไร

ไฟดับ ท่อน้ำรั่ว แอร์ไม่เย็น Wi-Fi หลุด เจอที่ไหนในมหาวิทยาลัยก็แจ้งได้จากหน้าเว็บเดียว ระบบส่งเรื่องถึงหน่วยงานที่รับผิดชอบให้อัตโนมัติ และทุกคนเห็นสถานะเดียวกันตลอดทาง

| บทบาท | ทำอะไรได้ |
| --- | --- |
| 🙋 **ผู้แจ้ง** (Reporter) | แจ้งซ่อมพร้อมรูป 1–5 รูป ติดตามสถานะ ยกเลิกก่อนช่างเริ่มซ่อม ตรวจรับงาน หรือส่งกลับให้แก้ |
| 🛠️ **เจ้าหน้าที่หน่วยงาน** (Staff) | เห็นเฉพาะคิวงานของหน่วยงานตัวเอง กดเริ่มซ่อม และส่งงานพร้อมรูปหลังซ่อม |
| 🧑‍💼 **ผู้ดูแลระบบ** (Admin) | รับเรื่องเข้า ส่งต่อ/เปลี่ยนหน่วยงาน เปลี่ยนหมวด ไม่รับเรื่อง จัดการหน่วยงาน กฎส่งต่ออัตโนมัติ บัญชีผู้ใช้ และดูรายงาน |
| 👀 **ผู้เยี่ยมชม** (Guest) | เปิดดูหน้าแจ้งซ่อมได้ แต่ต้องเข้าสู่ระบบก่อนส่ง เพื่อให้ติดตามเรื่องได้จากทุกเครื่อง |

## เส้นทางของใบแจ้งซ่อม 1 ใบ

ตัวอย่างจริงจากระบบ: ใบแจ้งซ่อม **#3CAD16D6** "ไฟตก ไฟกะพริบบนห้อง Sky Cafe"

```mermaid
flowchart LR
    A([แจ้งซ่อม]) --> B[รอรับเรื่อง]
    B -->|ส่งต่อหน่วยงาน<br/>อัตโนมัติ หรือ admin| C[รับเรื่องแล้ว]
    C -->|เจ้าหน้าที่กดเริ่ม| D[กำลังซ่อม]
    D -->|ส่งงาน + รูปหลังซ่อม| E[รอตรวจรับ]
    E -->|ผู้แจ้งตรวจรับ<br/>หรือครบ 7 วัน| F([ปิดงาน])
    E -->|ส่งกลับแก้ไข| D
    B -.->|ยกเลิก / ไม่รับเรื่อง| X([ยกเลิก])
    C -.->|ยกเลิก / ไม่รับเรื่อง| X
```

### 1. ผู้แจ้งส่งเรื่อง

ฟอร์มแบ่งเป็น 3 ส่วน: เลือกหมวด (ไฟฟ้า, ประปา, เครื่องปรับอากาศ, ไอที/เครือข่าย, อาคารสถานที่, อื่น ๆ) พิมพ์รายละเอียด ระบุอาคารและจุดสังเกต แล้วแนบรูป การ์ดสรุปด้านขวาอัปเดตตามที่กรอก ส่งแล้วจะได้เลขที่เรื่อง และเห็นสถานะทันที

ในตัวอย่างนี้หมวด "ไฟฟ้า" ยังไม่ได้ผูกกับหน่วยงาน ระบบจึงขึ้นแถบเหลืองว่า *รอผู้ดูแลส่งต่อ* และผู้แจ้งยังกดยกเลิกเองได้ เพราะช่างยังไม่เริ่มซ่อม

<table>
  <tr>
    <td width="50%"><img src="docs/images/02-report-form.webp" alt="ฟอร์มแจ้งซ่อม" /></td>
    <td width="50%"><img src="docs/images/03-reporter-pending.webp" alt="หน้ารายละเอียดเรื่องของผู้แจ้ง สถานะรอรับเรื่อง" /></td>
  </tr>
  <tr>
    <td align="center"><sub>ฟอร์มแจ้งซ่อม 3 ขั้นตอน พร้อมการ์ดสรุป</sub></td>
    <td align="center"><sub>หลังส่ง: สถานะ "รอรับเรื่อง" และไทม์ไลน์ความคืบหน้า</sub></td>
  </tr>
</table>

### 2. ผู้ดูแลระบบส่งต่อหน่วยงาน

เรื่องใหม่เข้ากล่อง **งานแจ้งซ่อม** ของ admin การ์ด "รอรับเรื่อง" ไฮไลต์งานที่ต้องจัดการ กรองตามสถานะหรือหน่วยงานได้

หน้า **หน่วยงาน** ใช้สร้างหน่วยงาน (ชื่อ, อีเมลติดต่อ, อาคารที่ดูแล) และตั้ง **ส่งต่องานอัตโนมัติ**: เลือกว่าแต่ละหมวดไปหน่วยงานไหน ตั้งครั้งเดียว เรื่องใหม่ในหมวดนั้นจะไปถึงหน่วยงานเองโดยไม่ต้องรอ admin ส่วนหมวด "อื่น ๆ" และหมวดที่ยังไม่ตั้งกฎจะเข้าคิว admin

<table>
  <tr>
    <td width="50%"><img src="docs/images/04-admin-inbox.webp" alt="กล่องงานแจ้งซ่อมของผู้ดูแลระบบ" /></td>
    <td width="50%"><img src="docs/images/05-admin-departments.webp" alt="หน้าหน่วยงานและกฎส่งต่ออัตโนมัติ" /></td>
  </tr>
  <tr>
    <td align="center"><sub>กล่องงานของ admin</sub></td>
    <td align="center"><sub>ตั้งกฎส่งต่ออัตโนมัติตามหมวด และเพิ่มหน่วยงาน</sub></td>
  </tr>
</table>

ก่อนช่างเริ่มซ่อม admin ยังเปลี่ยนหมวดหรือเปลี่ยนหน่วยงานได้ ทุกการกระทำถูกบันทึกในไทม์ไลน์ว่า *ใคร ทำอะไร เมื่อไร* เช่น ส่งต่อให้แผนกไฟฟ้า แล้วเปลี่ยนเป็นแผนกประปา

<table>
  <tr>
    <td width="68%"><img src="docs/images/06-admin-reassign.webp" alt="ผู้ดูแลระบบเปลี่ยนหน่วยงาน" /></td>
    <td width="32%"><img src="docs/images/07-ticket-timeline.png" alt="ไทม์ไลน์สถานะและความคืบหน้า" /></td>
  </tr>
  <tr>
    <td align="center"><sub>เปลี่ยนหมวด / เปลี่ยนหน่วยงาน / ไม่รับเรื่อง</sub></td>
    <td align="center"><sub>ไทม์ไลน์เก็บทุกขั้นตอน</sub></td>
  </tr>
</table>

### 3. เจ้าหน้าที่ซ่อมและส่งงาน

เจ้าหน้าที่เห็น **คิวงานซ่อม** เฉพาะของหน่วยงานตัวเอง ค้นหา กรองสถานะ/หมวด และเรียงลำดับได้ กด **เริ่มซ่อม** จากรายการได้เลย พอซ่อมเสร็จต้องแนบ **รูปหลังซ่อม** 1–5 รูปก่อนกดส่งงาน เพื่อให้ผู้แจ้งใช้ตรวจรับ

<table>
  <tr>
    <td width="50%"><img src="docs/images/08-staff-queue.webp" alt="คิวงานซ่อมของเจ้าหน้าที่" /></td>
    <td width="50%"><img src="docs/images/09-staff-submit.webp" alt="เจ้าหน้าที่ส่งงานพร้อมรูปหลังซ่อม" /></td>
  </tr>
  <tr>
    <td align="center"><sub>คิวงานของหน่วยงาน</sub></td>
    <td align="center"><sub>ส่งงานพร้อมรูปหลังซ่อม</sub></td>
  </tr>
</table>

### 4. ผู้แจ้งตรวจรับ แล้วปิดงาน

ผู้แจ้งดูรูปหลังซ่อม แล้วเลือก **ตรวจรับงาน** หรือ **ส่งกลับแก้ไข** (งานกลับไปที่ "กำลังซ่อม") ถ้าไม่ตอบภายใน 7 วัน ระบบปิดงานให้เอง ทุกครั้งที่สถานะเปลี่ยน ผู้เกี่ยวข้องได้รับแจ้งเตือนในเว็บและอีเมลผ่าน Gmail

<table>
  <tr>
    <td width="50%"><img src="docs/images/10-reporter-verify.webp" alt="ผู้แจ้งตรวจรับงาน" /></td>
    <td width="50%"><img src="docs/images/11-email-closed.webp" alt="อีเมลแจ้งปิดงาน" /></td>
  </tr>
  <tr>
    <td align="center"><sub>ตรวจรับงาน หรือส่งกลับแก้ไข</sub></td>
    <td align="center"><sub>อีเมลแจ้งปิดงานพร้อมสรุปสถานะ</sub></td>
  </tr>
</table>

นอกจากนี้ admin มีหน้า **บัญชีผู้ใช้** (สร้างบัญชีเจ้าหน้าที่ เปลี่ยนบทบาท ย้ายหน่วยงาน เปิด/ปิดบัญชี) และ **รายงาน** (MTTR, สถิติตามหมวด/หน่วยงาน/ช่วงวัน, จุดที่แจ้งบ่อย) ผู้ใช้เปลี่ยนรหัสผ่านและกู้รหัสผ่านทางอีเมลได้

---

## Tech stack

| ชั้น | ใช้อะไร |
| --- | --- |
| **Frontend** | React 18 + TypeScript, Vite, React Router, Radix UI, lucide-react, ฟอนต์ IBM Plex Sans Thai / Anuphan; เสิร์ฟด้วย nginx ซึ่ง proxy `/api` ไป gateway |
| **Backend** | Node.js 22 + NestJS (6 services, TypeScript), TypeORM, class-validator |
| **สื่อสารระหว่าง service** | REST (HTTP), **gRPC** ระหว่าง Gateway ↔ Ticket Service (`proto/ticket.proto`), **RabbitMQ** สำหรับ event แบบ asynchronous |
| **ฐานข้อมูล** | PostgreSQL 18 (แยก 4 database: auth, department, ticket, analytics), MongoDB 8 (กล่องแจ้งเตือน) |
| **Auth / Security** | JWT + RBAC, ownership check, rate limit, ตรวจชนิดและขนาดรูป, `X-Request-Id` ทุก request |
| **External** | Gmail API (OAuth) สำหรับส่งอีเมลแจ้งเตือน |
| **Deployment** | **Docker Compose** บนเครื่องเดียว, service discovery ด้วย **Docker DNS** |
| **Testing / Quality** | `node:test`, Vitest + Testing Library, Playwright (UI), k6 (load/stress), Postman/Newman, c8 coverage, SonarQube, GitHub Actions CI |

## สถาปัตยกรรม

<img src="docs/c4/02-container.png" alt="C4 container diagram" width="100%" />

ระบบแยกเป็น microservices ตามความรับผิดชอบ แต่ละ service เป็นเจ้าของข้อมูลของตัวเอง ไม่มี service ไหนอ่านตารางของคนอื่น

| Service | หน้าที่ | ข้อมูล |
| --- | --- | --- |
| `frontend` | UI ภาษาไทย (nginx) | – |
| `api-gateway` | ทางเข้าเดียวของ API: ตรวจ JWT/สิทธิ์ เก็บรูป แปลง REST เป็น gRPC | volume `uploads` |
| `auth-service` | บัญชีผู้ใช้ เข้าสู่ระบบ กู้รหัสผ่าน | PostgreSQL `auth` |
| `department-service` | หน่วยงานและกฎส่งต่ออัตโนมัติ | PostgreSQL `department` |
| `ticket-service` | workflow ใบแจ้งซ่อม, history, outbox, worker ส่งต่ออัตโนมัติ, ปิดงานอัตโนมัติ | PostgreSQL `ticket` |
| `notification-service` | รับ event จาก RabbitMQ เก็บกล่องแจ้งเตือน และส่ง Gmail | MongoDB |
| `analytics-service` | รับ event มาทำสถิติและ MTTR | PostgreSQL `analytics` |

### Service discovery: Docker Compose DNS

ทุก container อยู่บน network ส่วนตัวชื่อ `backend` ของ Compose และเรียกหากันด้วย **ชื่อ service** ซึ่ง Docker DNS แปลงเป็น IP ให้ ไม่มี IP ฝังใน config และไม่ต้องมี service registry แยก

```yaml
# docker-compose.yml (ตัดมาบางส่วน)
api-gateway:
  environment:
    AUTH_SERVICE_URL: http://auth-service:3002
    DEPARTMENT_SERVICE_URL: http://department-service:3001
    TICKET_SERVICE_URL: dns:///ticket-service:50051   # gRPC
ticket-service:
  environment:
    TICKET_DATABASE_URL: postgresql://fondue:fondue@postgres:5432/ticket
    RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
```

ถ้า container ใดถูกสร้างใหม่ (IP เปลี่ยน) gateway ก็หาเจออีกโดยไม่ต้อง restart ระหว่างที่ service ปลายทางหายไป gateway ตอบ 503/504 แทนการค้าง พอร์ตที่เปิดออกมาที่ host มีแค่ frontend และ gateway ส่วนฐานข้อมูลและ broker ผูกไว้ที่ `127.0.0.1` สำหรับ debug เท่านั้น

### จุดที่ออกแบบให้ทนทาน

- **Transactional outbox**: เปลี่ยนสถานะ + บันทึก history + เขียน event ลง outbox ใน transaction เดียว แล้ว relay ค่อย publish ไป RabbitMQ ถ้า broker ล่มหลัง commit event ก็ไม่หาย
- **At-least-once + กันซ้ำ**: consumer ack หลังเขียนเสร็จ และข้าม event ที่เคยเห็นด้วย `eventId`
- **กันแก้ชนกัน**: ล็อกแถวและเทียบ version ทุกครั้งที่เปลี่ยนสถานะ ถ้าข้อมูลเก่าตอบ 409
- **กันส่งซ้ำ**: ส่งคำร้องซ้ำด้วย `Idempotency-Key` เดิมไม่สร้างเรื่องซ้ำ
- **Timeout ทุก remote call**: gateway → services 5 วินาที, ticket → department 3 วินาที
- **Auto-routing worker**: รับเรื่องก่อนแล้วส่งต่อเบื้องหลังทุก 2 วินาที ถ้า Department Service ไม่พร้อมจะลองใหม่ 5 ครั้ง (เว้น 5, 15, 60, 180 วินาที) ก่อนส่งให้ admin ตัดสิน และไม่หายเมื่อ restart

แผนภาพเพิ่มเติม (System context และ sequence ของ UC-01..03) อยู่ที่ [docs/c4](docs/c4/README.md)

---

## เริ่มใช้งาน

ต้องมี Node.js 22.12+, npm และ Docker Desktop (Linux containers)

```bash
npm ci
npm run setup:demo
docker compose --env-file .env.demo -p fondue-demo up -d --build --wait
npm run seed:demo
```

เปิด http://localhost:8080 (gateway อยู่ที่ http://localhost:3100) บัญชีสาธิตใช้รหัส `FondueDemo!2026`

| บทบาท | อีเมล |
| --- | --- |
| Admin | `admin@fondue.test` |
| Reporter | `reporter@fondue.test` |
| Staff (งานอาคารและสถานที่) | `staff@fondue.test` |

`.env.demo` ใช้ฐานข้อมูล local แยกจาก `.env` เดิม ค่าเริ่มต้นไม่ต้องมีบัญชี Gmail และอย่าใช้รหัสสาธิตบนระบบสาธารณะ

<details>
<summary><b>เปิดส่งต่ออัตโนมัติ และอีเมลจริง</b></summary>

**ส่งต่ออัตโนมัติ**: ตั้ง `AUTO_ROUTING_ENABLED=true` ใน `.env.demo` แล้วอัปเดตบริการ

```bash
docker compose --env-file .env.demo -p fondue-demo up -d --build department-service ticket-service api-gateway frontend
npm run seed:demo
```

กฎ demo ส่ง IT / Network ไปฝ่ายไอที และงานไฟฟ้า/ประปา/แอร์/อาคารไปงานอาคารและสถานที่ seed ซ้ำไม่เขียนทับกฎเดิม ปิด flag แล้ว restart ticket-service จะหยุดส่งต่ออัตโนมัติใหม่ โดย admin ยังส่งต่อเองได้ รายละเอียด: [แผน](docs/auto-routing-plan.md), [ผลตรวจสอบ](docs/auto-routing-verification.md)

**อีเมลจริง**: ค่าเริ่มต้น `EMAIL_MODE=record` บันทึกการแจ้งเตือนโดยไม่ส่งอีเมล ถ้าจะส่งผ่าน Gmail ให้ตั้ง `EMAIL_MODE=gmail` และ `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_FROM` (ต้องมี scope `gmail.send`) ดู `.env.example`

</details>

<details>
<summary><b>คำสั่งที่ใช้บ่อย</b></summary>

```bash
docker compose --env-file .env.demo -p fondue-demo logs -f   # ดู log
docker compose --env-file .env.demo -p fondue-demo down      # หยุด (ข้อมูลยังอยู่ใน volume)
npm run dev:web                                              # frontend แบบ dev (Vite)
```

รัน backend บน host ด้วย `npm run dev` ต้องตั้ง `AUTH_DATABASE_URL`, `DEPARTMENT_DATABASE_URL`, `TICKET_DATABASE_URL`, `ANALYTICS_DATABASE_URL` และ URL ของ broker ให้ตรงพอร์ต (Compose ตั้งให้อยู่แล้ว)

</details>

## การทดสอบ

| คำสั่ง | ทดสอบอะไร |
| --- | --- |
| `npm test` | build + unit test backend และ frontend |
| `npm run test:coverage` | coverage (LCOV) สำหรับ SonarQube |
| `npm run test:e2e` | API end-to-end กับ Compose ที่รันอยู่ |
| `npm run test:recovery` | broker ล่ม/กลับมา และปิดงานอัตโนมัติ (เฉพาะ project `fondue-demo`) |
| `npm run test:routing`, `test:routing:recovery` | ส่งต่ออัตโนมัติ และการกู้คืนเมื่อ service ล่ม |
| `npm run test:ui`, `test:ui:responsive` | UI ผ่าน Playwright (ตั้ง `WEB_URL=http://127.0.0.1:8080` สำหรับ Compose) |
| `npm run test:perf` | k6 average load (50 VUs) + stress (50 → 200 VUs) พร้อมรายงาน HTML |
| `npm run test:postman` | Postman collection ผ่าน Newman |

ผลทดสอบและภาพหน้าจออยู่ที่ `test-results/` CI บน GitHub Actions รัน build, unit, API, broker recovery และ UI checks แล้วเก็บ evidence รายละเอียด: [load testing](docs/load-testing.md), [SonarQube](docs/sonarqube.md)

> [!WARNING]
> `test:recovery` และ `test:routing:recovery` หยุด/เริ่ม container และแก้วันที่ข้อมูล fixture ใช้กับ demo เท่านั้น ห้ามรันกับระบบจริง

## โครงสร้างโปรเจกต์

```text
chula-fondue/
├── frontend/                 React + Vite UI, nginx config
├── services/
│   ├── api-gateway/          REST, JWT/RBAC, รูป, REST → gRPC
│   ├── auth-service/         บัญชีผู้ใช้และ JWT
│   ├── department-service/   หน่วยงานและกฎส่งต่อ
│   ├── ticket-service/       workflow, outbox, auto-routing, auto-close
│   ├── notification-service/ RabbitMQ consumer, MongoDB, Gmail
│   └── analytics-service/    สถิติและ MTTR
├── proto/                    gRPC contract
├── docker/                   Dockerfile กลางของ services, init databases
├── docker-compose.yml        deployment หลัก
├── tests/  perf/  postman/   ชุดทดสอบ
└── docs/                     เอกสาร, C4 diagrams, ภาพหน้าจอ
```

`k8s/` และ `Tiltfile` เป็นงานทดลองบน Kubernetes ไม่ใช่ deployment ที่ใช้จริง ระบบที่ส่งและสาธิตรันบน Docker Compose

## เอกสารเพิ่มเติม

- [C4 model และ sequence diagrams](docs/c4/README.md)
- [API](docs/api.md)
- [รายละเอียด implementation](docs/complete-platform.md) · [Platform hardening](docs/platform-hardening.md)
- [สคริปต์สาธิต](docs/submission-demo-th.md)

`docs/progress-3/` และโฟลเดอร์ `demo-progress*` เก็บไว้เป็นประวัติ milestone
