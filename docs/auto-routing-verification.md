# Auto-routing verification — 8 November 2026

ทดสอบกับ Docker project `fondue-demo` ที่มีข้อมูลเดิม พร้อมเปิด `AUTO_ROUTING_ENABLED=true` ใน `.env.demo` และ seed กฎโดยไม่เขียนทับกฎที่มีอยู่ การแจ้งเตือนใช้ `EMAIL_MODE=record` จึงตรวจการบันทึก notification แทนการส่งอีเมลจริง

| การตรวจ | ผล |
| --- | --- |
| `npm run typecheck` | ผ่านทุก workspace |
| `npm test` / production build | ผ่าน 5 unit tests เดิมและ build ทุก service/React; integration test จะ skip เมื่อไม่กำหนดฐานข้อมูล |
| PostgreSQL routing integration | ผ่าน 14 กรณีย่อย (Node รายงาน 15 tests เมื่อนับ parent) ใช้ schema แยกและ cleanup หลังทดสอบ |
| `npm run test:e2e` | Workflow เดิมผ่าน รวม ownership, roles, concurrent start และ guest isolation |
| `npm run test:routing` | ผ่าน API กฎ, validation/409, staff scope, auto-assignment, review/retry, manual override, cancel และแจ้งปฏิเสธหลายผู้รับ |
| `npm run test:routing:recovery` | หยุด Department Service แล้วยังรับคำร้องได้; restart Ticket Service แล้วยังมี retry; ส่งต่อครั้งเดียวเมื่อบริการกลับมา |
| `npm run test:recovery` | ผ่าน RabbitMQ outage/outbox replay และปิดงานอัตโนมัติ 7 วัน |
| `npm run test:ui` | ผ่าน public UI 10 route/viewport checks |
| `npm run test:ui:live` | ผ่าน authenticated UI 20 route/viewport checks และส่งรูปแจ้งปัญหาผ่าน browser |
| `tests/routing-ui.mjs` | ผ่านการบันทึก/เปิด/ปิดกฎแล้ว reload, layout desktop/mobile, ส่งเรื่องจริงและรอ auto-assignment; ฉีด HTTP 503 หนึ่งครั้งเพื่อยืนยันว่า polling กลับมาทำต่อได้ |
| Visual QA | ตรวจภาพกฎบน desktop และรายละเอียดเรื่องบน mobile: ไม่มี overflow, แสดงหน่วยงาน/ไทม์ไลน์อัตโนมัติและปุ่มยกเลิกก่อนเริ่มงาน |
| `git diff --check` | ผ่าน |

Integration ครอบคลุม unique active rule, rollback ของ ticket/job/history/outbox, retry ครบจำนวนครั้ง, ambiguous/invalid response, worker สองตัว, lease เก่า, manual override, เปลี่ยนหมวดระหว่างส่งต่อ, cancel ระหว่างส่งต่อ, start แข่งกับ cancel, ผู้รับ notification หลายคนแต่ analytics ครั้งเดียว และปิด feature flag

คำสั่งทำซ้ำจาก repository root หลังตั้งค่า demo:

```sh
npm run typecheck
npm test
ROUTING_TEST_DATABASE_URL=postgresql://fondue:fondue@127.0.0.1:5435/ticket node --test tests/routing.integration.test.mjs
npm run test:e2e
npm run test:routing
npm run test:routing:recovery
npm run test:recovery
WEB_URL=http://127.0.0.1:8080 BROWSER_CHANNEL=chrome npm run test:ui
WEB_URL=http://127.0.0.1:8080 BROWSER_CHANNEL=chrome npm run test:ui:live
BROWSER_CHANNEL=chrome node --env-file-if-exists=.env.demo tests/routing-ui.mjs
```

ใช้ `BROWSER_CHANNEL=chromium` หากติดตั้ง Playwright Chromium แทน Chrome ของเครื่อง การทดสอบกู้คืนหยุดบริการเฉพาะ demo และคืนบริการใน `finally`; ไม่ใช้กับ production การทดสอบ API/UI กฎจะคืนค่า mapping ที่แก้ชั่วคราวหลังจบ

ผล JSON/ภาพอยู่ใน ignored `test-results/`: `routing-e2e.json`, `routing-recovery.json`, `routing-rules-1440.png`, `routing-rules-390.png`, `routing-mobile-assigned.png` และ evidence ของชุดเดิม

ระหว่างรัน API พร้อม Docker image build พบ cancellation ตอบ 504 หนึ่งครั้ง โดย log ระบุว่า transaction สำเร็จหลังประมาณ 6.3 วินาที เกิน deadline 5 วินาที เมื่อแยกทดสอบออกจาก build แล้วผ่านโดยไม่เปลี่ยน deadline ผลนี้ไม่ใช่การวัด capacity ภายใต้ load

เวอร์ชันนี้เลือกหน่วยงานจากหมวดตาม [แผน implementation](auto-routing-plan.md); ยังไม่เพิ่มกฎแยกอาคารหรือ AI, ไม่ย้ายคำร้องเก่าหรือที่มอบหมายแล้วอัตโนมัติ CI ถูกเพิ่มชุดทดสอบใหม่แล้ว แต่ผลในเอกสารนี้เป็นผล local ไม่ใช่ผล CI หรือการส่ง Gmail จริง
