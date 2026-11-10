# -*- mode: Python -*-
# Chula Fondue on Kubernetes for local development (Docker Desktop Kubernetes).
#
#   tilt up                          build every image, deploy k8s/, port-forward, seed demo data
#   tilt up -- --env-file=.env       read secrets from another env file (default: .env.demo)
#   tilt down                        remove the app; database volumes and uploaded photos are kept
#
# Open http://localhost:10350 for the Tilt UI. Saving a file under services/<name>/src rebuilds and
# redeploys only that service. Ports are chosen so Compose (8080/3000, demo 3100) can run at the same time.

config.define_string('env-file', usage='env file with JWT_SECRET, ADMIN_* and optional EMAIL/GMAIL settings')
cfg = config.parse()
ENV_FILE = cfg.get('env-file', '.env.demo')

# Docker Desktop builds images into the same Docker engine the cluster uses, so no registry is needed.
allow_k8s_contexts('docker-desktop')
if k8s_context() != 'docker-desktop':
    warn('Kubernetes context is "%s"; this Tiltfile is tested with docker-desktop.' % k8s_context())

update_settings(max_parallel_updates=3, k8s_upsert_timeout_secs=180)

# ---------------------------------------------------------------- secrets
# The same values Compose reads from .env / .env.demo. Only these keys are copied into the cluster:
# database, broker and service addresses are fixed in the manifests (Kubernetes Service names).
SECRET_KEYS = [
    'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'EMAIL_MODE', 'AUTO_ROUTING_ENABLED', 'AUTH_RATE_LIMIT',
    'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM', 'CLOUDINARY_URL',
]

def read_env(path):
    """Parses KEY=value lines like Docker Compose: # comments, quotes, and ` # comment` after a plain value."""
    text = str(read_file(path, default=''))
    if not text:
        fail('%s not found. Run `npm run setup:demo` first, or pass `tilt up -- --env-file=<file>`.' % path)
    values = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if key.startswith('export '):
            key = key[len('export '):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ['"', "'"]:
            value = value[1:-1]
        elif ' #' in value:
            value = value.split(' #', 1)[0].strip()
        values[key] = value
    return values

env = read_env(ENV_FILE)
missing = [key for key in ['JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'] if not env.get(key)]
if missing:
    fail('%s is missing %s' % (ENV_FILE, ', '.join(missing)))
if len(env['JWT_SECRET']) < 32:
    fail('JWT_SECRET in %s must be at least 32 characters' % ENV_FILE)

k8s_yaml(encode_yaml({
    'apiVersion': 'v1',
    'kind': 'Secret',
    'metadata': {'name': 'fondue-secrets', 'namespace': 'chula-fondue'},
    'type': 'Opaque',
    'stringData': {key: env[key] for key in SECRET_KEYS if env.get(key)},
}))

# ---------------------------------------------------------------- manifests
k8s_yaml(kustomize('k8s'))

# ---------------------------------------------------------------- images
# Image names match the ones `docker compose build` creates, so k8s/ also works without Tilt.
SERVICES = ['auth-service', 'department-service', 'ticket-service', 'notification-service', 'analytics-service', 'api-gateway']
BACKEND_CONTEXT = ['package.json', 'package-lock.json', 'tsconfig.base.json', 'services', 'frontend/package.json', 'proto', 'docker']

for service in SERVICES:
    # A change in another service's source must not rebuild this image.
    others = ['services/%s/src' % other for other in SERVICES if other != service]
    docker_build(
        'chula-fondue-' + service, '.',
        dockerfile='docker/Dockerfile',
        build_args={'SERVICE': service},
        only=BACKEND_CONTEXT,
        ignore=others + ['**/node_modules', '**/dist'],
    )

docker_build(
    'chula-fondue-frontend', '.',
    dockerfile='frontend/Dockerfile',
    only=['package.json', 'package-lock.json', 'services', 'frontend'],
    ignore=['services/*/src', '**/node_modules', '**/dist'],
)

# ---------------------------------------------------------------- resources in the Tilt UI
k8s_resource(new_name='config', objects=['chula-fondue:namespace', 'fondue-secrets:secret'], labels=['infra'])
k8s_resource('postgres', objects=['postgres-init:configmap'], resource_deps=['config'], labels=['infra'],
             port_forwards=['5436:5432'])
k8s_resource('rabbitmq', resource_deps=['config'], labels=['infra'],
             port_forwards=['15675:15672'], links=[link('http://localhost:15675', 'RabbitMQ UI (guest / guest)')])
k8s_resource('mongo', resource_deps=['config'], labels=['infra'])

k8s_resource('auth-service', resource_deps=['postgres'], labels=['backend'])
k8s_resource('department-service', resource_deps=['postgres'], labels=['backend'])
k8s_resource('ticket-service', resource_deps=['postgres', 'rabbitmq'], labels=['backend'])
k8s_resource('notification-service', resource_deps=['rabbitmq', 'mongo'], labels=['backend'])
k8s_resource('analytics-service', resource_deps=['postgres', 'rabbitmq'], labels=['backend'])
k8s_resource('api-gateway', objects=['api-gateway-uploads:persistentvolumeclaim'],
             resource_deps=['auth-service', 'department-service', 'ticket-service'], labels=['backend'],
             port_forwards=['3200:3000'], links=[link('http://localhost:3200/health/ready', 'Gateway readiness')])
k8s_resource('frontend', objects=['frontend-nginx:configmap'], resource_deps=['api-gateway'], labels=['frontend'],
             port_forwards=['8090:80'], links=[link('http://localhost:8090', 'Chula Fondue')])

# Departments, routing rules and demo accounts through the public API (idempotent; rerun from the UI).
local_resource(
    'seed-demo',
    cmd='for i in 1 2 3 4 5 6; do node --env-file=%s scripts/seed-demo.mjs && exit 0; sleep 5; done; exit 1' % ENV_FILE,
    env={'API_URL': 'http://localhost:3200'},
    resource_deps=['api-gateway', 'notification-service', 'analytics-service'],
    labels=['tools'],
)
