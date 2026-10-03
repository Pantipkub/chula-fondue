# Shared by the curl demo scripts: print each command, then its response and HTTP status.
FAILED=0

step() { printf '\n=== %s ===\n' "$*"; }

# call EXPECTED_STATUS METHOD URL [JSON_BODY]; leaves the response body in $BODY
call() {
  local expected=$1 method=$2 url=$3 body=${4:-}
  local args=(-s -X "$method" "$url")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  echo "\$ curl -s -X $method $url${body:+ -H 'Content-Type: application/json' -d '$body'}"
  local out
  out=$(curl "${args[@]}" -w '\n%{http_code}')
  local code=${out##*$'\n'}
  BODY=${out%$'\n'*}
  [ -n "$BODY" ] && echo "$BODY"
  if [ "$code" = "$expected" ]; then
    echo "-> HTTP $code (expected $expected)"
  else
    echo "-> HTTP $code (expected $expected) FAILED"
    FAILED=1
  fi
}

# id of the JSON object in $BODY
id() { node -pe 'JSON.parse(process.argv[1]).id' "$BODY"; }
