# Chula Fondue บน Kubernetes (dev ด้วย Tilt)

ระบบชุดเดียวกับ `docker-compose.yml` แต่รันบน Kubernetes ของ Docker Desktop โดยใช้ [Tilt](https://tilt.dev) build, deploy และ rebuild อัตโนมัติเมื่อแก้โค้ด Compose เดิมยังใช้ได้ตามปกติ

## เตรียมเครื่อง (ครั้งเดียว)

1. Docker Desktop → **Settings → Kubernetes → Enable Kubernetes** → Apply & restart
2. ติดตั้ง Tilt: `brew install tilt-dev/tap/tilt`
3. ตรวจ context: `kubectl config use-context docker-desktop`
4. มี `.env.demo` แล้ว (ถ้ายังไม่มี: `npm run setup:demo`)

## รัน

```sh
tilt up                       # เปิด Tilt UI ที่ http://localhost:10350
tilt up -- --env-file=.env    # ใช้ env file อื่น
tilt down                     # ลบแอป เก็บ volume ของ PostgreSQL / RabbitMQ / MongoDB / รูปไว้
```

| ที่อยู่ | ใช้ทำอะไร |
|---|---|
| http://localhost:8090 | เว็บ (Compose ใช้ 8080 จึงเปิดพร้อมกันได้) |
| http://localhost:3200 | API Gateway (`API_URL` สำหรับสคริปต์และเทสต์) |
| http://localhost:15675 | RabbitMQ UI (guest / guest) |
| localhost:5436 | PostgreSQL (fondue / fondue) |

`seed-demo` ใน Tilt UI สร้างหน่วยงาน กฎส่งต่อ และบัญชี demo ให้อัตโนมัติ (รหัส `FondueDemo!2026`) กดรันซ้ำได้

ค่าลับ (`JWT_SECRET`, `ADMIN_*`, `EMAIL_MODE`, `AUTO_ROUTING_ENABLED`, `GMAIL_*`, `CLOUDINARY_URL`) อ่านจาก env file แล้วสร้างเป็น Secret `fondue-secrets` หลังแก้ env file ให้กด restart service ที่เกี่ยวข้องใน Tilt UI เพราะ pod ไม่ reload Secret เอง

## Compose → Kubernetes

| Compose | Kubernetes |
|---|---|
| Docker embedded DNS (`auth-service:3002`) | Service DNS ชื่อเดิม โค้ดไม่ต้องแก้ |
| `healthcheck` + `depends_on` | `startupProbe` / `readinessProbe` / `livenessProbe` + `resource_deps` ใน Tilt |
| named volume | PersistentVolumeClaim (StatefulSet สำหรับ postgres / rabbitmq / mongo) |
| `.env` / `env_file` | Secret `fondue-secrets` (envFrom) ส่วนที่อยู่ service อยู่ใน `env` ซึ่งมีลำดับสูงกว่า |
| `rabbitmq-volume-init` | initContainer |
| `frontend/nginx.conf` (resolver 127.0.0.11) | ConfigMap `frontend-nginx` ชี้ Service `api-gateway` |

Readiness ผูกกับ discovery: pod ที่ `/health/ready` ไม่ผ่านจะถูกถอดออกจาก Service อัตโนมัติ (Compose DNS ทำไม่ได้)

## Replica, autoscaling และ load balancing

| Service | Replicas | การกระจายงาน |
|---|---|---|
| ticket-service | **HPA 2–5** | **Headless Service** + gateway ใช้ gRPC `round_robin` และ `GRPC_MAX_CONNECTION_AGE_MS=30000` ให้ gateway resolve ใหม่ทุก 30 วิ จึงเห็น pod ที่เพิ่มขึ้น worker (outbox / routing / auto-close) ใช้ `SKIP LOCKED` + lease จึงรันหลายตัวได้ปลอดภัย |
| notification-service | **HPA 2–4** | Competing consumers บน queue `notifications` (dedupe ด้วย `eventId`) |
| auth-service | **HPA 1–4** | ClusterIP กระจายตาม connection (scrypt ทำให้ login กิน CPU) |
| department / analytics | 1 | ClusterIP กระจายตาม connection เพิ่ม replicas ได้ทันที |
| api-gateway | 1 | รูปเก็บบน volume แบบ ReadWriteOnce และ rate limit อยู่ใน memory ถ้าจะเพิ่มต้องย้ายรูปไป Cloudinary / object storage และใช้ store กลางสำหรับ rate limit |
| postgres / rabbitmq / mongo | 1 | stateful ห้าม scale แบบนี้ |

### Conditional scaling (HorizontalPodAutoscaler)

`k8s/autoscaling.yaml` เพิ่ม pod เมื่อ **CPU เฉลี่ยเกิน 70% ของ `requests.cpu`** และลดลงเมื่อ load ต่ำต่อเนื่อง 60 วินาที

- Scale up: ทันที เพิ่มได้ครั้งละ 1–2 pod ทุก 15 วิ
- Scale down: รอ 60 วิ แล้วลดครั้งละ 1 pod ทุก 30 วิ (กันจำนวน pod แกว่ง)
- Deployment ที่มี HPA **ไม่มีฟิลด์ `replicas`** เพื่อให้ HPA เป็นคนคุมจำนวน ถ้าใส่ไว้ ทุกครั้งที่ Tilt apply ใหม่ จำนวนจะถูกรีเซ็ต
- ต้องมี **metrics-server**: Tilt ติดตั้งให้ใน resource `metrics-server` (v0.7.2 + `--kubelet-insecure-tls` สำหรับ Docker Desktop)

Demo:

```sh
kubectl -n chula-fondue get hpa -w          # terminal 1: ดู TARGETS กับ REPLICAS เปลี่ยน
```

แจ้งเรื่องบนเว็บอย่างน้อย 1 เรื่อง แล้วกด ▶ ที่ resource **`load-test`** ใน Tilt UI (50 clients อ่าน history 2 นาที) ภายในราว 30 วินาที ticket-service ควรเพิ่มจาก 2 pod ขึ้นไป และหลังหยุดยิงราว 1–2 นาทีจะลดกลับเป็น 2

ถ้า `TARGETS` ขึ้น `<unknown>` แปลว่า metrics-server ยังไม่พร้อม: `kubectl top pods -n chula-fondue` ต้องได้ตัวเลข (รอ 1–2 นาทีหลังติดตั้ง)

ข้อจำกัด: ทุก pod อยู่บนเครื่องเดียว CPU ชุดเดียวกัน จำนวน pod เพิ่มให้เห็นได้ แต่ throughput ไม่ได้เพิ่มตามจำนวน pod เท่ากับ cluster หลายเครื่อง และ load ผ่าน port-forward ของ Tilt ซึ่งรับได้จำกัด

ปรับจำนวนเองได้ชั่วคราว (HPA จะปรับกลับให้อยู่ในช่วง min–max):

```sh
kubectl -n chula-fondue get endpointslices -l kubernetes.io/service-name=ticket-service   # รายชื่อ pod ที่พร้อม
kubectl -n chula-fondue logs -l app=ticket-service --prefix -f | grep " ok "              # ดูว่า RPC กระจายไปทุก pod
```

## ไม่ใช้ Tilt

```sh
docker compose build                                   # สร้าง image ชื่อ chula-fondue-<service>
kubectl apply -f k8s/namespace.yaml
grep -E '^(JWT_SECRET|ADMIN_EMAIL|ADMIN_PASSWORD|EMAIL_MODE|AUTO_ROUTING_ENABLED|GMAIL_[A-Z_]+)=' .env.demo \
  | sed 's/ #.*//' > /tmp/fondue.env
kubectl -n chula-fondue create secret generic fondue-secrets --from-env-file=/tmp/fondue.env && rm /tmp/fondue.env
kubectl apply -k k8s
kubectl -n chula-fondue port-forward svc/frontend 8090:80
```

ลบทั้งหมดรวมข้อมูล: `kubectl delete namespace chula-fondue`

## ข้อจำกัด

- ทดสอบสำหรับ Docker Desktop Kubernetes เครื่องเดียว ถ้าเป็น cluster หลายเครื่องต้องมี image registry และ storage ที่ใช้ข้ามเครื่องได้
- รหัส PostgreSQL / RabbitMQ เป็นค่า dev เดียวกับ Compose ห้ามใช้กับระบบจริง
- ยังใช้ TypeORM `synchronize: true` เหมือน Compose
- สคริปต์ `test:recovery` / `test:routing:recovery` สั่ง Docker Compose โดยตรง ใช้กับ cluster นี้ไม่ได้
