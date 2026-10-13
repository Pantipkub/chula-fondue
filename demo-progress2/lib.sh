# Shared by the curl demo scripts: print each command, then its response and HTTP status.
FAILED=0

# In PowerShell and cmd, plain `bash` is the WSL one: it has no node and cannot reach the services on localhost.
if ! command -v node >/dev/null; then
  echo "node was not found, so this is probably WSL bash rather than Git Bash."
  echo "Run the script from a Git Bash terminal, or from PowerShell with:"
  echo "  & 'C:\\Program Files\\Git\\bin\\bash.exe' demo/<script>.sh"
  exit 1
fi

step() { printf '\n=== %s ===\n' "$*"; }

# as LABEL TOKEN: send this login token with every following request (as guest-less: `as "" ""`).
TOKEN='' WHO=''
as() { WHO=$1 TOKEN=$2; }

# _request EXPECTED_STATUS PRINTED_COMMAND CURL_ARGS...; leaves the response body in $BODY.
# Passwords and tokens are shortened in what is printed, never in what is sent.
_request() {
  local expected=$1 shown=$2
  shift 2
  if [ -n "$TOKEN" ]; then
    set -- "$@" -H "Authorization: Bearer $TOKEN"
    shown+=" -H 'Authorization: Bearer <$WHO token>'"
  fi
  echo "\$ curl -s $shown" | sed -E 's/("password":")[^"]*/\1***/'
  local out
  out=$(curl -s "$@" -w '\n%{http_code}')
  local code=${out##*$'\n'}
  BODY=${out%$'\n'*}
  [ -n "$BODY" ] && echo "$BODY" | sed -E 's/("accessToken":"[^"]{12})[^"]*/\1.../'
  if [ "$code" = "$expected" ]; then
    echo "-> HTTP $code (expected $expected)"
  else
    echo "-> HTTP $code (expected $expected) FAILED"
    FAILED=1
  fi
}

# call EXPECTED_STATUS METHOD URL [JSON_BODY]
call() {
  local expected=$1 method=$2 url=$3 body=${4:-}
  local args=(-X "$method" "$url")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  _request "$expected" "-X $method $url${body:+ -H 'Content-Type: application/json' -d '$body'}" "${args[@]}"
}

# upload EXPECTED_STATUS URL FIELD=VALUE...; sends a multipart form, FIELD=@path attaches a file
upload() {
  local expected=$1 url=$2
  shift 2
  local args=(-X POST "$url") shown="-X POST $url" field
  for field in "$@"; do
    args+=(-F "$field")
    shown+=" -F '$field'"
  done
  _request "$expected" "$shown" "${args[@]}"
}

# check LABEL COMMAND...: an extra assertion on the last response
check() {
  local label=$1
  shift
  if "$@"; then
    echo "   ok     $label"
  else
    echo "   FAILED $label"
    FAILED=1
  fi
}

# field EXPRESSION: part of the JSON in $BODY, e.g. `field .accessToken`
field() { node -pe "JSON.parse(process.argv[1])$1" "$BODY"; }

# id of the JSON object in $BODY
id() { field .id; }

# env_value NAME: a value from the project's .env file
env_value() { grep "^$1=" ../.env | head -n1 | cut -d= -f2-; }
