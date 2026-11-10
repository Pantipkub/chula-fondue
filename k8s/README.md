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

## Replica และ load balancing

| Service | Replicas | การกระจายงาน |
|---|---|---|
| ticket-service | 2 | **Headless Service** + gateway ใช้ gRPC `round_robin` และ `GRPC_MAX_CONNECTION_AGE_MS=30000` ให้ gateway resolve ใหม่ทุก 30 วิ จึงเห็น pod ที่ scale เพิ่ม worker (outbox / routing / auto-close) ใช้ `SKIP LOCKED` + lease จึงรันหลายตัวได้ปลอดภัย |
| notification-service | 2 | Competing consumers บน queue `notifications` (dedupe ด้วย `eventId`) |
| auth / department / analytics | 1 | ClusterIP กระจายตาม connection เพิ่ม replicas ได้ทันที |
| api-gateway | 1 | รูปเก็บบน volume แบบ ReadWriteOnce และ rate limit อยู่ใน memory ถ้าจะเพิ่มต้องย้ายรูปไป Cloudinary / object storage และใช้ store กลางสำหรับ rate limit |
| postgres / rabbitmq / mongo | 1 | stateful ห้าม scale แบบนี้ |

ทดลอง scale:

```sh
kubectl -n chula-fondue scale deploy/ticket-service --replicas=3
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
