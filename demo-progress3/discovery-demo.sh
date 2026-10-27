#!/usr/bin/env bash
# Service discovery demo (D1-D6). Needs the full stack: docker compose up -d --build
# The gateway reaches ticket-service by NAME. The ticket-service container is replaced by a new one with a
# different IP; the gateway finds it again without any configuration change or restart, and answers with a
# controlled 503 while it is gone.
cd "$(dirname "$0")" || exit 1
source ./common.sh
start_evidence discovery

show_env() { # the gateway's discovery settings, as the running container sees them
  echo "\$ docker compose exec api-gateway printenv $*"
  dc exec -T api-gateway node -e 'for (const k of process.argv.slice(1)) console.log(`${k}=${process.env[k]}`)' "$@"
}

step "D1 The system works: Admin lists tickets through the gateway"
login_admin
call 200 GET "$BASE/tickets"

step "D2 The gateway knows Ticket Service only by name; Docker DNS turns the name into the current IP"
show_env TICKET_SERVICE_URL AUTH_SERVICE_URL DEPARTMENT_SERVICE_URL
show dc exec -T api-gateway node -e "require('dns').lookup('ticket-service', (e, a) => console.log('ticket-service ->', e ? e.code : a))"
OLD_IP=$(container_ip ticket-service)
GATEWAY_STARTED=$(docker inspect -f '{{.State.StartedAt}}' "$(dc ps -q api-gateway)")
echo "ticket-service container IP: $OLD_IP"

step "D3 Remove the ticket-service container"
IMAGE=$(docker inspect -f '{{.Image}}' "$(dc ps -q ticket-service)")
show dc rm --stop --force ticket-service
# A placeholder container takes the old address, so the new ticket-service cannot get the same IP back.
# (Older Docker versions refuse --ip on networks without a configured subnet; then any free address is taken.)
HOLDER=$(docker run -d --rm --network fondue-backend --ip "$OLD_IP" --entrypoint sleep "$IMAGE" 600 2>/dev/null) ||
  HOLDER=$(docker run -d --rm --network fondue-backend --entrypoint sleep "$IMAGE" 600)
echo "placeholder container holds $(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$HOLDER")"

step "D4 While Ticket Service is gone, the gateway answers with a controlled error, never a hang"
echo "\$ curl -s -X GET $BASE/tickets -H 'Authorization: Bearer <Admin token>'"
OUT=$(curl -s -w '\n%{http_code} %{time_total}' -H "Authorization: Bearer $ADMIN" "$BASE/tickets")
echo "${OUT%$'\n'*}"
read -r CODE ELAPSED <<<"${OUT##*$'\n'}"
echo "-> HTTP $CODE after ${ELAPSED}s"
# 503 when the connection is refused at once; 504 when the old address does not answer and the 5 s deadline ends.
check "503 or 504 (got $CODE)" [ "$CODE" = 503 -o "$CODE" = 504 ]
check "answered within the 5 s gRPC deadline + 1 s" node -e "process.exit(Number(process.argv[1]) <= 6 ? 0 : 1)" "$ELAPSED"
call 503 GET "$BASE/health/ready"
check "readiness names ticket-service as down" [ "$(field ".checks['ticket-service']")" = down ]

step "D5 Start a new ticket-service container (the gateway is not touched) and time the recovery"
show dc up -d --no-deps ticket-service
START=$(now_ms)
until [ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ADMIN" "$BASE/tickets")" = 200 ]; do
  [ $(($(now_ms) - START)) -gt 90000 ] && break
  sleep 0.5
done
RECOVERY_MS=$(($(now_ms) - START))
docker rm -f "$HOLDER" >/dev/null
NEW_IP=$(container_ip ticket-service)
call 200 GET "$BASE/tickets"
echo "ticket-service IP before: $OLD_IP   after: $NEW_IP   answering again after ${RECOVERY_MS} ms"
echo "(measured from 'docker compose up' returning; includes the new container's own start-up)"
check "the container IP really changed" [ "$OLD_IP" != "$NEW_IP" ]
check "back within 30 s (proposed criterion)" [ "$RECOVERY_MS" -le 30000 ]

step "D6 Nothing was reconfigured or restarted on the gateway side"
show_env TICKET_SERVICE_URL
check "api-gateway container was not restarted" \
  [ "$(docker inspect -f '{{.State.StartedAt}}' "$(dc ps -q api-gateway)")" = "$GATEWAY_STARTED" ]
call 200 GET "$BASE/health/ready"

finish
