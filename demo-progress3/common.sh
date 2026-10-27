# Shared by the Progress 3 scripts. Builds on the Progress 2 helpers (step, as, call, upload, check, field, id).
# Run the scripts from Git Bash / bash, against `docker compose up -d --build` in the project root.
source ../demo-progress2/lib.sh
BASE=${GATEWAY_URL:-http://localhost:3000}
RUN=$(date +%s)
PHOTO=../demo-progress2/photos/issue-1.png

# docker compose, run from the project root whatever the current folder is
dc() { (cd .. && docker compose "$@"); }

# show COMMAND...: print the command (dc shown as docker compose), then run it
show() {
  local shown="$*"
  echo "\$ ${shown/#dc /docker compose }"
  "$@"
}

now_ms() { node -p 'Date.now()'; }

# IP address of a compose service's container on the fondue-backend network
container_ip() {
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$(dc ps -q "$1")"
}

login_admin() {
  as "" ""
  call 200 POST "$BASE/auth/login" "{\"email\":\"$(env_value ADMIN_EMAIL)\",\"password\":\"$(env_value ADMIN_PASSWORD)\"}"
  ADMIN=$(field .accessToken)
  as Admin "$ADMIN"
}

# call_traced EXPECTED METHOD URL JSON_BODY REQUEST_ID: like `call`, but sends our own X-Request-Id
call_traced() {
  local expected=$1 method=$2 url=$3 body=$4 rid=$5
  _request "$expected" "-X $method $url -H 'X-Request-Id: $rid' -H 'Content-Type: application/json' -d '$body'" \
    -X "$method" "$url" -H "X-Request-Id: $rid" -H 'Content-Type: application/json' -d "$body"
}

# Messages in the "notifications" queue that are not yet acknowledged (waiting + being processed),
# read live from RabbitMQ (the management page lags by ~5 s).
queue_messages() {
  local out
  out=$(dc exec -T rabbitmq rabbitmqctl list_queues --quiet --no-table-headers name messages 2>/dev/null) || {
    echo unknown
    return
  }
  echo "$out" | awk '$1 == "notifications" { print $2; found = 1 } END { if (!found) print 0 }'
}

# start_evidence NAME: copy everything this script prints into demo-progress3/evidence/NAME-<time>.log
start_evidence() {
  mkdir -p evidence
  EVIDENCE="evidence/$1-$(date +%Y%m%d-%H%M%S).log"
  exec > >(tee "$EVIDENCE") 2>&1
  echo "Evidence log: demo-progress3/$EVIDENCE"
  local commit dirty=''
  commit=$(git rev-parse --short HEAD 2>/dev/null)
  git diff --quiet HEAD 2>/dev/null || dirty=' + uncommitted changes'
  echo "Date: $(date '+%Y-%m-%d %H:%M:%S %z')   Branch: $(git branch --show-current 2>/dev/null)   Commit: $commit$dirty"
}

finish() {
  echo
  if [ "$FAILED" = 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
  echo "Saved to demo-progress3/$EVIDENCE"
  exit "$FAILED"
}
