#!/usr/bin/env bash
# Gateway demo (checks W1-W4). Run after demo/rest-demo.sh and demo/grpc-demo.sh.
cd "$(dirname "$0")" || exit 1
source ./lib.sh
source ./.ids || { echo "Run demo/rest-demo.sh first, it creates the departments."; exit 1; }
BASE=${GATEWAY_URL:-http://localhost:3000}

step "W1 Create a ticket through the gateway"
call 201 POST "$BASE/tickets" '{"category":"Plumbing","location":"ENG1 2nd floor restroom","description":"Leaking tap","reporterEmail":"student3@student.chula.ac.th"}'
TICKET=$(id)

step "W2 Assign it to department A through the gateway"
call 200 POST "$BASE/tickets/$TICKET/assign" "{\"departmentId\":\"$DEPT_A\"}"

step "W3 List departments through the gateway, then directly on department-service"
call 200 GET "$BASE/departments"
VIA_GATEWAY=$BODY
call 200 GET "${DEPARTMENT_SERVICE_URL:-http://localhost:3001}/departments"
if [ "$VIA_GATEWAY" = "$BODY" ]; then
  echo "-> identical responses"
else
  echo "-> responses differ FAILED"
  FAILED=1
fi

step "W4 Cancel the assigned ticket through the gateway (not allowed)"
call 409 DELETE "$BASE/tickets/$TICKET"

exit $FAILED
