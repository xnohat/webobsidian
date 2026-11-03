#!/usr/bin/env bash
# CI runtime check; owns only its uniquely named disposable container.
set -euo pipefail
name="webobsidian-mcp-smoke-$$"
port="${MCP_SMOKE_PORT:-18787}"
base="http://127.0.0.1:$port"
cleanup() { docker rm -fv "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$name" -p "127.0.0.1:$port:8787" \
  -e WEBOBSIDIAN_PASSWORD=mcp-container-test-password \
  -e WEBOBSIDIAN_MCP_ENABLED=true -e "WEBOBSIDIAN_MCP_PUBLIC_URL=$base/mcp" \
  "${1:-webobsidian:ci}" >/dev/null
ready=false
for _ in $(seq 1 90); do
  if curl -fsS "$base/healthz" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if ! "$ready"; then docker logs "$name"; exit 1; fi
test "$(curl -s -o /dev/null -w '%{http_code}' "$base/mcp")" = 401
cookie="$(curl -fsS -D - -o /dev/null "$base/auth/login" -H 'Content-Type: application/json' \
  -d '{"password":"mcp-container-test-password"}' | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\);.*/\1/p' | tr -d '\r')"
test -n "$cookie"
record="$(curl -fsS "$base/api/keys" -H "Cookie: $cookie" -H 'Content-Type: application/json' \
  -d '{"name":"docker-smoke","scopes":["read","search"]}')"
key="$(printf '%s' "$record" | jq -r .key)"
id="$(printf '%s' "$record" | jq -r .record.id)"
rpc() { curl -fsS "$base/mcp" -H "Authorization: Bearer $key" \
  -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' -d "$1"; }
rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"docker-ci","version":"1"}}}' | jq -e '.result.serverInfo.name == "webobsidian"' >/dev/null
rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq -e '.result.tools | length == 10' >/dev/null
rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_tags","arguments":{}}}' | jq -e '.result.isError != true' >/dev/null
rpc '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"write_note","arguments":{"path":"denied.md","content":"denied"}}}' | jq -e '.result.isError == true' >/dev/null
curl -fsS -X DELETE "$base/api/keys/$id" -H "Cookie: $cookie" >/dev/null
test "$(curl -s -o /dev/null -w '%{http_code}' "$base/mcp" -H "Authorization: Bearer $key")" = 401
cleanup
docker run -d --name "$name" -p "127.0.0.1:$port:8787" \
  "${1:-webobsidian:ci}" >/dev/null
ready=false
for _ in $(seq 1 90); do
  if curl -fsS "$base/healthz" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if ! "$ready"; then docker logs "$name"; exit 1; fi
test "$(curl -s -o /dev/null -w '%{http_code}' "$base/mcp")" = 404
echo 'Docker MCP runtime smoke passed'
