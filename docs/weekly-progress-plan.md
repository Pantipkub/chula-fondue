# Chula Fondue: แผนส่งงาน Progress รอบนี้

**อัปเดต 27 ต.ค. 2026:** งานคนที่ 1-3 มี implementation/evidence แล้ว และคนที่ 4 รวม [proposal ฉบับแก้ไข](proposal.md) / [PDF](proposal.pdf) แล้ว ดู [ผล NFR จริง](nfr-verification.md) สำหรับสถานะ PASS/FAIL/NOT_RUN ตารางและข้อความแผนด้านล่างเก็บเป็น baseline ตอนเริ่มวางแผน ไม่ใช่สถานะ implementation ล่าสุด

รายละเอียดงานที่ลงมือได้ทันที ขอบเขตไฟล์ shared contracts และ prompt เลือกคนที่ 1-5 ให้ยึด [ส่วนแบ่งงานใน README](../README.md#team-roles) เป็นหลัก ไฟล์นี้ใช้ประกอบเรื่อง scope เวลา NFR และ storyboard

## เป้าหมาย

ทำงานรอบนี้ให้จบภายในวันนี้ โดยใช้ backend 3 services ที่มีเป็นฐาน และส่งงานสองชิ้นที่เล่าเรื่องเดียวกัน:

1. คลิปความยาวประมาณ 4 นาที 40 วินาที อธิบายการจัดการ Service Discovery และ Non-Functional Requirements (NFRs)
2. Project proposal ฉบับปรับปรุง พร้อม ADRs, revised microservice design และ diagrams ที่ตรงกับสถานะจริง

จากข้อความโจทย์ที่ได้รับ ยังไม่พบข้อกำหนดว่าต้อง implement ระบบทั้งหมดหรือมี live demo แผนนี้เสนอ technical demo สั้นเพื่อใช้เป็นหลักฐานประกอบ หากมี rubric เพิ่มเติม ให้ตรวจความครอบคลุมก่อนเริ่มอัดคลิป

ไฟล์นี้เป็นแผนงาน การตั้งค่า Docker, health checks, timeouts และผล performance ด้านล่างยังเป็นงานที่จะทำและเป้าหมายที่จะทดสอบ

## สถานะเริ่มต้น

| ส่วน | สถานะใน repository |
| --- | --- |
| API Gateway | REST เข้า, REST ไป Department, gRPC ไป Ticket |
| Department Service | REST CRUD, validation, SQLite ของตัวเอง |
| Ticket Service | gRPC ticket lifecycle, history, transaction, REST lookup ตอน assign |
| Environment configuration | มี root .env/.env.example และตัวโหลดสำหรับ services กับ demo scripts |
| Service Discovery | กำหนด endpoint ผ่าน environment เป็นหลัก; ยังไม่มี Compose DNS setup |
| Notification | log stub ภายใน Ticket Service |
| Health/readiness, bounded timeout, tracing | ยังไม่มี implementation เฉพาะใน source ที่ตรวจ |
| Auth, UI, Cloudinary, RabbitMQ, MongoDB | เป็นงานที่ยังต้องทำตามแบบระบบ |
| PostgreSQL | เป็น target ตาม ADR-007; prototype ปัจจุบันใช้ SQLite |

การตัดสินใจใน ADR อาจมีสถานะ Accepted แม้ยัง implement ไม่ครบ ให้เพิ่ม implementation status แยกไว้ด้วย

## ขอบเขตลงมือวันนี้

### 1. Service Discovery ที่นำมาอธิบายและเดโม

เสนอใช้ Docker Compose สำหรับ local/demo โดยให้ทั้ง 3 services อยู่ใน network เดียวกัน และใช้ DNS ชื่อ service:

```dotenv
# ตัวอย่างค่าภายใน Compose สำหรับงานที่จะเพิ่ม
TICKET_SERVICE_URL=ticket-service:50051
DEPARTMENT_SERVICE_URL=http://department-service:3001
```

- เก็บ .env สำหรับ npm run dev แบบ localhost ตามเดิม แล้วกำหนดค่า internal endpoints ผ่าน Compose environment ให้ชัดเจน
- เครื่องผู้ใช้เรียก Gateway ที่ localhost:3000; service ภายใน network เรียกกันด้วยชื่อ service
- Environment configuration บอกชื่อปลายทาง ส่วน DNS ของ Docker ทำหน้าที่ resolve ชื่อนั้นเป็น IP ของ container
- เมื่อ recreate service ให้ทดสอบว่าเรียกด้วยชื่อเดิมได้โดยไม่แก้ URL พร้อมตรวจการ reconnect ของ client ด้วย
- DNS discovery, health checks และ client recovery เป็นคนละกลไก ต้องอธิบายแยกกัน
- Compose DNS ในเดโมหนึ่งเครื่องยังไม่ใช่หลักฐานของ high availability หรือการรองรับหลายเครื่อง

หลักฐานที่เก็บ: Compose configuration, ผล DNS lookup จากภายใน network, request ผ่าน Gateway และผลหลัง recreate Department Service

หากเลือก Render เป็น deployment ของ backend ในอนาคต ให้ใช้ internal service addresses ของแพลตฟอร์มใน workspace/region เดียวกัน แยกจากชื่อ Compose ของเครื่องพัฒนา รอบนี้ระบุเป็น deployment proposal จนกว่าจะมีการ deploy และทดสอบจริง

### 2. NFR ที่ทำให้เห็นหลักฐานได้วันนี้

ตัวเลขในตารางนี้เป็นเกณฑ์ที่เสนอสำหรับ demo/test ให้ทีมรับรองก่อนใช้ใน proposal ไม่ใช่ผลที่วัดแล้ว

| มิติ | สิ่งที่จะทำ | วิธีตรวจและเกณฑ์ที่เสนอ |
| --- | --- | --- |
| Performance | วัด read APIs ผ่าน Gateway | ข้อมูลตัวอย่าง 100 tickets; warm-up 10 วินาที; 20 concurrent clients นาน 60 วินาที; ดู GET /tickets และ history แยกกัน; เป้าหมาย p95 < 1 วินาที, error < 1% พร้อมบันทึกเครื่องและ workload |
| Failure handling | เพิ่ม REST timeout และ gRPC deadline | เสนอ REST timeout 2 วินาที และ gRPC deadline 3 วินาที; ทดลองทั้ง service หยุดและปลายทางตอบช้า; request ต้องจบด้วย error ที่สื่อความหมาย เช่น 503/504 ภายใน deadline พร้อมส่วนเผื่อเล็กน้อย; ถ้า Department lookup ล้มเหลวก่อน commit สถานะ ticket ต้องคงเดิม |
| Health / readiness | HTTP health/readiness ของ Gateway/Department และ gRPC health ของ Ticket | ลองทั้งปกติและ dependency ล่ม; liveness ดู process, readiness ดูความสามารถให้บริการที่กำหนด; ถ้า Gateway ยังมี route ใช้ได้บางส่วน ให้แสดงสถานะแต่ละ dependency แทนการซ่อน failure |
| Data integrity / persistence | เก็บ transaction เดิม และผูก SQLite แต่ละ service กับ volume ของตัวเอง | สร้าง ticket และ history; recreate container โดยคง volume; ตรวจว่า ticket และ history ยังอยู่และสัมพันธ์กัน |
| Observability | เก็บ request ID, service, operation, duration และ error code | ตามรอย request เดียวจาก Gateway ไป service ที่เรียกได้ โดยไม่ log secrets |
| Security | แยก secret configuration และจำกัดการเปิด port | ตรวจว่า .env ไม่ถูก track และ runtime/demo network เปิด host port เท่าที่จำเป็น; ระบุ JWT/RBAC เป็นงานที่ยังไม่เสร็จ |

ข้อควบคุมขอบเขต:

- ถ้ามี retry ให้เริ่มจาก read-only operation แบบจำกัดครั้งและอยู่ภายใน deadline เดิม
- การ create/assign/เปลี่ยนสถานะต้องออกแบบ idempotency ก่อนเพิ่ม automatic retry
- การที่ client หมด deadline ไม่ได้ยืนยันว่า server ย้อน transaction แล้ว ต้องตรวจสถานะจริงเมื่อผลลัพธ์ไม่แน่นอน
- Compose healthcheck และ depends_on แบบ service_healthy ช่วยลำดับการเริ่มต้น; failure ระหว่าง runtime ยังต้องให้ application จัดการ
- การ restore หลัง recreate เป็นหลักฐาน persistence; ไม่เท่ากับทดสอบ backup/restore ครบกระบวนการ
- ภายในวันนี้ให้เก็บ performance และ failure/persistence เป็นหลักฐานหลัก; tracing เพิ่มเมื่อเวลาพอ

### 3. เป้าหมาย NFR เดิมที่ต้องคงไว้ในเอกสาร

ใน proposal เดิมมีเป้าหมายหน้าเว็บ < 2 วินาที, upload < 3 วินาที, ticket status/history < 1 วินาที, uptime 99.5%, ผู้ใช้ active สูงสุด 1,000 คน, Thai responsive UI และ JWT/RBAC

- แยก target, วิธีทดสอบ, implementation status และ measured result เป็นคนละช่อง
- ระบุ percentile, test environment, dataset และ load model ให้กับ performance target
- ผลทดสอบ 20 clients เป็นหลักฐานเบื้องต้น; เป้าหมาย 1,000 active users ยังต้องมี workload model และ capacity test แยก
- กำหนดช่วงวัดและวิธีนับ downtime สำหรับ uptime 99.5%; คลิปไม่กี่นาทียังยืนยันตัวเลขนี้ไม่ได้
- UI/upload/security ที่ยังไม่มี implementation ให้ลงวิธีตรวจที่วางไว้และระบุว่ายังไม่ได้ทดสอบ

## ตารางทำงานวันนี้: ประมาณ 6 ชั่วโมงแบบแบ่งงานในทีม

T0 คือเวลาเริ่มลงมือ ระยะเวลาเป็นประมาณการ เผื่อเวลาส่งไฟล์ก่อน deadline จริง

| ช่วง | งานและ dependency | สิ่งที่ต้องได้ |
| --- | --- | --- |
| T0 ถึง +30 นาที | ตรวจ rubric, Docker พร้อมใช้, dependencies/build; ตกลง scope และ NFR criteria | รายการส่งงานและเกณฑ์ทดสอบที่ทีมเห็นตรงกัน |
| +30 นาที ถึง +2 ชั่วโมง | ฝั่งโค้ดทำ containers/network/volumes และ health/timeouts; ฝั่งเอกสารทำ service catalog, ADRs และ diagrams ควบคู่ | 3 services เรียกกันผ่าน DNS ได้; ร่างเอกสารและภาพ |
| +2 ถึง +3 ชั่วโมง | รัน happy path, DNS/recreate, failure และ performance; เก็บ output | หลักฐานจริงพร้อมระบุเงื่อนไขและข้อจำกัด |
| +3 ถึง +4 ชั่วโมง | ปรับ proposal/ADRs ให้ตรงผล, ทำภาพสุดท้ายและสคริปต์คลิป | Proposal พร้อม export และ storyboard ประมาณ 4:40 |
| +4 ถึง +5 ชั่วโมง | ซ้อม, อัดคลิปและตัดต่อ | คลิป draft ที่ต่ำกว่า 5 นาที |
| +5 ถึง +6 ชั่วโมง | คนที่ไม่ได้เขียนตรวจคลิปและ PDF, export และตรวจไฟล์ส่ง | คลิปและ proposal ฉบับส่งที่เปิดอ่าน/เล่นได้ |

หากติดปัญหาติดตั้งหรือ build ในช่วงแรก ให้ลดจำนวนเดโมเหลือ discovery + failure handling แล้วอธิบาย measurement plan ที่ยังไม่ได้รันตามจริง เว้นแต่ rubric กำหนดว่าต้องมีผลการทดสอบครบ ส่วนที่ทำจริงกับส่วนที่เสนอควรระบุทั้งในภาพและคำพูด

## การแบ่งงานสำหรับทีม 5 คน

| ผู้รับผิดชอบ | งานหลัก | สิ่งที่ส่งต่อ |
| --- | --- | --- |
| คนที่ 1 | Docker/Compose, DNS, internal endpoints, volumes | คำสั่งเดโมที่รันซ้ำได้ + deployment diagram |
| คนที่ 2 | Health/readiness, timeouts/deadlines, error behavior | ผลกรณีปกติ/ปลายทางล่ม + sequence diagram |
| คนที่ 3 | Performance, persistence checks และรวบรวมผล NFR | ตาราง target/result/test conditions |
| คนที่ 4 | Proposal, service catalog, ADRs และความสอดคล้องของภาพ | เอกสารฉบับรวมและ PDF |
| คนที่ 5 | Storyboard, สคริปต์พูด, บันทึกจอ, ตัดต่อ และ final QA | คลิปฉบับส่ง |

คนที่ 4 และ 5 เริ่มโครงเอกสาร/คลิปได้ทันที แล้วใช้ผลจากคนที่ 1-3 มาเติม ไม่ต้องรอให้โค้ดเสร็จก่อนเริ่ม

## Proposal ที่ต้องอัปเดต

1. Problem, actors และ use cases: คงสาระเดิมและแก้เฉพาะสิ่งที่เปลี่ยน
2. Progress scope: แสดง Implemented / Proposed / Future ให้ชัด
3. Service catalog: ของแต่ละ service ระบุ responsibility, operations, protocol, owned data และ dependencies; รวม API Gateway, Auth, Ticket, Department และ Notification
4. Service Discovery: เปรียบเทียบ static configuration, DNS-based discovery และ dedicated registry แล้วระบุวิธีเลือกตาม environment
5. NFR matrix: requirement, measurable target, mechanism, verification, result/status และ limitations
6. Updated ADRs และ diagrams
7. Remaining work และ references

### ADR เดิมที่ต้องแก้

- ADR-004/006: คงแนวทาง RabbitMQ และ MongoDB ตาม target พร้อมบอกว่าโค้ดปัจจุบันยังเป็น notification log stub
- ADR-005: ลบข้อความเก่าที่บอกว่า Gateway เรียก Notification ผ่าน gRPC/Gmail แล้วใช้แนวทาง RabbitMQ ให้ตรงทั้งเอกสาร
- ADR-007: แยก PostgreSQL/MongoDB ใน target ออกจาก SQLite prototype และระบุ migration/persistence plan
- ADR-008: คง JWT/RBAC เป็น design decision พร้อม implementation status ที่ตรงจริง
- UC-05: แก้ relationship/postcondition ที่ยังสื่อว่าส่ง Gmail ในรอบนี้ ให้ตรงกับ notification record ผ่าน RabbitMQ/MongoDB และ Gmail ที่เป็น future iteration

### ADR ใหม่ที่เสนอ

| ADR | Decision ที่จะบันทึก | ทางเลือก/ผลกระทบที่ต้องอธิบาย |
| --- | --- | --- |
| ADR-009 Service Discovery | ใช้ Compose DNS ใน local/demo; ถ้าเลือก Render deployment ใช้ internal service addresses | เทียบกับ static URLs และ dedicated registry; ระบุ network scope, reconnect และข้อจำกัดของ single-host demo |
| ADR-010 Resilience and Health | Health/readiness แยกกัน, REST timeout, gRPC deadline, meaningful errors | ค่า timeout เป็น trade-off; startup readiness ต่างจาก runtime recovery; retry policy และ idempotency |
| ADR-011 NFR Verification and Observability | กำหนด workload, p95/error measurement, failure test, persistence test และ request tracing | ต้นทุนการวัด, test environment, สิ่งที่ผลทดสอบรองรับและสิ่งที่ยังยืนยันไม่ได้ |

ADR ใหม่เริ่มสถานะ Proposed แล้วปรับตามการตัดสินใจของทีม บันทึก Context, Alternatives, Decision, Consequences และ Verification พร้อมสถานะ implementation

### Diagrams ที่ต้องมีอย่างน้อย 3 ภาพ

1. **Revised logical architecture**: ขอบเขต service, REST/gRPC/AMQP, database ownership, Cloudinary และ legend ของ Implemented / Proposed / Future
2. **Deployment / Service Discovery**: เครื่องผู้ใช้ -> exposed Gateway port -> Compose network -> service DNS names; แสดง volume ของแต่ละฐานข้อมูลและ network boundary; ถ้าพูดถึง Render ให้แยกเป็น target deployment view
3. **Assign Ticket sequence**: Gateway -> Ticket -> Department -> ticket/history transaction; มี failure/timeout branch; ส่วน event/notification ที่ยังไม่ทำแสดงเป็น proposed branch ชัดเจน

แต่ละภาพต้องบอกว่าเป็น current implementation หรือ target design และใช้ชื่อ service/protocol ตรงกันทั้งเอกสารและคลิป

## Storyboard คลิป: 4 นาที 40 วินาที

| เวลา | สิ่งที่อธิบาย | ภาพ/หลักฐาน |
| --- | --- | --- |
| 0:00-0:25 | ปัญหาของ Chula Fondue และสถานะระบบรอบนี้ | Revised architecture พร้อม legend |
| 0:25-1:35 | Services หา endpoint กันอย่างไร; config vs DNS; เหตุผลเลือกวิธีนี้และข้อจำกัด | Network diagram + internal service names |
| 1:35-2:45 | NFR ที่เลือก, targets และกลไกจัดการ failure/data/performance | NFR matrix + ค่าที่วัดจริงถ้ามี |
| 2:45-4:15 | Demo สั้น: เรียกผ่าน Gateway, DNS/recreate, dependency ล่มแล้ว error ภายใน deadline, persistence/result | Terminal/recording ที่อ่านได้; ใช้ผลที่รันทดสอบไว้จริง |
| 4:15-4:40 | ADR ที่เปลี่ยน, trade-offs, สิ่งที่ยังไม่เสร็จและวิธีตรวจต่อ | สไลด์ปิดสั้นหนึ่งหน้า |

ซ้อมให้ได้ประมาณ 4:30-4:40 รวม title/outro เพื่อเหลือระยะปลอดภัยจากข้อกำหนด < 5 นาที หากเดโมใช้เวลามาก เลือก discovery และ failure เป็นภาพเคลื่อนไหว แล้วแสดง persistence/performance เป็นผลที่บันทึกไว้

## เกณฑ์พร้อมส่ง

- [ ] คลิปมีความยาวรวมต่ำกว่า 5 นาทีและเสียงฟังชัด
- [ ] อธิบายทั้ง Service Discovery และ NFR พร้อมเหตุผลเลือกและข้อจำกัด
- [ ] ผลที่แสดงมีคำสั่ง/test conditions ที่รันซ้ำได้; ไม่มีตัวเลขสมมติที่ถูกนำเสนอเป็นผลจริง
- [ ] Proposal มี updated ADRs, revised service catalog และ diagrams อย่างน้อย 3 ภาพ
- [ ] Current implementation กับ target design ถูกระบุชัดทั้งภาพ เอกสาร และคำพูด
- [ ] ไม่มีข้อความ notification แบบ gRPC/Gmail ที่ขัดกับ RabbitMQ target เหลืออยู่
- [ ] เปิด PDF แล้วตัวอักษรและ labels อ่านได้ ไม่ถูกตัดหรือเล็กเกินไป
- [ ] ไม่มี secret ในเอกสาร ภาพ terminal คลิป หรือ Git
- [ ] ไฟล์/ลิงก์ส่งงานเปิดได้และใช้เวอร์ชันเดียวกัน

## แหล่งอ้างอิง

- Project description and ADRs (2).pdf: เอกสารตั้งต้นที่ผู้ใช้ให้; NFR อยู่หน้า 12-13 และ ADRs ที่เกี่ยวข้องอยู่หน้า 16-19
- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/): service-name discovery, container/host ports และการ reconnect หลัง container เปลี่ยน
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/): readiness และ service_healthy ในช่วงเริ่มต้น
- [Render private network](https://render.com/docs/private-network): ทางเลือก discovery/networking สำหรับ target deployment ถ้าทีมเลือกใช้ Render
