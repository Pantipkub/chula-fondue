# Chula Fondue — แผนงาน Progress #2

## 1. โจทย์ และเราจะตอบโจทย์อย่างไร

| โจทย์กำหนด | เราจะทำ |
| --- | --- |
| Demo 3 business use case | UC-01 แจ้งปัญหา, UC-02 ส่ง ticket ให้แผนก, UC-03 แก้ปัญหาและปิดงาน |
| Authentication | เพิ่ม Auth Service และให้ API Gateway ตรวจสิทธิ์ทุกคำขอ |
| ฐานข้อมูล 2 แบบ | PostgreSQL (แบบตาราง) และ MongoDB (แบบเอกสาร) |
| อย่างน้อย 1 service ใช้ message broker | Ticket Service ส่งข้อความผ่าน RabbitMQ ไปให้ Notification Service |
| เอกสารฉบับปรับปรุง | แก้ ADR 3 ใบ, เพิ่ม ADR 3 ใบ, แก้ diagram และตาราง operations |
| คลิปไม่เกิน 5 นาที | Demo ฝั่ง backend ด้วยสคริปต์ ดูลำดับในหัวข้อ 8 |

ข้อสรุปที่ตกลงแล้ว:

| เรื่อง | ข้อสรุป |
| --- | --- |
| ฐานข้อมูลแบบตาราง | PostgreSQL บน Neon |
| ฐานข้อมูลแบบเอกสาร | MongoDB แบบออนไลน์ ใช้เก็บประวัติการแจ้งเตือน |
| Message broker | RabbitMQ อยู่ระหว่าง Ticket Service กับ Notification Service รันในเครื่องแต่ละคนด้วย Docker |
| การแจ้งเตือน | รอบนี้บันทึกลง MongoDB เท่านั้น ยังไม่ส่งอีเมลจริง (ดูหัวข้อ 3.5) |
| รูปภาพ | อัปโหลดได้หลายรูป เก็บบน Cloudinary โดย API Gateway เป็นตัวอัปโหลด |
| Demo | สคริปต์ฝั่ง backend ก่อน หน้าเว็บทำถ้าเวลาเหลือ |

สถานะการ implement (13 ต.ค. 2026):

| ส่วน | สถานะ |
| --- | --- |
| Auth Service, การตรวจบัตรผ่านและบทบาทที่ API Gateway | เสร็จ ทดสอบผ่าน |
| 3 use case ผ่าน API Gateway พร้อมอัปโหลดหลายรูป | เสร็จ ทดสอบผ่าน |
| Ticket Service → RabbitMQ → Notification Service → MongoDB | เสร็จ ทดสอบผ่านกับ MongoDB ออนไลน์ รวมกรณีปิด Notification Service แล้วเปิดใหม่ |
| PostgreSQL | เสร็จ ทดสอบกับ PostgreSQL ในเครื่อง ยังไม่ได้ทดสอบกับ Neon เพราะยังไม่มีค่าเชื่อมต่อ |
| Cloudinary | เขียนเสร็จ ยังไม่ได้ทดสอบกับบัญชีจริงเพราะยังไม่มีค่าเชื่อมต่อ ตอนนี้รูปเก็บในโฟลเดอร์ในเครื่องแทน |
| ADR, diagram, ตาราง operations | ยังไม่ได้ทำ |

วิธีรันและรายการเส้นทางทั้งหมดอยู่ใน [README.md](../README.md)

## 2. ภาพรวมระบบหลังแก้

```
Client
  |  REST
  v
API Gateway ----REST----> Auth Service ---------> PostgreSQL (auth)
  |
  +-------------REST----> Department Service ---> PostgreSQL (department)
  |                              ^
  |                              | REST (ตรวจว่าแผนกมีจริงตอน assign)
  +-------------gRPC----> Ticket Service -------> PostgreSQL (ticket)
  |                              |
  |                              | หย่อนข้อความ
  |                              v
  |                          RabbitMQ
  |                              |
  |                              | ส่งข้อความต่อ
  |                              v
  |                      Notification Service --> MongoDB
  |                              |
  |                              +--> Gmail (รอบถัดไป)
  v
Cloudinary (เก็บรูป)
```

| Service | สถานะ | งานที่ต้องทำ |
| --- | --- | --- |
| Auth Service | สร้างใหม่ | สมัครสมาชิก, login, login แบบ guest |
| Notification Service | สร้างใหม่ | รับข้อความจาก RabbitMQ, บันทึกประวัติลง MongoDB |
| Ticket Service | แก้ | เปลี่ยนไปใช้ PostgreSQL, หย่อนข้อความลง RabbitMQ, เก็บ link รูปเป็นรายการ |
| Department Service | แก้เล็กน้อย | เปลี่ยนไปใช้ PostgreSQL เท่านั้น |
| API Gateway | แก้ | ตรวจบัตรผ่านและบทบาท, รับไฟล์รูปแล้วอัปโหลดขึ้น Cloudinary |
| Analytics Service | ไม่ทำรอบนี้ | ไม่อยู่ใน 3 use case หลัก คงไว้ใน diagram ว่าเป็นแผน |

หมายเหตุ: ในโค้ดปัจจุบันยังไม่มี Notification Service แยกออกมา มีแค่ตัวจำลองอยู่ใน Ticket Service ที่พิมพ์ข้อความลง log

## 3. รายละเอียดแต่ละส่วน

### 3.1 RabbitMQ

**คืออะไร และอยู่ตรงไหน**

RabbitMQ เป็นโปรแกรมแยกต่างหาก ไม่ได้ฝังอยู่ใน service ใด ทำหน้าที่เป็นตู้จดหมายกลางระหว่าง Ticket Service (ผู้ส่ง) กับ Notification Service (ผู้รับ)

**ทำไมต้องใช้**

แบบเดิมตาม diagram รอบก่อน (Ticket Service เรียก Notification Service โดยตรง):

1. Admin กด assign
2. Ticket Service บันทึกสถานะใหม่
3. Ticket Service เรียก Notification Service แล้วรอคำตอบ
4. Notification Service ส่งอีเมลผ่าน Gmail แล้วตอบกลับ
5. Ticket Service ตอบ Admin

การเรียกตรงเหมือนการโทรศัพท์ ผู้โทรต้องถือสายจนอีกฝ่ายทำเสร็จและตอบกลับ ปัญหามี 2 ข้อ:

- ถ้า Notification Service หรือ Gmail ช้า Admin ต้องรอไปด้วย ทั้งที่ ticket ถูก assign เสร็จตั้งแต่ขั้นที่ 2
- ถ้า Notification Service ล่มอยู่ตอนนั้น คำสั่งแจ้งเตือนหายไปเลย เพราะไม่มีใครเก็บไว้ให้

แบบใหม่ (ผ่าน RabbitMQ):

1. Admin กด assign
2. Ticket Service บันทึกสถานะใหม่
3. Ticket Service หย่อนข้อความลงตู้ ใช้เวลาเสี้ยววินาที
4. Ticket Service ตอบ Admin ทันที
5. RabbitMQ ส่งข้อความต่อให้ Notification Service
6. Notification Service บันทึกการแจ้งเตือน (และส่งอีเมลในรอบถัดไป)

ผลที่ได้: Admin ไม่ต้องรอ และถ้า Notification Service ล่ม ข้อความค้างรออยู่ในตู้จนกว่าจะเปิดกลับมา ซึ่งตรงกับ ADR-005 เดิมที่เขียนว่าการแจ้งเตือนล้มเหลวต้องไม่ทำให้การเปลี่ยนสถานะล้มเหลว

เหตุผลที่ไม่ใช้ RabbitMQ กับการ route ticket ไปหาแผนก: Admin ต้องรู้ผลทันทีว่าแผนกที่เลือกยังมีอยู่หรือไม่ (UC-02) จึงต้องเรียกตรงแบบรอคำตอบ ส่วนคำว่า "department queue" ในเอกสารหมายถึงรายการ ticket ของแผนก ไม่ใช่ message queue

**วิธีรัน**

ต้องมี Docker Desktop (โปรแกรมที่เปิดซอฟต์แวร์สำเร็จรูปได้ด้วยคำสั่งเดียวโดยไม่ต้องติดตั้งเอง) เปิด Docker Desktop ไว้ แล้วรันคำสั่งนี้ที่โฟลเดอร์หลักของโปรเจกต์:

```
docker compose up -d
```

คำสั่งนี้เปิด RabbitMQ และ PostgreSQL สำรองในเครื่อง ตามที่กำหนดไว้ในไฟล์ `docker-compose.yml` ปิดด้วย `docker compose stop`

- ช่อง 5672 ใช้ให้ service ของเราต่อเข้าไป
- ช่อง 15672 เป็นหน้าเว็บสำหรับดูสถานะ เปิดที่ http://localhost:15672 ชื่อผู้ใช้ `guest` รหัสผ่าน `guest` หน้านี้แสดงว่ามีตู้ชื่ออะไร และมีข้อความค้างอยู่กี่ใบ

**วิธีที่โค้ดใช้**

- NestJS มีเครื่องมือต่อ RabbitMQ ในตัว ไม่ต้องเขียนส่วนเชื่อมต่อเอง
- ฝั่ง Ticket Service: จุดที่เคยเรียกตัวจำลองการแจ้งเตือน เปลี่ยนเป็นคำสั่งหย่อนข้อความ 1 บรรทัด
- ฝั่ง Notification Service: เขียนฟังก์ชัน 1 ตัวที่ระบุว่ารับข้อความชื่อ `ticket.status_changed` RabbitMQ จะเรียกฟังก์ชันนี้ทุกครั้งที่มีข้อความเข้า
- ตู้ชื่อ `notifications` ตั้งให้เก็บข้อความไว้แม้ RabbitMQ ปิดแล้วเปิดใหม่
- Notification Service แจ้ง RabbitMQ ว่า "ทำเสร็จแล้ว" หลังบันทึกลง MongoDB สำเร็จเท่านั้น ถ้าล่มกลางทาง RabbitMQ จะส่งข้อความเดิมมาใหม่
- ถ้าบันทึกลง MongoDB ไม่สำเร็จ Notification Service คืนข้อความให้ RabbitMQ แล้วลองใหม่ทุก 5 วินาที
- ถ้า RabbitMQ เองล่มตอน Ticket Service จะหย่อนข้อความ ให้บันทึก log แล้วทำงานต่อ การเปลี่ยนสถานะ ticket ยังสำเร็จ

**รูปแบบข้อความ**

```json
{
  "ticketId": "a1b2c3",
  "status": "ASSIGNED",
  "recipientEmail": "building@chula.ac.th",
  "category": "ไฟฟ้า",
  "location": "ตึก 3 ชั้น 2",
  "description": "หลอดไฟดับ",
  "changedAt": "2026-10-13T10:00:00Z"
}
```

ข้อความต้องมีข้อมูลครบสำหรับเขียนอีเมล เพื่อให้ Notification Service ไม่ต้องย้อนไปถาม Ticket Service อีก

| สถานะใหม่ของ ticket | ผู้รับแจ้ง |
| --- | --- |
| Assigned | อีเมลติดต่อของแผนก |
| In Progress, Resolved, Rejected, Closed | Reporter |
| Submitted, Cancelled | ไม่แจ้ง ไม่หย่อนข้อความ |

### 3.2 ฐานข้อมูล

| ข้อมูล | ฐานข้อมูล | เหตุผล |
| --- | --- | --- |
| ผู้ใช้, ticket, แผนก | PostgreSQL บน Neon | ข้อมูลมีโครงสร้างตายตัวและอ้างถึงกัน |
| ประวัติการแจ้งเตือน | MongoDB | เป็นบันทึกเหตุการณ์ที่เก็บเป็นก้อนอิสระ ไม่ต้องเชื่อมกับตารางอื่น |

PostgreSQL:

- Neon เป็นบริการ PostgreSQL ออนไลน์ ทุกคนต่อเข้าฐานข้อมูลชุดเดียวกัน ข้อมูลจึงตรงกัน ต่างจาก SQLite เดิมที่เป็นไฟล์ในเครื่องของแต่ละคน
- สร้าง 3 ฐานข้อมูลแยกกันใน Neon ชื่อ `auth`, `ticket`, `department` service หนึ่งห้ามอ่านฐานข้อมูลของอีก service เพื่อให้ตรงกับ diagram ที่ระบุว่าแต่ละ service มีฐานข้อมูลของตัวเอง
- ถ้ายังไม่ได้ใส่ค่าเชื่อมต่อ Neon ในไฟล์ `.env` ระบบจะใช้ PostgreSQL สำรองในเครื่องที่เปิดด้วย Docker แทน ข้อมูลในนั้นไม่แชร์กับเพื่อน
- แผนฟรีของ Neon จะพักฐานข้อมูลเมื่อไม่มีการใช้งาน คำขอแรกหลังพักจะช้ากว่าปกติ ก่อนอัดคลิปให้ยิงคำขอปลุกไว้ก่อน
- ข้อควรระวัง: ตอนนี้โค้ดตั้งให้ปรับโครงสร้างตารางอัตโนมัติตอนเปิด service เมื่อใช้ฐานข้อมูลร่วมกัน ถ้าใครแก้โครงสร้างตาราง ตารางของทุกคนจะเปลี่ยนตาม ให้แจ้งในกลุ่มก่อนแก้

MongoDB:

- สร้างแบบออนไลน์ 1 ชุด ฐานข้อมูลชื่อ `notification`
- ต้องตั้งให้ต่อเข้าได้จากทุกที่ (หน้า Network Access เลือกอนุญาต `0.0.0.0/0`) ถ้าอนุญาตแค่ที่อยู่เดียว เครื่องที่ใช้เน็ตมือถือหรือเน็ตที่ที่อยู่เปลี่ยนไปมาจะต่อได้บ้างไม่ได้บ้าง โดยขึ้นข้อความ `SSL alert number 80`
- ตัวอย่างข้อมูลที่ Notification Service บันทึก 1 รายการต่อ 1 ข้อความ:

```json
{
  "ticketId": "a1b2c3",
  "status": "ASSIGNED",
  "recipientEmail": "building@chula.ac.th",
  "category": "ไฟฟ้า",
  "location": "ตึก 3 ชั้น 2",
  "description": "หลอดไฟดับ",
  "changedAt": "2026-10-13T10:00:00Z",
  "receivedAt": "2026-10-13T10:00:01Z",
  "delivery": "RECORDED"
}
```

### 3.3 Authentication

- Auth Service เป็น REST เหมือน Department Service เก็บผู้ใช้ในฐานข้อมูล `auth`: อีเมล, รหัสผ่าน, บทบาท, รหัสแผนก (เฉพาะ Staff)
- Login สำเร็จแล้ว Auth Service ออกบัตรผ่านดิจิทัล (JWT คือข้อความเข้ารหัสที่ระบุว่าผู้ใช้เป็นใคร บทบาทอะไร อยู่แผนกไหน) อายุ 1 วัน
- ผู้ใช้แนบบัตรผ่านมากับทุกคำขอ API Gateway เป็นจุดเดียวที่ตรวจ service ข้างหลังไม่ต้องตรวจซ้ำ
- รหัสผ่านเก็บแบบเข้ารหัสทางเดียว ไม่เก็บตัวอักษรจริง
- Guest เรียก "เข้าแบบ guest" แล้วได้บัตรผ่านชั่วคราว ไม่มีบัญชีในฐานข้อมูล และต้องระบุอีเมลติดต่อตอนแจ้งปัญหา
- บัญชี Admin คนแรกถูกสร้างอัตโนมัติตอนเปิด Auth Service จากค่า `ADMIN_EMAIL` และ `ADMIN_PASSWORD` ในไฟล์ `.env`
- Admin สร้างบัญชี Staff และ Admin คนอื่นผ่าน `POST /auth/users` โดย Staff ต้องระบุรหัสแผนก การสมัครสมาชิกทั่วไปสร้างได้เฉพาะ Reporter
- อีเมลของผู้แจ้งมาจากบัตรผ่าน ไม่รับจากข้อมูลที่ผู้ใช้ส่งมา ยกเว้น Guest ที่ต้องกรอกเอง
- การตรวจว่า "เป็น ticket ของตัวเอง" หรือ "เป็น ticket ของแผนกตัวเอง": API Gateway ดึง ticket มาเทียบกับข้อมูลในบัตรผ่านก่อนส่งคำขอต่อ

| เส้นทางที่ API Gateway | ใครเรียกได้ |
| --- | --- |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/guest` | ทุกคน |
| `POST /auth/users` สร้างบัญชี Staff หรือ Admin | Admin |
| `POST /tickets` แจ้งปัญหา | Reporter, Guest |
| `GET /tickets` | Admin เห็นทั้งหมด, Staff เห็นของแผนกตัวเอง, Reporter เห็นของตัวเอง |
| `GET /tickets/:id/history` | Admin, Staff ของแผนกนั้น, เจ้าของ ticket, Guest ที่มีรหัส ticket |
| `DELETE /tickets/:id` ยกเลิก | เจ้าของ ticket |
| `POST /tickets/:id/assign`, `/reject` | Admin |
| `POST /tickets/:id/start`, `/resolve` | Staff ของแผนกนั้น |
| `POST /tickets/:id/confirm`, `/reopen` | เจ้าของ ticket |
| `/departments` ดู สร้าง แก้ ลบ | Admin |

### 3.4 รูปภาพ

**หลักการ**

ฐานข้อมูลของเราไม่เก็บไฟล์รูป เก็บเฉพาะ link ไฟล์รูปจริงอยู่ที่ Cloudinary ซึ่งเป็นบริการฝากรูปออนไลน์ที่มีแผนฟรี เราส่งไฟล์รูปไปให้ แล้ว Cloudinary เก็บไว้และตอบ link ถาวรของรูปนั้นกลับมา

**ขั้นตอนตอนแจ้งปัญหา**

1. ผู้ใช้ส่งคำขอแบบฟอร์มที่แนบไฟล์ได้ มีข้อมูล ticket และไฟล์รูปในช่องชื่อ `photos` แนบได้หลายไฟล์
2. API Gateway ตรวจไฟล์: ต้องเป็นรูป (jpg, png, webp) ขนาดไม่เกิน 5 MB ต่อรูป จำนวน 1 ถึง 5 รูป ถ้าไม่ผ่านให้ตอบ error และไม่สร้าง ticket (ตรงกับ UC-01)
3. API Gateway ส่งแต่ละไฟล์ขึ้น Cloudinary ผ่านชุดคำสั่งสำเร็จรูปของ Cloudinary
4. Cloudinary ตอบ link กลับมารูปละ 1 link หน้าตาประมาณ `https://res.cloudinary.com/<ชื่อบัญชี>/image/upload/v1/abc123.jpg`
5. API Gateway ส่งข้อมูล ticket พร้อมรายการ link ต่อให้ Ticket Service
6. Ticket Service บันทึกรายการ link ลงฐานข้อมูล
7. ตอนดู ticket ผู้ใช้ได้รายการ link กลับไป เปิดดูรูปได้จาก link โดยตรง

ตอน resolve (UC-03) ใช้ขั้นตอนเดียวกัน โดยเก็บเป็นรายการรูปหลังซ่อมแยกจากรูปตอนแจ้ง

**ทำไมให้ API Gateway เป็นตัวอัปโหลด**

- ช่องทางระหว่าง API Gateway กับ Ticket Service (gRPC) จำกัดขนาดข้อความไว้ราว 4 MB รูปหลายรูปรวมกันเกินแน่นอน
- ถ้าให้ Ticket Service อัปโหลด ไฟล์ต้องเดินทาง 2 ต่อโดยไม่ได้ประโยชน์อะไร
- ผลต่อ diagram: เส้นไปที่เก็บรูปย้ายจาก Ticket Service มาอยู่ที่ API Gateway

**สิ่งที่ต้องแก้เพราะรองรับหลายรูป**

- สัญญาระหว่าง API Gateway กับ Ticket Service (ไฟล์ `proto/ticket.proto`): ช่อง link รูปเดี่ยวเปลี่ยนเป็นรายการ ทั้งรูปตอนแจ้งและรูปหลังซ่อม
- ตาราง ticket: ช่อง link รูปเดี่ยวเปลี่ยนเป็นรายการ และเพิ่มช่องรายการรูปหลังซ่อม ตอนนี้โค้ดไม่ได้เก็บรูปหลังซ่อมไว้กับ ticket เขียนไว้แค่ในข้อความประวัติ

**ถ้ายังไม่มีบัญชี Cloudinary**

ถ้าไม่ได้ใส่ `CLOUDINARY_URL` ในไฟล์ `.env` API Gateway จะเก็บรูปไว้ในโฟลเดอร์ `services/api-gateway/uploads` และให้ link ที่ชี้มาที่ API Gateway เอง link แบบนี้เปิดได้เฉพาะในเครื่องที่รันอยู่ ใช้สำหรับพัฒนาเท่านั้น

**ข้อจำกัดที่ยอมรับ**

- link รูปเป็นแบบเปิด ใครมี link ก็ดูรูปได้
- ถ้าอัปโหลดรูปสำเร็จแต่สร้าง ticket ไม่สำเร็จ รูปจะค้างอยู่บน Cloudinary ไม่มีการลบตาม

### 3.5 การแจ้งเตือน: รอบนี้ทำถึงไหน

- รอบนี้: Notification Service รับข้อความจาก RabbitMQ แล้วบันทึกลง MongoDB โดยตั้งช่อง `delivery` เป็น `RECORDED` ยังไม่มีอีเมลออกจริง
- รอบถัดไป: เพิ่มการส่งอีเมลผ่าน Gmail ในฟังก์ชันรับข้อความของ Notification Service จุดเดียว แล้วเปลี่ยน `delivery` เป็น `SENT` หรือ `FAILED` service อื่นไม่ต้องแก้
- สิ่งที่ต้องเตรียมเมื่อจะส่งจริง: บัญชี Gmail ของโปรเจกต์ และการขอสิทธิ์ส่งอีเมลจาก Google
- ในเอกสารและในคลิปต้องพูดให้ตรงว่ารอบนี้ยังไม่ส่งอีเมลจริง

## 4. ค่าที่ต้องเตรียมและใส่ในไฟล์ตั้งค่า

ทุกค่าใส่ในไฟล์ชื่อ `.env` ที่โฟลเดอร์หลักของโปรเจกต์ บรรทัดละค่า ในรูป `ชื่อ=ค่า` ไฟล์นี้มีรหัสผ่าน ห้าม commit ขึ้น git ให้ส่งกันทางแชตส่วนตัว

| ชื่อ | ได้มาจาก | ใครเตรียม | service ที่ใช้ |
| --- | --- | --- | --- |
| `AUTH_DATABASE_URL` | Neon ฐานข้อมูล `auth` | คนดูแล Neon | Auth |
| `TICKET_DATABASE_URL` | Neon ฐานข้อมูล `ticket` | คนดูแล Neon | Ticket |
| `DEPARTMENT_DATABASE_URL` | Neon ฐานข้อมูล `department` | คนดูแล Neon | Department |
| `MONGODB_URL` | หน้าเชื่อมต่อของ MongoDB | คนสร้าง MongoDB | Notification |
| `RABBITMQ_URL` | ค่าตายตัวเมื่อรันด้วย Docker | ไม่ต้องเตรียม | Ticket, Notification |
| `CLOUDINARY_URL` | หน้าแรกของบัญชี Cloudinary | คนสมัคร Cloudinary | API Gateway |
| `JWT_SECRET` | ตั้งเองเป็นข้อความสุ่มยาวอย่างน้อย 32 ตัวอักษร | แต่ละคนตั้งเองได้ | Auth, API Gateway |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | ตั้งเอง เป็นบัญชี Admin คนแรก | แต่ละคนตั้งเองได้ | Auth |

ค่าที่ไม่ใส่ได้: 3 ค่าของ Neon (จะใช้ PostgreSQL ในเครื่อง), `RABBITMQ_URL` (ใช้ค่าตายตัวด้านล่าง) และ `CLOUDINARY_URL` (จะเก็บรูปในโฟลเดอร์ในเครื่อง) ไฟล์ `.env.example` มีตัวอย่างครบทุกค่า

หน้าตาของแต่ละค่า:

```
AUTH_DATABASE_URL=postgresql://<user>:<password>@<host>.neon.tech/auth?sslmode=require
TICKET_DATABASE_URL=postgresql://<user>:<password>@<host>.neon.tech/ticket?sslmode=require
DEPARTMENT_DATABASE_URL=postgresql://<user>:<password>@<host>.neon.tech/department?sslmode=require
MONGODB_URL=mongodb+srv://<user>:<password>@<host>.mongodb.net/notification
RABBITMQ_URL=amqp://guest:guest@localhost:5672
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
JWT_SECRET=<ข้อความสุ่มยาวอย่างน้อย 32 ตัวอักษร>
ADMIN_EMAIL=admin@chula.ac.th
ADMIN_PASSWORD=<รหัสผ่านอย่างน้อย 8 ตัวอักษร>
```

## 5. สิ่งที่ต้องทำก่อนเริ่มโค้ด

1. สร้าง 3 ฐานข้อมูลบน Neon แล้วส่ง 3 ค่ามา
2. สร้าง MongoDB ตั้งให้ทุกคนต่อเข้าได้ แล้วส่ง `MONGODB_URL` มา
3. สมัคร Cloudinary แล้วส่ง `CLOUDINARY_URL` มา
4. ทุกคนลง Docker Desktop แล้วรัน `docker compose up -d` ตามหัวข้อ 3.1
5. ตกลงสองเรื่องที่หลายคนต้องใช้ร่วมกัน:
   - ข้อมูลในบัตรผ่าน: รหัสผู้ใช้, อีเมล, บทบาท, รหัสแผนก (เฉพาะ Staff)
   - รูปแบบข้อความใน RabbitMQ ตามหัวข้อ 3.1

## 6. แบ่งงาน

| งาน | เนื้องาน | ต้องรออะไร |
| --- | --- | --- |
| A. ฐานข้อมูล | ย้าย Ticket Service และ Department Service จาก SQLite ไป PostgreSQL | ค่าจาก Neon |
| B. Auth | สร้าง Auth Service, ให้ API Gateway ตรวจบัตรผ่านและบทบาท, สคริปต์สร้างบัญชี Admin และ Staff | งาน A |
| C. แจ้งเตือน | สร้าง Notification Service, แก้ Ticket Service ให้หย่อนข้อความ | `MONGODB_URL` และ RabbitMQ ที่รันแล้ว |
| D. รูปภาพ | API Gateway รับไฟล์และอัปโหลด, แก้สัญญาและตาราง ticket ให้เก็บ link เป็นรายการ | `CLOUDINARY_URL` และงาน A |
| E. เอกสาร | ADR, diagram, ตาราง operations | ไม่ต้องรอ |
| F. Demo | ปรับสคริปต์ demo ให้ login แนบบัตรผ่าน และแนบรูป แล้วอัดคลิป | งาน A ถึง D |

งาน B, C, D แก้ไฟล์คนละส่วนเป็นหลัก ทำพร้อมกันได้หลังงาน A เสร็จ จุดที่ชนกันคือ Ticket Service (งาน C และ D) และ API Gateway (งาน B และ D)

## 7. เอกสารที่ต้องแก้

ADR:

- ADR-002 แก้: ลบประโยคที่ว่าไม่ใช้ message broker
- ADR-004 แก้: ระบุว่ารอบนี้บันทึกการแจ้งเตือนลงฐานข้อมูลก่อน การส่งผ่าน Gmail อยู่ในรอบถัดไป
- ADR-005 แก้: เส้น Ticket Service ไป Notification Service เปลี่ยนเป็นผ่าน RabbitMQ, เพิ่มเส้น API Gateway ไป Auth Service แบบ REST และลบประโยคที่ว่า API Gateway เรียก Notification Service ซึ่งขัดกับ diagram เดิมที่วาดให้ Ticket Service เป็นผู้เรียก
- ADR-006 ใหม่: เลือก message broker
- ADR-007 ใหม่: เลือกฐานข้อมูล
- ADR-008 ใหม่: วิธีทำ authentication

Diagram และตาราง operations:

- เพิ่ม Auth Service กับฐานข้อมูล, RabbitMQ, ฐานข้อมูลของ Notification Service
- ย้ายเส้นที่เก็บรูปมาที่ API Gateway และระบุว่าเป็น Cloudinary
- ทำเครื่องหมายว่า Gmail API และ Analytics Service เป็นแผนของรอบถัดไป
- เพิ่ม Register(), Login(), GuestLogin() ของ Auth Service ในตาราง
- ในตาราง: ช่องผู้ร่วมงานของ CreateTicket() และ ResolveTicket() เอา Object Storage ออก เพราะย้ายไปที่ API Gateway

## 8. ลำดับ demo ในคลิป

ใช้สคริปต์ `demo/progress2-demo.sh` สำหรับขั้นที่ 1 ถึง 4 และ `demo/broker-demo.sh` สำหรับขั้นที่ 6 (วิธีรันอยู่ใน README) และเปิดหน้าจอของ Neon, MongoDB, RabbitMQ ประกอบ

1. Login เป็น Reporter แล้วแจ้งปัญหาพร้อมรูป 2 รูป (UC-01) เปิด link รูปให้เห็นว่าอยู่บน Cloudinary
2. เรียกคำขอของ Admin ด้วยบัตรผ่านของ Reporter ให้เห็นว่าถูกปฏิเสธ
3. Login เป็น Admin แล้ว assign ให้แผนก (UC-02) เปิด MongoDB ให้เห็นรายการแจ้งเตือนที่เพิ่งเข้า
4. Login เป็น Staff แล้วเริ่มงานและ resolve พร้อมรูป (UC-03)
5. เปิดตารางใน Neon ให้เห็นข้อมูล ticket และประวัติสถานะ
6. ปิด Notification Service แล้ว assign อีกใบ ซึ่งยังสำเร็จ เปิดหน้าเว็บ RabbitMQ ให้เห็นข้อความค้าง 1 ใบ จากนั้นเปิด Notification Service กลับมาให้เห็นว่าข้อความถูกรับไปและมีรายการใหม่ใน MongoDB

หมายเหตุ: ตอน Notification Service ทำงานปกติ ข้อความถูกรับไปทันที หน้าเว็บ RabbitMQ จะแสดงข้อความค้าง 0 ใบ จึงเห็นข้อความค้างได้เฉพาะในขั้นที่ 6

## 9. ไม่ทำรอบนี้

- ส่งอีเมลจริงผ่าน Gmail (ดูหัวข้อ 3.5)
- หน้าเว็บ (ทำถ้าเวลาเหลือ)
- Analytics Service (UC-07)
- ปิด ticket อัตโนมัติเมื่อครบ 7 วัน
- ส่งอีเมลซ้ำอัตโนมัติเมื่อส่งไม่สำเร็จ
- แก้จุดที่โค้ดไม่ตรงเอกสาร: ตอน reopen เอกสารกำหนดให้แจ้งแผนก แต่โค้ดปัจจุบันแจ้ง Reporter (อยู่ใน UC-06 ซึ่งไม่ใช่ use case หลักของรอบนี้)
