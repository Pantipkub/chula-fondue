# สคริปต์คลิปภาษาไทย — Service Discovery และ NFR

**เป้าหมายเวลา:** ประมาณ 4:40 นาที รวม title/outro เมื่ออ่านด้วยจังหวะปกติและเว้นช่วงเปลี่ยนภาพสั้น ๆ  
**สถานะ:** สคริปต์พร้อมอัด; ยังไม่มีไฟล์บันทึกคลิป (`recording pending`)  
**แหล่งข้อเท็จจริง:** proposal v1.0 ลงวันที่ 27 ต.ค. 2026 และผล NFR รอบ `20261027t084152z-c1ab`

## 0:00–0:25 — ปัญหาและขอบเขต

สวัสดีครับ คลิปนี้สรุปความคืบหน้าของ Chula Fondue ในเรื่อง Service Discovery และ Non-Functional Requirements หรือ NFR ระบบต้นแบบมี API Gateway, Department Service และ Ticket Service ทำงานเป็นสาม service แยกกัน รอบนี้เราจะดูว่า service ติดต่อกันอย่างไร และมีหลักฐานอะไรยืนยันคุณภาพการทำงานบ้าง

## 0:25–1:35 — Service Discovery

ในเครื่องนักพัฒนา เราตั้ง address ผ่าน environment variable เช่น Gateway เรียก Department ที่ localhost พอรันด้วย Docker Compose แต่ละ container อยู่ใน network เดียวกัน และเรียกกันด้วยชื่อ service เช่น `department-service:3001` หรือ `ticket-service:50051` Docker DNS แปลงชื่อนี้เป็น address ที่ container ติดต่อได้ ส่วนผู้ใช้ภายนอกเรียกผ่าน Gateway ที่ port ซึ่ง publish ไว้

การตั้งค่า address, DNS, health check และการ reconnect เป็นคนละหน้าที่กัน ชื่อ service ช่วยให้ caller ใช้ชื่อเดิมหลัง container ถูกสร้างใหม่ โดยไม่ต้องแก้ URL ส่วน readiness บอกว่า service พร้อมรับงานหรือไม่ และ client ต้องจัดการการเชื่อมต่อใหม่เมื่อปลายทางเปลี่ยน

หลักฐานของทีมคือการ resolve ชื่อจากใน Gateway, เรียก API ผ่าน Gateway และ recreate Department กับ Ticket แล้วอ่านข้อมูลและ history เดิมกลับมาได้ผ่าน Gateway เดิม ในการทดสอบนี้ Docker ใช้ IP เดิมซ้ำได้ ดังนั้นข้อสรุปคือเรียกผ่านชื่อเดิมและข้อมูลยังอยู่ ไม่ใช่พิสูจน์ว่า IP เปลี่ยน หรือมี high availability ระบบนี้เป็น local Compose บนเครื่องเดียว

## 1:35–2:45 — NFR และผลที่วัด

รอบนี้วัด GET `/tickets` และประวัติ ticket แยกกัน ใช้ข้อมูล 100 tickets, warm-up 10 วินาที, worker แบบ closed-loop 20 ตัว และวัด 60 วินาทีต่อ endpoint ผล `/tickets` มี p95 27.68 มิลลิวินาที และ error ศูนย์เปอร์เซ็นต์ ส่วน history มี p95 23.37 มิลลิวินาที และ error ศูนย์เปอร์เซ็นต์ ทั้งสอง endpoint ผ่านเกณฑ์ชั่วคราว p95 ต่ำกว่าหนึ่งวินาที และ error ต่ำกว่าหนึ่งเปอร์เซ็นต์ ใน workload รอบนี้

แต่ผลรวมของ verification suite ยังเป็น FAIL หนึ่งกรณี เมื่อหยุด Ticket Service แล้ว Gateway ตอบ `/tickets` เป็น HTTP 504 หลังประมาณ 3.03 วินาที ขณะที่เกณฑ์คาด 503 กรณีนี้เกิดซ้ำและยังเปิดอยู่ เราไม่สรุปสาเหตุ transport เกินกว่าหลักฐาน และไม่ปรับเกณฑ์เพื่อเปลี่ยน FAIL เป็น PASS

การวัดนี้ทำบน Docker เครื่องเดียว ใช้ SQLite และมี workload อื่นใช้ทรัพยากรร่วม จึงไม่ยืนยันผู้ใช้พร้อมกัน 1,000 คน, uptime 99.5 เปอร์เซ็นต์, cloud HA หรือผล production

## 2:45–4:15 — Demo

เริ่มจากหน้าจอ Compose และแผนภาพ deployment: Gateway เปิดให้ host เรียก ส่วน Department และ Ticket ติดต่อกันภายใน network ด้วยชื่อ service

จากใน Gateway เรา resolve `department-service` และ `ticket-service` แล้วเรียก `/departments` และ `/tickets` ผ่าน port 31320 ตัวอย่าง fixture ของรอบ NFR แสดง Department, ticket และ history ก่อนและหลัง recreate โดยข้อมูลยังตรงกัน ชื่อ DNS ยังคงใช้ได้ ไม่ต้องเปลี่ยน URL

ต่อไปดู failure ที่บันทึกไว้จริง: เมื่อหยุด Ticket, readiness ของ Gateway เป็น 503 แต่ request `/tickets` จบเป็น 504 ใน 3,027 มิลลิวินาที นี่คือกรณี FAIL ที่เราส่งให้ตรวจต่อ ไม่ใช่ผล PASS ของชุดทดสอบ

ผลด้าน performance มาจาก evidence CSV และ JSON: tickets list 67,200 requests, history 69,113 requests, ทั้งคู่ error ศูนย์และผ่าน p95 ตามเป้าหมายรอบนี้ การทดสอบยังคืน service ให้ทำงานและ readiness กลับมา ก่อนปิด Compose โดยเก็บ volumes ไว้

## 4:15–4:40 — Trade-offs และงานต่อ

สรุปคือ Compose DNS กับ volume ช่วยสาธิต discovery และ persistence ในเครื่องเดียว ส่วน health, deadlines และ request ID ช่วยตรวจ failure และตาม request ได้ งานต่อคือวิเคราะห์กรณี Ticket stopped ที่ตอบ 504, และทดสอบ capacity, uptime, security และ deployment จริงเพิ่มเติม สไลด์ข้อเสนอมี ADR, architecture และข้อจำกัดครบ คลิปนี้จึงรายงานทั้งสิ่งที่ทำได้และสิ่งที่ยังไม่มีหลักฐานครับ
