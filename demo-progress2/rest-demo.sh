#!/usr/bin/env bash
# REST CRUD demo on department-service (checks R1-R8). Safe to re-run: department names are unique per run.
cd "$(dirname "$0")" || exit 1
source ./lib.sh
BASE=${DEPARTMENT_SERVICE_URL:-http://localhost:3001}
RUN=$(date +%s)

step "R1 Create department A"
call 201 POST "$BASE/departments" "{\"name\":\"Engineering Facilities $RUN\",\"contactEmail\":\"eng-facilities@chula.ac.th\",\"buildings\":[\"ENG1\",\"ENG3\"]}"
DEPT_A=$(id)

step "R2 Create department B"
call 201 POST "$BASE/departments" "{\"name\":\"Central Grounds $RUN\",\"contactEmail\":\"grounds@chula.ac.th\"}"
DEPT_B=$(id)

step "R3 List departments (both are in the list)"
call 200 GET "$BASE/departments"

step "R4 Get department A"
call 200 GET "$BASE/departments/$DEPT_A"

step "R5 Update department A's contactEmail"
call 200 PUT "$BASE/departments/$DEPT_A" '{"contactEmail":"eng-helpdesk@chula.ac.th"}'

step "R6 Delete department B"
call 204 DELETE "$BASE/departments/$DEPT_B"

step "R7 List departments (B is gone)"
call 200 GET "$BASE/departments"

step "R8 Get deleted department B"
call 404 GET "$BASE/departments/$DEPT_B"

# The gRPC demo reuses these ids.
printf 'DEPT_A=%s\nDEPT_B=%s\n' "$DEPT_A" "$DEPT_B" > .ids
exit $FAILED
