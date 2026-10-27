# Prepares this terminal for recording the Progress 3 demo video. Run it OFF camera, from the project root,
# after `docker compose up -d --build` shows every service as (healthy):
#
#   source demo-progress3/demo-env.sh
#
# It must be sourced (not run with bash), so the variables stay in your terminal. Works in zsh and bash.
# Defines:   api  json  ipof  newticket
# Sets:      G J ADMIN STUDENT DEPT TICKET TICKET2 EXPIRED
# The commands to type on camera are in the demo script document (scenes 2-6).

if [ ! -f docker-compose.yml ] || [ ! -d demo-progress3 ]; then
  echo "Run this from the project root:  source demo-progress3/demo-env.sh"
  return 1 2>/dev/null || exit 1
fi

# api = curl that prints the HTTP status and time after the body; json = pick a field out of a JSON reply
api() { curl -s -w '\n→ HTTP %{http_code}  (%{time_total} s)\n\n' "$@"; }
json() { node -pe "JSON.parse(require('fs').readFileSync(0,'utf8'))$1"; }
# ipof SERVICE = the current IP of that service's container on the fondue-backend network
ipof() { docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$(docker compose ps -q "$1")"; }
envval() { grep "^$1=" .env | head -n 1 | cut -d= -f2-; }

G=http://localhost:3000
J='Content-Type: application/json'

# Forget the values of an earlier run, so a failed setup can never leave stale ids behind
unset ADMIN STUDENT DEPT TICKET TICKET2 EXPIRED

if [ "$(curl -s -o /dev/null -w '%{http_code}' "$G/health/ready")" != 200 ]; then
  echo "The system is not ready. Run 'docker compose up -d --build', wait until 'docker compose ps' shows (healthy), then source this again."
  return 1
fi

# Admin token; the password is read from .env so it never appears on screen
ADMIN=$(curl -s -X POST "$G/auth/login" -H "$J" \
  -d "{\"email\":\"$(envval ADMIN_EMAIL)\",\"password\":\"$(envval ADMIN_PASSWORD)\"}" | json .accessToken)
if [ -z "$ADMIN" ] || [ "$ADMIN" = undefined ]; then
  echo "Admin login failed: check ADMIN_EMAIL and ADMIN_PASSWORD in .env"
  return 1
fi

# One department, one student account and two SUBMITTED tickets; RUN keeps names unique between takes
RUN=$(date +%s)
DEPT=$(curl -s -X POST "$G/departments" -H "Authorization: Bearer $ADMIN" -H "$J" \
  -d "{\"name\":\"Electrical $RUN\",\"contactEmail\":\"elec@chula.ac.th\"}" | json .id)
curl -s -X POST "$G/auth/register" -H "$J" \
  -d "{\"email\":\"student-$RUN@student.chula.ac.th\",\"password\":\"Demo-pass-123\"}" > /dev/null
STUDENT=$(curl -s -X POST "$G/auth/login" -H "$J" \
  -d "{\"email\":\"student-$RUN@student.chula.ac.th\",\"password\":\"Demo-pass-123\"}" | json .accessToken)

# newticket = the student reports a new issue; prints its id. Use TICKET=$(newticket) before a retake.
newticket() {
  _reply=$(curl -s -X POST "$G/tickets" -H "Authorization: Bearer $STUDENT" \
    -F category=Electrical -F "location=ENG4 room 401" -F "description=Flickering light" \
    -F photos=@demo-progress2/photos/issue-1.png)
  _id=$(printf '%s' "$_reply" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id || ''" 2>/dev/null)
  if [ -z "$_id" ]; then
    echo "newticket failed: $_reply" >&2
    return 1
  fi
  echo "$_id"
}
TICKET=$(newticket)   # scene 4
TICKET2=$(newticket)  # scene 5

# A token signed with the real JWT_SECRET that expired an hour ago (scene 5)
EXPIRED=$(JWT_SECRET="$(envval JWT_SECRET)" node -e '
  const jwt = require("jsonwebtoken");
  const now = Math.floor(Date.now() / 1000);
  console.log(jwt.sign({ sub: "demo", email: "admin@chula.ac.th", role: "ADMIN", departmentId: "", iat: now - 7200, exp: now - 3600 },
    process.env.JWT_SECRET, { algorithm: "HS256" }));')

for _value in "$DEPT" "$STUDENT" "$TICKET" "$TICKET2" "$EXPIRED"; do
  case "$_value" in
    "" | undefined | null)
      echo "Setup did not finish (DEPT='$DEPT' TICKET='$TICKET' TICKET2='$TICKET2'). Check 'docker compose ps', then source this again."
      return 1 ;;
  esac
done

echo "Ready to record.  DEPT=$DEPT  TICKET=$TICKET  TICKET2=$TICKET2"
echo "Type 'clear' before you start recording."
