# CLAUDE.md — WebObsidian contributor guidance

## Upstream contribution — authoritative routing

This branch contributes the integrated `macros0`, `phamtruonghung` and `lakylekidd`
community work to `xnohat/webobsidian`. Read `docs/FORK_INTEGRATION.md` for historical
source revisions and merge decisions.
Use `--repo xnohat/webobsidian` explicitly for upstream GitHub operations. References below
to the Pham issue tracker or LXC 107 describe the source fork and must not direct operations there.
Do not deploy or access a real vault unless explicitly requested. Use temporary local vaults
for tests. Automatic trash retention defaults to zero (keep forever).

Validation: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`,
`node scripts/integration-smoke.mjs`; desktop typecheck/build via its workspace scripts.
Linux CI also runs `scripts/smoke-test.sh` for auth, symlinks, Agent API and MCP.

## Bối cảnh
WebObsidian là web app self-hosted clone toàn diện Obsidian. Thiết kế chính thức nằm ở
[PRD.md](PRD.md). Tiến độ phát triển được track ở [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Nguyên tắc bắt buộc (đọc trước mỗi phiên làm việc)

1. **Luôn bám sát PRD.md.** Trước khi code một tính năng, đối chiếu với phần FR/NFR/API/data
   model tương ứng trong PRD. Không tự ý đổi kiến trúc hay phạm vi. Nếu thấy cần lệch khỏi PRD,
   **cập nhật PRD.md trước** (ghi rõ lý do, tăng version/changelog) rồi mới code.

2. **Luôn cập nhật IMPLEMENTATION_PLAN.md.** Mỗi khi bắt đầu hoặc hoàn thành một mục:
   - Đổi checkbox: `[ ]` → `[~]` (đang làm) → `[x]` (xong).
   - Cập nhật dòng "Cập nhật lần cuối" và thêm dòng vào "Nhật ký tiến độ" (ngày + tóm tắt).
   - Một mục chỉ đánh `[x]` khi code chạy được/được kiểm chứng, không phải khi mới viết xong.

3. **Đồng bộ với todo list của session.** Todo nội bộ phải phản ánh các mục trong plan.

4. **Tài liệu là nguồn sự thật.** Khi phạm vi thay đổi theo yêu cầu người dùng: cập nhật PRD.md
   (thiết kế) và IMPLEMENTATION_PLAN.md (thêm/sửa mục) trong cùng lần thay đổi.

## Quy ước kỹ thuật
- Ngôn ngữ: TypeScript cho cả server và web. Tránh `any` khi có thể.
- Cấu hình runtime: chỉ dùng file JSON (`data/settings.json`) — không thêm DB engine.
- Bảo mật: không log secret/token/API key; hash trước khi lưu; guard path traversal.
- Commit/push git **chỉ khi người dùng yêu cầu**.

## Lệnh hữu ích
```bash
npm install            # cài deps toàn workspace
npm run dev            # chạy server + web (dev)
npm run build          # build web rồi server
npm run start          # chạy production (server serve web đã build)
npm run typecheck      # kiểm tra type cả 2 workspace
docker compose up      # chạy full stack
```

## Cấu trúc (xem PRD §2.2)
- `server/` — Express API (routes, services, middleware, plugins shim).
- `web/` — React SPA (components, lib, styles).
- `data/` — runtime config & index (gitignored).
- `docs/` — tài liệu bổ sung.

## Ghi chú riêng của fork
Đây là fork `phamtruonghung/webobsidian` (= upstream + toàn bộ PR đang mở đã merge). Xem
[docs/UPSTREAM_PR_MERGES.md](docs/UPSTREAM_PR_MERGES.md) trước khi "sửa" một lỗi trông giống lỗi
upstream. Deploy production chạy trên LXC 107 qua Docker Compose + self-hosted runner — quy trình,
runbook và rollback ở [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Agent skills

### Issue tracker

Issues live as GitHub issues in this fork (`phamtruonghung/webobsidian`); use the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles map one-to-one: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix` (plus repo labels `deploy`, `upstream-sync`). See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `PRD.md` + `IMPLEMENTATION_PLAN.md` are authoritative, `docs/adr/` and `CONTEXT.md`
are created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
