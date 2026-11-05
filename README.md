# Chula Fondue

ระบบแจ้งซ่อมในมหาวิทยาลัยสำหรับ Reporter, Guest, Admin และ Department Staff ใน monorepo เดียว: React + TypeScript และ NestJS 6 services, PostgreSQL, MongoDB, RabbitMQ และ Docker Compose.

## รันโปรเจค

ต้องมี Node.js 22.12+, npm และ Docker Desktop (Linux containers).

```powershell
npm ci
npm run setup:demo
docker compose --env-file .env.demo -p fondue-demo up -d --build --wait
npm run seed:demo
```

เปิด http://localhost:8080. บัญชีสาธิตใช้รหัส `FondueDemo!2026`:

| บทบาท | อีเมล |
| --- | --- |
| Admin | admin@fondue.test |
| Reporter | reporter@fondue.test |
| Staff | staff@fondue.test |

Staff สาธิตสังกัดงานอาคารและสถานที่. Guest กดแจ้งปัญหาได้โดยไม่สมัครสมาชิก แต่ติดตามได้เฉพาะ session เดิม. `.env.demo` ใช้ฐานข้อมูล local แยกจาก `.env` เดิม ไม่ต้องใช้บัญชี Cloudinary, Atlas หรือ Gmail. อย่าใช้รหัสสาธิตบนระบบสาธารณะ.

## ฟีเจอร์

- แจ้งปัญหา แนบรูป 1–5 รูป ไม่เกิน 5 MB ต่อรูป และติดตามประวัติ
- Admin ตรวจเรื่อง เปลี่ยนหมวดหมู่ มอบหมาย/ส่งต่อ ปฏิเสธพร้อมเหตุผล และจัดการหน่วยงาน/สร้างบัญชีเจ้าหน้าที่
- Staff เห็นเฉพาะงานของหน่วยงาน เริ่มงานและส่งหลักฐานหลังซ่อม
- Reporter ยกเลิกก่อนมอบหมาย ยืนยันผล หรือขอแก้ไขใหม่; ปิดงานอัตโนมัติหลังแก้เสร็จ 7 วัน
- Analytics Service: MTTR จากเวลาแก้ไขเสร็จจริง, สถิติตามหมวด/หน่วยงาน/ช่วงวัน และจุดที่แจ้งบ่อย
- Notification ผ่าน transactional outbox + RabbitMQ เก็บใน MongoDB พร้อมหน้าแสดงประวัติ; ส่ง Gmail ได้เมื่อตั้งค่า OAuth
- JWT/RBAC, ownership checks, rate limit, concurrency checks, request IDs, health/readiness และ persistent photo storage

## โครงสร้าง

| โฟลเดอร์ | หน้าที่ |
| --- | --- |
| frontend | React/Vite UI ภาษาไทย; nginx proxy `/api` |
| services/api-gateway | REST, JWT/RBAC, รูป, แปลง REST เป็น gRPC |
| services/auth-service | บัญชีและ JWT; PostgreSQL auth |
| services/department-service | หน่วยงาน; PostgreSQL department |
| services/ticket-service | Workflow, history, outbox, auto-close; PostgreSQL ticket |
| services/notification-service | RabbitMQ consumer, MongoDB, Gmail worker |
| services/analytics-service | RabbitMQ projection; PostgreSQL analytics |
| proto | gRPC contract |
| tests | Unit, API end-to-end, recovery และ UI checks |

Gateway ใช้ได้ที่ http://localhost:3100 เมื่อใช้ `.env.demo`. พอร์ต infrastructure ผูกเฉพาะ localhost; services ภายในไม่เผยแพร่พอร์ต. การค้นหา service ใช้ Compose DNS. Analytics/notification ทำงานแบบ asynchronous จึงอาจตามหลังรายการเรื่องเล็กน้อย.

## ตรวจสอบ

```powershell
npm test
npm run test:e2e
npm run test:recovery
# ใช้กับ frontend ที่รันอยู่ (dev URL เริ่มต้น 127.0.0.1:5173)
npm run dev:web
# อีก terminal; Windows ใช้ Microsoft Edge ที่ติดตั้งอยู่
npm run test:ui
```

สำหรับ UI ของ Compose ตั้ง `WEB_URL=http://127.0.0.1:8080`. บน Linux ให้ติดตั้ง Playwright Chromium และตั้ง `BROWSER_CHANNEL=chromium`. ผลทดสอบและภาพหน้าจออยู่ `test-results/`. `test:recovery` หยุด/เริ่ม RabbitMQ เฉพาะ project `fondue-demo` และปรับวันที่ข้อมูล fixture เพื่อทดสอบปิดงานอัตโนมัติ. ห้ามใช้ script นี้กับ deployment จริง.

CI รัน build, unit, API, broker recovery และ responsive UI checks แล้วเก็บ evidence. ต้องดูผล CI จริงก่อนอ้างว่าผ่าน.

## ตั้งค่าเพิ่มเติม

ดู `.env.example` และ [รายละเอียด implementation](docs/complete-platform.md), [API](docs/api.md), [สคริปต์สาธิต](docs/submission-demo-th.md). ค่าเริ่มต้น `EMAIL_MODE=record` บันทึกการแจ้งเตือนโดยไม่ส่งอีเมล. Gmail ต้องมี OAuth credentials ของผู้ส่งจึงส่งจริงได้.

การพัฒนา frontend: `npm run dev:web`; backend แบบ host: `npm run dev` โดยต้องตั้ง URL ของฐานข้อมูล/broker ให้ถูกพอร์ต. การรัน Compose ตามขั้นตอนด้านบนง่ายที่สุดและไม่ใช้ `.env` เดิม.

```powershell
docker compose --env-file .env.demo -p fondue-demo logs -f
docker compose --env-file .env.demo -p fondue-demo down
```

คำสั่ง down ปกติเก็บข้อมูลใน named volumes. เอกสาร `docs/progress-3/` และ demo เดิมเก็บไว้เป็นประวัติ milestone ไม่ใช่ผลทดสอบของ implementation ใหม่นี้.
