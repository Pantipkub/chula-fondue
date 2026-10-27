#!/usr/bin/env bash
# Security checks (S1-S10): authentication, role checks and per-ticket access, all through the gateway,
# plus the network boundary of the Docker setup. Every refused action is followed by a check that the
# data did not change. Runs against `docker compose up -d --build` (S10 needs it) or `npm run dev`.
cd "$(dirname "$0")" || exit 1
source ./common.sh
start_evidence security
PASSWORD="Demo-pass-$RUN"

login() { # login EMAIL PASSWORD; the token is then `field .accessToken`
  as "" ""
  call 200 POST "$BASE/auth/login" "{\"email\":\"$1\",\"password\":\"$2\"}"
}

# mint_token EXPIRES_IN_SECONDS: a token signed with the real JWT_SECRET (negative = already expired)
mint_token() {
  JWT_SECRET=$(env_value JWT_SECRET) node -e '
    const jwt = require("jsonwebtoken");
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: "s-test", email: "admin@chula.ac.th", role: "ADMIN", departmentId: "", iat: now - 7200, exp: now + Number(process.argv[1]) };
    console.log(jwt.sign(claims, process.env.JWT_SECRET, { algorithm: "HS256" }));' -- "$1"
}

step "Setup: Admin, two departments, one Staff each, two reporters, one ticket per reporter"
login_admin
call 201 POST "$BASE/departments" "{\"name\":\"Sec Dept A $RUN\",\"contactEmail\":\"sec-a-$RUN@chula.ac.th\"}"
DEPT_A=$(id)
call 201 POST "$BASE/departments" "{\"name\":\"Sec Dept B $RUN\",\"contactEmail\":\"sec-b-$RUN@chula.ac.th\"}"
DEPT_B=$(id)
for d in a b; do
  dept=$DEPT_A
  [ $d = b ] && dept=$DEPT_B
  call 201 POST "$BASE/auth/users" "{\"email\":\"sec-staff-$d-$RUN@chula.ac.th\",\"password\":\"$PASSWORD\",\"role\":\"STAFF\",\"departmentId\":\"$dept\"}"
done
for r in 1 2; do
  as "" ""
  call 201 POST "$BASE/auth/register" "{\"email\":\"sec-reporter-$r-$RUN@student.chula.ac.th\",\"password\":\"$PASSWORD\"}"
done
login "sec-staff-a-$RUN@chula.ac.th" "$PASSWORD"; STAFF_A=$(field .accessToken)
login "sec-staff-b-$RUN@chula.ac.th" "$PASSWORD"; STAFF_B=$(field .accessToken)
login "sec-reporter-1-$RUN@student.chula.ac.th" "$PASSWORD"; REPORTER_1=$(field .accessToken)
login "sec-reporter-2-$RUN@student.chula.ac.th" "$PASSWORD"; REPORTER_2=$(field .accessToken)
as Reporter1 "$REPORTER_1"
upload 201 "$BASE/tickets" "category=Plumbing" "location=ENG1 restroom" "description=Leaking tap" "photos=@$PHOTO"
TICKET_1=$(id)
as Reporter2 "$REPORTER_2"
upload 201 "$BASE/tickets" "category=Cleaning" "location=ENG2 hall" "description=Spilled paint" "photos=@$PHOTO"
TICKET_2=$(id)

status_of() { # status_of TICKET: read with the Admin token, as the trusted view of the data
  curl -s -H "Authorization: Bearer $ADMIN" "$BASE/tickets/$1/history" | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).ticket.status'
}

step "S1 No token"
as "" ""
call 401 GET "$BASE/tickets"

step "S2 Forged token (signed with another secret)"
as Forged "$(node -e 'console.log(require("jsonwebtoken").sign({ sub: "x", email: "x@x.co", role: "ADMIN", departmentId: "" }, "not-the-real-secret-not-the-real-secret"))')"
call 401 GET "$BASE/tickets"

step "S3 Expired token (correct signature, expired an hour ago)"
as Expired "$(mint_token -3600)"
call 401 GET "$BASE/tickets"

step "S4 A Reporter tries to assign a ticket (Admin only)"
as Reporter1 "$REPORTER_1"
call 403 POST "$BASE/tickets/$TICKET_1/assign" "{\"departmentId\":\"$DEPT_A\"}"
check "ticket is still SUBMITTED" [ "$(status_of "$TICKET_1")" = SUBMITTED ]

step "S5 A Reporter tries to manage departments and create Staff accounts (Admin only)"
call 403 POST "$BASE/departments" "{\"name\":\"Rogue $RUN\",\"contactEmail\":\"rogue@chula.ac.th\"}"
call 403 POST "$BASE/auth/users" "{\"email\":\"rogue-$RUN@chula.ac.th\",\"password\":\"$PASSWORD\",\"role\":\"ADMIN\"}"

step "S6 A Reporter reads another reporter's ticket"
as Reporter1 "$REPORTER_1"
call 403 GET "$BASE/tickets/$TICKET_2/history"
call 200 GET "$BASE/tickets/$TICKET_1/history"

step "S7 Admin assigns ticket 1 to Department A; Staff of Department B tries to read and start it"
as Admin "$ADMIN"
call 200 POST "$BASE/tickets/$TICKET_1/assign" "{\"departmentId\":\"$DEPT_A\"}"
as StaffB "$STAFF_B"
call 403 GET "$BASE/tickets/$TICKET_1/history"
call 403 POST "$BASE/tickets/$TICKET_1/start"
check "ticket is still ASSIGNED" [ "$(status_of "$TICKET_1")" = ASSIGNED ]
as StaffA "$STAFF_A"
call 200 GET "$BASE/tickets/$TICKET_1/history"

step "S8 Staff B's ticket list contains only Department B's tickets"
as StaffB "$STAFF_B"
call 200 GET "$BASE/tickets"
check "ticket 1 is not in Staff B's list" [ "$(field ".tickets.some(t => t.id === '$TICKET_1')")" = false ]

step "S9 A Guest token cannot list tickets"
as "" ""
call 200 POST "$BASE/auth/guest"
as Guest "$(field .accessToken)"
call 403 GET "$BASE/tickets"

step "S10 The services behind the gateway cannot be reached from outside the Docker network"
for target in localhost:3001/departments localhost:3002/auth/guest localhost:8081/health; do
  echo "\$ curl -s -m 3 http://$target"
  code=$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://$target")
  check "http://$target is unreachable (got HTTP $code; 000 = no connection)" [ "$code" = 000 ]
done
echo "\$ node -e 'net.connect(50051)'   # gRPC port of ticket-service"
GRPC=$(node -e 'const s = require("net").connect(50051, "localhost"); s.on("connect", () => { console.log("open"); s.destroy(); }); s.on("error", () => console.log("closed")); setTimeout(() => process.exit(), 2000)')
check "gRPC port 50051 is closed (got $GRPC)" [ "$GRPC" = closed ]

finish
