# Postman: ทดสอบทุก API ผ่าน API Gateway

`chula-fondue.postman_collection.json` มี 124 requests / 301 assertions ครอบคลุมทุก endpoint ของ gateway ทั้งกรณีปกติ สิทธิ์ (401/403) validation (400) สถานะไม่ถูกต้อง (409) และไม่พบข้อมูล (404) แต่ละรอบสร้าง reporter, staff, หน่วยงาน และ ticket ของตัวเองด้วย `runId` จึงรันซ้ำได้โดยไม่ชนข้อมูลเดิม

## ก่อนรัน

1. ระบบต้องรันอยู่ (Compose demo, Compose ปกติ หรือ Tilt) และ `seed:demo` แล้ว ถ้าอยากให้ข้อ 08 ทดสอบ auto-routing จริง (ต้องมีกฎ IT / Network และ `AUTO_ROUTING_ENABLED=true`)
2. เลือก environment ให้ตรงกับระบบที่รัน:

| ไฟล์ | baseUrl | ใช้กับ |
|---|---|---|
| `environments/demo.postman_environment.json` | http://localhost:3100 | `docker compose --env-file .env.demo -p fondue-demo up` |
| `environments/compose.postman_environment.json` | http://localhost:3000 | `docker compose up` (แก้ `adminPassword` ให้ตรง `.env`) |
| `environments/k8s.postman_environment.json` | http://localhost:3200 | `tilt up` |

## รันด้วย newman (command line)

```sh
npm run test:postman                       # ใช้ environment demo
npx newman run postman/chula-fondue.postman_collection.json \
  -e postman/environments/k8s.postman_environment.json --working-dir .
```

`--working-dir .` ต้องรันจาก root ของ repo เพราะ request ที่อัปโหลดรูปใช้ไฟล์ `demo-progress2/photos/issue-1.png`

## รันใน Postman (GUI)

1. Import → เลือกไฟล์ collection และ environment ที่ต้องการ
2. **Settings → General → Working directory** ตั้งเป็นโฟลเดอร์ root ของ repo (ไม่งั้น request ที่แนบรูปจะหาไฟล์ไม่เจอ)
3. เลือก environment มุมขวาบน → คลิกขวาที่ collection → **Run collection** → รันตามลำดับ (request ถัดไปใช้ token / id จาก request ก่อนหน้า)

## ลำดับในคอลเลกชัน

| Folder | ครอบคลุม |
|---|---|
| 00 Health | `/health`, `/health/ready` (ต่อไม่ได้จะหยุดทันที ไม่รันต่อ) |
| 01 Auth | login, register, guest token, `/auth/me`, token ผิด/ไม่มี |
| 02 Departments | CRUD + ชื่อซ้ำ, อีเมลผิด, 404, สิทธิ์ |
| 03 Users | สร้าง staff, หน่วยงานไม่มีจริง, list users, login staff |
| 03b Accounts | เปลี่ยนรหัสผ่าน (token เก่าใช้ไม่ได้), logout, ลืมรหัสผ่าน (ไม่บอกว่ามีบัญชีไหม), reset token ผิด, admin ปิด/เปิดบัญชี staff, ห้ามปิดบัญชีตัวเอง |
| 04 Routing rules | list, create (ปิดไว้), update, หมวดไม่รองรับ, `/routing-rules/match` |
| 05 Ticket lifecycle | แจ้ง + รูป → assign → start → resolve → reopen → resolve → confirm + ตรวจ history ครบทุกขั้น และรูปถูกเสิร์ฟจริง |
| 05b Idempotent submission | `Idempotency-Key` เดิม + เนื้อหาเดิมได้เรื่องเดิม, เนื้อหาต่าง 409, key ผิดรูปแบบ 400 |
| 06 Reject and cancel | reject (ต้องมีเหตุผล), filter สถานะ, cancel, includeCancelled |
| 07 Guest token | guest ส่งเรื่อง/อ่าน/list/cancel ไม่ได้ |
| 08 Automatic routing | IT / Network ถูกส่งต่อเองตามกฎ, "Other" เข้าคิว admin (NO_RULE), retry-routing (poll ทุก 1.5 วิ ไม่รอเงียบ จึงไม่เจอ socket hang up) |
| 09 Analytics and notifications | report + filter + วันที่ผิด, notifications ของ admin / staff (ตามหน่วยงาน) / reporter, mark read |
| 10 Validation and errors | ไม่มีรูป, ไฟล์ไม่ใช่รูป, ขาดรายละเอียด, id ผิด, staff assign ไม่ได้ |
| 11 Department deactivation | ลบไม่ได้ถ้ามี staff active หรืองานค้าง (409), ลบ = ปิดใช้งาน, `includeInactive`, assign/สร้าง staff ในหน่วยงานที่ปิดไม่ได้ |

flow รีเซ็ตรหัสผ่านสำเร็จ (กดลิงก์ในอีเมล) ทดสอบใน Postman ไม่ได้ เพราะ token ส่งทางอีเมลเท่านั้น ให้ทดสอบด้วยมือ

## ข้อควรรู้

- **Rate limit:** gateway จำกัด login / register / guest / password / logout / forgot / reset / create user รวม 30 ครั้งต่อนาที หนึ่งรอบใช้ประมาณ 24 ครั้ง **รันห่างกันอย่างน้อย 1 นาที** ไม่งั้นได้ 429
- **ตั้ง `EMAIL_MODE=record` ก่อนรัน** ถ้าเป็น `gmail` คอลเลกชันจะส่งอีเมลจริงหลายสิบฉบับไปยังอีเมลทดสอบ (`@example.test`)
- **Notifications ต้องมี MongoDB** ข้อ 09 จะรอ 3 วินาทีให้ event เดินทาง outbox → RabbitMQ → MongoDB ก่อนตรวจ
- ข้อ 08 ปรับผลตามระบบ: ถ้าปิด auto-routing ระบบควรเก็บเรื่องไว้ให้ admin, ถ้าไม่มีกฎ IT ควรเป็น REVIEW
- ไม่มี API ลบ user และ ticket จึงมีข้อมูลทดสอบสะสมในฐานข้อมูลทุกครั้งที่รัน
