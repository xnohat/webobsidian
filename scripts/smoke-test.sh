#!/usr/bin/env bash
# Runtime smoke test for everything unit tests cannot cover end-to-end: the auth
# hardening (#4 + #15), the SIGTERM graceful shutdown (#27), vault symlinks through
# the HTTP API (#23) and the Agent API's read-modify-write surface + MCP server
# (adopted from other forks).
#
#   npm run build && scripts/smoke-test.sh
#
# Boots the built server five times (fresh install / operator override / symlinked
# vault / agent API / strict agent API) on a free-ish local port against throwaway
# data + vault dirs, drives it with curl (and one real MCP stdio handshake), then
# asserts the responses and the shutdown log.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
[[ -f server/dist/index.js ]] || { echo "build first: npm run build" >&2; exit 64; }

PORT="${SMOKE_PORT:-8799}"
EXPECTED_VERSION="$(node -p "require('./package.json').version")"
BASE="http://127.0.0.1:${PORT}"
LOG="$(mktemp)"
pass=0; fail=0

chk() { # chk <label> <expected> <actual>
  if [[ "$2" == "$3" ]]; then
    echo "  PASS  $1  ->  $3"; pass=$((pass+1))
  else
    echo "  FAIL  $1  expected '$2' got '$3'"; fail=$((fail+1))
  fi
}

start_server() { # start_server <env-assignment...>
  DATA_DIR="$(mktemp -d)" VAULT_PATH="$(mktemp -d)" PORT="$PORT" HOST=127.0.0.1 "$@" \
    node server/dist/index.js >>"$LOG" 2>&1 &
  SRV=$!
  for _ in $(seq 1 60); do
    curl -fsS -m 1 "$BASE/healthz" >/dev/null 2>&1 && return 0
    kill -0 $SRV 2>/dev/null || return 1
    sleep 0.5
  done
  return 1
}

login() { # login <password>  -> "<http status> <mustChangePassword|absent>"
  local code
  code="$(curl -s -o /tmp/wo-login.json -w '%{http_code}' -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' -d "{\"password\":\"$1\"}")"
  local flag
  flag="$(python3 -c "import json;print(json.load(open('/tmp/wo-login.json')).get('mustChangePassword','absent'))" 2>/dev/null || echo unparseable)"
  echo "$code $flag"
}

echo "== scenario A: fresh install (no override) =="
if start_server env; then
  chk "GET /auth/status has no mustChangePassword (#15)" "['passwordSet']" \
      "$(curl -s "$BASE/auth/status" | python3 -c "import json,sys;print(sorted(json.load(sys.stdin).keys()))")"
  chk "GET /healthz reports ok + version + build" "ok ${EXPECTED_VERSION}" \
      "$(curl -s "$BASE/healthz" | python3 -c "import json,sys;d=json.load(sys.stdin);print('ok' if d.get('ok') else 'not-ok', d.get('version','?'), d.get('build','?') if d.get('build') else 'missing')" | awk '{print $1, $2}')"
  echo "  INFO  /healthz build: $(curl -s "$BASE/healthz" | python3 -c "import json,sys;print(json.load(sys.stdin).get('build','?'))")"
  chk "login 123456 on a fresh install: accepted, change forced" "200 True" "$(login 123456)"
else
  echo "  FAIL  server did not start (scenario A)"; fail=$((fail+1))
fi
kill -TERM $SRV 2>/dev/null; wait $SRV 2>/dev/null
chk "graceful shutdown logged every step incl. the signal (#27)" "5" \
    "$(grep -c '\[shutdown\]' "$LOG")"
chk "no shutdown error" "0" "$(grep -c '\[shutdown\] error' "$LOG")"

echo "== scenario B: WEBOBSIDIAN_PASSWORD override set =="
before="$(grep -c '\[shutdown\]' "$LOG")"
if start_server env WEBOBSIDIAN_PASSWORD='correct-horse-battery'; then
  chk "login 123456 with an override: refused (#4 + #15)" "401 absent" "$(login 123456)"
  chk "login with the override password: accepted, no forced change" "200 False" \
      "$(login correct-horse-battery)"
  kill -TERM $SRV 2>/dev/null; wait $SRV 2>/dev/null
  chk "second boot shut down gracefully too" "5" "$(( $(grep -c '\[shutdown\]' "$LOG") - before ))"
else
  echo "  FAIL  server did not start (scenario B)"; fail=$((fail+1))
fi

echo "== scenario C: symlinked folder inside the vault (#23) =="
VAULT_C="$(mktemp -d)"; OUTSIDE_C="$(mktemp -d)"
mkdir -p "$OUTSIDE_C/shared"
printf '# from the linked folder' > "$OUTSIDE_C/shared/linked-note.md"
printf 'my own note' > "$VAULT_C/local.md"
ln -s "$OUTSIDE_C/shared" "$VAULT_C/linked"
DATA_DIR="$(mktemp -d)" VAULT_PATH="$VAULT_C" ALLOWED_ROOTS="$OUTSIDE_C" PORT="$PORT" HOST=127.0.0.1 \
  node server/dist/index.js >>"$LOG" 2>&1 &
SRV=$!
for _ in $(seq 1 60); do curl -fsS -m 1 "$BASE/healthz" >/dev/null 2>&1 && break; sleep 0.5; done
curl -s -c /tmp/wo-cookies.txt -o /dev/null -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' -d '{"password":"123456"}'
chk "GET /api/files lists the symlinked folder" "['linked-note.md']" \
    "$(curl -s -b /tmp/wo-cookies.txt "$BASE/api/files" \
       | python3 -c "import json,sys; t=json.load(sys.stdin); print([c['name'] for c in next(f for f in t['children'] if f['name']=='linked')['children']])")"
code_c="$(curl -s -o /tmp/wo-c.json -w '%{http_code}' -b /tmp/wo-cookies.txt \
  "$BASE/api/files/content?path=linked%2Flinked-note.md")"
chk "GET /api/files/content reads through the symlink" "200 # from the linked folder" \
    "$code_c $(python3 -c "import json;print(json.load(open('/tmp/wo-c.json'))['content'])")"
kill -TERM $SRV 2>/dev/null; wait $SRV 2>/dev/null

echo "== scenario D: Agent API read-modify-write (adopted from blueberry6401) =="
NOTE_JSON='"content":"# smoke\nline two\nmarker here\nmarker here\n","base_version":""'
NOTE="Testing/smoke.md"
if start_server env; then
  curl -s -c /tmp/wo-d-cookies.txt -o /dev/null -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' -d '{"password":"123456"}'
  KEY="$(curl -s -b /tmp/wo-d-cookies.txt -X POST "$BASE/api/keys" -H 'Content-Type: application/json' \
    -d '{"name":"smoke","scopes":["read","write","search"]}' \
    | python3 -c 'import json,sys;print(json.load(sys.stdin).get("key",""))')"
  chk "POST /api/keys issues an agent key" "wok_" "${KEY:0:4}"

  api() { curl -s -m 10 -H "X-API-Key: $KEY" -H 'Content-Type: application/json' "$@"; }
  jget() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }

  # `echo $got` collapses the whitespace introduced by the line continuations above.
  got="$(curl -s -o /tmp/wo-d-put.json -w '%{http_code}' -X PUT "$BASE/api/v1/notes/$NOTE" \
         -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d "{$NOTE_JSON}") \
         $(jget 'd.get("ok")' < /tmp/wo-d-put.json) \
         $(jget 'len(d.get("version",""))' < /tmp/wo-d-put.json)"
  chk "PUT with base_version \"\" creates the note and returns its version" "200 True 16" "$(echo $got)"
  V1="$(jget 'd["version"]' < /tmp/wo-d-put.json)"

  api "$BASE/api/v1/notes/$NOTE" > /tmp/wo-d-get.json
  chk "GET returns the same version + line count" "$V1 5" \
      "$(jget 'd["version"]' < /tmp/wo-d-get.json) $(jget 'd["totalLines"]' < /tmp/wo-d-get.json)"

  api "$BASE/api/v1/notes/$NOTE?offset=1&limit=2" > /tmp/wo-d-seg.json
  chk "GET ?offset=1&limit=2 returns just those lines" "line two/marker here True" \
      "$(jget 'd["content"].replace(chr(10),"/")' < /tmp/wo-d-seg.json) $(jget 'd["hasMore"]' < /tmp/wo-d-seg.json)"

  api "$BASE/api/v1/note-matches?path=Testing%2Fsmoke.md&q=marker" > /tmp/wo-d-grep.json
  chk "GET /note-matches counts occurrences + reports line numbers" "2 3,4" \
      "$(jget 'd["count"]' < /tmp/wo-d-grep.json) $(jget '",".join(str(m["line"]) for m in d["matches"])' < /tmp/wo-d-grep.json)"

  code="$(curl -s -o /tmp/wo-d-amb.json -w '%{http_code}' -X PATCH "$BASE/api/v1/notes/$NOTE" \
    -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"find":"marker here","replace":"x"}')"
  chk "PATCH with an ambiguous find is refused, with the count" "409 find_ambiguous 2" \
      "$code $(jget 'd.get("error")' < /tmp/wo-d-amb.json) $(jget 'd.get("count")' < /tmp/wo-d-amb.json)"

  api -X PATCH "$BASE/api/v1/notes/$NOTE" -d '{"find":"line two","replace":"line 2"}' > /tmp/wo-d-edit.json
  chk "PATCH find/replace replaces exactly one occurrence" "True 1" \
      "$(jget 'd.get("ok")' < /tmp/wo-d-edit.json) $(jget 'd.get("replaced")' < /tmp/wo-d-edit.json)"

  code="$(curl -s -o /tmp/wo-d-conf.json -w '%{http_code}' -X PUT "$BASE/api/v1/notes/$NOTE" \
    -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d "{\"content\":\"clobber\",\"base_version\":\"$V1\"}")"
  chk "PUT with a stale base_version is refused and reports the current one" "409 version_conflict" \
      "$code $(jget 'd.get("error")' < /tmp/wo-d-conf.json)"
  chk "the refused write did not touch the note" "line 2" \
      "$(api "$BASE/api/v1/notes/$NOTE" | jget 'd["content"].split(chr(10))[1]')"

  got="$(curl -s -o /tmp/wo-d-len.json -w '%{http_code}' -X PUT "$BASE/api/v1/notes/$NOTE" \
         -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"content":"# smoke\\n"}') \
         $(jget 'd.get("ok")' < /tmp/wo-d-len.json)"
  chk "PUT without base_version still works (lenient default)" "200 True" "$(echo $got)"

  chk "GET /notes?folder= lists the note with the requested sort" "Testing/smoke.md modified" \
      "$(api "$BASE/api/v1/notes?folder=Testing&sort=modified" | jget 'd["notes"][0]') $(api "$BASE/api/v1/notes?folder=Testing" | jget 'd["sort"]')"

  echo "== scenario E: MCP server over stdio, against the running instance =="
  if [[ -f mcp-server/dist/index.js ]]; then
    WEBOBSIDIAN_BASE_URL="$BASE" WEBOBSIDIAN_API_KEY="$KEY" node --test mcp-server/test/*.mjs > /tmp/wo-d-mcp.log 2>&1
    mcp_rc=$?
    chk "MCP handshake, tools/list, tool calls, input constraints and conflicts" "0" "$mcp_rc"
    [[ $mcp_rc -ne 0 ]] && tail -20 /tmp/wo-d-mcp.log | sed 's/^/  MCP  /'
  else
    echo "  FAIL  mcp-server/dist/index.js missing (run npm run build)"; fail=$((fail+1))
  fi

  kill -TERM $SRV 2>/dev/null; wait $SRV 2>/dev/null
else
  echo "  FAIL  server did not start (scenario D)"; fail=$((fail+1))
fi

echo "== scenario F: WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1 refuses unversioned writes =="
if start_server env WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1; then
  curl -s -c /tmp/wo-f-cookies.txt -o /dev/null -X POST "$BASE/auth/login" \
    -H 'Content-Type: application/json' -d '{"password":"123456"}'
  KEY_F="$(curl -s -b /tmp/wo-f-cookies.txt -X POST "$BASE/api/keys" -H 'Content-Type: application/json' \
    -d '{"name":"strict","scopes":["read","write"]}' \
    | python3 -c 'import json,sys;print(json.load(sys.stdin).get("key",""))')"
  code="$(curl -s -o /tmp/wo-f.json -w '%{http_code}' -X PUT "$BASE/api/v1/notes/Testing/strict.md" \
    -H "X-API-Key: $KEY_F" -H 'Content-Type: application/json' -d '{"content":"# x\n"}')"
  chk "strict mode: PUT without base_version is refused" "400 missing_base_version" \
      "$code $(python3 -c 'import json;print(json.load(open("/tmp/wo-f.json")).get("error"))')"
  code="$(curl -s -o /tmp/wo-f2.json -w '%{http_code}' -X PUT "$BASE/api/v1/notes/Testing/strict.md" \
    -H "X-API-Key: $KEY_F" -H 'Content-Type: application/json' -d '{"content":"# x\n","base_version":""}')"
  chk "strict mode: PUT with base_version still works" "200 True" \
      "$code $(python3 -c 'import json;print(json.load(open("/tmp/wo-f2.json")).get("ok"))')"
  kill -TERM $SRV 2>/dev/null; wait $SRV 2>/dev/null
else
  echo "  FAIL  server did not start (scenario F)"; fail=$((fail+1))
fi

echo "== scenario G: vault locks — the browser is refused, the agent is not =="
VAULT_G="$(mktemp -d)"
mkdir -p "$VAULT_G/_system" "$VAULT_G/relats/raw" "$VAULT_G/relats/tasks"
printf '# frozen evidence\n' > "$VAULT_G/relats/raw/2026-09-26-evidence.md"
printf '# a normal note\n' > "$VAULT_G/relats/tasks/work.md"
cat > "$VAULT_G/_system/locks.json" <<'JSON'
{ "unlock": "confirm", "locked": [ { "glob": "relats/raw/**", "reason": "Frozen evidence — ask the agent for a new snapshot." } ] }
JSON
DATA_DIR="$(mktemp -d)" VAULT_PATH="$VAULT_G" PORT="$PORT" HOST=127.0.0.1 node server/dist/index.js >>"$LOG" 2>&1 &
SRV=$!
for _ in $(seq 1 60); do curl -fsS -m 1 "$BASE/healthz" >/dev/null 2>&1 && break; sleep 0.5; done
curl -s -c /tmp/wo-g-cookies.txt -o /dev/null -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' -d '{"password":"123456"}'

chk "GET /api/files marks the locked note and leaves the other one editable" "True False" \
    "$(curl -s -b /tmp/wo-g-cookies.txt "$BASE/api/files" | python3 -c "
import json,sys
t=json.load(sys.stdin)
def find(n,p):
    if n['path']==p: return n
    for c in n.get('children',[]):
        r=find(c,p)
        if r: return r
    return None
print(*[bool(find(t,p).get('locked')) for p in ('relats/raw/2026-09-26-evidence.md','relats/tasks/work.md')])")"

code="$(curl -s -o /tmp/wo-g-put.json -w '%{http_code}' -b /tmp/wo-g-cookies.txt -X PUT "$BASE/api/files/content" \
  -H 'Content-Type: application/json' -d '{"path":"relats/raw/2026-09-26-evidence.md","content":"# tampered\n"}')"
chk "a session write to a locked note: refused with 423 + the error name" "423 locked" \
    "$code $(python3 -c 'import json;print(json.load(open("/tmp/wo-g-put.json")).get("error"))')"
chk "the refused write changed nothing on disk" "# frozen evidence" \
    "$(head -1 "$VAULT_G/relats/raw/2026-09-26-evidence.md")"

code="$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/wo-g-cookies.txt -X PUT "$BASE/api/files/content" \
  -H 'Content-Type: application/json' -H 'x-unlock-locked: 1' \
  -d '{"path":"relats/raw/2026-09-26-evidence.md","content":"# edited on purpose\n"}')"
chk "the unlock header opens it (confirm mode)" "200" "$code"

code="$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/wo-g-cookies.txt -X PUT "$BASE/api/files/content" \
  -H 'Content-Type: application/json' -d '{"path":"relats/tasks/work.md","content":"# mine to edit\n"}')"
chk "an unlocked note still saves normally" "200" "$code"

KEY_G="$(curl -s -b /tmp/wo-g-cookies.txt -X POST "$BASE/api/keys" -H 'Content-Type: application/json' \
  -d '{"name":"smoke-g","scopes":["read","write"]}' | python3 -c 'import json,sys;print(json.load(sys.stdin).get("key",""))')"
code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/v1/notes/relats/raw/2026-09-26-evidence.md" \
  -H "X-API-Key: $KEY_G" -H 'Content-Type: application/json' -d '{"content":"# the agent wrote this\n"}')"
chk "the agent's key writes the same locked note (a lock binds the browser session only)" "200" "$code"

# `echo $got` collapses the whitespace the line continuations introduce.
got="$(curl -s -o /tmp/wo-g-404.json -w '%{http_code}' -b /tmp/wo-g-cookies.txt \
       "$BASE/api/files/content?path=relats/raw/2026-09-26-no-such-note.md") \
       $(python3 -c 'import json;print(json.load(open("/tmp/wo-g-404.json")).get("error"))')"
chk "reading a note that does not exist is a 404, not a 500" "404 not_found" "$(echo $got)"
kill -TERM $SRV 2>/dev/null; wait $SRV 2>/dev/null

echo
echo "shutdown log (last boot):"
grep '\[shutdown\]' "$LOG" | tail -5 | sed 's/^/  /'
echo
echo "RESULT: $pass passed, $fail failed"
exit $((fail > 0))
