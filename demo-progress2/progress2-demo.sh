#!/usr/bin/env bash
# Progress #2 demo through the API Gateway: authentication plus the three business use cases
# (UC-01 report, UC-02 route, UC-03 resolve). Safe to re-run: every run creates its own
# department, accounts and ticket, so it also works on a shared database.
cd "$(dirname "$0")" || exit 1
source ./lib.sh
BASE=${GATEWAY_URL:-http://localhost:3000}
RUN=$(date +%s)
PASSWORD="Demo-pass-$RUN"

login() { # login EMAIL PASSWORD; the token is then `field .accessToken`
  call 200 POST "$BASE/auth/login" "{\"email\":\"$1\",\"password\":\"$2\"}"
}

step "S1 Admin logs in (account seeded from .env)"
login "$(env_value ADMIN_EMAIL)" "$(env_value ADMIN_PASSWORD)"
ADMIN=$(field .accessToken)

step "S2 Admin creates two departments"
as Admin "$ADMIN"
call 201 POST "$BASE/departments" "{\"name\":\"Engineering Facilities $RUN\",\"contactEmail\":\"eng-facilities@chula.ac.th\",\"buildings\":[\"ENG1\",\"ENG3\"]}"
DEPT_A=$(id)
call 201 POST "$BASE/departments" "{\"name\":\"Central Grounds $RUN\",\"contactEmail\":\"grounds@chula.ac.th\"}"
DEPT_B=$(id)

step "S3 Admin creates one Staff account per department"
call 201 POST "$BASE/auth/users" "{\"email\":\"staff-a-$RUN@chula.ac.th\",\"password\":\"$PASSWORD\",\"role\":\"STAFF\",\"departmentId\":\"$DEPT_A\"}"
call 201 POST "$BASE/auth/users" "{\"email\":\"staff-b-$RUN@chula.ac.th\",\"password\":\"$PASSWORD\",\"role\":\"STAFF\",\"departmentId\":\"$DEPT_B\"}"

step "A1 A reporter registers and logs in"
as "" ""
call 201 POST "$BASE/auth/register" "{\"email\":\"student-$RUN@student.chula.ac.th\",\"password\":\"$PASSWORD\"}"
login "student-$RUN@student.chula.ac.th" "$PASSWORD"
REPORTER=$(field .accessToken)

step "A2 Wrong password is refused"
call 401 POST "$BASE/auth/login" "{\"email\":\"student-$RUN@student.chula.ac.th\",\"password\":\"wrong-password\"}"

step "A3 A request without a token is refused"
call 401 GET "$BASE/tickets"

step "A4 Both Staff accounts log in"
login "staff-a-$RUN@chula.ac.th" "$PASSWORD"
STAFF_A=$(field .accessToken)
login "staff-b-$RUN@chula.ac.th" "$PASSWORD"
STAFF_B=$(field .accessToken)

step "UC-01.1 Reporter reports an issue with two photos"
as Reporter "$REPORTER"
upload 201 "$BASE/tickets" "category=Electrical" "location=ENG3 room 315" "description=Ceiling light is flickering" "photos=@photos/issue-1.png" "photos=@photos/issue-2.jpg"
TICKET=$(id)
check "ticket is SUBMITTED" [ "$(field .status)" = SUBMITTED ]
check "ticket has two photo links" [ "$(field .photoUrls.length)" = 2 ]
PHOTO=$(field '.photoUrls[0]')

step "UC-01.2 The stored photo link opens"
echo "\$ curl -s -o /dev/null -w '%{http_code}' $PHOTO"
PHOTO_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$PHOTO")
check "photo link returns HTTP 200 (got $PHOTO_STATUS)" [ "$PHOTO_STATUS" = 200 ]

step "UC-01.3 A file that is not an image is rejected and no ticket is created"
upload 400 "$BASE/tickets" "category=Electrical" "location=ENG3" "description=Bad upload" "photos=@photos/not-a-photo.txt"

step "UC-01.4 A report without a photo is rejected"
upload 400 "$BASE/tickets" "category=Electrical" "location=ENG3" "description=No photo"

step "UC-01.5 A guest reports an issue and must leave a contact email"
as "" ""
call 200 POST "$BASE/auth/guest"
as Guest "$(field .accessToken)"
upload 400 "$BASE/tickets" "category=Grounds" "location=Central Library walkway" "description=Broken paving stone" "photos=@photos/issue-1.png"
upload 201 "$BASE/tickets" "category=Grounds" "location=Central Library walkway" "description=Broken paving stone" "contactEmail=visitor-$RUN@example.com" "photos=@photos/issue-1.png"

step "UC-01.6 Reporter sees only their own ticket"
as Reporter "$REPORTER"
call 200 GET "$BASE/tickets"
check "list has exactly the reporter's one ticket" [ "$(field '.tickets.length')" = 1 ]

step "UC-02.1 A reporter may not route tickets"
call 403 POST "$BASE/tickets/$TICKET/assign" "{\"departmentId\":\"$DEPT_A\"}"

step "UC-02.2 Admin reviews the central inbox"
as Admin "$ADMIN"
call 200 GET "$BASE/tickets?status=SUBMITTED&reporterEmail=student-$RUN@student.chula.ac.th"

step "UC-02.3 Admin picks a department that no longer exists"
call 204 DELETE "$BASE/departments/$DEPT_B"
call 404 POST "$BASE/tickets/$TICKET/assign" "{\"departmentId\":\"$DEPT_B\"}"

step "UC-02.4 Admin assigns the ticket to Engineering Facilities"
call 200 POST "$BASE/tickets/$TICKET/assign" "{\"departmentId\":\"$DEPT_A\"}"
check "ticket is ASSIGNED" [ "$(field .status)" = ASSIGNED ]

step "UC-02.5 The department was notified: Ticket Service -> RabbitMQ -> Notification Service -> MongoDB"
node --env-file=../.env show-notifications.js "$TICKET" 1 || FAILED=1

step "UC-03.1 Staff sees the ticket in their department queue"
as "Staff A" "$STAFF_A"
call 200 GET "$BASE/tickets"
check "queue has the assigned ticket" [ "$(field '.tickets.length')" = 1 ]

step "UC-03.2 Staff of another department may not touch it"
as "Staff B" "$STAFF_B"
call 403 POST "$BASE/tickets/$TICKET/start"

step "UC-03.3 Staff starts work"
as "Staff A" "$STAFF_A"
call 200 POST "$BASE/tickets/$TICKET/start"

step "UC-03.4 Resolving without a completion photo is rejected"
upload 400 "$BASE/tickets/$TICKET/resolve"

step "UC-03.5 Staff uploads the completion photo and resolves the ticket"
upload 200 "$BASE/tickets/$TICKET/resolve" "photos=@photos/fixed-1.png"
check "ticket is RESOLVED" [ "$(field .status)" = RESOLVED ]
check "ticket has one completion photo link" [ "$(field .completionPhotoUrls.length)" = 1 ]

step "UC-03.6 Reporter follows the ticket history"
as Reporter "$REPORTER"
call 200 GET "$BASE/tickets/$TICKET/history"
check "history is SUBMITTED, ASSIGNED, IN_PROGRESS, RESOLVED" [ "$(field '.history.map((entry) => entry.toStatus).join()')" = "SUBMITTED,ASSIGNED,IN_PROGRESS,RESOLVED" ]

step "UC-03.7 Every status change was recorded as a notification"
node --env-file=../.env show-notifications.js "$TICKET" 3 || FAILED=1

echo
[ "$FAILED" = 0 ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $FAILED
