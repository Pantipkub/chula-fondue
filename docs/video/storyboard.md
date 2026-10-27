# Storyboard — คลิป Service Discovery และ NFR

**ความยาวเป้าหมาย:** 4:40 นาที; ให้ซ้อมพร้อมเปลี่ยนภาพและปรับให้น้อยกว่า 5:00 ก่อนอัดจริง  
**Source of truth:** [Proposal v1.0](../proposal.pdf), [NFR report](../nfr-verification.md), run `20261027t084152z-c1ab`.  
**สถานะ:** storyboard พร้อม; ยังไม่มีคลิปจริง (`recording pending`).

| เวลา | ภาพ / การกระทำ | เสียง | ข้อความบนจอ |
| --- | --- | --- | --- |
| 0:00–0:25 | Title แล้ว architecture diagram; ไฮไลต์ Gateway, Department, Ticket | เกริ่นปัญหาและขอบเขตสาม services | `Chula Fondue — Service Discovery & NFR` |
| 0:25–1:35 | Deployment diagram; ชี้ host → Gateway และลูกศรภายใน network; สลับ terminal แสดง DNS lookup และ URL config | อธิบาย localhost เทียบกับ Compose service names; แยก DNS, readiness, reconnect | `Config เลือกชื่อ • Docker DNS resolve • Health บอก readiness` |
| 1:35–2:45 | ตาราง NFR จาก proposal แล้ว zoom แถว performance และ failure | อ่านตัวเลข p95/error และแจ้ง suite FAIL ที่ Ticket stopped ได้ 504 แทน 503 | `local test only` / `Performance: PASS` / `Stopped Ticket: FAIL (504 vs 503)` |
| 2:45–3:15 | Terminal: `docker compose ps`; `node /app/docker/discovery-demo.mjs dns` หรือ DNS evidence จาก runner | แสดง DNS lookup และสถานะ service; เตือนว่าใช้ localhost gateway port 31320 | `Same service name after recreate` |
| 3:15–3:40 | Terminal: Gateway GET routes; ภาพ snapshot ticket/history ก่อน/หลัง recreate หรือ `discovery.json` | แสดง Department/ticket/history ที่ยังอยู่ | `Persistence verified • same Gateway` |
| 3:40–4:00 | แสดง log/evidence จริงจาก `failure.json` และ findings; ไม่ต้องจำลองใหม่ระหว่างอัด | หยุด Ticket แล้ว `/tickets` ตอบ HTTP 504 ใน 3,027 ms; เกณฑ์คาด 503 | `Open finding • not a passing check` |
| 4:00–4:15 | Screenshot/table จาก report, zoom p95 and errors | อ่าน requests, p95 และ error rate; บอก 20 workers ≠ 1,000 users | `67,200 / 69,113 requests • 0% errors` |
| 4:15–4:40 | Architecture พร้อม legend + closing slide | trade-offs, open work, สรุป | `Single-host demo • capacity / uptime / HA NOT_RUN` |

## การผลิต

- ใช้ภาพ architecture/deployment จาก `docs/diagrams/*.png` และตาราง/ผลใน `docs/proposal.pdf` กับ NFR report เพื่อให้ label ตรงกับเอกสาร
- ใช้ขนาดหน้าต่าง terminal ให้อ่าน URL, status และ duration ได้; ปิด tab/notification ที่ไม่เกี่ยวข้อง และตรวจว่าไม่มี `.env`, token หรือข้อมูลส่วนบุคคลบนจอ
- ใช้ผล failure ที่บันทึกไว้เป็นหลักฐาน; ไม่จำเป็นต้องหยุด service จริงระหว่างอัด หากทำ live demo ให้ใช้ Compose project แยกและคืน Ticket ให้พร้อมก่อนจบ
- แสดง label `FAIL` ติดกับ 504-vs-503 ทุกครั้ง และอย่าตัดช่วงให้ดูเหมือนทั้ง suite ผ่าน
- ซ้อมจับเวลาพร้อม title/outro; ถ้าเกิน 5 นาทีให้ย่อช่วงสาธิต ไม่ตัดคำอธิบาย finding หรือข้อจำกัดผลวัด
