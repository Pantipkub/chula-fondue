# Fondue — หน้าเว็บ (frontend)

หน้าเว็บของระบบแจ้งซ่อม Chula Fondue ทำด้วย **React 18 + TypeScript + Vite** ใช้ react-router สำหรับเปลี่ยนหน้า และ lucide-react สำหรับไอคอน ไม่ใช้ UI library อื่น หน้าตาทำด้วย CSS ไฟล์เดียว ใช้สีตาม Figma

มีหน้าครบทุกบทบาท (ผู้เยี่ยมชม, ผู้แจ้ง, Admin, Staff) ทุกหน้าเรียก API จริงผ่าน API Gateway

> **สถานะ:** ทดสอบทั้ง flow ด้วย Playwright กับ backend ที่รันแบบ `npm run dev` แล้ว ไม่มี error
> flow ที่ทดสอบ: ผู้เยี่ยมชมแจ้ง → ติดตาม → สมัครสมาชิก → ผู้แจ้งแจ้งเรื่อง → Admin สร้างหน่วยงาน มอบหมาย ปฏิเสธ เปลี่ยนหน่วยงาน สร้างบัญชี Staff → Staff เริ่มงาน ส่งงาน → ผู้แจ้งขอแก้ไขใหม่ → Staff ส่งงานอีกรอบ → ผู้แจ้งยืนยัน (ปิดเรื่อง)

---

## 1. รันยังไง

### แบบ Docker (ใช้ตอน demo)

ต้องมี `.env` ที่ root ของโปรเจกต์ก่อน (ดู README หลัก)

```bash
docker compose up -d --build
```

- หน้าเว็บ: **http://localhost:8080**
- API Gateway: http://localhost:3000

service `frontend` ใน `docker-compose.yml` จะ build ด้วย `frontend/Dockerfile` แล้วใช้ nginx เสิร์ฟ หน้าที่ของ nginx:

- เสิร์ฟไฟล์ที่ build แล้ว
- ส่งต่อ `/api/*` ไปที่ `api-gateway:3000` โดยตัด `/api` ออก
- ส่งต่อ `/uploads/*` ไปที่ gateway ตรง ๆ

nginx ถาม Docker DNS ใหม่ทุก 5 วินาที ถ้า gateway ถูกสร้างใหม่แล้วได้ IP ใหม่ ก็ยังหาเจอ (ตรงกับ ADR-009)

### แบบพัฒนา (แก้โค้ดแล้วหน้าเว็บเปลี่ยนทันที)

เปิด backend ไว้ที่ port 3000 ก่อน จะใช้ `docker compose up -d` หรือ `npm run dev` ที่ root ก็ได้ แล้วรัน

```bash
cd frontend
npm install
npm run dev          # เปิด http://localhost:5173
```

- Vite ส่งต่อ `/api` และ `/uploads` ไปที่ `http://localhost:3000` ให้ (ตั้งค่าใน `vite.config.ts`)
- ถ้า gateway อยู่ที่อื่น ให้รัน `GATEWAY_URL=http://<host>:3000 npm run dev`
- ตรวจ type: `npm run typecheck`
- build แบบเดียวกับใน Docker: `npm run build`

### เตรียมข้อมูลตอนเริ่มครั้งแรก

1. เข้าสู่ระบบด้วย Admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` ใน `.env`)
2. ไปที่เมนู **หน่วยงาน** แล้วเพิ่มหน่วยงาน เช่น ฝ่ายไฟฟ้า หรือฝ่ายประปา ใส่ชื่ออาคารที่ดูแลด้วย จะได้ใช้แนะนำหน่วยงานตอนมอบหมาย
3. ไปที่เมนู **บัญชีเจ้าหน้าที่** แล้วสร้างบัญชี Staff ให้แต่ละหน่วยงาน
4. ผู้แจ้งสมัครเองได้ที่ `/register` ส่วนผู้เยี่ยมชมไม่ต้องมีบัญชี

---

## 2. หน้าทั้งหมด

| URL | ใครเข้าได้ | ทำอะไร | API ที่เรียก |
| --- | --- | --- | --- |
| `/` | ทุกคน | หน้าแรก | — |
| `/login`, `/register` | ทุกคน | เข้าสู่ระบบ, สมัครสมาชิก (ได้ role Reporter เสมอ) | `POST /auth/login`, `/auth/register` |
| `/report` | ผู้เยี่ยมชม, ผู้แจ้ง | แจ้งปัญหา: หมวด, รายละเอียด, สถานที่, รูป 1–5 รูป (ผู้เยี่ยมชมต้องกรอกอีเมลติดต่อ) | `POST /auth/guest` (ถ้ายังไม่ล็อกอิน), `POST /tickets` |
| `/report/done/:id` | ผู้เยี่ยมชม, ผู้แจ้ง | ส่งเรื่องสำเร็จ แสดงเลขที่เรื่องพร้อมปุ่มคัดลอก | — |
| `/track`, `/track/:id` | ทุกคน | ติดตามสถานะด้วยเลขที่เรื่อง (UUID เต็ม) | `GET /tickets/:id/history` |
| `/my` | ผู้แจ้ง | เรื่องของฉัน: แท็บแยกสถานะ, ค้นหา, ปุ่มยืนยันผลบนการ์ด | `GET /tickets?includeCancelled=true`, `POST /tickets/:id/confirm` |
| `/tickets/:id` | ผู้แจ้ง (เจ้าของเรื่อง) | รายละเอียด: ยกเลิก (ตอน SUBMITTED), ยืนยันผล / ขอแก้ไขใหม่ (ตอน RESOLVED) | `DELETE /tickets/:id`, `/confirm`, `/reopen` |
| `/admin` | Admin | กล่องเรื่องเข้า: ตัวเลขสรุป, แท็บสถานะ, กรองหน่วยงาน, ตาราง | `GET /tickets`, `GET /departments` |
| `/admin/tickets/:id` | Admin | มอบหมายงาน (ระบบแนะนำหน่วยงาน), ปฏิเสธพร้อมเหตุผล, เปลี่ยนหน่วยงาน (ตอน ASSIGNED) | `/assign`, `/reject` |
| `/admin/departments` | Admin | เพิ่ม แก้ไข ลบหน่วยงาน (UC-08) | `GET/POST/PUT/DELETE /departments` |
| `/admin/users` | Admin | สร้างบัญชี Staff หรือ Admin | `POST /auth/users` |
| `/admin/analytics` | Admin | รายงานวิเคราะห์ (UC-07 · **Planned**) | `GET /tickets` |
| `/staff` | Staff | คิวงานของหน่วยงาน 3 คอลัมน์ พร้อมปุ่มเริ่มงาน | `GET /tickets`, `/start` |
| `/staff/tickets/:id` | Staff | เริ่มงาน, ส่งงานพร้อมรูปหลังแก้ไข 1–5 รูป | `/start`, `/resolve` |

หลังเข้าสู่ระบบ ระบบจะพาไปหน้าตาม role: Admin → `/admin`, Staff → `/staff`, Reporter → `/my`
ถ้าเข้าหน้าที่ role ตัวเองไม่มีสิทธิ์ `RequireRole` จะส่งกลับไปหน้าที่ควรอยู่

---

## 3. โครงสร้างไฟล์

```
frontend/
├─ Dockerfile, nginx.conf     # build แล้วใช้ nginx เสิร์ฟ + proxy /api และ /uploads
├─ vite.config.ts             # proxy ตอน dev
├─ index.html                 # โหลดฟอนต์ Anuphan + IBM Plex Sans Thai
└─ src/
   ├─ App.tsx                 # route ทั้งหมด
   ├─ styles.css              # design token (สี, เงา, มุมโค้ง) + class ทั้งหมด + responsive
   ├─ lib/
   │  ├─ api.ts               # fetch wrapper, type ของ Ticket/Department, Api.* ทุก endpoint, แปลง error เป็นไทย
   │  ├─ auth.tsx             # AuthProvider / useAuth: เก็บ token, อ่าน role จาก JWT, ensureToken() ขอ token ผู้เยี่ยมชม
   │  └─ format.ts            # ชื่อสถานะภาษาไทย, หมวด, shortId, วันที่, แปลง history เป็นข้อความไทย, แนะนำหน่วยงาน
   ├─ components/
   │  ├─ ui.tsx               # Button, Badge, Input/Select/Textarea, Modal, Drawer, Toast, PhotoPicker, Gallery,
   │  │                       # Timeline, VSteps/HSteps, Empty, Skeleton, useLoad
   │  └─ layouts.tsx          # TopNav (ผู้เยี่ยมชม/ผู้แจ้ง), AppShell (sidebar ของ Admin/Staff), RequireRole, PageHead, Crumb
   └─ pages/
      ├─ public.tsx           # Landing, Login, Register, Track
      ├─ reporter.tsx         # ReportForm, ReportDone, MyTickets, TicketDetail (+ Kpi, TicketCard, KV ที่หน้าอื่นใช้ร่วม)
      ├─ admin.tsx            # Inbox, Review, Departments, Users, Analytics
      └─ staff.tsx            # Queue, Work
```

---

## 4. ต่อกับ backend ยังไง

- **เรียกผ่าน `/api` เสมอ:** gateway ไม่เปิด CORS ถ้าเรียก `http://localhost:3000` ตรงจาก browser จะโดนบล็อก ให้ใช้ `Api.xxx()` ใน `lib/api.ts` ซึ่งเติม `/api` และ header `Authorization` ให้
- **token:**
  - เก็บใน `localStorage` (key `fondue.token`)
  - หน้าเว็บอ่าน role, email และ departmentId จาก JWT เพื่อเลือกเมนู แต่การตรวจสิทธิ์จริงอยู่ที่ gateway
  - token หมดอายุ (1 วัน) หรือ API ตอบ 401 → ออกจากระบบอัตโนมัติ
- **ผู้เยี่ยมชม:** `ensureToken()` เรียก `POST /auth/guest` ให้เองเมื่อยังไม่ได้ล็อกอิน ตอนส่งเรื่องต้องแนบ `contactEmail` (gateway บังคับ)
- **error:** `friendly()` ใน `api.ts` แปลงเป็นข้อความไทย
  - 503 → "ระบบบางส่วนไม่พร้อมใช้งานชั่วคราว"
  - 504 → "ระบบตอบช้าเกินไป"
  - 409 → สถานะเปลี่ยนไปแล้ว
  - ข้อความ validation ที่พบบ่อยก็แปลงด้วย
- **โหลดข้อมูล:** ใช้ `useLoad(() => Api.xxx(), [deps])` ได้ `{ data, error, loading, reload }` กลับมา

---

## 5. Design system

ตรงกับไฟล์ Figma (หน้า "Chula Fondue — UI")

- **สี:** ตัวแปร CSS อยู่บนสุดของ `styles.css`
  - ชมพูหลัก `--pink-600` (#A85565)
  - ครีม `--cream-*`, เสจ `--sage-*`, ม่วงอ่อน `--lilac-*`
  - ตัวอักษร `--ink-900`, ตัวอักษรรอง `--ink-600`
- **สีของสถานะ:** class `tone-honey | pink | lilac | sage | gray | red | muted` ใช้ได้กับ badge, note และ bubble
- **ฟอนต์:** หัวข้อใช้ Anuphan, เนื้อหาใช้ IBM Plex Sans Thai (โหลดจาก Google Fonts ใน `index.html`)
- **ปุ่ม:** `<Button kind="primary | secondary | outline | ghost | danger | success" icon="check" sm block busy>`
- **ไอคอน:** `<Icon name="..." />` ชื่อที่ใช้ได้อยู่ใน `ICONS` ใน `ui.tsx` ถ้าจะเพิ่มต้อง import จาก lucide-react มาใส่ในตารางนั้น
- **responsive:**
  - จอต่ำกว่า 1100px: เหลือ 1 คอลัมน์
  - ต่ำกว่า 900px: sidebar กลายเป็นแถบด้านบน
  - ต่ำกว่า 640px: ขนาดมือถือ

---

## 6. จะเพิ่มหน้าใหม่ทำยังไง

1. เขียน component ใน `pages/` ไฟล์ที่ตรงกับ role
2. ถ้าต้องเรียก endpoint ใหม่ ให้เพิ่มใน `Api` ใน `lib/api.ts`
3. เพิ่ม `<Route>` ใน `App.tsx`
   - หน้าของ Admin/Staff ให้ใส่เป็น route ลูกของ `/admin` หรือ `/staff` จะได้ sidebar อัตโนมัติ
   - หน้าที่ต้องล็อกอินให้ครอบด้วย `RequireRole`
4. ถ้าเป็นเมนูใน sidebar ให้เพิ่มใน `MENUS` ใน `layouts.tsx`
5. รัน `npm run typecheck` และ `npm run build` ก่อน commit

---

## 7. ข้อควรรู้และข้อจำกัด

- **เลขที่เรื่องเป็น UUID:**
  - หน้าเว็บแสดงแค่ 8 ตัวแรก เช่น `#3F9A2C1E` แต่หน้าติดตามต้องใช้เลขเต็ม 36 ตัว
  - หน้าส่งเรื่องสำเร็จมีปุ่มคัดลอกเลขเต็ม
  - เบราว์เซอร์จำเรื่องที่ผู้เยี่ยมชมเคยแจ้งไว้ (`fondue.recentTickets`)
- **ผู้เยี่ยมชมสมัครทีหลังได้:** ถ้าสมัครด้วยอีเมลเดียวกับที่กรอกตอนแจ้ง เรื่องเดิมจะขึ้นใน "เรื่องของฉัน" และยืนยันผลได้ เพราะ backend จับคู่เรื่องกับผู้แจ้งด้วยอีเมล
- **หมวดปัญหา:** เก็บเป็นภาษาอังกฤษ (`Electrical`, `Plumbing`, …) เพื่อให้ตรงกับ demo script แต่แสดงเป็นไทย ดู `CATEGORIES` ใน `format.ts`
- **สถานที่:** API มีช่องเดียว (`location`) หน้าเว็บเลยเอา "อาคาร · ชั้น/ห้อง" มารวมกันเป็นข้อความเดียว
- **การแนะนำหน่วยงาน:** ดูว่าชื่ออาคารของหน่วยงานไหนอยู่ในข้อความ `location` เป็นแค่คำแนะนำ Admin เลือกเองได้
- **หน้าบัญชีเจ้าหน้าที่:** API ยังไม่มีคำสั่งดึงรายชื่อบัญชีทั้งหมด หน้านี้จึงแสดงเฉพาะบัญชีที่สร้างในหน้านั้น
- **รายงานวิเคราะห์ (UC-07):** ยังไม่มี backend
  - หน้าเว็บคำนวณจาก `GET /tickets` ในเบราว์เซอร์
  - MTTR เป็นค่าประมาณจาก `updatedAt - createdAt`
  - ติดป้าย PLANNED ไว้แล้ว
- **รูปถ่าย:** gateway ส่งลิงก์เต็มกลับมาเป็น `http://localhost:3000/uploads/...` (ตามค่า `GATEWAY_PUBLIC_URL`)
  - เปิดเว็บจากเครื่องอื่นในวง LAN แล้วรูปจะไม่ขึ้น
  - แก้: ตั้ง `GATEWAY_PUBLIC_URL` ใน compose ให้เป็น IP ของเครื่องที่รัน
  - ถ้าใช้ `CLOUDINARY_URL` จะไม่มีปัญหานี้

---

## 8. แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
| --- | --- |
| หน้าเว็บขึ้น "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" | backend ไม่ได้รัน หรือ gateway ไม่อยู่ที่ port 3000 ลอง `curl localhost:3000/health/ready` |
| ขึ้น "ระบบบางส่วนไม่พร้อมใช้งานชั่วคราว" (503) | service ข้างหลังบางตัวล่ม ดู `docker compose ps` แล้วรอให้ขึ้น healthy |
| เข้าสู่ระบบแล้วถูกเด้งออก | token หมดอายุ หรือ `JWT_SECRET` เปลี่ยน ให้เข้าสู่ระบบใหม่ |
| `docker compose` build frontend แล้วขึ้น `Cannot find name 'process'` | `tsconfig.json` ต้องมี `"include": ["src"]` เท่านั้น อย่าใส่ `vite.config.ts` |
| เปลี่ยนโค้ดแล้วหน้าใน Docker ไม่เปลี่ยน | ต้อง build ใหม่: `docker compose up -d --build frontend` |
| Admin มอบหมายไม่ได้ เพราะไม่มีตัวเลือก | ยังไม่มีหน่วยงาน ให้เพิ่มที่เมนูหน่วยงานก่อน |
