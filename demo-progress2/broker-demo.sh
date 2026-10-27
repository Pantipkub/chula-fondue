#!/usr/bin/env bash
# Message broker demo: a ticket is assigned and the script shows how many messages are waiting in
# RabbitMQ. Run it once with Notification Service stopped (1 message waits, the assignment still
# succeeds) and watch the message get picked up when Notification Service starts again.
cd "$(dirname "$0")" || exit 1
source ./lib.sh
BASE=${GATEWAY_URL:-http://localhost:3000}
RABBITMQ_API=${RABBITMQ_API:-http://guest:guest@localhost:15672/api}
RUN=$(date +%s)

waiting() { # messages waiting in the "notifications" queue
  curl -s "$RABBITMQ_API/queues/%2F/notifications" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).messages_ready ?? "queue not found"'
}

step "B1 A guest reports an issue"
call 200 POST "$BASE/auth/guest"
as Guest "$(field .accessToken)"
upload 201 "$BASE/tickets" "category=Plumbing" "location=ENG1 2nd floor restroom" "description=Leaking tap" "contactEmail=visitor-$RUN@example.com" "photos=@photos/issue-1.png"
TICKET=$(id)

step "B2 Admin creates a department and assigns the ticket to it"
as "" ""
call 200 POST "$BASE/auth/login" "{\"email\":\"$(env_value ADMIN_EMAIL)\",\"password\":\"$(env_value ADMIN_PASSWORD)\"}"
as Admin "$(field .accessToken)"
call 201 POST "$BASE/departments" "{\"name\":\"Plumbing Team $RUN\",\"contactEmail\":\"plumbing@chula.ac.th\"}"
call 200 POST "$BASE/tickets/$TICKET/assign" "{\"departmentId\":\"$(id)\"}"
check "ticket is ASSIGNED whether or not Notification Service is running" [ "$(field .status)" = ASSIGNED ]

step "B3 Messages waiting in RabbitMQ (the management page refreshes every 5 seconds)"
sleep 6
echo "\$ curl -s http://localhost:15672/api/queues/%2F/notifications   # messages_ready"
echo "-> $(waiting) message(s) waiting. 0 = Notification Service already took it, 1 = it is stopped and the message is kept."

echo
echo "Ticket id: $TICKET"
echo "After Notification Service is running, show its record with:"
echo "  node --env-file=.env demo-progress2/show-notifications.js $TICKET"
exit $FAILED
