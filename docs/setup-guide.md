# Chula Fondue — คู่มือติดตั้ง รัน หยุด และล้างข้อมูล

สำหรับสมาชิกทีมที่ clone โปรเจกต์ไปรันบนเครื่องตัวเอง โค้ดของ Progress #2 อยู่ที่ branch `feature/business-use-cases`

## 1. ต้องติดตั้งอะไรบ้าง

| โปรแกรม | ใช้ทำอะไร | หมายเหตุ |
| --- | --- | --- |
| Node.js 22.13 ขึ้นไป | รัน service ทั้ง 5 ตัว | ตรวจด้วย `node --version` |
| Docker Desktop | รัน RabbitMQ และ PostgreSQL ในเครื่อง | ต้องเปิดโปรแกรมค้างไว้ก่อนใช้คำสั่ง `docker` |
| Git (บน Windows มี Git Bash มาด้วย) | clone และรันสคริปต์ demo | |
| Postman | ยิงคำขอทดสอบและอัดคลิป | |
| DBeaver | ดูข้อมูลใน PostgreSQL | ไม่บังคับ |

ไม่ต้องติดตั้ง PostgreSQL, RabbitMQ หรือ MongoDB เอง PostgreSQL กับ RabbitMQ รันผ่าน Docker ส่วน MongoDB ใช้ตัวออนไลน์ของทีม

## 2. ไฟล์ที่ต้องสร้างเองหลัง clone

มีไฟล์เดียวคือ `.env` ที่โฟลเดอร์หลักของโปรเจกต์ ไฟล์นี้เก็บรหัสผ่าน จึงไม่อยู่ใน git ต้องสร้างเองทุกเครื่อง

วิธีสร้าง: คัดลอก `.env.example` แล้วเปลี่ยนชื่อเป็น `.env` จากนั้นกรอก 4 ค่านี้

| ค่า | กรอกอะไร | ได้มาจากไหน |
| --- | --- | --- |
| `MONGODB_URL` | ที่อยู่ของ MongoDB ของทีม | ขอจากคนที่สร้าง MongoDB ทางแชตส่วนตัว |
| `JWT_SECRET` | ข้อความสุ่มยาวอย่างน้อย 32 ตัวอักษร ใช้เซ็นกำกับบัตรผ่านตอน login | สร้างเองด้วยคำสั่งด้านล่าง |
| `ADMIN_EMAIL` | อีเมลของบัญชี Admin คนแรก | ตั้งเอง ค่าเริ่มต้น `admin@chula.ac.th` |
| `ADMIN_PASSWORD` | รหัสผ่านของ Admin อย่างน้อย 8 ตัวอักษร | ตั้งเอง |

คำสั่งสร้าง `JWT_SECRET`:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

ค่าที่เหลือใน `.env.example` (Neon, Cloudinary, RabbitMQ) ขึ้นต้นด้วย `#` คือปิดไว้ ไม่ต้องแตะ ถ้าไม่ได้เปิด ระบบจะใช้ PostgreSQL ในเครื่องและเก็บรูปไว้ในโฟลเดอร์ในเครื่อง

ข้อควรรู้:

- แต่ละคนมี PostgreSQL ของตัวเองในเครื่อง ข้อมูล ticket, แผนก และบัญชีจึงไม่แชร์กัน `JWT_SECRET` และรหัส Admin ตั้งต่างกันได้
- MongoDB เป็นตัวเดียวที่ทุกคนใช้ร่วมกัน เจ้าของต้องตั้งให้ต่อเข้าได้จากทุกที่ (ใน Atlas หน้า Network Access อนุญาต `0.0.0.0/0`) ไม่อย่างนั้นเครื่องคนอื่นจะต่อไม่ได้

## 3. ติดตั้งครั้งแรก

รันที่โฟลเดอร์หลักของโปรเจกต์ตามลำดับ

| ขั้น | คำสั่ง | ทำอะไร |
| --- | --- | --- |
| 1 | `git clone https://github.com/Pantipkub/chula-fondue.git` | ดาวน์โหลดโปรเจกต์ |
| 2 | `cd chula-fondue` แล้ว `git checkout feature/business-use-cases` | สลับไป branch ของ Progress #2 |
| 3 | `npm run install:all` | ติดตั้งชุดคำสั่งที่โค้ดใช้ ของทุก service ในครั้งเดียว |
| 4 | สร้างไฟล์ `.env` ตามหัวข้อ 2 | |
| 5 | `docker compose up -d` | เปิด RabbitMQ และ PostgreSQL ครั้งแรกจะดาวน์โหลดนานหน่อย |

## 4. วิธีรัน

```
docker compose up -d
npm run dev
```

1. `docker compose up -d` เปิด RabbitMQ และ PostgreSQL ถ้าเปิดอยู่แล้วรันซ้ำได้ ไม่มีผลเสีย
2. `npm run dev` เปิด service ทั้ง 5 ตัวในหน้าต่างเดียว รอจนเห็นคำว่า `successfully started` ครบ 5 บรรทัด
3. ตารางในฐานข้อมูลและบัญชี Admin ถูกสร้างให้เองตอน service เริ่มทำงาน

คำสั่งรันทั้งหมด:

| คำสั่ง | เปิดอะไร | ใช้เมื่อไร |
| --- | --- | --- |
| `npm run dev` | ทั้ง 5 service | ใช้งานปกติ |
| `npm run dev:no-notification` | 4 service ยกเว้น Notification Service | demo ตัวกลางส่งข้อความ (หัวข้อ 8) |
| `npm run notification` | Notification Service ตัวเดียว | ใช้คู่กับคำสั่งข้างบน ในอีกหน้าต่าง |

ห้ามเปิด `npm run dev` พร้อมกับ `npm run dev:no-notification` เพราะเป็น service ชุดเดียวกัน จะชนกันที่ช่องเดียวกัน

ที่อยู่ที่ใช้:

| อะไร | ที่อยู่ | รหัสเข้าใช้ |
| --- | --- | --- |
| API Gateway (ยิงคำขอทั้งหมดมาที่นี่) | `http://localhost:3000` | บัตรผ่านจากการ login |
| หน้าเว็บ RabbitMQ | `http://localhost:15672` | `guest` / `guest` |
| PostgreSQL (สำหรับ DBeaver) | `localhost` ช่อง `5433` | `fondue` / `fondue` |

ใน DBeaver ให้ติ๊ก Show all databases ตอนสร้างการเชื่อมต่อ จะเห็น 3 ฐานข้อมูล: `auth`, `ticket`, `department`

## 5. วิธีหยุด

| ต้องการ | ทำอย่างไร | ข้อมูล |
| --- | --- | --- |
| หยุด service | กด Ctrl+C ในหน้าต่างที่รัน `npm run dev` | ยังอยู่ |
| หยุด RabbitMQ และ PostgreSQL ชั่วคราว | `docker compose stop` | ยังอยู่ |
| ลบ container แต่เก็บข้อมูล | `docker compose down` | ยังอยู่ |
| ลบ container และข้อมูลทั้งหมด | `docker compose down -v` | หายหมด |

เปิดกลับมาใช้ `docker compose up -d` ได้ทุกกรณี

วิธีตรวจว่า service หยุดจริง: เปิด `http://localhost:3000/tickets` ในเบราว์เซอร์ ถ้าเปิดไม่ติดคือหยุดแล้ว

## 6. วิธีล้างข้อมูลเพื่อเริ่มใหม่ทั้งหมด

| ขั้น | ทำอะไร | คำสั่ง |
| --- | --- | --- |
| 1 | หยุด service | Ctrl+C ทุกหน้าต่างที่รัน service |
| 2 | ล้าง PostgreSQL และข้อความใน RabbitMQ | `docker compose down -v` แล้ว `docker compose up -d` |
| 3 | ล้างการแจ้งเตือนใน MongoDB | คำสั่งด้านล่าง |
| 4 | ลบรูปที่อัปโหลด | ลบโฟลเดอร์ `services/api-gateway/uploads` |
| 5 | เปิดระบบใหม่ | `npm run dev` |

คำสั่งล้าง MongoDB (ขั้น 3):

```
node --env-file=.env -e "const {MongoClient}=require('mongodb');const c=new MongoClient(process.env.MONGODB_URL);c.db('notification').collection('notifications').deleteMany({}).then(r=>{console.log('deleted',r.deletedCount);return c.close()})"
```

ข้อควรรู้:

- ขั้น 3 ลบการแจ้งเตือนของทุกคนในทีม เพราะ MongoDB ใช้ร่วมกัน บอกเพื่อนก่อน ถ้าไม่ล้างก็ไม่พัง แค่มีรายการเก่าค้าง
- ต้องทำขั้น 2 ก่อนขั้น 5 เพราะตารางและบัญชี Admin ถูกสร้างตอน service เริ่มทำงาน
- หลังล้างไม่ต้องสร้าง Admin เอง ระบบสร้างให้จากค่าใน `.env`
- ถ้าไม่ล้าง ก็รันทดสอบซ้ำได้ เพราะแต่ละรอบสร้างชื่อแผนกและอีเมลที่ไม่ซ้ำกัน

## 7. วิธีทดสอบ

### ผ่าน Postman

1. กด Import แล้วเลือกไฟล์ `demo-progress2/chula-fondue.postman_collection.json`
2. คลิกชื่อ collection เปิดแท็บ Variables ใส่ `adminPassword` ให้ตรงกับ `ADMIN_PASSWORD` ใน `.env` แล้วกด Save
3. กดส่งคำขอในโฟลเดอร์ `0 Setup` ตามลำดับ P1 ถึง P4
4. กดส่งคำขอในโฟลเดอร์ `1 Demo` ตามลำดับ 1 ถึง 11

สิ่งที่ต้องทำเอง:

- คำขอที่อัปโหลดรูป (ข้อ 2, ข้อ 10 และ B1) ต้องลบไฟล์เดิมในช่อง `photos` แล้วกดเลือกไฟล์ใหม่จากโฟลเดอร์ `demo-progress2/photos` หรือใช้รูปของตัวเอง ไม่อย่างนั้นจะได้ 400 ว่าไม่มีรูป
- ทำตามลำดับเลข ห้ามข้าม เพราะแต่ละคำขอเก็บค่า (บัตรผ่าน รหัส ticket รหัสแผนก) ไว้ให้คำขอถัดไปใช้

### ผ่านสคริปต์

```
bash demo-progress2/progress2-demo.sh
```

สคริปต์รันครบทั้ง login และ 3 use case แล้วบอกว่าผ่านหรือไม่ บน Windows ต้องรันใน Git Bash ถ้ารันใน PowerShell ให้ใช้:

```
& 'C:\Program Files\Git\bin\bash.exe' demo-progress2/progress2-demo.sh
```

## 8. วิธี demo ตัวกลางส่งข้อความ (RabbitMQ)

เป้าหมาย: แสดงว่าตอน Notification Service ปิดอยู่ Admin ยัง assign ได้ และข้อความรออยู่ใน RabbitMQ จนกว่า Notification Service จะกลับมา

| ขั้น | ทำอะไร | ต้องเห็น |
| --- | --- | --- |
| 1 | กด Ctrl+C ปิด `npm run dev` แล้วรัน `npm run dev:no-notification` | `successfully started` 4 บรรทัด |
| 2 | เปิด `http://localhost:15672` แท็บ Queues and Streams ดูแถว `notifications` | Consumers = 0 |
| 3 | Postman: ส่ง `B1` (เลือกรูปก่อน) แล้วส่ง `B2` | B2 ได้ 200 |
| 4 | กลับไปหน้า RabbitMQ รอ 5 วินาที | Ready = 1 |
| 5 | เปิดหน้าต่างใหม่ รัน `npm run notification` | บรรทัด `Recorded ... status=ASSIGNED` |
| 6 | ดูหน้า RabbitMQ และ MongoDB | Ready = 0 และมีรายการใหม่ใน MongoDB |

ข้อควรรู้:

- ถ้าไม่เห็นคอลัมน์ Consumers ให้กดปุ่ม `+/-` มุมขวาของตารางแล้วติ๊ก Consumer count
- `B1` แค่สร้าง ticket ยังไม่มีข้อความเข้าคิว ข้อความเกิดตอน `B2` (assign)
- ไม่ต้อง login ใหม่หลังเปิดระบบรอบสอง บัตรผ่านใน Postman ใช้ได้ 1 วัน

ข้อความเข้าคิวเมื่อไร:

| เหตุการณ์ | ข้อความเข้าคิว | แจ้งใคร |
| --- | --- | --- |
| แจ้งปัญหา, ยกเลิก | ไม่เข้า | ไม่แจ้ง |
| Admin assign | เข้า | แผนกที่รับงาน |
| เริ่มงาน, resolve, reject, confirm, reopen | เข้า | ผู้แจ้ง |

## 9. ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ | วิธีแก้ |
| --- | --- | --- |
| service ไม่ขึ้น ขึ้นข้อความ `JWT_SECRET must be set` | ไม่มีไฟล์ `.env` หรือ `JWT_SECRET` สั้นกว่า 32 ตัวอักษร | สร้าง `.env` ตามหัวข้อ 2 |
| ขึ้น `EADDRINUSE` หรือ address already in use | มี service รอบก่อนค้างอยู่ | ปิดหน้าต่าง terminal เก่าให้หมด ถ้ายังไม่หายใช้คำสั่งใต้ตารางนี้ |
| ขึ้น `ECONNREFUSED` ที่ช่อง 5433 หรือ 5672 | ยังไม่ได้เปิด Docker | เปิด Docker Desktop แล้วรัน `docker compose up -d` |
| Admin login ได้ 401 | รหัสใน Postman ไม่ตรงกับตอนที่บัญชีถูกสร้าง การแก้ `ADMIN_PASSWORD` ใน `.env` ทีหลังไม่เปลี่ยนรหัสของบัญชีที่มีอยู่แล้ว | ใช้รหัสเดิม หรือล้างข้อมูลตามหัวข้อ 6 |
| อัปโหลดรูปได้ 400 `At least one photo is required` | Postman หาไฟล์รูปไม่เจอ | ลบไฟล์ในช่อง `photos` แล้วเลือกใหม่ |
| คำขอได้ 401 `Missing bearer token` | ยังไม่ได้ login หรือตัวแปรบัตรผ่านว่าง | ส่งคำขอ login ของบทบาทนั้นก่อน |
| คำขอได้ 403 | บทบาทไม่มีสิทธิ์ทำสิ่งนั้น หรือ ticket ไม่ใช่ของตัวเองหรือของแผนกตัวเอง | ตรวจแท็บ Authorization ว่าใช้ตัวแปรบัตรผ่านถูกบทบาท |
| P3 หรือ P4 ได้ 409 | อีเมลนั้นสมัครไปแล้ว | ส่ง P2 ใหม่ก่อน จะได้เลขชุดใหม่ |
| Notification Service ขึ้น `SSL alert number 80` | MongoDB ยังไม่อนุญาตเครือข่ายของเครื่องนี้ | ให้เจ้าของ MongoDB ตั้ง Network Access เป็น `0.0.0.0/0` |
| สคริปต์ขึ้น `HTTP 000` และ `node: command not found` | รันด้วย bash ของ Windows (WSL) แทน Git Bash | ใช้คำสั่งในหัวข้อ 7 |
| DBeaver ต่อไม่ได้ | ใช้ช่อง 5432 | เปลี่ยนเป็น 5433 |
| DBeaver ไม่เห็นตาราง | ดูอยู่ในฐานข้อมูล `postgres` หรือยังไม่เคยเปิด service | ติ๊ก Show all databases แล้วเปิด `npm run dev` ก่อน จากนั้นกด F5 |
| หน้า RabbitMQ ไม่เห็น Ready = 1 | Notification Service ยังเปิดอยู่ จึงรับข้อความไปทันที | ตรวจว่า Consumers = 0 ก่อนส่ง B2 |

คำสั่งปิด service ที่ค้าง (PowerShell):

```
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*dist/main.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## 10. ข้อมูลเก็บอยู่ที่ไหน

| ที่เก็บ | เก็บอะไร | แชร์กับเพื่อนหรือไม่ |
| --- | --- | --- |
| PostgreSQL ใน Docker ฐานข้อมูล `auth` | บัญชีผู้ใช้ (รหัสผ่านเก็บแบบเข้ารหัส) | ไม่แชร์ |
| PostgreSQL ใน Docker ฐานข้อมูล `ticket` | ticket และประวัติสถานะ | ไม่แชร์ |
| PostgreSQL ใน Docker ฐานข้อมูล `department` | แผนก | ไม่แชร์ |
| MongoDB ออนไลน์ ฐานข้อมูล `notification` | รายการแจ้งเตือน | แชร์ |
| โฟลเดอร์ `services/api-gateway/uploads` | ไฟล์รูป | ไม่แชร์ |
| RabbitMQ ใน Docker | ข้อความที่รอส่งต่อ ปกติว่าง | ไม่แชร์ |

รอบนี้ยังไม่มีการส่งอีเมลจริง การแจ้งเตือนถูกบันทึกลง MongoDB อย่างเดียว
