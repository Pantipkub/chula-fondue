#!/usr/bin/env bash
# Reliability demo (N1-N6). Needs the full stack: docker compose up -d --build
# Notification Service is stopped, a ticket is assigned anyway, the event waits in RabbitMQ, and it is
# processed when Notification Service comes back. One request id joins the logs of all three services.
cd "$(dirname "$0")" || exit 1
source ./common.sh
start_evidence reliability

step "N1 Stop Notification Service (the consumer). RabbitMQ and Ticket Service keep running"
show dc stop notification-service
BEFORE=$(queue_messages)
echo "messages in the queue before: $BEFORE"

step "N2 A guest reports an issue and the Admin assigns it while nobody consumes notifications"
as "" ""
call 200 POST "$BASE/auth/guest"
as Guest "$(field .accessToken)"
upload 201 "$BASE/tickets" "category=Electrical" "location=ENG4 room 401" "description=Flickering light" \
  "contactEmail=visitor-$RUN@example.com" "photos=@$PHOTO"
TICKET=$(id)
login_admin
call 201 POST "$BASE/departments" "{\"name\":\"Electrical Team $RUN\",\"contactEmail\":\"electrical-$RUN@chula.ac.th\"}"
DEPT=$(id)
REQUEST_ID="assign-$RUN"
call_traced 200 POST "$BASE/tickets/$TICKET/assign" "{\"departmentId\":\"$DEPT\"}" "$REQUEST_ID"
check "ticket is ASSIGNED although Notification Service is down" [ "$(field .status)" = ASSIGNED ]

step "N3 The event waits in RabbitMQ"
sleep 1
WAITING=$(queue_messages)
echo "\$ docker compose exec rabbitmq rabbitmqctl list_queues name messages"
echo "-> notifications: $WAITING message(s) in the queue"
check "one more message is waiting than before" [ "$WAITING" -ge $((BEFORE + 1)) ]

step "N4 Start Notification Service again and wait until every message is processed and acknowledged"
show dc start notification-service
START=$(now_ms)
until [ "$(queue_messages)" = 0 ]; do
  [ $(($(now_ms) - START)) -gt 60000 ] && break
  sleep 1
done
DRAIN_MS=$(($(now_ms) - START))
echo "-> queue empty after ${DRAIN_MS} ms"
check "queue drained within 60 s" [ "$(queue_messages)" = 0 ]

step "N5 Notification Service recorded the event that waited"
sleep 1
echo "\$ docker compose logs notification-service | grep ticket=$TICKET"
dc logs --no-color notification-service | grep "ticket=$TICKET"
check "notification-service logged 'Recorded ... ticket=$TICKET'" \
  bash -c "cd .. && docker compose logs --no-color notification-service | grep -q 'Recorded.*ticket=$TICKET'"
MONGO=$(env_value MONGODB_URL)
echo "\$ node demo-progress2/show-notifications.js $TICKET"
MONGODB_URL=${MONGO:-mongodb://localhost:27018} node ../demo-progress2/show-notifications.js "$TICKET" 1 || FAILED=1

step "N6 One request id, followed from the gateway through Ticket Service to Notification Service"
echo "\$ docker compose logs api-gateway ticket-service notification-service | grep requestId=$REQUEST_ID"
dc logs --no-color api-gateway ticket-service notification-service | grep "requestId=$REQUEST_ID"
for service in api-gateway ticket-service notification-service; do
  check "$service logged requestId=$REQUEST_ID" \
    bash -c "cd .. && docker compose logs --no-color $service | grep -q 'requestId=$REQUEST_ID'"
done

finish
