#!/usr/bin/env bash
# Smoke test a *running* WebObsidian deployment over HTTP.
#
#   deploy/smoke.sh [base-url]
#
# Reads the deployment's own env (ENV_FILE) and data volume to know what to expect, so it works both
# for a docker deployment (LXC 107) and for a locally built server. It asserts behaviour that only
# exists in this fork's merged upstream PRs, so it doubles as "is the fork build actually live?":
#   - GET /auth/status returns ONLY { passwordSet }  (upstream v0.1.1 also leaked mustChangePassword — PR #15)
#   - 123456 is refused whenever any credential is configured (PRs #4 + #15), accepted on a bare install
#   - the configured operator password still logs in
# Never prints a secret. Exit code 0 = all checks passed.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-/root/webobsidian/.env}"
PROJECT="${PROJECT:-webobsidian}"
PORT_DEFAULT="${PORT:-8787}"
BASE="${1:-${SELF_URL:-http://127.0.0.1:$PORT_DEFAULT}}"
BASE="${BASE%/}"

pass=0; fail=0
redact() { sed "s/$1/***/g"; }   # replacement for a secret value in output

chk() { # chk <label> <expected> <actual>
  if [[ "$2" == "$3" ]]; then echo "  PASS  $1  ->  $3"; pass=$((pass+1))
  else echo "  FAIL  $1  expected '$2' got '$3'"; fail=$((fail+1)); fi
}

env_get() {
  [[ -f "$ENV_FILE" ]] || return 0
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -1 | sed 's/^["'"'"']//; s/["'"'"']$//'
}

http() { # http <method> <path> [data] -> "<code> <body>"
  local method="$1" path="$2" data="${3:-}" out code
  if [[ -n "$data" ]]; then
    out="$(curl -s -m 15 -o /tmp/wo-smoke-body -w '%{http_code}' -X "$method" "$BASE$path" \
            -H 'Content-Type: application/json' -d "$data")"
  else
    out="$(curl -s -m 15 -o /tmp/wo-smoke-body -w '%{http_code}' -X "$method" "$BASE$path")"
  fi
  code="$out"
  echo "$code $(tr -d '\n' </tmp/wo-smoke-body | head -c 400)"
}

login() { # login <password> -> "<code> <mustChangePassword|absent>"
  local code
  code="$(curl -s -m 15 -o /tmp/wo-smoke-login -w '%{http_code}' -X POST "$BASE/auth/login" \
          -H 'Content-Type: application/json' -d "{\"password\":\"$1\"}")"
  local flag
  flag="$(python3 -c "import json;print(json.load(open('/tmp/wo-smoke-login')).get('mustChangePassword','absent'))" 2>/dev/null || echo unparseable)"
  echo "$code $flag"
}

echo "smoke: $BASE (env: $ENV_FILE)"

# 1. liveness — /healthz also reports the built-in version and the commit the image was built
# from, so this doubles as "is the deployment actually running the build we just shipped?".
read -r code body < <(http GET /healthz)
hb="$(printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("version","?"), d.get("build","?"), "ok" if d.get("ok") else "not-ok")' 2>/dev/null || echo "? ? unparseable")"
read -r h_version h_build h_ok <<<"$hb"
chk "GET /healthz returns ok" "ok" "$h_ok"
if [[ -n "${EXPECT_BUILD:-}" ]]; then
  chk "running build is the deployed commit" "$EXPECT_BUILD" "$h_build"
else
  echo "  INFO  running build: version=$h_version build=$h_build"
fi

# 2. the SPA is served
body="$(curl -s -m 15 "$BASE/" | tr -d '\n' | head -c 4000)"
if [[ "$body" == *'<div id="root">'* ]]; then
  echo "  PASS  GET / serves the SPA bundle"; pass=$((pass+1))
else
  echo "  FAIL  GET / did not serve the SPA bundle (got: $(head -c 120 <<<"$body"))"; fail=$((fail+1))
fi

# 3. fork marker: /auth/status must not expose mustChangePassword (PR #15)
read -r code body < <(http GET /auth/status)
keys="$(printf '%s' "$body" | python3 -c "import json,sys; print(sorted(json.load(sys.stdin).keys()))" 2>/dev/null || echo unparseable)"
chk "GET /auth/status exposes only passwordSet (fork marker)" "['passwordSet']" "$keys"

# 4. credentials configured? (env override or a hash in the data volume)
env_pw="$(env_get WEBOBSIDIAN_PASSWORD)"
settings="/var/lib/docker/volumes/${PROJECT}_webobsidian-data/_data/settings.json"
has_hash="unknown"
if [[ -f "$settings" ]]; then
  has_hash="$(python3 -c "import json; a=json.load(open('$settings'))['auth']; print('yes' if (a.get('userPasswordHash') or a.get('passwordHash')) else 'no')" 2>/dev/null || echo unknown)"
fi
configured="no"
[[ -n "$env_pw" || "$has_hash" == "yes" ]] && configured="yes"

if [[ "$configured" == "yes" ]]; then
  chk "123456 is refused (credential configured)" "401 absent" "$(login 123456 | sed "s/$env_pw/***/g")"
else
  chk "123456 works on a bare install" "200 True" "$(login 123456)"
fi

if [[ -n "$env_pw" ]]; then
  result="$(login "$env_pw")"
  chk "the configured operator password logs in" "200 False" "${result//$env_pw/***}"
else
  echo "  SKIP  operator-password login (WEBOBSIDIAN_PASSWORD empty; UI password only)"
fi

# 5. Tasks board (FR-15): the route exists and is auth-guarded — a regression that
# lets it fall through to the SPA (or drops the guard) fails the deploy here instead
# of reaching the user. With the operator password available, also confirm it serves
# real data once logged in.
read -r code body < <(http GET /api/tasks)
chk "GET /api/tasks without a session is 401" "401" "$code"

if [[ -n "$env_pw" ]]; then
  jar="$(mktemp)"
  login_code="$(curl -s -m 15 -c "$jar" -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/login" \
                -H 'Content-Type: application/json' -d "{\"password\":\"$env_pw\"}")"
  if [[ "$login_code" == "200" ]]; then
    tasks_code="$(curl -s -m 15 -b "$jar" -o /tmp/wo-smoke-tasks -w '%{http_code}' "$BASE/api/tasks")"
    is_array="$(python3 -c "import json; d=json.load(open('/tmp/wo-smoke-tasks')); print('yes' if isinstance(d.get('tasks'), list) else 'no')" 2>/dev/null || echo unparseable)"
    chk "GET /api/tasks with a session returns 200 + a tasks array" "200 yes" "$tasks_code $is_array"
  else
    echo "  FAIL  could not log in to check GET /api/tasks (login returned $login_code)"; fail=$((fail+1))
  fi
  rm -f "$jar"
else
  echo "  SKIP  GET /api/tasks 200 check (WEBOBSIDIAN_PASSWORD empty; UI password only)"
fi

echo
echo "== vault locks (docs/LOCKS.md) =="
# A locked note must refuse a *session* write with 423 while staying readable. The probe path is
# derived from the vault's own `_system/locks.json` (via the tree response), so this asserts the
# live config rather than a hardcoded path — and a refusal leaves nothing behind.
if [[ -n "$env_pw" ]]; then
  jar2="$(mktemp)"
  curl -s -m 15 -c "$jar2" -o /dev/null -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' -d "{\"password\":\"$env_pw\"}"
  curl -s -m 15 -b "$jar2" "$BASE/api/files" -o /tmp/wo-smoke-tree.json
  read -r locked_dir locked_count < <(python3 -c "
import json
tree = json.load(open('/tmp/wo-smoke-tree.json'))
paths = []
def walk(n):
    if n.get('locked'):
        paths.append(n['path'])
    for c in n.get('children') or []:
        walk(c)
walk(tree)
print((paths[0].rsplit('/', 1)[0] if paths and '/' in paths[0] else ''), len(paths))")
  if [[ -n "$locked_dir" ]]; then
    probe="$locked_dir/.smoke-lock-probe.md"
    enc="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=''))" "$probe")"
    code="$(curl -s -m 15 -b "$jar2" -o /tmp/wo-smoke-lock.json -w '%{http_code}' -X PUT "$BASE/api/files/content" \
              -H 'Content-Type: application/json' -d "{\"path\":\"$probe\",\"content\":\"probe\\n\"}")"
    err="$(python3 -c "import json;print(json.load(open('/tmp/wo-smoke-lock.json')).get('error'))" 2>/dev/null || echo unparseable)"
    chk "a session write into a locked folder is refused with the lock error" "423 locked" "$code $err"
    chk "the refused write created nothing on disk" "404" \
        "$(curl -s -m 15 -b "$jar2" -o /dev/null -w '%{http_code}' "$BASE/api/files/content?path=$enc")"
    curl -s -m 15 -b "$jar2" -o /dev/null -X DELETE "$BASE/api/files/?path=$enc" 2>/dev/null || true
    echo "  INFO  vault locks: $locked_count path(s) locked; probed $locked_dir/"
  else
    echo "  SKIP  vault locks (nothing locked in this vault's _system/locks.json)"
  fi
  rm -f "$jar2"
else
  echo "  SKIP  vault locks (WEBOBSIDIAN_PASSWORD empty; UI password only)"
fi

echo
echo "== PDF file view (FR-21) =="
# A PDF is served by /api/files/content and framed by the app itself. Two things can
# silently break that: the CSP dropping back to `frame-ancestors 'none'` (the browser
# then refuses to embed the file and the pane stays empty), and the binary branch
# regressing to a download/octet-stream. The probe file is whatever PDF this vault
# happens to hold, derived from the tree, and nothing is written.
csp="$(curl -s -m 15 -D- -o /dev/null "$BASE/" | tr -d '\r' | sed -n 's/^[Cc]ontent-[Ss]ecurity-[Pp]olicy: //p')"
if [[ "$csp" == *"frame-ancestors 'self'"* ]]; then
  echo "  PASS  the app may frame its own content (CSP frame-ancestors 'self')"; pass=$((pass+1))
else
  echo "  FAIL  CSP does not allow self-framing — a PDF pane will stay empty (got: ${csp:0:160})"; fail=$((fail+1))
fi

if [[ -n "$env_pw" ]]; then
  jar3="$(mktemp)"
  curl -s -m 15 -c "$jar3" -o /dev/null -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' -d "{\"password\":\"$env_pw\"}"
  curl -s -m 15 -b "$jar3" "$BASE/api/files" -o /tmp/wo-smoke-tree3.json
  pdf="$(python3 -c "
import json
tree = json.load(open('/tmp/wo-smoke-tree3.json'))
found = ''
def walk(n):
    global found
    if n.get('type') == 'file' and n['path'].lower().endswith('.pdf') and not found:
        found = n['path']
    for c in n.get('children') or []:
        walk(c)
walk(tree)
print(found)")"
  if [[ -n "$pdf" ]]; then
    enc_pdf="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe='/'))" "$pdf")"
    deep="$(curl -s -m 15 -b "$jar3" -o /dev/null -w '%{http_code} %{content_type}' "$BASE/note/$enc_pdf")"
    chk "the PDF deep link serves the SPA" "200 text/html; charset=UTF-8" "$deep"
    read -r fcode ftype fdisp < <(curl -s -m 20 -b "$jar3" -D /tmp/wo-smoke-pdfhdr -o /tmp/wo-smoke-pdf \
      -w '%{http_code} %{content_type}' "$BASE/api/files/content?path=$enc_pdf" \
      | awk '{print $1, $2, "x"}')
    disp="$(tr -d '\r' < /tmp/wo-smoke-pdfhdr | sed -n 's/^[Cc]ontent-[Dd]isposition: //p')"
    chk "the PDF is served inline as application/pdf" "200 application/pdf|" "$fcode $ftype|$disp"
    magic="$(head -c 5 /tmp/wo-smoke-pdf)"
    range="$(curl -s -m 20 -b "$jar3" -r 0-4 -o /tmp/wo-smoke-range -w '%{http_code}' "$BASE/api/files/content?path=$enc_pdf")"
    chk "a range request returns the PDF magic bytes" "206 %PDF-" "$range $(head -c 5 /tmp/wo-smoke-range)"
    echo "  INFO  probed $pdf ($magic)"
  else
    echo "  SKIP  PDF file view (this vault holds no .pdf)"
  fi
  rm -f "$jar3"
else
  echo "  SKIP  PDF file view (WEBOBSIDIAN_PASSWORD empty; UI password only)"
fi

echo
echo "== Binary download (FR-22) =="
# A file with no viewer has to come out under its own name: without the header the
# browser names it after the last URL segment and saves `content`, with no extension,
# which no desktop application can open. The same route must still serve inline when
# nothing asks for a download — that is what the PDF pane depends on.
if [[ -n "$env_pw" ]]; then
  jar4="$(mktemp)"
  curl -s -m 15 -c "$jar4" -o /dev/null -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' -d "{\"password\":\"$env_pw\"}"
  curl -s -m 15 -b "$jar4" "$BASE/api/files" -o /tmp/wo-smoke-tree4.json
  binary="$(python3 -c "
import json
tree = json.load(open('/tmp/wo-smoke-tree4.json'))
found = ''
def walk(n):
    global found
    if n.get('type') == 'file' and not found and n['path'].lower().endswith(('.pptx', '.docx', '.xlsx', '.zip')):
        found = n['path']
    for c in n.get('children') or []:
        walk(c)
walk(tree)
print(found)")"
  if [[ -n "$binary" ]]; then
    enc_bin="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe='/'))" "$binary")"
    base_name="$(basename "$binary")"
    dcode="$(curl -s -m 20 -b "$jar4" -D /tmp/wo-smoke-dlhdr -o /tmp/wo-smoke-dl \
      -w '%{http_code}' "$BASE/api/files/content?path=$enc_bin&download=1")"
    ddisp="$(tr -d '\r' < /tmp/wo-smoke-dlhdr | sed -n 's/^[Cc]ontent-[Dd]isposition: //p')"
    chk "?download=1 answers 200" "200" "$dcode"
    chk "?download=1 names the file, extension included" \
      "attachment; filename=\"$base_name\"" "$(printf '%s' "$ddisp" | cut -d';' -f1,2)"
    chk "the download is the real office/zip container" "PK" "$(head -c 2 /tmp/wo-smoke-dl)"
    idisp="$(curl -s -m 20 -b "$jar4" -D - -o /dev/null "$BASE/api/files/content?path=$enc_bin" \
      | tr -d '\r' | sed -n 's/^[Cc]ontent-[Dd]isposition: //p')"
    chk "without ?download it still serves inline" "" "$idisp"
    echo "  INFO  probed $binary"
  else
    echo "  SKIP  binary download (this vault holds no office/zip file)"
  fi
  rm -f "$jar4"
else
  echo "  SKIP  binary download (WEBOBSIDIAN_PASSWORD empty; UI password only)"
fi

echo
echo "RESULT: $pass passed, $fail failed"
exit $((fail > 0))
