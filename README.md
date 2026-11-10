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

Staff สาธิตสังกัดงานอาคารและสถานที่. Guest ดูหน้าแจ้งปัญหาได้ แต่ต้องเข้าสู่ระบบก่อนส่งเรื่อง เพื่อให้ติดตามเรื่องได้จากทุกเครื่อง. `.env.demo` ใช้ฐานข้อมูล local แยกจาก `.env` เดิม ไม่ต้องใช้บัญชี Cloudinary, Atlas หรือ Gmail. อย่าใช้รหัสสาธิตบนระบบสาธารณะ.

## ฟีเจอร์

- แจ้งปัญหา แนบรูป 1–5 รูป ไม่เกิน 5 MB ต่อรูป และติดตามประวัติ
- ส่งต่ออัตโนมัติตามหมวดด้วยกฎที่ admin ตั้งได้; กรณีไม่มีกฎหรือส่งต่อไม่สำเร็จเข้าคิวผู้ดูแล
- Admin จัดการกฎ เปลี่ยนหมวดหมู่ มอบหมาย/ส่งต่อ ปฏิเสธก่อนเจ้าหน้าที่เริ่มงาน และจัดการหน่วยงาน/สร้างบัญชีเจ้าหน้าที่
- Staff เห็นเฉพาะงานของหน่วยงาน เริ่มงานและส่งหลักฐานหลังซ่อม
- Reporter ยกเลิกก่อนเจ้าหน้าที่เริ่มงานได้ทั้งก่อนและหลังมอบหมาย ยืนยันผล หรือขอแก้ไขใหม่; ปิดงานอัตโนมัติหลังแก้เสร็จ 7 วัน
- Analytics Service: MTTR จากเวลาแก้ไขเสร็จจริง, สถิติตามหมวด/หน่วยงาน/ช่วงวัน และจุดที่แจ้งบ่อย
- Notification ผ่าน transactional outbox + RabbitMQ เก็บใน MongoDB พร้อมหน้าแสดงประวัติ; ส่ง Gmail ได้เมื่อตั้งค่า OAuth
- JWT/RBAC, ownership checks, rate limit, concurrency checks, request IDs, health/readiness และ persistent photo storage
- แจ้งเตือน Staff ตามหน่วยงาน พร้อมอ่านแล้วแยกแต่ละบัญชีและลิงก์เปิดคำร้อง
- Admin เปลี่ยนบทบาท/ย้ายหน่วยงาน/เปิดปิดบัญชี; ผู้ใช้เปลี่ยนหรือกู้รหัสผ่านได้ พร้อมยกเลิก token เดิม
- ปิดใช้งานหน่วยงานโดยเก็บประวัติ และตรวจงานค้าง/Staff/กฎก่อนปิด
- ส่งคำร้องซ้ำด้วย `Idempotency-Key` เดิมได้โดยไม่สร้างเรื่องซ้ำ

รายละเอียดพฤติกรรมและ API เพิ่มเติม: [Platform hardening](docs/platform-hardening.md)

## โครงสร้าง

| โฟลเดอร์ | หน้าที่ |
| --- | --- |
| frontend | React/Vite UI ภาษาไทย; nginx proxy `/api` |
| services/api-gateway | REST, JWT/RBAC, รูป, แปลง REST เป็น gRPC |
| services/auth-service | บัญชีและ JWT; PostgreSQL auth |
| services/department-service | หน่วยงานและกฎส่งต่อ; PostgreSQL department |
| services/ticket-service | Workflow, auto-routing worker, history, outbox, auto-close; PostgreSQL ticket |
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
npm run test:platform
npm run test:platform:e2e
# ตรวจฟีเจอร์ใหม่ใน browser (macOS ใช้ Chrome; Linux ตั้ง BROWSER_CHANNEL=chromium)
npm run test:platform:ui
# หลังเปิด auto-routing และ seed กฎแล้ว
npm run test:routing
npm run test:routing:recovery
# ใช้กับ frontend ที่รันอยู่ (dev URL เริ่มต้น 127.0.0.1:5173)
npm run dev:web
# อีก terminal; Windows ใช้ Microsoft Edge ที่ติดตั้งอยู่
npm run test:ui
```

สำหรับ UI ของ Compose ตั้ง `WEB_URL=http://127.0.0.1:8080`. บน Linux ให้ติดตั้ง Playwright Chromium และตั้ง `BROWSER_CHANNEL=chromium`. ผลทดสอบและภาพหน้าจออยู่ `test-results/`. `test:recovery` หยุด/เริ่ม RabbitMQ เฉพาะ project `fondue-demo` และปรับวันที่ข้อมูล fixture เพื่อทดสอบปิดงานอัตโนมัติ. ห้ามใช้ script นี้กับ deployment จริง.

CI รัน build, unit, API, broker recovery และ responsive UI checks แล้วเก็บ evidence. ต้องดูผล CI จริงก่อนอ้างว่าผ่าน.

## Load testing

ทดสอบ Average load (50 VUs) และ Stress (50 → 100 → 200 → 50 VUs) ผ่าน gateway ด้วย k6 บน Docker:

```powershell
npm run test:load
npm run test:stress
# รันทั้งสองประเภท พร้อมบันทึก CPU/RAM และรายงานผล
npm run test:perf
# ตรวจ script แบบสั้น ผลนี้ไม่ใช้สรุป performance
npm run test:perf -- --quick
```

ต้องเปิด Compose project `fondue-demo` และมี image `grafana/k6:1.8.2` ก่อน (`docker pull grafana/k6:1.8.2`). ผลแต่ละรอบอยู่ใน `test-results/load/`; เปิด `report.html` เพื่อดูกราฟแยก Average-load / Stress ดู [วิธีรันและตัวเลือก](docs/load-testing.md). การทดสอบสร้างบัญชีและคำร้องสำหรับ fixture ในฐานข้อมูล local; ไม่ล้างข้อมูลเดิม.

## เปิดการส่งต่ออัตโนมัติ

ตั้ง `AUTO_ROUTING_ENABLED=true` ใน `.env.demo` (หรือ `.env` ของ deployment ที่ใช้) แล้วอัปเดตบริการ:

```sh
docker compose --env-file .env.demo -p fondue-demo up -d --build department-service ticket-service api-gateway frontend
npm run seed:demo
```

Admin เข้า `/admin/departments` เพื่อกำหนดหน่วยงานแต่ละหมวดและเปิด/ปิดกฎได้ หมวด “อื่น ๆ” และหมวดที่ไม่มีกฎเข้าคิวผู้ดูแล กฎ demo ส่ง IT / Network ไปฝ่ายไอที และงานไฟฟ้า/ประปา/แอร์/อาคารไปงานอาคารและสถานที่; seed ซ้ำไม่เขียนทับกฎเดิม

ระบบตอบรับคำร้องก่อน แล้ว worker ส่งต่อทุก 2 วินาทีโดยไม่ต้องเปิด browser ค้างไว้ หาก Department Service ไม่พร้อมจะพยายามรวม 5 ครั้ง (เว้น 5, 15, 60, 180 วินาที) จากนั้นรอ admin ตรวจสอบและสั่งลองใหม่ได้ การ restart ไม่ทำให้งาน retry หาย และ admin มอบหมายเองได้ระหว่างรอ

ค่าเริ่มต้นเป็น `false` เพื่อเปิดใช้หลังตั้งกฎพร้อมแล้ว การปิด flag และ restart ticket-service หยุดรับ/claim งานอัตโนมัติใหม่ โดยเก็บข้อมูลและงานที่ค้างไว้; admin ยังมอบหมายได้ตามปกติ คำร้องเก่าไม่ถูกส่งต่อย้อนหลังเอง

ทดสอบ transaction/concurrency ด้วย PostgreSQL จริงโดยกำหนด `ROUTING_TEST_DATABASE_URL` แล้วรัน `node --test tests/routing.integration.test.mjs` หลัง `npm run build` ทดสอบแต่ละครั้งสร้าง schema แยกและลบเฉพาะ schema นั้น ส่วน `npm run test:routing:recovery` หยุด Department Service และ restart Ticket Service เฉพาะ Docker project `fondue-demo` จึงใช้กับ demo เท่านั้น

ทดสอบหน้าจอส่งต่อด้วย `node --env-file-if-exists=.env.demo tests/routing-ui.mjs`; กำหนด `BROWSER_CHANNEL=chrome` สำหรับ Chrome ที่ติดตั้งอยู่ หรือ `chromium` สำหรับ Playwright Chromium ดู [รายละเอียดแผนและพฤติกรรม](docs/auto-routing-plan.md) และ [ผลตรวจสอบ](docs/auto-routing-verification.md)

## Kubernetes (Tilt)

รันระบบเดียวกันบน Kubernetes ของ Docker Desktop: เปิด Kubernetes ใน Docker Desktop, `brew install tilt-dev/tap/tilt` แล้ว `tilt up` (เว็บที่ http://localhost:8090, gateway ที่ http://localhost:3200) Compose ยังใช้ได้ตามเดิม ดูรายละเอียด replica, load balancing และวิธีรันแบบไม่ใช้ Tilt ที่ [k8s/README.md](k8s/README.md)

## ตั้งค่าเพิ่มเติม

ดู `.env.example` และ [รายละเอียด implementation](docs/complete-platform.md), [API](docs/api.md), [สคริปต์สาธิต](docs/submission-demo-th.md). ค่าเริ่มต้น `EMAIL_MODE=record` บันทึกการแจ้งเตือนโดยไม่ส่งอีเมล. Gmail ต้องมี OAuth credentials ของผู้ส่งจึงส่งจริงได้.

การพัฒนา frontend: `npm run dev:web`; backend แบบ host: `npm run dev` โดยต้องตั้ง URL ของฐานข้อมูล/broker ให้ถูกพอร์ต. การรัน Compose ตามขั้นตอนด้านบนง่ายที่สุดและไม่ใช้ `.env` เดิม.

```powershell
docker compose --env-file .env.demo -p fondue-demo logs -f
docker compose --env-file .env.demo -p fondue-demo down
```

คำสั่ง down ปกติเก็บข้อมูลใน named volumes. เอกสาร `docs/progress-3/` และ demo เดิมเก็บไว้เป็นประวัติ milestone ไม่ใช่ผลทดสอบของ implementation ใหม่นี้.
