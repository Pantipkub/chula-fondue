#!/usr/bin/env bash
# Performance test (P1): 50 virtual users for 60 s on GET /tickets/:id/history through the gateway.
# Uses k6 if it is installed (brew install k6 / winget install k6), otherwise the grafana/k6 Docker image.
# Saves the console output and a JSON summary under demo-progress3/evidence/.
#   bash demo-progress3/perf-test.sh                 # defaults
#   VUS=100 DURATION=120s bash demo-progress3/perf-test.sh
cd "$(dirname "$0")" || exit 1
source ./common.sh
start_evidence perf
SUMMARY="${EVIDENCE%.log}-summary.json"

step "P0 Test environment (record it with the results)"
echo "Machine: $(uname -srm)   CPUs: $(getconf _NPROCESSORS_ONLN 2>/dev/null)"
echo "Target: $BASE   Virtual users: ${VUS:-50}   Steady phase: ${DURATION:-60s} after a 15 s warm-up"
docker version --format 'Docker {{.Server.Version}}' 2>/dev/null
dc ps --format '{{.Service}}: {{.Status}}' 2>/dev/null
echo "Tickets in the database before the test: $(dc exec -T postgres psql -U fondue -d ticket -tAc 'select count(*) from ticket' 2>/dev/null || echo unknown)"

step "P1 k6 run perf/ticket-history.k6.js"
cd .. || exit 1
if command -v k6 >/dev/null; then
  k6 run -e BASE_URL="$BASE" -e VUS="${VUS:-50}" -e DURATION="${DURATION:-60s}" \
    --summary-export="demo-progress3/$SUMMARY" perf/ticket-history.k6.js
else
  # Inside the Docker network the gateway is http://api-gateway:3000.
  # Git Bash on Windows rewrites paths like /work; MSYS_NO_PATHCONV stops that and pwd -W gives C:/... for -v.
  HOST_DIR=$(pwd -W 2>/dev/null || pwd)
  MSYS_NO_PATHCONV=1 docker run --rm -i --network fondue-backend -v "$HOST_DIR:/work" -w /work grafana/k6:1.8.2 run \
    -e BASE_URL="${K6_BASE_URL:-http://api-gateway:3000}" -e VUS="${VUS:-50}" -e DURATION="${DURATION:-60s}" \
    --summary-export="demo-progress3/$SUMMARY" perf/ticket-history.k6.js
fi
STATUS=$?
cd demo-progress3 || exit 1
[ "$STATUS" = 0 ] || FAILED=1
echo
echo "k6 exit code $STATUS (99 = a threshold failed)"
finish
