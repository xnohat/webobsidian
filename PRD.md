> Review fixes 2026-10-30: CLI must not install a permanent well-known recovery password;
> closing a dirty tab awaits successful persistence; rename rejects occupied destinations;
> browser and Agent API version checks and writes share one in-process vault transaction;
> recursive copies validate every resolved path and publish only complete copies;
> text writes use exclusive unique temporary files. Transactions cover one server process,
> not independent filesystem writers or concurrent external symlink replacement.

# PRD — WebObsidian

## Browser language packs — 2026-11-03

The web client supports user-imported UTF-8 language files using Obsidian's
`[key]`, `original=`, `translation=` format. Its own English catalog supplies
fallback strings and a downloadable blank template. Users obtain external files
themselves through the repository link in Settings → Language. One active pack
is saved in the authenticated server settings and shared by browsers of this
WebObsidian instance. A local cache supplies startup/offline labels. Imports validate parameters and preserve
the current pack on failure. Compatible strings update React and existing editor
widgets immediately. Document names, text, command IDs and saved custom labels
retain their literal values. A fresh installation and an explicit language reset
use English throughout the application, including PDF controls, file menus,
external-change notices and editor messages, regardless of browser language.
Imported language packs provide translated strings with English fallbacks.
Public server-rendered pages,
native Electron menus and third-party plugin strings are outside this first
version. Users obtain official dictionaries themselves and explicitly upload
their chosen file. Successful imports save only compatible strings on the server.
Existing browser-local packs migrate when the server has no language setting.
An explicit reset clears the server setting and local cache. Returning to a
browser window or opening Language settings refreshes its active server pack.

> FR-2 clarification 2026-10-29: literal angle identifiers containing underscores
> (for example `<LS_BEN>`) must use the normal body text color, not HTML tag red.
> Apply in Source/Live/Reading without editing the note. Earlier red-preservation
> acceptance is superseded by this explicit user correction.
> Paired multiline backticks in Live also follow Obsidian's observed behavior across
> blank paragraphs: delimiters conceal and body lines stay literal in normal type.

> FR-2 background parity follow-up 2026-10-29: synthetic Obsidian 1.14.5 captures
> run in a separate hidden profile without OS focus/input. Match measured text/table
> metrics; render quoted/list tables with preserved empty columns and container prefixes;
> resolve compound heading paths within their parent sections. Transclusion follows the
> observed six-level depth limit. Viewing never rewrites note text. Capture evidence and
> remaining visual matrix are tracked in `docs/rendering-compatibility.md`.

> FR-2 rendering parity follow-up 2026-10-29: shared browser/public Markdown dialect
> and HTML policy, rendered table inline formatting, nested callouts, numbered Reading
> footnotes with local navigation, paragraph/list block embeds and source-relative note
> resolution. Unsupported complex YAML remains visible as source instead of entering the
> lossy simple Properties editor. Source is never rewritten to achieve display parity.
> Original Obsidian 1.14.5 comparison evidence and remaining limitations:
> `docs/rendering-compatibility.md`. Pixel-level visual acceptance is still pending.

> FR-2 rendering parity, critical batch 2026-10-29: viewing and cursor movement must
> preserve note text. Literal angle identifiers remain visible beside valid inline HTML;
> code, escapes and HTML attributes must not trigger unrelated Markdown extensions.
> Reading/preview/public hide comments; Live keeps them editable. Heading embeds select
> only their section and subsections; embedded image resolution carries the source path.
> Implementation status and remaining compatibility work:
> `docs/superpowers/plans/2026-10-29-rendering-parity-progress.md`.

> CI maintenance 2026-10-29: GitHub Actions validates Node 22 workspaces, Electron browser
> fixtures, desktop packaging and Docker builds on main pushes, main PRs and manual runs.
> A separate dependency audit rejects every advisory severity (including dev dependencies)
> and retains its JSON report for 14 days. Jobs use read-only tokens, timeouts and cancellation
> of superseded runs. Existing deployment restrictions and application behavior are unchanged.

> FR-2 full toolbar implementation 2026-10-29 (revision 2):
> port the 64 standard Editing Toolbar commands into the native editor, including
> popup subpanels, nested groups, palettes, parameter dialogs, selection/fixed/mobile
> layouts, configuration and import. Preserve selection and document identity across
> overlays; verify formatting in Live Preview, Reading, split preview and public shares.
> Design: `docs/superpowers/specs/2026-10-29-full-editing-toolbar-design.md`.
> Execution plan: `docs/superpowers/plans/2026-10-29-full-editing-toolbar.md`.
> Third-party Obsidian commands and AI/PKMer integrations are separate compatibility work.

> FR-2 formatting extension 2026-10-29: extend the existing desktop/mobile toolbar with
> text and background color palettes (including reset). Store colors as standard inline
> HTML spans with hex color styles for Obsidian compatibility. Preserve safe colors in
> Markdown preview without admitting arbitrary CSS. Show a compact selection toolbar
> with bold/italic/link/code and the same color controls, positioned by CodeMirror within
> the viewport. Keep selection when clicking controls, support Undo/Redo and Escape,
> and prohibit formatting in read-only/locked editors. No new dependencies or deployment.

> Rendering dependency maintenance 2026-10-29: update KaTeX to the patched 0.18 line and Mermaid
> to 12.2, including Mermaid's KaTeX copy. Preserve default untrusted math rendering, sanitizers
> and both preview paths. Mermaid 12 requires an ES2024-capable browser (Safari 17.4+); layout
> changes are accepted for this upgrade. Validate representative formulas and diagrams locally.
> This supersedes the earlier rendering deferral; production deployment remains out of scope.

> Moderate dependency maintenance 2026-10-29: refresh Hono/node adapter, fast-uri, ip-address and
> qs within their parent ranges, and update the desktop compiler to esbuild0.28.2. Preserve all
> application behavior and keep KaTeX/Mermaid declarations and locked package entries unchanged.
> Validation uses disposable local fixtures; deployed server and real vaults remain out of scope.

> High dependency maintenance 2026-10-29: remove remaining high entries through maintained
> Electron 43 (preserve Windows ia32), Vite 6.4, MCP SDK, Multer and Zod 4 upgrades plus compatible
> transitive patches. Preserve settings defaults, secrets, schema behavior, uploads, MCP tools and
> desktop isolation. Keep Node ≥22.12 and all deployment restrictions unchanged.

> Security maintenance 2026-10-29: remove all currently reported critical dependency versions
> through supported parent-package upgrades and compatible transitive patches. Preserve auth,
> Markdown/media, Git sync and desktop packaging behavior. Development/CI now requires Node ≥22.12
> for supported electron-builder tooling; Docker remains on Node 22. No production deployment.

> Fork integration 2026-10-29: combine the pinned `phamtruonghung` and `lakylekidd`
> revisions from `docs/superpowers/plans/2026-10-29-community-forks.md`. Preserve
> both feature sets and security boundaries. Automatic trash retention is opt-in
> in `macros0/webobsidian`; its default is zero days (keep forever). Production
> deployment is outside this integration task.

> Product Requirements Document
> Phiên bản: 1.24 · Cập nhật: 2026-11-02 · Trạng thái: Draft
> Changelog 1.24 (FR-2, FR-12): fenced JavaScript, Python and YAML use the native editor token palette in Live, Reading and Source modes. Canvas uses compact native selection controls, height-dependent text padding and an initial fit capped at 100%. The browser tab uses the official Obsidian gradient icon.
> Changelog 1.23 (FR-23 — chọn giá trị cho thuộc tính đóng: nút `▾` + danh sách giá trị, issue #61): trên
> trang task, `status:` là **text tự do** nên đổi trạng thái phải gõ đúng id — mà gõ sai thì không vô hại:
> board chỉ map id canonical (`open`/`in-progress`/`blocked`/`done`) + vài alias, mọi giá trị khác thành
> một cột riêng và **không bao giờ** bị sửa lại khi đọc. Thêm `web/src/lib/propOptions.ts` (bảng từ vựng
> theo `relats/SCHEMA.md`: `status`, `priority`, `origin`, `confidence`, `severity`) và nút `▾` cạnh giá
> trị ở Properties mở danh sách (**giá trị lạ giữ nguyên, đứng đầu, gắn nhãn**; field vẫn là text sửa
> được; chọn xong ghi qua đúng đường frontmatter như gõ tay).
> Changelog 1.22 (FR-22 — tải file nhị phân từ vault: pane tải + `Content-Disposition`, issue #59): file
> Word/Excel/PowerPoint nằm trong vault nhưng **không lấy ra được**: mọi định dạng không có viewer rơi vào
> editor markdown (hiện byte nhị phân) và URL duy nhất phục vụ file
> (`GET /api/files/content?path=…`) được trình duyệt lưu thành `content` **không có phần mở rộng**, nên không
> ứng dụng nào mở được. Thêm `?download=1` (server gửi `Content-Disposition: attachment` kèm tên file thật,
> có `filename*` RFC 5987 cho tên không ASCII) và `fileViewKind()` trả `attachment` cho nhóm tài liệu/nén
> (`DOWNLOAD_EXT_RE`) ⇒ pane tải với tên file + nút **Download**.
> Changelog 1.21 (FR-21 — xem file PDF: pane xem + embed `![[x.pdf]]`, issue #57): PDF nằm trong vault
> nhưng **không xem được ở đâu**: `EditorPane` chỉ có nhánh `.md`/canvas/ảnh/video/audio nên mọi đường vào
> (`/note/<path>.pdf`, click trong cây file, wikilink) đều mở một tab editor trống, dù
> `GET /api/files/content` đã phục vụ file đúng. Thêm `fileViewKind()` (`lib/media.ts`) làm một nguồn duy
> nhất cho cả ba đường render, pane PDF là iframe trỏ vào chính endpoint file (trình xem của trình duyệt lo
> phân trang/zoom/tìm/in); `![[x.pdf]]` render inline ở Live Preview (widget) và ở Reading/Preview (link trơ
> mang `data-href`, pass post-render thay bằng iframe — schema sanitize **không** nới); CSP đổi
> `frame-ancestors 'none'` → `'self'` vì chính app khung nội dung của mình; link tới file đính kèm không
> tồn tại không còn sinh note rác (`report.pdf`).
> Changelog 1.20 (FR-20 — hai lỗi đường dẫn: note không tồn tại trả 500 thay vì 404; lệnh daily note
> ghi ra `Daily/<iso>.md` ở gốc vault bất kể vault đặt thư mục daily ở đâu, issue #52 và #55): lỗi 404
> do `GET /api/files/content` giải đường dẫn theo basename (cho embed `![[image.png]]`) rồi vẫn đọc tiếp
> khi chưa thấy file, nên ENOENT của `readFileText` nổi lên thành 500 — sửa bằng một nhánh trả
> `404 {error:"not_found"}` sau khi đã thử giải basename; lỗi daily note do `web/src/lib/store.ts` suy ra
> đường dẫn `Daily/<iso>.md` cứng ở gốc vault, sinh file rác ở gốc cho mọi vault có thư mục daily nằm sâu
> hơn — sửa bằng cách chọn thư mục `daily/` **nông nhất** trong cây, chỉ rơi về `Daily/` gốc khi vault
> không có thư mục daily nào.
> Changelog 1.19 (FR-19 — khoá ghi chú cho trình duyệt (vault locks), issue #53 và #54): app vốn đã tách
> hai đường ghi (`/api/files/*` bằng cookie phiên cho người dùng, `/api/v1/*` bằng `X-API-Key` cho agent),
> nên khoá chỉ cần là một middleware trên router của phiên: `_system/locks.json` liệt kê glob + lý do, phiên
> bị từ chối bằng `423 Locked`, agent vẫn ghi bình thường. Cây file hiện 🔒, editor chuyển read-only kèm
> banner nêu lý do; mở khoá có chủ ý theo `unlock` = `confirm` / `password` / `off`.
> Changelog 1.18 (FR-18 — sửa lỗi popup gợi ý trên theme Catppuccin, issue #49): gõ `[[` để chèn liên
> kết trên theme Catppuccin thì danh sách gợi ý hiện **chữ đen** (theme đang dùng là `catppuccin-mocha`,
> một theme tối) — popup bị mount ra ngoài wrapper theme vì nơi mount chỉ tìm `.theme-light, .theme-dark`,
> thiếu bốn class `theme-ctp-*`. Biến palette (`--text-normal`, `--background-primary`…) chỉ khai báo trên
> wrapper `.theme-*`, nên ngoài đó mọi `var()` vô hiệu: chữ về màu đen mặc định, nền trong suốt. Sửa bằng
> một helper duy nhất `themedPopupHost()` (`web/src/lib/theme.ts`) — dùng chung `THEME_SELECTOR` với
> `THEME_CLASS` nên theme mới thêm sẽ tự đúng; áp cho suggester `[[`/`#`, dropdown giá trị trong Properties
> và toast của plugin. Thêm guard test `web/tests/themeHost.test.ts` để shortcut hai class không quay lại.
> Changelog 1.17 (review bản deploy — FR-2/FR-3/FR-11/FR-15/NFR, theo yêu cầu người dùng): sửa các lỗi
> tìm thấy khi dùng thử bản production. **Bảng** không còn bẻ chữ giữa từ ("Own|er", "hun|g") — bảng rộng
> cuộn ngang trong khung riêng thay vì bị ép theo độ rộng dòng (desktop + mobile). **Rate limit login**
> thêm `CLIENT_IP_HEADER` (vd `CF-Connecting-IP`): sau tunnel mọi khách cùng một địa chỉ socket nên 10 lần
> sai của người lạ khoá luôn chủ vault; header chỉ được tin khi peer là proxy tin cậy theo `TRUST_PROXY`.
> **WebSocket** tự kết nối lại (backoff 1s→30s, reload tree sau khi nối lại), server ping mỗi 30s (Cloudflare
> cắt WS rảnh ~100s) và `GET /ws` không upgrade trả **426** thay vì `index.html`. **Tasks board**: cột co giãn
> (240–340px) nên 4 cột vừa màn laptop; nhãn "N hidden". **Graph**: tự fit toàn bộ graph khi layout lắng
> (chỉ zoom ra, bỏ qua nếu người dùng đã pan/zoom), nhãn chồng nhau bị ẩn (ưu tiên node nhiều liên kết),
> footer "N nodes · M notes". **Inline title**: thêm setting `ui.showInlineTitle` (Appearance → Show inline
> title, mặc định bật như Obsidian). **Recent/Bookmarks** hiện thư mục cha khi trùng tên. **Snippet tìm
> kiếm** bỏ cú pháp Markdown (`[[…]]`, `**`, `#`, `|---|`), giữ highlight; không còn lộ nửa dòng thứ 3.
> **Trang login** dùng theme lần trước của trình duyệt (không loé nền sáng). **Mobile**: bỏ
> `maximum-scale=1` (cho phép pinch-zoom), ô nhập 16px để iOS không tự zoom. **Cache**: `/assets/*` (tên có
> hash) `max-age=1y, immutable`.
> Changelog 1.16 (FR-17 — sửa lỗi chọn template, issue #46): **chọn template nay là hành động rõ ràng** —
> hover chỉ là hiệu ứng, **click mới chọn** (trước đây `onMouseEnter` đặt cùng state với click nên hover
> đã chọn template và cú click trở nên vô nghĩa; template đầu danh sách còn bị chọn sẵn dù người dùng
> chưa chọn gì). Hàng template chuyển thành `<button>` (click, focus, Enter/Space), modal thêm dòng
> **Template:** nêu tên template đang chọn, và form nói rõ **vì sao chưa tạo được** thay vì để nút chết.
> **Thư mục là bắt buộc**: template không suy ra được thư mục (`document`, `procedure`, `query`,
> `shift-handover`) trước đây vẫn tạo được và **ghi note ra gốc vault** — nay `Create` bị chặn cho tới khi
> có thư mục, và store action từ chối thư mục rỗng, nên gốc vault không bao giờ nhận note từ template.
> Changelog 1.15 (FR-17 — Tạo note từ template, issue #42): thêm lệnh **New note from template**
> (command palette + ribbon) tạo note mới từ một template trong thư mục `templates` của vault: tự đặt
> tên `<YYYY-MM-DD>-<slug>.md`, tự suy **thư mục đích** từ tên template (`meeting`→`meetings`,
> `query`→`queries`, `weekly-review`→`reviews`), tự thay placeholder (`{{title}}`, `{{date}}`,
> `{{time}}`, `{{slug}}` và đúng dạng chữ `YYYY-MM-DD` / `YYYY-MM-DD-slug` mà vault đang dùng — template
> hiện có chạy được ngay, không phải migrate), rồi mở note vừa tạo. **Đường dẫn sẽ ghi được hiện ra
> trước khi ghi** và ô thư mục luôn sửa được; **không bao giờ ghi đè** (create-only, trùng tên nhảy
> `-2`, `-3`) và **không tự tạo thư mục thiếu** — báo lỗi thẳng. Không thêm endpoint, dependency hay
> setting nào; logic thuần ở `web/src/lib/templates.ts`.
> Changelog 1.14 (FR-15 — Tasks view: đặt hạn từ board/timeline, issue #41): badge hạn trên thẻ trở
> thành **control** — click mở `<input type="date">` ngay tại chỗ (Enter lưu, Esc huỷ, có nút Clear →
> `due: none`), và menu `⋯` thêm "Set due date…"/"Clear due date" để tìm được bằng bàn phím. Ghi qua
> hàm thuần `setTaskDue` (đổi **đúng** dòng `due:` + `updated:`, CAS `baseVersion`, rollback + notify
> như thao tác kéo thẻ). Chip **"Needs a due date"** lọc nhanh các task chưa có hạn (đếm theo tập đang
> hiện sau bộ lọc trạng thái). **Template `Wiki/templates/task.md`** đổi `due: none` → `due: YYYY-MM-DD`
> kèm quy ước "hạn là một phần của định nghĩa action"; `Wiki/SCHEMA.md` nói `due` là bắt buộc, `none`
> chỉ khi cố ý — để việc thiếu hạn trở thành quyết định nhìn thấy được, không phải ô trống im lặng.
> Changelog 1.13 (FR-15 — Tasks view: lọc theo trạng thái, mặc định ẩn `done`, issue #39): thêm
> **hàng lọc Status** — mỗi trạng thái một chip kèm số thẻ (4 trạng thái chuẩn theo thứ tự cột, kể cả
> khi 0 thẻ, rồi tới các giá trị lạ đang có). **Mặc định ẩn `done`**; giá trị lạ vẫn hiện (không ẩn dữ
> liệu người dùng chưa yêu cầu ẩn). Không có gì bị ẩn âm thầm: hàng lọc ghi rõ "N hidden — show all"
> (một click để bỏ lọc) và số thẻ trên thanh công cụ phản ánh phần đang hiện. **Cột Done vẫn được vẽ**
> dù thẻ bị ẩn — giữ nó làm chỗ thả để còn kéo thẻ sang Done được, header ghi `+N hidden`, thân cột ghi
> rõ lý do. Timeline dùng chung bộ lọc này.
> Changelog 1.12 (FR-16 — Timeline: tuần hiển thị tối thiểu 8 tuần tới, issue #37): zoom **Week**
> nay **theo bề rộng thật của trục** — `pxPerDay = clamp(usable / (56/0.88), 4, 20)` với 12% bề ngang
> giữ lại phía sau hôm nay — nên **8 tuần tới luôn nằm trong màn hình** ở mọi bề rộng khả thi
> (đo được: 1440px → 8.0 tuần · 1000px mở cả hai sidebar → 8.0 · 390px → 8.0), thay vì 2–4 tuần như
> mức 16px/ngày cố định trước đây. Dải thời gian luôn vẽ sẵn **56 ngày tới** kể cả khi mọi task đến
> hạn sớm hơn. Nhãn trục đổi định dạng theo mật độ: `Sep 14` khi rộng, `14` khi dày (dải tháng đã nêu
> tên tháng). Thêm chip "N weeks ahead" trên thanh công cụ. Cột nhãn chuyển compact theo **bề rộng
> pane** (không chỉ viewport); Month zoom còn 3px/ngày để Week luôn > Month.
> Changelog 1.11 (FR-16 — Timeline: restyle giao diện, issue #35): trục **2 tầng** (dải tháng +
> tick tuần), nhãn ngày dạng "Sep 28" thay cho "09-28", **tô nền cuối tuần**, lưới phân cấp
(ngày mảnh / tuần / tháng đậm) thay cho lớp gradient mỗi ngày, thanh bo góc có chip priority +
> tên task bên trong, **hôm nay** = dải + đường + nhãn "Today", cột nhãn sticky có bóng đổ, và
> **trạng thái hiện bằng chữ** trong cột nhãn (không chỉ dựa vào màu). Cột nhãn rộng 200px, thu
> còn 132px ở ≤640px. Sửa bug: auto-scroll "về hôm nay" chạy lúc chưa có task nên bị kẹp về 0 —
> giờ cuộn lại khi dải/zoom đổi và nhường người dùng ngay khi họ tự cuộn.
> Changelog 1.10 (FR-16 — Tasks view: Timeline/Gantt, phần 2/2 của FR-15, issue #32): thêm chế độ
> **Timeline** trong cùng Tasks view — mỗi task một thanh `raised`→`due` (fallback `created`, thiếu
> `due` → thanh nét đứt mở chạy tới hôm nay), module thuần `web/src/lib/gantt.ts` tính trên chỉ số
> ngày UTC (không lệch ngày vì DST), dải tự fit + pad 3 ngày, zoom Day/Week/Month, đường hôm nay,
> thanh quá hạn viền đỏ; cột trái sticky + cuộn ngang. Mode Board|Timeline nằm trong store
> (`tasksMode`, **không** persist) và **URL là nguồn sự thật lúc load** — sửa bug `/tasks?mode=timeline`
> bị `urlsync` ghi đè thành `/tasks` khi restore, rơi âm thầm về board (có test hồi quy). Không
> thêm endpoint/dependency runtime; không dependency-arrow/auto-scheduling/critical path (non-goal).
> Changelog 1.9 (FR-15 — Tasks view: Kanban board trên ghi chú `type: task`, theo yêu cầu người dùng
> issue #31): thêm **Tasks view** dạng **Kanban** phủ lên các note có frontmatter `type: task` (nguồn
> sự thật vẫn là vault markdown, không DB/sync mới). 4 cột chuẩn `open→Backlog`, `in-progress→Doing`,
> `blocked→Blocked`, `done→Done` (có alias); giá trị `status` lạ → cột riêng, thiếu `status` → Backlog
> kèm dấu chấm "no status field". Kéo thẻ đổi cột ghi lại `status:`/`updated:` vào frontmatter qua
> `PUT /api/files/content` với **compare-and-set tuỳ chọn** (`GET` trả thêm `version`, `PUT` nhận
> `baseVersion` — lệch thì `409 version_conflict`, không đè mù; không truyền thì hành vi cũ giữ
> nguyên). API mới `GET /api/tasks` (session) và `GET /api/v1/tasks` (Agent API, scope `read`) trả
> bản ghi đã chuẩn hoá, tái dùng index QMD sẵn có (không quét lại vault mỗi request). Điều hướng theo
> đúng khuôn `graph://view`: `tasks://view` + `openTasks()`, URL `/tasks?mode=board|timeline` (mode
> `timeline` để dành cho FR-16/#32), ribbon + command palette.
> Changelog 1.8 (FR-6 — Agent API đọc–sửa an toàn + MCP server): mọi lần đọc trả `version`
> (sha256 nội dung, không phụ thuộc mtime nên autosync git không tạo conflict giả); `PUT`/`PATCH`
> nhận `base_version` để compare-and-set (`""` = bắt buộc chưa tồn tại), lệch → `409 version_conflict`
> kèm `currentVersion`; `PATCH {"find","replace"}` sửa tại chỗ theo chuỗi literal (không regex,
> không nội suy `$&`), trùng nhiều chỗ → `409 find_ambiguous` + số lần khớp; đọc phân đoạn theo dòng
> (`?offset=&limit=`) trả `totalLines`/`hasMore`; `GET /note-matches` grep literal trong 1 note kèm số
> dòng + ngữ cảnh; `GET /notes` thêm `sort`/`order`/`folder`. Chế độ chặt
> `WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1` từ chối ghi thiếu `base_version`. Kèm workspace
> `mcp-server` (stdio MCP) bọc Agent API cho Claude Code/Codex… với 10 tool. Tham khảo (adopt) từ
> fork blueberry6401 + Absenthome — xem docs/UPSTREAM_PR_MERGES.md.
> Changelog 1.7 (FR-9 — deploy pipeline của fork: LXC 107 + CI/CD deploy-on-merge): healthcheck probe
> `127.0.0.1` (sửa bug `localhost` → `::1` khiến container báo unhealthy mãi); `deploy/deploy.sh`
> idempotent (sync → backup rolling → build → up → smoke → tự rollback) chạy trên self-hosted runner
> trong LXC 107; `deploy.yml` deploy sau khi CI xanh cho push vào `main`; runbook ở docs/DEPLOYMENT.md.
> Changelog 1.6 (FR-2 — Preview tabs, requested to reduce tab clutter while browsing): selecting a
> note reuses one italicized preview tab. Double-clicking its tab title keeps it open. Editing a
> preview or creating a note also keeps its tab open; preview state persists with the workspace.
> Changelog 1.6 (FR-14 — Command-line process manager `webo`): bổ sung **FR-14** — CLI `webo` nằm trong workspace `packages/webo` quản lý tiến trình server WebObsidian dưới dạng background daemon (PID file + log file + graceful shutdown). Cung cấp các lệnh: `install`, `start`, `stop`, `restart`, `status`, `logs`, `config`, `uninstall`. Môi trường cấu hình lưu tập trung tại `~/.webobsidian/.env`.
> Changelog 1.6 (FR-1 — symlink vault roots): hỗ trợ **symlink trong vault**: folder/file được trỏ qua
> symlink được liệt kê và đọc/ghi bình thường kể cả khi trỏ ra ngoài vault root (miễn realpath nằm trong
> `vault.allowedRoots`); cycle guard bằng `realpath` chống vòng lặp symlink.
> Phiên bản: 1.12 · Cập nhật: 2026-10-16 · Trạng thái: Draft
> Changelog 1.12 (FR-1 — Reveal active file in explorer, issue #36): thêm tuỳ chọn **Settings → Vault & Files → Reveal active file in explorer** (mặc định tắt, lưu trong workspace state nên đồng bộ giữa tab/thiết bị). Khi bật, đổi tab/mở tài liệu sẽ tự mở thư mục cha cần thiết, cuộn tree tới file đang active và highlight đúng 1 file active; khi tắt thì không tự đổi trạng thái mở folder hay vị trí cuộn của file explorer.
> Changelog 1.11 (FR-1 — Manual sorting trong file explorer, issue #34): thêm lựa chọn sort **Manual** trong Files sidebar. Khi bật Manual, người dùng kéo-thả trực tiếp trong tree để đổi thứ tự file/folder theo từng thư mục; thứ tự tuỳ chỉnh lưu trong workspace state server-side (`/api/uistate`) theo key từng parent folder, không đổi tên file/folder và không sửa nội dung markdown. Chuyển sang mode sort khác không xoá dữ liệu manual; chuyển lại Manual thì khôi phục thứ tự cũ. Item mới hoặc item được move vào thư mục sẽ được thêm vào cuối danh sách manual của thư mục đích. **Bổ sung (sửa 3 vấn đề):** (1) ở Manual, kéo thả dùng 3 vùng theo vị trí con trỏ trên hàng — mép trên/dưới = chèn trước/sau (có vạch chỉ vị trí), giữa hàng folder = chuyển vào folder, nên vẫn chuyển được file vào folder cùng cấp; (2) mép dưới hàng cuối (hoặc thả vào vùng trống dưới tree với item ở root) = xuống cuối danh sách; (3) đổi tên/di chuyển giữ vị trí thủ công: đổi tên file/folder giữ nguyên slot, folder mang theo thứ tự con, di chuyển sang folder khác thì xuống cuối thứ tự của folder đích.
> Changelog 1.11 (FR-2 — Floating document outline, issue #32): Live/Reading view hiển thị outline nổi ở lề phải: mỗi heading `#`–`######` là một marker (độ dài theo cấp), marker của section đang xem được làm nổi theo scroll; hover mở rộng thành mục lục có thụt lề, click marker/mục cuộn mượt tới heading. Ẩn khi note không có heading, ở Source mode, khi pane hẹp (<760px) hoặc khi in. Cập nhật tự động khi sửa heading. (Các setting vị trí/độ sâu/min headings để sau.)
> Changelog 1.10 (FR-1 — Ẩn thư mục attachments trong file tree): thêm tuỳ chọn **Settings → Vault & Files → Show attachment folders** (mặc định **tắt**, lưu cùng workspace state nên đồng bộ giữa tab/thiết bị). Khi tắt, thư mục tên `attachments` (không phân biệt hoa thường) bị ẩn khỏi file tree, folder view và hộp "Move to…" — **trừ khi** bên trong (kể cả thư mục con) có note `.md`/`.markdown` hoặc canvas (safeguard để không ẩn thư mục thật của người dùng). Chỉ ẩn khi hiển thị: file vẫn nằm trên đĩa, embed/share không đổi, cảnh báo xoá folder vẫn đếm cả nội dung ẩn; "Reveal file in navigation" cho file nằm trong thư mục ẩn sẽ báo cách bật tuỳ chọn. Sau khi xoá/đưa vào trash file trong `attachments/`, thư mục `attachments/` rỗng được tự dọn (không đụng thư mục khác).
> Changelog 1.9 (FR-1/FR-2 — Local attachment folders + nút xoá ảnh, issue #30): ảnh dán/drop được lưu vào `attachments/` **cạnh note** (tự tạo; tên không bao giờ ghi đè: `image.png`, `image-1.png`…) và chèn đường dẫn tương đối `![](attachments/x.png)`. `GET /api/files/content?path=…&from=<note>` resolve đường dẫn tương đối theo thư mục note trước, rồi mới fallback basename toàn vault. Hover ảnh (Live Preview + Reading) hiện icon thùng rác góc trên-phải: xoá tham chiếu khỏi note; kiểm tra tham chiếu ở note khác (`GET /api/files/references`) — không còn ai dùng thì xoá vĩnh viễn file (`DELETE /api/files?permanent=1`), còn dùng thì cảnh báo và chỉ gỡ khỏi note hiện tại (giữ file).
> Changelog 1.8 (FR-1 — Trash retention): thêm setting `vault.trashRetentionDays` (mặc định **0** trong macros0 (source fork: 30), `0` = giữ mãi) trong Settings → Vault & Files. Item trong `.trash` bị **xoá vĩnh viễn** sau số ngày này, tính từ **thời điểm item được chuyển vào trash** (không phải mtime của file — `rename` giữ nguyên mtime gốc). Thời điểm ghi trong `<trash>/.trash-index.json`; item có sẵn trong trash trước tính năng được bắt đầu tính từ lần quét đầu tiên (không bị xoá ngay). Dọn lúc khởi động, mỗi giờ và ngay khi đổi setting; chỉ tác động trong `.trash`.
> Changelog 1.7 (FR-1 — Inline rename từ file tree, issue #19): double-click tên file, folder hoặc canvas để vào inline rename; Enter xác nhận, Escape huỷ. Giữ Rename trong context menu và dùng cùng validation hiện có.
> Changelog 1.6 (FR-2 — Link preview card, issue #7): URL đứng riêng một dòng render thành thẻ preview (thumbnail, title, mô tả 2 dòng, domain) ở Reading view, Live Preview và trang Public share; Markdown gốc giữ nguyên, lỗi fetch → link thường. Server fetch metadata an toàn (chặn IP nội bộ, giới hạn redirect/size/timeout, chỉ lấy OG text) qua provider chain mở rộng được.
>
> Changelog 1.5 (FR-13 — Desktop app Electron đa nền tảng, theo yêu cầu người dùng): bổ sung **FR-13** —
> đóng gói WebObsidian thành **app cài đặt** macOS/Windows/Linux (arm64/x64/ia32). Workspace mới `desktop/`
> là **Electron shell** spawn đúng server Express hiện có như tiến trình con (qua `ELECTRON_RUN_AS_NODE`,
> bind `127.0.0.1` + cổng ngẫu nhiên) và load SPA trong `BrowserWindow`. Server được esbuild bundle thành
> **1 file `.mjs`** (không native module runtime nên cross-arch chỉ là đổi Electron binary). Lần đầu **chọn
> vault**, dữ liệu vào `userData`, **auto-login** bằng mật khẩu ngẫu nhiên/máy (không bắt đổi pass). Đóng gói
> bằng **electron-builder** (dmg/zip · nsis/portable · AppImage/deb); CI mới `release.yml` build matrix
> macOS/Windows/Ubuntu khi push tag `v*` và publish **GitHub Release**. Không đổi server/web code.
> Changelog 1.4 (FR-2 — Audio/Video embed: phát được như Obsidian, theo yêu cầu người dùng): embed
> `![[clip.mp4]]` / `![[song.mp3]]` giờ render **trình phát HTML5 thật** (`<video controls>` / `<audio
> controls>`) ở **cả** Live Preview, Reading view và trang public share — trước đây chỉ hiện link xanh.
> Mở thẳng file media từ file tree cũng hiện player (như ảnh). Hỗ trợ video: `mp4/webm/ogv/mov/mkv`,
> audio: `mp3/wav/m4a/3gp/flac/ogg/oga/opus` (khớp bộ extension của Obsidian). Size param `![[clip.mp4|W]]`
> đặt chiều rộng video. **Quan trọng:** route serve binary (`GET /api/files/content`, raw share) nay
> **stream + hỗ trợ HTTP Range** (206 Partial Content) nên thanh tua/seek video hoạt động và Safari phát
> được — thay vì đọc cả file vào RAM. MIME map + bộ extension gom về `server/services/mime.ts` &
> `web/lib/media.ts`. Không thêm API mới.
> Changelog 1.3 (FR-1 — File explorer header toolbar parity Obsidian, theo yêu cầu người dùng): header sidebar
> **Files** bổ sung đủ nút như Obsidian: **New note**, **New canvas**, **New folder**, **Change sort order**
> (dropdown 7 kiểu: File name A→Z/Z→A, Modified time new↔old, Created time new↔old, Manual), **Auto reveal current
> file** (toggle: tự mở folder cha + cuộn tới file đang xem), **Collapse all / Expand all**. Sort theo thời gian
> nhanh nhờ **stat cache trong RAM** ở server (`listTree` fill 1 lần, watcher invalidate file đổi → 0 syscall
> ở steady-state); `TreeNode` thêm `ctime`. Không thêm API mới (tree cũ nay kèm `mtime`/`ctime`). Canvas (FR-12):
> fix Android Chrome double-tap edit không lưu được text (commit qua doc-level pointerdown + double-tap detect).
> Changelog 1.2 (FR-2 — Ảnh: resize + zoom, theo yêu cầu người dùng): ảnh nhúng trong note giờ **kéo để
> resize** (2 thanh handle trái/phải hiện khi hover trong Live Preview) — ghi lại kích thước vào source dưới
> dạng size param Obsidian: `![[img|W]]` cho wikilink embed, `![alt|W](url)` cho ảnh markdown chuẩn (giữ tỉ lệ,
> height auto). Size param `|300` / `|300x200` nay áp dụng **cả** ảnh markdown `![](…)` (trước chỉ `![[…]]`),
> ở cả Live lẫn Reading. **Click ảnh → lightbox toàn màn hình** (cả 2 mode): cuộn chuột/pinch để zoom (theo
> con trỏ/tâm 2 ngón), kéo/1-ngón để pan, double-click reset, Esc hoặc click nền để đóng. Không thêm API mới.
> Changelog 1.1 (FR-1 — Trash UI + chế độ xoá, theo yêu cầu người dùng): bổ sung **giao diện Trash** để xem,
> **khôi phục (Restore)** và **xoá vĩnh viễn** từng file đã xoá, cùng nút **Empty trash**. Mở Trash từ nút 🗑
> trên header sidebar Files hoặc command palette ("Open trash"). Thêm setting `vault.deleteMode`
> (`trash` = chuyển vào `.trash` khôi phục được [mặc định] · `permanent` = xoá vĩnh viễn ngay) trong
> Settings → Vault & Files. API mới: `GET /api/files/trash`, `POST /api/files/trash/restore`,
> `DELETE /api/files/trash/item`, `DELETE /api/files/trash`. Restore tự né trùng tên (suffix `.restored-<ts>`)
> và dọn thư mục rỗng trong `.trash`; mọi thao tác trash đều guard path traversal (chỉ tác động trong `.trash`).
> Changelog 1.0 (FR-12 — Canvas, theo yêu cầu người dùng): clone tính năng **Canvas** của Obsidian. Khung vẽ
> vô hạn (pan/zoom) chứa các node (text markdown, file embed/link tới note hoặc ảnh, link URL, group) và các
> edge nối cạnh node có mũi tên + nhãn. Đọc/ghi đúng định dạng mở **JSON Canvas** (`.canvas`, tương thích
> Obsidian). Tạo/di chuyển/resize/đổi màu/xóa node, nối edge bằng kéo từ chấm cạnh, multi-select + marquee,
> double-click nền tạo text node, double-click text node để sửa. Autosave debounce như editor (qua store
> `content`/`save`). Tạo canvas mới: context menu file tree + command palette. Không thêm API mới (dùng
> `/api/files/content`).
> Changelog 0.9 (FR-1 — Copy/Cut/Paste trong context menu file tree theo yêu cầu người dùng): menu chuột phải
> file/folder bổ sung **Copy**, **Cut**, **Paste** (clipboard session-local, không persist/broadcast). Cut dùng
> `rename` (move) cho cả file lẫn folder; Copy dùng endpoint mới **POST `/api/files/copy`** copy đệ quy file/folder
> (qua `fs.cp` recursive, reindex các `.md` mới). Paste vào folder đích (folder được click hoặc thư mục cha của file):
> tự đặt tên không trùng (`… copy`/`… copy N`), chặn dán folder vào chính nó/thư mục con, dán Cut vào đúng chỗ cũ là
> no-op; row bị Cut làm mờ chờ dán; mục **Paste** chỉ hiện khi clipboard có dữ liệu. Right-click vùng trống
> file tree cũng ra context menu của app (New note / New folder / Paste vào vault root) thay vì menu native trình duyệt.
> Changelog 0.8 (FR-2/FR-4 — menu ⋯ parity Obsidian theo yêu cầu người dùng): menu **More options (⋯)**
> dựng lại theo cấu trúc Obsidian Desktop và bổ sung: **Backlinks in document** + **Open linked view**
> (Backlinks/Outgoing links/Outline → mở right panel); **Open in new window** (mở deep-link `/note/<path>`
> ở tab mới); **Add file property** (chèn property rỗng vào frontmatter YAML); **Find…** trong note
> (`@codemirror/search`, ⌘F/⌘⇧F/⌘G); **Export to PDF…** (Reading view + `window.print()` qua CSS
> `@media print`); **Reveal file in navigation** (mở folder tổ tiên + scroll/flash row trong file tree);
> **Open version history** (FR-4): `git log`/`git show` cho từng file qua `/api/git/log|/show`, modal liệt
> kê commit + preview + Restore version. Bỏ "Reveal in Finder"/"Open in default app" (desktop-only).
> Changelog 0.7 (FR-10 UX theo phản hồi): menu "Copy public link" → "Share…" mở **Share dialog**
> per-note (tạo link, copy URL, toggle bật/tắt, đặt/đổi password, xoá link) ở cả context menu file
> tree lẫn menu ⋯ của pane; note đang share public có **icon globe** (màu accent) cạnh tên trong
> file tree; danh sách share cache trong store (đồng bộ giữa dialog, Settings → Sharing và badge).
> Changelog 0.6 (FR-9 deploy hardening cho open-source self-host): tham số deploy chuyển hết sang `.env`
> (`VAULT_HOST_PATH`/`HTTP_BIND`/`HTTP_PORT`/`WEBOBSIDIAN_WATCH`) nên `docker-compose.yml` không bị clobber
> khi redeploy; file watcher tự fallback polling khi đụng inotify limit; healthcheck `start_period=90s`.
> Changelog 0.5: Graph (FR-2) thêm tìm node theo keywords — ô search nổi trên Graph view, gõ keywords
> hiện danh sách note/tag khả dĩ (match label/path, tag luôn xếp trước, sau đó prefix > label > path + degree), click
> (hoặc Enter = kết quả đầu) bay camera (fly animation pan+zoom mượt) tới node và highlight node đó
> (node sáng màu accent, phần không liên kết mờ đi) tới khi di chuột; Esc đóng danh sách.
> Changelog 0.4: thêm FR-11 (Mobile / responsive UI cho smartphone màn hình cảm ứng) — sidebar trái/phải
> thành drawer overlay trượt (hamburger + edge-swipe + backdrop), workspace full-width, mobile editing
> toolbar trên bàn phím (bold/italic/heading/list/checkbox/link/…), touch target ≥44px, safe-area insets.
> Tham chiếu UX Obsidian Mobile app. Cập nhật NFR khả dụng.
> Changelog 0.3: mở rộng FR-2 theo phản hồi người dùng — (a) menu "More options" (⋯) trên header mỗi pane
> (Split right/Split down, Copy screenshot cho Graph, Bookmark, Copy public link, Make a copy, Rename/Move/
> Copy path/Delete, Close tab/Close others) giống Obsidian; (b) Right sidebar đại tu thành tab strip icon
> (Backlinks · Outgoing links · Tags · Outline) với Linked mentions + **Unlinked mentions** và **Outgoing
> links** (resolved/unresolved) — trước đó chỉ có 2 panel cố định.
> Changelog 0.2: thêm FR-10 (deep-link URL `/note/...` + public share link readonly + trang quản lý share tập trung), API `/api/shares` + `/public/shares`, data model `data/shares.json`.

---

## 1. Tổng quan

**WebObsidian** là một web app self-hosted clone toàn diện chức năng của [Obsidian](https://obsidian.md), chạy trên server (Docker), thao tác trực tiếp trên một thư mục Vault chứa các file Markdown. Mục tiêu là cho phép truy cập và chỉnh sửa "second brain" của người dùng từ bất kỳ trình duyệt nào, đồng thời mở API cho AI Agent tương tác.

### 1.1 Mục tiêu (Goals)
- Trải nghiệm soạn thảo/đọc Markdown tương đương Obsidian desktop (editor, live preview, wikilinks, graph, backlinks).
- Vault là một thư mục thực trên server — tương thích 100% với vault Obsidian hiện có (kể cả `.obsidian/`).
- Sync 2 chiều bằng **GitHub repo native** (git), hỗ trợ **Git LFS** cho file lớn (ảnh, pdf, audio…).
- **Login gate** đơn giản: một mật khẩu duy nhất bảo vệ toàn bộ app.
- Cấu hình lưu trong **file `.json` thuần** (không cần DB engine).
- **API Gate** với API key để AI Agent đọc/ghi/tìm kiếm vault qua REST.
- **QMD search engine** tích hợp sẵn: full-text + fielded search nhanh trên toàn vault.
- Hỗ trợ cài **Obsidian community plugins** giống app chuẩn (qua plugin loader + Obsidian API shim).
- Đóng gói **Docker stack** chạy 1 lệnh.

### 1.2 Ngoài phạm vi (Non-goals — v1)
- Realtime multi-user collaborative editing (CRDT). v1 là single-user (1 password).
- Obsidian Sync/Publish độc quyền (thay bằng Git sync).
- Mobile native app (chỉ responsive web).
- 100% tương thích mọi plugin dùng Electron/Node API nội bộ (chỉ hỗ trợ subset Obsidian API phổ biến).

### 1.3 Người dùng mục tiêu
- Cá nhân tự host knowledge base, muốn truy cập từ mọi thiết bị qua web.
- Người dùng muốn AI Agent đọc/ghi vault qua API an toàn.

---

## 2. Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                          │
│   React + CodeMirror 6 · Live Preview · File Tree · Graph     │
└───────────────▲───────────────────────────┬──────────────────┘
                │ REST + WebSocket           │ static assets
┌───────────────┴───────────────────────────▼──────────────────┐
│                   Server (Node + Express + TS)                │
│  Auth gate │ Vault FS │ QMD Search │ Git Sync │ API Gate │     │
│            │          │            │          │ Plugins  │     │
└───┬─────────────┬──────────┬────────────┬──────────────┬──────┘
    │             │          │            │              │
 settings.json   Vault dir  Search index  GitHub repo   plugins dir
 (JSON db)       (.md+attach) (in-mem/disk) (git+LFS)    (.obsidian/plugins)
```

### 2.1 Tech stack
| Layer | Lựa chọn | Lý do |
|-------|----------|-------|
| Backend | Node 20+, Express, TypeScript | Đồng nhất ngôn ngữ, hệ sinh thái git/markdown phong phú |
| Frontend | React + Vite + TypeScript | Build nhanh, SPA |
| Editor | CodeMirror 6 | Engine soạn thảo của chính Obsidian |
| Markdown | unified/remark + rehype | Render an toàn, hỗ trợ plugin |
| Search | QMD (module nội bộ trên nền MiniSearch) | Full-text + fielded, in-process, không cần service ngoài |
| Sync | simple-git + git-lfs | Native git, hỗ trợ file lớn |
| Auth | Mật khẩu hash (scrypt) + JWT cookie | Đơn giản, không cần DB |
| Storage cfg | `data/settings.json` | Yêu cầu "JSON thuần" |
| Container | Docker + docker-compose | Deploy 1 lệnh |

### 2.2 Layout thư mục dự án
```
webobsidian/
├── server/           # API backend
│   └── src/
│       ├── routes/       # auth, files, search, sync, api(agent), plugins
│       ├── services/     # vault, search(QMD), git, settings, auth, plugins
│       ├── middleware/   # auth guard, apikey guard, error handler
│       └── plugins/      # Obsidian API shim + loader
├── web/              # React SPA
│   └── src/
│       ├── components/   # FileTree, Editor, Preview, SearchPanel, Settings…
│       ├── lib/          # api client, store, markdown
│       └── styles/
├── data/             # runtime: settings.json, apikeys, sessions (gitignored)
├── docs/
├── docker-compose.yml
└── Dockerfile
```

---

## 3. Yêu cầu chức năng (Functional Requirements)

### FR-1 · Vault management
- Chọn/đổi thư mục Vault qua Settings (đường dẫn server-side, có folder browser an toàn trong allowed roots).
- CRUD file & folder: tạo, đọc, ghi, đổi tên, di chuyển, xoá. Chế độ xoá cấu hình qua
  `vault.deleteMode`: `trash` (→ `.trash`, khôi phục được — mặc định) hoặc `permanent` (xoá hẳn).
- **Inline rename trong file tree**: double-click tên file, folder hoặc canvas để sửa trực tiếp; Enter xác nhận,
  Escape huỷ. Giữ thao tác Rename trong context menu và áp dụng cùng validation hiện có.
- **Sort trong file tree**: 7 chế độ (`File name A→Z`, `File name Z→A`, `Modified new→old`, `Modified old→new`,
  `Created new→old`, `Created old→new`, `Manual`). Ở mode **Manual**, kéo-thả trên tree đổi thứ tự file/folder
  theo từng thư mục; metadata thứ tự lưu server-side trong uistate, không đổi tên file và không sửa nội dung note.
  Chuyển mode sort khác không xoá thứ tự manual; item mới hoặc move vào thư mục được thêm vào cuối thứ tự manual
  của thư mục đích.
  Thả vào mép trên/dưới của một hàng = chèn trước/sau (hiện vạch chỉ vị trí); thả vào giữa hàng folder = chuyển vào folder.
  Đổi tên giữ vị trí; đổi tên folder giữ thứ tự của các mục con.
- **Trash**: giao diện xem các file đã xoá, **Restore** về vị trí gốc, **xoá vĩnh viễn** từng file, **Empty
  trash**. Trash ẩn khỏi file tree (dotfile) và khỏi watcher; mở qua nút 🗑 header Files hoặc command palette.
- **Trash retention**: item trong `.trash` tự xoá vĩnh viễn sau `vault.trashRetentionDays` ngày (mặc định 0; `0` = không tự dọn),
  tính từ lúc chuyển vào trash (index `.trash-index.json`); folder bị xoá hết cùng lúc như một đơn vị. Danh sách Trash hiển thị
  thời điểm xoá thật.
- **Copy/Cut/Paste** trên context menu file tree (file & folder): clipboard session-local; Cut = move (`rename`),
  Copy = copy đệ quy (`POST /api/files/copy`, `fs.cp` recursive); Paste vào folder đích, tự né trùng tên, chặn dán
  folder vào chính nó/thư mục con.
- Hỗ trợ attachments (ảnh/pdf/…); upload từ web. Thư mục đích upload resolve **case-insensitive** với folder
  sẵn có (`vault.resolveDirCaseInsensitive`) — tránh tạo thư mục trùng khác hoa-thường (vd `attachments` cạnh
  `Attachments` có sẵn) trên filesystem phân biệt hoa-thường (Linux).
- Editor paste/drop, toolbar attachments and canvas uploads follow `.obsidian/app.json` → `attachmentFolderPath`: `/` or empty = vault root, `./` = note folder, `./sub` = note-relative subfolder, other relative paths = fixed vault folder. An existing config without the key uses the Obsidian root default. If app.json is absent, use the legacy note-local `vault.attachmentDir` fallback. Invalid configuration fails visibly; existing files are never moved. The server reuses existing directory casing, avoids filename collisions and returns correctly escaped note-relative URLs. Explicit-directory uploads retain their contract.
- Ảnh dán/drop vào note dùng link tương đối; hover ảnh có
  icon xoá (gỡ tham chiếu + xoá file nếu không note nào khác dùng) — xem Changelog 1.9.
- Configured attachment folders and existing folders named `attachments` (any case, ignoring surrounding whitespace for visibility matching only) default to hidden in the file tree (*Show attachment folders* controls visibility only). Existing attachment folders remain hideable after changing Obsidian's destination to `./` or `/`. The vault root and folders containing notes/canvases are never hidden. This setting does not select or change the upload destination.
- Watch filesystem (chokidar) để phản ánh thay đổi ngoài (git pull, sửa trực tiếp).
- **Symlink vault roots**: folder/file được trỏ qua symlink trong vault được liệt kê, đọc/ghi và index như
  file thường — kể cả khi symlink trỏ ra ngoài vault root, miễn realpath của đích nằm trong
  `vault.allowedRoots`. Cycle guard bằng `realpath` (Set) chống vòng lặp symlink (vd symlink trỏ ngược
  về chính vault root). Link hỏng bị bỏ qua.
- Tương thích cấu trúc `.obsidian/` (config, plugins, themes).

### FR-2 · Editor & rendering

Ordinary URLs (2026-11-01): bare HTTP(S) addresses remain compact, clickable URL text in Live, Reading and split preview. Do not automatically request metadata or replace ordinary address lines with rich cards. Inline addresses and the literal editable form under the caret remain clickable. Authored Markdown links, code literals and supported media embeds retain their existing semantics.

External-change notice (2026-11-01): for the active Markdown article, filesystem events, focus/visibility return, and a 30-second visible-tab fallback check the server's content version. A changed server version displays a notice without replacing the open text. Explicit refresh re-reads the latest content; if local edits exist, open the existing version comparison instead. Refresh and comparison must preserve edits made during pending reads and ignore replies from a previous document session or vault scope. Own saves and unchanged content must not produce notices. Split previews are outside this change.

Vault compatibility (2026-10-31): the authenticated effective-preferences endpoint reads portable Obsidian settings with explicit value sources and warnings; upload placement uses the same strict rule as Settings. WebObsidian retains its saved deletion choice until the user explicitly follows Obsidian; unavailable client system trash maps visibly to recoverable vault trash. Settings publish only after persistence succeeds, reject blank vault paths, and roll back failed UI saves.

Creation and internal-link generation honor note directory, Markdown/wiki and path-format settings; unsupported wiki delimiter filenames use Markdown URLs to preserve identity. Existing content is not reformatted automatically. Excluded files remain directly accessible/in the explorer and in reference safety inventory; search/graph/backlink results filter them and suggestions rank them lower. Readable line width follows the native preference; mobile toolbar commands import only through an explicit merge preserving existing configuration.

Renaming/moving updates resolved Markdown/wiki/HTML/canvas references when automatic updates are enabled, otherwise asks whether to update. Versions and locks are checked before mutation; a durable journal supports rollback/recovery without overwriting observed external edits. In-process serialization cannot provide an OS-wide atomic transaction against external Obsidian/NFS writers; detected conflicts preserve recovery data. Public folder shares remap descendant paths, and index notifications include old and new paths.

Deleting an image fails closed on incomplete reference checks, includes hidden live notes and HTML/canvas references, saves the source note with CAS before removing an unused file, and binds the request to its vault scope and confirmed deletion mode. Note-deletion attachment cleanup follows native ask/always/never semantics; ask uses a server-issued, vault-bound candidate receipt and selectable files. A confirmed recoverable action never escalates to permanent deletion if settings change while a dialog is open.
- **Preview tabs**: opening a file uses a single reusable tab with an italic title. Opening another
  file replaces that preview in place; selecting an already-open file activates its existing tab.
  Double-clicking the tab title makes it permanent and removes italics. Editing a preview keeps it
  open automatically, and newly created notes/canvases open permanently. Permanent tabs and the
  Graph view are never replaced by previews. Persist the preview flag with workspace tabs; tabs
  saved before this feature remain permanent. Back/forward navigation follows the same reuse rules.
- CodeMirror 6: syntax highlight Markdown, keybindings cơ bản.
- Live preview / Reading view chuyển đổi.
- Wikilinks `[[note]]`, embeds `![[file]]`, tags `#tag`, callouts, tasks `- [ ]`.
- **Ảnh nhúng — resize & zoom**: kéo handle 2 cạnh (trái/phải) trên ảnh trong Live Preview để đổi rộng,
  ghi lại vào source dạng size param Obsidian `![[img|W]]` / `![alt|W](url)` (giữ tỉ lệ, height auto).
  Size param `|W` / `|WxH` áp dụng cho **cả** `![[…]]` và ảnh markdown `![](…)`, ở Live lẫn Reading.
  Click ảnh → **lightbox toàn màn hình**: wheel/pinch zoom (theo con trỏ/tâm), kéo/1-ngón pan,
  double-click reset, Esc/click nền đóng (xem §22 mobile: pinch-zoom ảnh trong reading).
- **Audio/Video nhúng**: `![[clip.mp4]]` → `<video controls>`, `![[song.mp3]]` → `<audio controls>`
  (Live Preview, Reading, public share). Video: `mp4/webm/ogv/mov/mkv`; audio: `mp3/wav/m4a/3gp/flac/ogg/
  oga/opus`. `![[clip.mp4|W]]` đặt chiều rộng video. Mở thẳng file media từ file tree → hiện player.
  Binary serve qua HTTP Range (206) để seek/Safari hoạt động; MIME + extension: `services/mime.ts` /
  `lib/media.ts`.
- **PDF**: `![[doc.pdf]]` → khung trình xem PDF (Live Preview, Reading/Preview); mở thẳng file từ file tree
  hoặc deep link `/note/<path>.pdf` → pane xem PDF toàn khung. Chi tiết: FR-21.
- Backlinks panel, outline, tag pane.
- Right sidebar dạng **tab strip icon** (giống Obsidian): Backlinks · Outgoing links · Tags · Outline.
  - Backlinks: "Linked mentions" (đếm + danh sách) **và** "Unlinked mentions" (note nhắc tên note hiện tại
    bằng plain text mà chưa link — tìm qua QMD search, loại trừ note đã link).
  - Outgoing links: mọi wikilink trong note hiện tại, phân biệt resolved/unresolved, click để mở/tạo.
- Menu **More options (⋯)** trên header mỗi pane (note lẫn Graph view), dựng theo cấu trúc Obsidian Desktop:
  - Note: Backlinks in document, Split right / Split down, Open in new window, Rename / Move file to / Make a
    copy, Bookmark, Add file property, Export to PDF…, Find…, Copy path, Open version history, Open linked view
    (Backlinks / Outgoing links / Outline), Reveal file in navigation, Share…, Close tab / Close other tabs, Delete.
  - Graph view: Copy screenshot (PNG vào clipboard), Close tab.
  - Split pane hỗ trợ 2 hướng: right (cạnh phải) và down (bên dưới); hướng split persist trong uistate.
  - **Find/Replace trong note**: tích hợp `@codemirror/search` (panel top, ⌘F mở Find, ⌘⇧F Replace, ⌘G next).
  - **Reveal file in navigation**: mở rộng folder tổ tiên + cuộn/nháy sáng row trong file tree.
  - **Add file property**: chèn property rỗng vào frontmatter YAML (tạo block nếu chưa có) → render trong Properties widget.
  - **Export to PDF**: chuyển Reading view rồi dùng print dialog của trình duyệt (CSS `@media print` chỉ in nội dung note).
  - **Open in new window**: mở deep-link `/note/<path>` ở tab/cửa sổ trình duyệt mới.
  - Lưu ý: "Reveal in Finder" / "Open in default app" của Obsidian Desktop không áp dụng cho web app nên không có.
- Graph view (lực đẩy, từ wikilinks).
  - Tìm node trên graph: ô search nổi (góc trên-trái), gõ keywords → danh sách node khả dĩ
    (note/tag/attachment đang hiển thị trên graph); click hoặc Enter → camera bay (pan+zoom mượt)
    tới node, node được highlight kiểu hover (accent + dim phần không liên kết) tới khi di chuột.

### FR-3 · Login gate
- **Mật khẩu mặc định khi cài đặt: `123456`** — không cần bước setup, đăng nhập ngay được
  bằng pass mặc định. settings.json mặc định **không** chứa mật khẩu nào.
- Người dùng đổi mật khẩu trong Settings → Account (nhập pass hiện tại + pass mới). Hash mới
  lưu ở `auth.userPasswordHash`. Khi field này rỗng nghĩa là đang dùng pass mặc định `123456`.
- **Mật khẩu override (khôi phục khi quên pass):** `auth.passwordHash` trong `data/settings.json`
  (sửa tay, dạng scrypt hash) **hoặc** biến môi trường `WEBOBSIDIAN_PASSWORD` (plaintext). Login
  chấp nhận pass override **bất kể** người dùng đã đổi pass hay chưa. Mặc định không có override.
- Đăng nhập 1 password → JWT trong httpOnly cookie.
- Mọi route web & file API yêu cầu auth (trừ `/login`, healthcheck).

### FR-4 · GitHub sync
- Cấu hình: repo URL, branch, token (PAT) hoặc deploy key, tên/email commit.
- Thao tác: init/clone, pull, commit-all, push; hiển thị status (ahead/behind/dirty).
- Auto-sync tuỳ chọn theo interval + on-save debounce.
- Git LFS: cấu hình `.gitattributes` cho pattern lớn; track/push LFS.
- **Version history per-file**: `git log` (commit chạm file, newest first) + `git show <hash>:<path>` qua
  `GET /api/git/log` & `/api/git/show`; UI modal liệt kê version, preview nội dung, "Restore this version"
  (ghi đè + reload). Rỗng khi vault chưa là git repo / chưa bật Git Sync.
- Conflict: phát hiện, báo người dùng, chiến lược merge cơ bản (ưu tiên hỏi).

### FR-5 · Settings (JSON db)
- Toàn bộ cấu hình trong `data/settings.json` (atomic write, có backup).
- Nhóm: vault, auth, git, search, api, ui, plugins.
- UI Settings để xem/sửa; validate bằng schema (zod).

### FR-6 · API Gate (AI Agent)
- Quản lý nhiều **API key** (tạo/thu hồi, scope: read / write / search).
- REST endpoints `/api/v1/*` xác thực bằng header `Authorization: Bearer <key>` hoặc `X-API-Key`.
- Năng lực: list notes (sort/order/folder), read note (phân đoạn theo dòng + `version`), create/update
  (compare-and-set qua `base_version`), delete, append, find/replace literal tại chỗ, grep 1 note
  (`/note-matches`), search, get backlinks.
- **Chống ghi đè**: `version` = hash nội dung; `base_version` sai → `409 version_conflict` +
  `currentVersion`; `find` mơ hồ → `409 find_ambiguous` + `count`. Chế độ chặt:
  `WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1` (thiếu `base_version` → `400 missing_base_version`).
- Workspace `mcp-server`: stdio MCP server bọc Agent API (10 tool) cho các MCP host.
- Rate limit + audit log mỗi key.

### FR-7 · QMD Search engine
- Index toàn bộ `.md`: nội dung, tiêu đề, headings, tags, path, frontmatter.
- Truy vấn: full-text, prefix, fuzzy, fielded (`tag:`, `path:`, `title:`), boolean.
- Cập nhật incremental khi file thay đổi (qua watcher).
- Index lưu/khôi phục trên disk (`data/qmd-index.json`) để khởi động nhanh.

### FR-8 · Community plugins
- Đọc danh sách plugin từ `.obsidian/plugins/*` (manifest.json, main.js).
- Plugin loader nạp `main.js` trong sandbox với **Obsidian API shim** (App, Vault, Workspace, Plugin, Notice, Setting…).
- Browse & cài plugin từ community list (qua GitHub releases) — tải về thư mục plugins.
- Bật/tắt plugin; lưu trạng thái trong settings.

### FR-9 · Docker
- `Dockerfile` multi-stage (build web + server → image gọn).
- `docker-compose.yml`: mount vault volume, data volume, env cho password/secret.
- Healthcheck (`start_period` đủ dài cho index vault lớn lần đầu), restart policy.
- **Healthcheck probe `127.0.0.1`, không dùng `localhost`**: trong image alpine `localhost` resolve
  ra `::1` (IPv6) còn server chỉ bind IPv4 → `wget` không fallback, probe fail mãi và container báo
  `unhealthy` dù API phục vụ bình thường. Đã sửa ở cả `docker-compose.yml` và `Dockerfile`.
- **Deploy pipeline của fork (LXC 107)**: deploy = `deploy/deploy.sh` (sync → backup rolling →
  build → `up -d` → `deploy/smoke.sh`, tự rollback về image `webobsidian:rollback` nếu build hoặc
  smoke fail). Chạy trên **self-hosted GitHub Actions runner đặt trong chính LXC** vì LXC nằm sau NAT
  (không mở inbound); workflow `deploy.yml` trigger sau khi **CI xanh cho push vào `main`**
  (`workflow_run` + kiểm tra `event == 'push'` để PR từ fork không bao giờ chạm runner) và có
  `workflow_dispatch` để chạy tay. Vault là bind mount nên deploy **không** đụng tới note; `/data`
  được snapshot giữ 1 bản rolling (`/root/backups`). Chi tiết + runbook: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **Self-deploy không sửa file tracked**: mọi tham số deploy đặt qua `.env` (git-ignored) —
  `VAULT_HOST_PATH` (host vault → `/vault`), `HTTP_BIND`/`HTTP_PORT` (publish), `WEBOBSIDIAN_PASSWORD`,
  `WEBOBSIDIAN_WATCH`, `TRUST_PROXY` (mặc định `true` — tin hop kề để `X-Forwarded-Proto` hoạt động khi
  đứng sau reverse proxy; đặt `false` khi phơi trực tiếp không proxy, hoặc danh sách subnet/số hop để siết),
  `CLIENT_IP_HEADER` (tuỳ chọn, vd `CF-Connecting-IP` — header IP thật của khách, chỉ dùng làm khoá rate
  limit login và chỉ khi peer là proxy tin cậy theo `TRUST_PROXY`).
  `docker-compose.yml` chỉ tham chiếu `${VAR:-default}` nên `git pull`/redeploy
  không clobber cấu hình của người tự host. `cp .env.example .env && docker compose up -d --build`.
- **File watcher chịu lỗi inotify**: VPS sạch thường có `fs.inotify.max_user_watches` thấp →
  native watch lỗi `ENOSPC/EMFILE`. Watcher tự degrade sang **polling** (`WEBOBSIDIAN_WATCH=auto`),
  log hướng dẫn nâng `sysctl` để giữ native (CPU thấp hơn).

### FR-10 · Deep-link URL & Public share
- **Deep-link**: URL trình duyệt phản ánh note đang mở — `/note/<vault-relative-path>`
  (URL-encode từng segment); Graph view = `/graph`. Mở URL trực tiếp (sau login) sẽ mở đúng
  note; back/forward của trình duyệt hoạt động (popstate ↔ history stack của app).
- **Public share (readonly, không cần login)**:
  - Tạo share link cho một note `.md` **hoặc canvas `.canvas`** → token ngẫu nhiên (16 bytes, base64url),
    URL dạng `/share/<token>`.
  - **Canvas share**: `.canvas` được server render thành **HTML tĩnh** (snapshot): node đặt tuyệt đối theo
    toạ độ, edges vẽ SSR bằng SVG Bézier (cùng hình học với editor), text/embedded-note render qua pipeline
    markdown; trang full-width (bỏ cột markdown hẹp). Allowlist file public lấy từ ảnh trong file-node canvas
    (`rendercanvas.canvasEmbedTargets`). Non-interactive (không pan/zoom) ở v1.
  - Trang public render Reading view (markdown → HTML sanitize), **không** sidebar/editor,
    không yêu cầu auth. Wikilink trong note hiển thị như text tĩnh (không điều hướng).
  - **SEO / SSR**: `GET /share/{id}` được **server render thành HTML hoàn chỉnh** (không cần JS
    để đọc nội dung → Google indexable). Head gồm: `<title>` (tên note), meta description
    (~160 ký tự đầu của body, đã strip markdown), canonical, Open Graph
    (`og:title/description/type=article/url/site_name/image` — ảnh đầu tiên note nhúng hoặc URL
    ảnh web đầu tiên), Twitter card (`summary_large_image`/`summary`), `robots: index,follow`.
    Share có password → SSR trang nhập password (**noindex**, không kèm nội dung note, form unlock
    bằng inline JS); share disabled/không tồn tại → 404 (noindex). Render markdown phía server
    dùng cùng pipeline unified/remark/rehype + sanitize (port từ web, kèm CSS inline từ bundle).
  - File nhúng (ảnh/pdf/video) trong note được serve qua endpoint public **giới hạn đúng các
    file mà note đó nhúng** (`![[...]]` / `![](...)`) — không cho đọc tuỳ ý vault. Không serve
    file `.md` qua endpoint này (không transclusion ở trang public).
  - Share record: `{ id, path, enabled, createdAt, passwordHash? }` lưu ở `data/shares.json`
    (JSON, atomic write). Mỗi note tối đa 1 share record (tạo lại → trả record cũ + enable).
  - Disable (giữ token, có thể bật lại) hoặc xoá hẳn. Token bị disable/xoá → trang public trả 404.
  - **Password tuỳ chọn cho từng share**: đặt/xoá ở trang quản lý (hash scrypt, không bao giờ trả
    hash về client — chỉ `hasPassword`). Khi share có password: endpoint public trả 401
    `{passwordRequired: true}`; khách nhập password → `POST /public/shares/{id}/unlock` → JWT
    (ký bằng `jwtSecret`, TTL 12h, payload gắn share id) đặt trong httpOnly cookie scope đúng
    `/public/shares/{id}` — ảnh nhúng tự gửi cookie. Đổi/xoá password không vô hiệu cookie đã cấp
    (TTL ngắn chấp nhận được cho v1).
- **Share dialog per-note**: menu "Share…" (context menu file tree + menu ⋯ của pane, cho note `.md`
  **và canvas `.canvas`**) mở popup cài đặt share của note đó: tạo public link, ô URL + nút Copy, toggle
  bật/tắt link, đặt/đổi/xoá password, xoá link vĩnh viễn.
- **Badge nhận biết**: note đang share public (enabled) hiện **icon globe** màu accent cạnh tên
  trong file tree. Danh sách share cache trong store, load sau login và refresh sau mỗi thao tác
  (dialog lẫn Settings dùng chung) nên badge luôn đúng.
- **Quản lý tập trung**: Settings → tab "Sharing" liệt kê toàn bộ note đã share, có ô search
  lọc theo path, toggle enable/disable nhanh, copy link, xoá.

---

### FR-11 · Mobile / responsive UI (smartphone cảm ứng)
Mục tiêu: trải nghiệm **đọc note** và **soạn thảo note** thuận tiện trên điện thoại màn hình cảm ứng,
tham chiếu UX Obsidian Mobile. Kích hoạt theo breakpoint (`max-width: 768px`) — không phải app riêng,
cùng một codebase React.
- **Layout drawer**: ribbon + sidebar trái và right sidebar trở thành **drawer overlay** trượt đè lên
  nội dung (không đẩy layout). Mặc định đóng → editor chiếm trọn màn hình. Mở bằng: nút hamburger (☰)
  trên thanh tab, **vuốt từ mép trái/phải** (edge-swipe), hoặc các nút toggle panel. Có **backdrop** mờ;
  chạm backdrop hoặc chọn note → drawer tự đóng. Drawer trái gồm strip ribbon (chuyển panel Files/Search/
  Graph/Bookmarks/Tags/Settings) + panel nội dung.
- **Trạng thái drawer là cục bộ thiết bị** (không persist, không broadcast qua WebSocket) → mở/đóng drawer
  trên điện thoại không ảnh hưởng trạng thái sidebar của desktop đang đồng bộ chung `uistate`.
- **Touch targets**: hàng cây thư mục, nút công cụ, tab ≥ 44px; tăng padding chạm; bỏ hover-only affordance
  (nút close tab luôn hiện trên mobile).
- **Format toolbar**: thanh công cụ định dạng khi soạn thảo (Live/Source): bold, italic, heading, list,
  checklist, quote, link, internal link `[[`, code, tag, indent/outdent, undo/redo. Mỗi nút thao tác trực
  tiếp lên editor đang active. **Mobile**: nổi phía trên bàn phím (neo qua visualViewport) như Obsidian
  Mobile. **Desktop**: thanh in-flow ngay dưới view-header (theo yêu cầu người dùng).
- **Viewport & safe-area**: `viewport-fit=cover`; chừa `env(safe-area-inset-*)` cho notch/home-indicator;
  không cho double-tap zoom (app-like) nhưng giữ pinch-zoom ảnh trong reading.

### FR-12 · Canvas (khung vẽ vô hạn — JSON Canvas)
Mục tiêu: clone tính năng **Canvas** của Obsidian — một mặt phẳng vô hạn để sắp xếp card/note/ảnh/link và nối
chúng bằng đường có mũi tên, dùng cho brainstorm, moodboard, sơ đồ. Tham chiếu UX Obsidian Canvas.

- **Định dạng file `.canvas`**: tuân thủ chuẩn mở **JSON Canvas** (jsoncanvas.org) để tương thích hai chiều với
  Obsidian. File là JSON `{ "nodes": [...], "edges": [...] }`.
  - **Node** (chung): `id`, `type`, `x`, `y`, `width`, `height`, `color?`. `color` là preset `"1".."6"`
    (đỏ/cam/vàng/lục/lam/tím) hoặc hex `"#RRGGBB"`.
    - `type:"text"` → `text` (markdown).
    - `type:"file"` → `file` (đường dẫn vault-relative), `subpath?` (heading/block).
    - `type:"link"` → `url`.
    - `type:"group"` → `label?`, `background?`, `backgroundStyle?`.
  - **Edge**: `id`, `fromNode`, `fromSide?`(top/right/bottom/left), `fromEnd?`(none/arrow), `toNode`,
    `toSide?`, `toEnd?`(none/arrow, mặc định arrow), `color?`, `label?`.
- **Tương tác canvas**: **kéo chuột trái trên nền = pan**; **Shift+kéo = marquee chọn nhiều node**; pan cũng
  qua Space+kéo và kéo nút giữa/phải; cảm ứng 1 ngón pan. Zoom bằng cuộn chuột (con trỏ làm tâm), nút
  zoom in/out/fit/100%. Lưới chấm nền.
- **Node**: double-click nền → tạo **text node** và vào chế độ sửa ngay; double-click vào text node để sửa
  (textarea), Esc/blur để thoát. Kéo node để di chuyển; 8 handle để resize. Drop file note/ảnh từ cây (hoặc
  nút) → tạo **file node** render embed (note = preview markdown, ảnh = `<img>`). Đổi màu qua palette 6 màu +
  mặc định. Xóa (Delete/Backspace).
- **Edge**: hover node hiện 4 chấm cạnh; kéo từ một chấm sang node/cạnh khác → tạo edge. Edge vẽ bằng đường
  cong Bézier theo hướng cạnh, có mũi tên ở đầu `to`. Double-click giữa edge để thêm/sửa **label**. Chọn edge
  để đổi màu/xóa.
- **Select**: click chọn 1 node/edge; kéo marquee trên nền để chọn nhiều; Shift+click thêm/bớt; di chuyển/xóa
  theo nhóm. Thanh công cụ ngữ cảnh nổi khi có lựa chọn (đổi màu, xóa).
- **Alignment snap (đường gióng)**: khi kéo node, các cạnh/tâm node tự gióng vào cạnh/tâm các node khác và
  hiện **đường gióng** (port thuật toán `getSnapping/O3/P3` từ Obsidian: điểm snap = 4 góc + tâm, ngưỡng
  `ceil(15/scale)` đơn vị canvas). Giữ **Alt** (⌃ trên macOS) để kéo tự do (tắt snap); giữ **Shift** để khoá trục.
- **Format trong text card**: phím tắt như editor chính (`obsidianKeymap`) — ⌘B đậm, ⌘I nghiêng, ⌘K thêm link,
  ⌘L task, `⌘/` comment (toggle marker); menu chuột phải mở **đúng tại con trỏ** và tự dịch vào trong màn hình.
- **Căn lề text** (mở rộng ngoài JSON Canvas spec): `TextNode.textAlign` = `left|center|right`, chọn qua
  submenu "Align" menu chuột phải; áp cho cả textarea lẫn nội dung render.
  *Lưu ý: Obsidian thật bỏ qua field này khi mở lại.*
- **Selection toolbar parity (2026-11-02)**: a single text card shows Remove, Set color, Zoom to selection and Edit in a compact native-style toolbar. Text cards use readable 16px default typography, native neutral borders and no outer paragraph margins. Vertical padding shrinks with card height using the native Canvas rule so two lines fit a 250×60 card. Opening a small board fits at up to 100%. Zoom changes viewport state only.
- **Canvas screenshot parity (2026-11-03)**: text cards use an explicit 16px render size to match the reference even when the vault note font preference differs. Flexible vertical spacers grow up to 16px and shrink with short cards. Arrowheads use a 13px base, 10.4px length and 1px rounded outline.
- **Lưu**: autosave debounce (~900ms) như editor, ghi qua `PUT /api/files/content` (store `content`/`save`,
  `.canvas` đã nằm trong `TEXT_RE`). Không thêm endpoint mới.
- **Tạo canvas mới**: context menu cây thư mục ("New canvas") + command palette; tên `Untitled.canvas` không
  trùng, nội dung khởi tạo `{"nodes":[],"edges":[]}`.
- **Phạm vi v1 (non-goals)**: không có realtime collaborative cursor; không group auto-resize theo thành viên;
  không portal/embed canvas-trong-canvas; không liên kết backlink graph từ node file (giữ đơn giản).

### FR-13 · Desktop app (Electron, multi-platform)
Mục tiêu: đóng gói WebObsidian thành **app cài đặt trên máy** (macOS/Windows/Linux) để người dùng tải về dùng
như app native, không cần tự dựng server hay Docker. Bản chất là một **Electron shell** bọc quanh đúng server
Express + SPA hiện có (không fork code, không đổi kiến trúc) — nên mọi tính năng web đều chạy y hệt.

- **Kiến trúc**: Electron `main` **spawn server hiện có như tiến trình con** qua `ELECTRON_RUN_AS_NODE`
  (dùng luôn Node nhúng trong Electron, không cần Node cài sẵn trên máy), bind **`127.0.0.1` + cổng trống
  ngẫu nhiên** (localhost-only, không mở ra mạng), rồi `BrowserWindow` load `http://127.0.0.1:<port>`.
  Server được **bundle thành 1 file `.mjs` duy nhất** bằng esbuild (toàn bộ deps inline; `fsevents` để
  external vì optional). SPA build (`server/public`) đi kèm trong `resources/server/public`.
- **Dữ liệu & vault**: lần chạy đầu hiện hộp thoại **chọn thư mục vault** (mặc định `~/Documents/WebObsidianVault`
  nếu bỏ qua). `DATA_DIR` (settings.json, index) nằm trong thư mục `userData` per-user của Electron. Menu
  **File → Switch Vault…** đổi vault (relaunch để re-index), **Open Vault/Data Folder**, **Open Logs**.
- **Đăng nhập liền mạch**: app tự sinh **mật khẩu ngẫu nhiên/máy** lưu trong `userData`, truyền qua
  `WEBOBSIDIAN_PASSWORD` (override) → **auto-login** (seed cookie JWT vào session của cửa sổ) và tự đặt
  password tuỳ chỉnh để **không bắt đổi mật khẩu** lần đầu. Người dùng không phải gõ password; vẫn có thể
  đổi trong Settings.
- **Đa nền tảng / đa kiến trúc**: vì server **không có native module runtime**, cross-arch chỉ là đóng gói
  Electron binary tương ứng. Đóng gói bằng **electron-builder**: macOS `dmg`+`zip` (arm64/x64), Windows
  `nsis`(installer)+`portable` (x64/arm64/ia32), Linux `AppImage`+`deb` (x64/arm64).
- **Phát hành**: GitHub Actions workflow `release.yml` chạy khi push tag `v*` — matrix macOS/Windows/Ubuntu,
  mỗi runner build native cho HĐH của nó rồi **publish lên GitHub Release** (draft) để người dùng tải.
- **Phụ thuộc ngoài**: tính năng Git sync cần `git` có trên máy (PATH được bổ sung các vị trí phổ biến); thiếu
  git thì app vẫn chạy bình thường cho sửa note cục bộ, chỉ tắt sync. App **chưa code-sign/notarize** (sẽ có
  cảnh báo Gatekeeper/SmartScreen — chấp nhận cho self-hosted free).
- **Phạm vi (non-goals)**: chưa auto-update (người dùng tải bản mới thủ công); chưa ký số; không nhúng git
  portable; không chạy nhiều cửa sổ/vault song song trong 1 instance (single-instance lock).

### FR-15 · Tasks view — Kanban board (ghi chú `type: task`)
Mục tiêu: cho hệ thống task sẵn có trong vault (`Wiki/tasks/*.md` + `Wiki/templates/task.md`, mang
`status`/`priority`/`owner`/`due`/`raised`/`sources`) một **view**, không phải data model mới — bản thân
markdown vẫn là nguồn sự thật, không thêm DB/sync/tool ngoài. Phần 1/2 (xem FR-16/issue #32 cho
Timeline/Gantt dựng trên cùng shell Tasks view).

- **Phạm vi & nguồn dữ liệu**: một note là task khi frontmatter có `type: task` (so khớp string, trim,
  không phân biệt hoa/thường). Note chứa checkbox `- [ ]` **không** phải task trong view này (non-goal —
  không gom `- [ ]`, không Dataview query). **Loại trừ template**: note nằm trong bất kỳ thư mục có
  segment tên `templates` (không phân biệt hoa/thường) không được coi là task dù mang `type: task` —
  quy tắc này áp cho chính `Wiki/templates/task.md`.
- **Hợp đồng trạng thái → cột**: 4 cột chuẩn theo thứ tự `open`→**Backlog**, `in-progress`→**Doing**,
  `blocked`→**Blocked**, `done`→**Done**. Alias (không phân biệt hoa/thường, đã trim): `todo`→`open`;
  `doing`/`wip`→`in-progress`; `waiting`/`on-hold`→`blocked`; `closed`/`completed`/`complete`→`done`.
  Giá trị `status` không khớp canonical/alias nào → **cột riêng của nó**, nhãn = giá trị thô, xếp sau 4
  cột chuẩn (nhiều cột lạ thì sắp theo alphabet); đọc **không bao giờ** âm thầm ép/ghi lại giá trị đó.
  Thiếu key `status` → nằm ở **Backlog**, đánh dấu **chấm nhỏ + tooltip "no status field"**; kéo thẻ đó
  sang cột khác sẽ **thêm** key `status` (data được "sửa" như tác dụng phụ của thao tác kéo).
- **Điều hướng**: theo đúng khuôn `graph://view`/`openGraph()` — `TASKS_PATH = 'tasks://view'` +
  `openTasks()` trong store (tab tiêu đề "Tasks"), route `/tasks?mode=board|timeline` (mặc định
  `board`; option `timeline` **ẩn** ở phần 1, dành cho FR-16/#32), ribbon (icon riêng) và command
  palette ("Open tasks board"). Mọi chỗ trong `web/src` so sánh `GRAPH_PATH` như "virtual view, không
  phải file" đều xử lý `TASKS_PATH` tương tự (tree/tab restore, history, back/forward, `urlsync.ts`).
- **UX thẻ & cột**: header cột = tên + số thẻ; cuộn ngang, kích thước chạm được trên mobile (PRD FR-11).
  Thẻ hiển thị title (`title:` frontmatter, fallback tên file), badge priority (`P1`/`P2`/`P3`), owner,
  due date (đỏ khi `due` < hôm nay và `status ≠ done`), tags, đường dẫn vault làm hint. Click thẻ →
  mở note bằng hành vi mở file hiện có (không route mới). Kéo thẻ giữa cột (HTML5 drag & drop, không
  thêm dependency) **và** menu chuột phải/nút "⋯" → "Move to → <tên cột>" cho mọi cột khác (fallback
  cho chạm/không kéo-thả). Optimistic update: sai thì khôi phục cột cũ + `notify('Could not move
  "<title>": <message>')`.
- **Lọc theo trạng thái (issue #39)**: hàng "Status" riêng dưới thanh lọc, mỗi trạng thái một chip kèm
  số thẻ — 4 chuẩn theo thứ tự cột (luôn hiện, kể cả 0 thẻ, để control không nhảy vị trí) rồi tới các giá
  trị lạ theo alphabet. Click để ẩn/hiện; chip đang ẩn bị làm mờ + gạch ngang nhãn. **Mặc định chỉ ẩn
  `done`** — giá trị lạ vẫn hiện. Khi có thẻ bị ẩn, hàng này hiện `N hidden — show all` (một click xoá
  lọc) và số thẻ trên thanh công cụ chỉ tính phần đang hiện. **Mọi cột vẫn được vẽ** kể cả khi trạng thái
  đó bị ẩn: cột Done phải còn làm chỗ thả, nếu không sẽ không thể hoàn thành task bằng cách kéo; header
  hiện `+N hidden`, thân cột hiện "All hidden by the status filter". Timeline lọc cùng bộ trạng thái.
  Bộ lọc là state của component (như folder/priority/owner/text), không persist và không lên URL.
- **Đặt hạn trực tiếp (issue #41)**: badge hạn trên thẻ là **nút** (kèm caret ▾ báo hiệu bấm được): click
  mở ngay `<input type="date">` tại chỗ — Enter lưu, Esc huỷ, blur ra ngoài lưu, nút **Clear** ghi
  `due: none`; click trong editor không làm mở note, focus chuyển trong editor không tự lưu. Menu `⋯`
  (và chuột phải) thêm "Set due date…" / "Clear due date" — affordance cho bàn phím. Timeline dùng chung
  control này ở cột nhãn (`.`gantt-due`), bấm vào *thanh* vẫn mở note. Ghi bằng hàm thuần
  `setTaskDue(content, due, today)` — cùng phép "phẫu thuật" frontmatter với `setTaskStatus` (đổi đúng
  dòng `due:`/`updated:`, giữ nguyên BOM/CRLF/thứ tự key/phần thân), gọi `changeTaskDue` → `PUT
  /api/files/content` với `baseVersion` (409 khi lệch) — optimistic + rollback + `notify`. Chip **"Needs a
  due date"** trong hàng lọc: đếm theo tập đang hiện (sau bộ lọc trạng thái) và một click lọc chỉ còn
  task chưa có hạn, để xếp lịch một lượt.
- **Bộ lọc**: phạm vi thư mục (mặc định "Whole vault"), priority, owner, free-text theo title. Nút
  Refresh thủ công + auto-refresh (debounce ~500ms) khi WebSocket báo thay đổi `.md` trong phạm vi lọc
  (sự kiện `wo-fs` mà `App.tsx` đã phát cho tree). Empty state giải thích quy ước `type: task` và link
  thẳng tới `Wiki/templates/task.md`.
- **Hợp đồng ghi**: kéo/"Move to" chỉ đổi **dòng `status:`** (chèn sau `type:` nếu có, không thì làm
  dòng cuối cùng của block frontmatter; không có frontmatter thì tạo mới, giữ nguyên phần thân) và
  set `updated: <YYYY-MM-DD>` (ngày đổi) — **không đụng** field khác, thứ tự key khác hay phần thân.
  Ghi qua đường ghi note sẵn có (`PUT /api/files/content`) kèm **compare-and-set tuỳ chọn**: `GET`
  trả thêm `version` (content-hash, giống cơ chế FR-6), `PUT` nhận `baseVersion` tuỳ chọn — lệch với
  bản hiện tại → `409 { error: 'version_conflict', currentVersion }`, không ghi; file đã bị xoá/đổi tên
  mà `baseVersion ≠ ''` cũng → `409` (cùng ngữ nghĩa `base_version` của Agent API — không "hồi sinh"
  note); không truyền thì hành vi cũ giữ nguyên (autosave editor không đổi). Giá trị trạng thái ghi trần
  khi YAML đọc lại đúng chuỗi đó, còn lại (số, có khoảng trắng, `yes`/`no`/`null`…) được quote. Thất bại
  (kể cả 409) → rollback optimistic UI ở trên (chỉ thẻ vừa kéo).
- **API server**: `GET /api/tasks?folder=&status=&priority=&owner=&q=` (cookie session, cùng guard các
  route web khác) và mirror đọc `GET /api/v1/tasks` (Agent API, scope `read`) — cùng query, cùng hình
  dạng response `{ tasks: TaskRecord[] }` (sắp theo `path`):
  ```ts
  interface TaskRecord {
    path: string; title: string;            // fallback tên file khi thiếu title
    status: string;                          // id canonical/alias, hoặc giá trị thô khi lạ, 'open' khi thiếu
    statusRaw: string | null;                // giá trị thô trong frontmatter, null khi thiếu/rỗng
    priority: string | null; owner: string | null;
    due: string | null; raised: string | null; created: string | null; updated: string | null; // 'YYYY-MM-DD' hoặc chuỗi thô khác
    tags: string[];
  }
  ```
  Tái dùng parser frontmatter sẵn có (`server/src/services/markdown.ts`) và **index sẵn có** (QMD
  engine, `server/src/services/search.ts`) — không quét lại vault mỗi request: mỗi note đã parse khi
  build/upsert index (`toDoc`) nay tính kèm `TaskRecord` (hàm thuần `taskRecordFrom`), lưu trong
  `qmd.allTasks()`, cập nhật đồng bộ với mọi đường ghi + watcher đã gọi `qmd.upsert` từ trước. Map task
  **không** persist vào `data/qmd-index.json`: khi boot khôi phục index từ đĩa, server quét vault **một
  lần** (`qmd.refreshTasks()`) để board phản ánh đúng các note sửa lúc server tắt (vd. `git pull` khi
  deploy — watcher `ignoreInitial` không báo) thay vì trạng thái của lần build index đầy đủ gần nhất.
- **Kiểm thử**: unit test thuần cho normalise trạng thái/alias/giá trị lạ/thiếu, chọn task theo
  `type: task` (kèm loại trừ `templates`), từng filter, `setTaskStatus`/chèn `updated`, `isOverdue` —
  cả hai phía server (`server/src/**/*.test.ts`) và web (`web/tests/`, twin logic giữ đồng bộ bằng
  comment trỏ chéo). Test route: chọn đúng task, từng filter, 401 thiếu session, `/api/v1/tasks` 401
  thiếu key/403 thiếu scope `read`/200 khi đủ, CAS (GET có `version`, PUT `baseVersion` cũ → 409 và
  file không đổi, `baseVersion` đúng → 200). `deploy/smoke.sh` thêm assertion `GET /api/tasks` không
  session → 401.
- **Phạm vi v1 (non-goals)**: không gom `- [ ]` checkbox, không ngôn ngữ truy vấn kiểu Dataview, không
  plugin/proxy layer mới, không phụ thuộc tracker ngoài (Jira/Trello…), không realtime multi-user
  editing, không tạo thẻ mới từ board (note vẫn tạo trong app/agent như hiện tại), không swimlane,
  không WIP limit, không cấu hình cột tuỳ ý.

---

### FR-16 · Tasks view — Timeline (Gantt) (phần 2/2 của FR-15)
Mục tiêu: chế độ **Timeline (Gantt)** trong cùng Tasks view (issue #32): mỗi task một thanh từ ngày bắt
đầu đến `due` để nhìn tải công việc theo trục thời gian. Dựng trên shell của FR-15 (filter bar, dữ liệu
`GET /api/tasks`, điều hướng `tasks://view`), không thêm DB/sync/tool ngoài.

- **Hợp đồng dữ liệu**: thanh chạy **`raised` → `due`** (fallback `created`, thiếu cả hai → hôm nay).
  **Không thêm field frontmatter nào** (một field `start:` thật là quyết định riêng, chưa làm). `due`
  thiếu / `none` / không phải `YYYY-MM-DD` → thanh **nét đứt, mở**, chạy tới hôm nay, có nhãn "no due".
  `due` < ngày bắt đầu (dữ liệu sai) → kẹp về 1 ngày, không bao giờ có width âm. **Quá hạn** = `due` <
  hôm nay và `status ≠ done` — đúng quy tắc `isOverdue` của board.
- **Toạ độ & thuật toán** (module thuần `web/src/lib/gantt.ts`, test được không cần DOM/clock): mọi
  phép tính trên **chỉ số ngày UTC** (`YYYY-MM-DD` → số ngày từ epoch) nên DST/múi giờ không thể làm
  thanh hay đường hôm nay lệch một ngày.
  - **Dải thời gian** = min/max của mọi thanh **và hôm nay**, cộng **pad 3 ngày** mỗi bên; không có task
    → cửa sổ **±15 ngày** quanh hôm nay. Hôm nay luôn nằm trong dải (đường hôm nay không bao giờ ra
    ngoài trục).
  - **`pxPerDay`**: Day 40 · Week 16 · Month 4; **`MIN_BAR_PX = 8`** (task trong cùng một ngày vẫn thấy
    và click được ở zoom tháng). Độ dài thanh tính **bao gồm cả hai đầu** — task `due` ngay ngày `raised`
    = 1 ngày.
  - **Trục** (`ticksFor`): Day = mỗi ngày (nhãn `MM-DD` ở thứ Hai, còn lại là số ngày); Week = mỗi thứ
    Hai; Month = ngày 1 mỗi tháng. Dải không chứa mốc nào → vẫn có 1 nhãn ở đầu dải (trục không bao giờ
    trống nhãn).
- **Hiển thị**: thanh màu theo trạng thái (cùng hệ màu cột board; trạng thái lạ = `status-unknown`),
  badge priority trên thanh, quá hạn = **viền đỏ**, mở = **nét đứt**; **đường hôm nay** (đỏ) đánh dấu
  *đầu* ngày hôm nay — thanh kết thúc hôm nay phủ trọn cột ngày đó. Cột trái (title + priority/owner/due)
  **sticky**, toàn bộ cuộn ngang (pan) bằng scroll native kể cả cảm ứng; nút Day/Week/Month + nút cuộn
  về hôm nay (chỉ tự cuộn ở lần mount đầu, không giật lại mỗi lần refresh). Click **thanh** hoặc **nhãn
  dòng** → mở note; tooltip = title · status · owner · start → due.
- **Điều hướng & deep link**: mode Board|Timeline là **state của app** (`tasksMode` + `setTasksMode`
  trong store, **cố ý không** nằm trong `PERSIST_KEYS`) và **URL là nguồn sự thật lúc load**:
  `/tasks?mode=timeline`, bare `/tasks` = board. `pathToUrl(TASKS_PATH, tasksMode)` sinh kèm query,
  `modeFromUrl(pathname, search)` đọc lại lúc boot; command palette thêm "Open tasks timeline".
  **Lý do (bug đã gặp, có test hồi quy)**: `urlsync` là nơi duy nhất ghi URL và nó dựng URL **từ
  activePath** — không mang theo mode thì mỗi lần restore/reload, `/tasks?mode=timeline` bị ghi đè thành
  `/tasks` và **âm thầm rơi về board**; và nếu persist `tasksMode` thì state khôi phục (`board`) lại đè
  mode mà URL yêu cầu ngay sau `initUrlSync`.
- **Non-goals (v1, cố ý — không làm)**: không dependency/arrow, không auto-scheduling, không critical
  path, không baseline, không kéo-thả để dời ngày, không cascade ngày, không milestone, không export/
  print. **Không thêm dependency runtime** (toàn bộ là số học + CSS). Không đổi server (không endpoint
  mới) nên `deploy/smoke.sh` giữ nguyên.
- **Hiển thị (restyle #35)**: trục **hai tầng** — dải tháng (`September 2026`) trên, tick tuần dưới
  (Day: mỗi ngày + `Sep 28` ở thứ Hai; Week: mỗi thứ Hai; Month: mỗi mùng 1). Lưới **phân cấp**:
  hairline mỗi ngày khi `pxPerDay ≥ 12`, đường tuần đậm hơn, đường tháng 2px đậm nhất — bỏ hẳn lớp
  `repeating-linear-gradient` mỗi ngày (trước đây là "sương mù" không đọc được). **Nền cuối tuần**
  gộp Sat+Sun thành một khối. **Hôm nay** = dải màu cột ngày + đường 2px + nhãn `Today` trên dải
  tháng, và cửa sổ tự cuộn về hôm nay khi mount (xem bug bên dưới). Thanh: 40px/26px, bo 6px, chữ
  11.5px/500, chip priority bên trong, tên task trong thanh khi thanh ≥ 120px (ẩn ở chế độ compact),
  bar mở **mờ dần** (mask) thay vì viền nét đứt, quá hạn = **viền đỏ + sọc chéo** (không chỉ dựa vào
  màu), `:focus-visible` rõ ràng. Cột nhãn: chấm trạng thái + title 13px/500 + meta 11.5px nêu **tên
  trạng thái bằng chữ**, due date tô đỏ khi quá hạn, bóng đổ mép phải để bar cuộn xuống dưới đọc là
  "còn tiếp ở phía sau" chứ không phải bị cắt; **compact ≤640px**: cột nhãn 132px, meta rút gọn còn
  trạng thái + hạn (priority đã có trên thanh), không hiện tên task trong thanh. Màu trạng thái đo
  được: tương phản chữ trên thanh ≥ 4.5:1 ở cả hai theme (thấp nhất 4.70:1), `open` được nâng sáng
  trên theme tối. Không thêm dependency runtime, không đổi server.
- **Cửa sổ thời gian (issue #37)**: ở zoom Week, tỉ lệ pixel/ngày suy ra từ bề rộng thật của trục
  (`weekZoomPxPerDay`) để **8 tuần tới** vừa màn hình, kẹp trong `[4, 20]` px/ngày — màn rộng dừng ở
  20px/ngày nên hiển thị **nhiều hơn** 8 tuần, màn hẹp đi xuống tới sàn 4px/ngày. Sàn là giới hạn thật
  và được nói rõ: dưới ~200px trục thì 8 tuần không còn đọc được nữa. `computeRange` luôn mở rộng tới
  **hôm nay + 56 ngày** (kể cả khi mọi task đến hạn sớm), để tương lai luôn có chỗ trên trục. Nhãn tick
  tuần đổi định dạng theo khoảng cách (`WEEK_SHORT_LABEL_SPACING_PX`): `Sep 14` khi ≥56px/tuần, còn
  `14` khi dày hơn — vì `Sep 14` rộng hơn khoảng cách ~30px giữa hai thứ Hai ở 4px/ngày; quy tắc chống
  chồng nhãn dùng khe hở 24px cho nhãn ngắn và 40px cho nhãn dài, đường lưới **không bao giờ** bị bỏ.
  Cột nhãn chuyển compact theo **bề rộng pane** (`COMPACT_PANE_PX = 640`), không chỉ theo viewport: cửa
  sổ 1000px mở cả hai sidebar chỉ còn ~404px pane, cột 200px chiếm một nửa. Thanh công cụ hiện chip
  "N weeks ahead" để thấy ngay chế độ này đang hoạt động. Month zoom còn **3px/ngày** để bảo toàn thứ
  tự Month < Week < Day sau khi sàn Week hạ xuống 4.
- **Bug đã sửa (do kiểm chứng DOM + ảnh chụp phát hiện)**: `scrollToToday()` chạy ở effect mount khi
  `tasks` còn rỗng → dải chỉ 31 ngày quanh hôm nay, container **chưa tràn** nên `scrollLeft` bị kẹp
  về 0 và **đường hôm nay nằm ngoài màn hình**; đồng thời callback giữ `lineX` cũ (240px) nên cuộn sai
  chỗ. Sửa: effect phụ thuộc `[lineX, pxPerDay]` (luôn dùng offset hiện tại), observe **cả** container
  lẫn grid (nội dung tăng khi task về), và **nhường ngay khi người dùng tự cuộn/kéo/chạm hoặc đổi
  zoom**. Test DOM thêm assertion "đường hôm nay phải nằm trong vùng nhìn thấy" — chính assertion này
  bắt được bug (trước đó test chỉ so `offsetLeft`, tức hình học đúng nhưng người dùng không thấy gì).
- **Kiểm thử**: unit test thuần `web/tests/gantt.test.ts` (parse ngày/kẹp ngày sai, nguồn ngày bắt đầu,
  mở/quá hạn, pad + luôn chứa hôm nay, cửa sổ rỗng, hình học thanh + floor, đường hôm nay, nhãn trục
  theo từng zoom, fallback 1 nhãn) và `web/tests/urlsync.test.ts` (`pathToUrl` mang mode, `modeFromUrl`,
  default của store). Kiểm chứng DOM thật bằng headless Chromium trên vault fixture: hình học **từng
  thanh so với kỳ vọng tính độc lập bằng Python** từ frontmatter, lớp overdue/open-ended/unknown, đường
  hôm nay, nhãn trục, 3 mức zoom, click thanh/nhãn mở note, toggle, **reload giữ timeline**, cuộn ngang
  ở 390px, không lỗi console.

### FR-17 · Tạo note từ template — hết copy tay (issue #42)
Mục tiêu: mỗi lần họp hay ghi chép theo mẫu, người dùng đang phải tự làm 4 bước — tạo note trong đúng
thư mục, đặt tên `YYYY-MM-DD-slug`, copy nội dung template vào, rồi tự điền `title` / `created` /
`updated` / `date` / `sources`. Một lệnh **New note from template** làm cả 4 bước đó. Không có tính năng
template nào trong app để bật: app không có core Templates plugin, và shim community plugin là **sai tập
con** cho việc này (`addCommand`, `registerView`, `loadData`/`saveData` đều là no-op → Templater không
bao giờ đăng ký được lệnh của nó), nên tính năng được viết thẳng vào app.

- **Một lệnh dùng chung, template lấy từ vault**: mục command palette **"New note from template"** + nút
  ribbon (`file-plus`), cả hai mở cùng một modal. Dùng chung cho meeting / task / procedure / abnormality
  / document / query / weekly-review — không phải nút riêng cho meeting.
- **Thư mục template tự dò**: thư mục **nông nhất** có tên `templates` (không phân biệt hoa thường) —
  trong vault này là `Wiki/templates`. Không thêm setting, không thêm key cấu hình (Obsidian core
  Templates cũng chỉ dùng một thư mục). Modal liệt kê mọi file `.md` trong đó (có ô lọc), ô **Title**, và
  ô **Folder** sẽ chứa note mới.
- **Thư mục đích suy ra từ template, và luôn hiện trước khi ghi**: xét các tên là *anh em* của thư mục
  template (`Wiki/templates/meeting.md` → xét trong `Wiki/`): `meeting` → `meetings`; tên giữ nguyên
  (`daily` → `daily`); `y` → `ies` (`query` → `queries`, `abnormality` → `abnormalities`); `+es` sau âm
  sibilation; và **đoạn cuối sau dấu gạch** (`weekly-review` → `reviews`). Không khớp (ví dụ
  `shift-handover`) thì ô Folder để trống cho người dùng gõ. Ô này **luôn sửa được và luôn hiển thị**,
  nên note rơi đúng chỗ mà modal nói. **Thư mục thiếu KHÔNG tự tạo**: gõ sai một chữ sẽ rải note vào
  thư mục rác, còn báo "Folder not found" trung thực chỉ tốn một lần sửa.
- **Tên file & placeholder**: `<YYYY-MM-DD>-<slug>.md`; trùng tên → `-2`, `-3` … và **không bao giờ ghi
  đè** (ghi kiểu create-only `baseVersion: ''`; 409 vì người khác vừa tạo → nhảy sang hậu tố kế tiếp).
  Slug: chữ thường, bỏ dấu tiếng Việt **kể cả `đ`/`Đ`** (NFD không tách được hai ký tự này), ký tự khác
  gom thành `-`, cắt 60 ký tự. Thay trong nội dung template: `{{title}}`, `{{date}}` (YYYY-MM-DD),
  `{{time}}` (HH:mm), `{{slug}}`, và — để template hiện có **chạy được ngay, không phải migrate** — đúng
  dạng chữ mà vault đang dùng: `YYYY-MM-DD-slug` (xử lý trước) rồi `YYYY-MM-DD`. Ngày/giờ là **giờ địa
  phương của trình duyệt** (deployment này GMT+7); không thêm setting múi giờ.
- **Hợp đồng state**: `templatePicker: boolean` + `setTemplatePicker(open)` trong store (giống
  `setGraph` / `setSettings`); action `newFromTemplate(templatePath, title, folder) → Promise<string>`
  dùng đúng `api.read` / `api.write` / tree hiện có, mở note vừa tạo và trả về path. Modal đóng khi thành
  công; thất bại thì giữ nguyên modal và hiện lỗi. **Không thêm endpoint, không thêm dependency, không
  đổi settings/schema.** Toàn bộ logic thuần nằm ở `web/src/lib/templates.ts` để test được không cần DOM.
- **Chọn template là hành động rõ ràng (sửa 2026-09-26, issue #46)**: hover **không** chọn template
  (chỉ là hiệu ứng), **click mới chọn**; hàng template là `<button>` nên bàn phím (Tab + Enter/Space)
  cũng chọn được; không có template nào được chọn sẵn. Thư mục **là bắt buộc**: template không suy ra
  được thư mục thì `Create` bị chặn kèm lý do, và action từ chối thư mục rỗng — **gốc vault không
  bao giờ nhận note từ template**.
- **Không làm (non-goals)**: chạy JS của plugin/Templater; định dạng `{{date:...}}`; tự tạo thư mục còn
  thiếu; setting cho thư mục template; phím tắt riêng.
- **Phía vault (không phải code repo)**: `Wiki/templates/meeting.md` đang viết `title: Meeting — subject
  YYYY-MM-DD`, nên note tạo ra vẫn còn chữ "subject"; đổi `title:`/H1 của template sang `{{title}}` thì
  tiêu đề gõ vào đi thẳng vào note. Lệnh chạy đúng trong cả hai trường hợp.

### FR-18 · Popup nổi phải mount bên trong wrapper theme (issue #49)
Mục tiêu: mọi popup mở đè lên editor (gợi ý `[[`, gợi ý `#`, dropdown giá trị property, toast) phải
theo theme đang dùng — gồm cả bốn theme Catppuccin, không chỉ Obsidian Light/Dark.

- **Lỗi gốc (đo được, không phải phỏng đoán)**: `web/src/lib/theme.ts` khai báo palette bằng CSS biến
  (`--text-normal`, `--background-primary`, `--text-accent`…) trên **wrapper `.theme-*`** (`theme-light`,
  `theme-dark`, `theme-ctp-mocha/-macchiato/-frappe/-latte`). Popup của suggester `[[` và dropdown giá
  trị trong Properties lại tìm wrapper bằng `document.querySelector('.theme-light, .theme-dark')` — thiếu
  bốn class `theme-ctp-*`. Trên theme Catppuccin lookup trả `null` → popup bị `appendChild` vào `<body>`,
  tức **ngoài** phạm vi khai báo biến: `.suggestion-title { color: var(--text-normal) }` không giải được,
  rơi về màu chữ mặc định (**đen**), `.suggestion-container { background: var(--background-primary) }`
  không giải được → **nền trong suốt**. Vault này đang dùng `catppuccin-mocha` (theme tối) nên đúng như
  người dùng báo: chữ đen trên nền tối.
- **Số đo trước khi sửa** (headless Chromium, `[[` + `Al`, bundle trùng bản deploy `d876c0c`):
  `obsidian-light` → cha `div.theme-light`, chữ `rgb(34,34,34)`; `obsidian-dark` → cha `div.theme-dark`,
  chữ `rgb(218,218,218)`; `catppuccin-mocha` → cha **`BODY`**, chữ **`rgb(0,0,0)`**, nền `rgba(0,0,0,0)`.
  Dropdown giá trị Properties: cha `BODY`, nền trong suốt, chữ đen.
- **Một helper duy nhất**: `themedRoot()` (chuyển từ `lib/cssColor.ts` sang `lib/theme.ts`, cssColor
  import lại) và `themedPopupHost()` = `themedRoot() ?? document.body`. Cả hai dùng `THEME_SELECTOR`
  dựng từ `THEME_CLASS` — nguồn sự thật duy nhất — nên **thêm theme mới không phải sửa nơi mount**.
- **Ba điểm mount được sửa**: `lib/suggest.ts` (suggester `[[` và `#`), `lib/livePreview.ts` (dropdown
  giá trị property), `lib/plugins.ts` (`Notice` → `.toast`; `.toast` cũng đọc biến palette nên cùng lỗi).
  Lightbox giữ nguyên (style dùng màu literal, không đọc biến palette).
- **Guard test**: `web/tests/themeHost.test.ts` — bắt lỗi nếu (a) có `querySelector('.theme-light, .theme-dark')`
  ở bất kỳ file `web/src/**` nào, (b) ba điểm mount không dùng `themedPopupHost()` hoặc append thẳng vào
  `document.body`, (c) `THEME_SELECTOR` thiếu class nào trong `THEME_CLASS`, (d) nhánh fallback: có wrapper
  thì mount vào wrapper, chưa render thì về `<body>`. Đã kiểm chứng test **đỏ** khi hoàn tác code cũ (revert
  `suggest.ts` → 2 test fail) và **xanh** sau khi sửa; không cần DOM thật (đọc source + stub `Document`).
- **Không làm (non-goals)**: đổi cách khai báo palette (giữ trên wrapper, không đẩy lên `:root`); sửa phép
  thử `document.querySelector('.theme-dark')` dùng làm cờ "đang tối" cho mermaid (`lib/livePreview.ts`,
  `components/Preview.tsx`) — đó là lỗi khác (mermaid render sai theme trên Catppuccin), tách issue riêng.

### FR-19 · Khoá ghi chú — trang chỉ đọc với trình duyệt (vault locks) (issue #53, #54)
Mục tiêu: một số note **không được sửa tay** — bằng chứng thô (hash chính là hồ sơ), board/index sinh tự
động, quy tắc của vault — nhưng trình duyệt rất giỏi sửa file do tai nạn (một phím lạc trong khung xem
trước, một lần dán nhầm tab). Khoá lại: vẫn đọc/tìm kiếm được, chỉ từ chối ghi, và **nói rõ vì sao**.

- **Vì sao không cần hệ quyền thứ hai**: app vốn có **hai đường ghi tách biệt** — `/api/files/*` xác thực
  bằng cookie phiên (người dùng trên trình duyệt) và `/api/v1/*` xác thực bằng `X-API-Key` (agent, MCP).
  Khoá là một middleware trên router của phiên; đường của agent không đi qua middleware đó nên không bị
  ảnh hưởng — và đó chính là mục đích: agent vẫn là bên bảo trì những note ấy.
- **Khai báo nằm trong vault**: `_system/locks.json` —
  `{"unlock": "confirm", "locked": [{"glob": "relats/raw/**", "reason": "…"}]}`. Glob: `**` mọi độ sâu,
  `*` trong một tầng, `?` một ký tự; so khớp **không phân biệt hoa/thường** (vault hay được clone qua
  filesystem khác nhau). Thiếu file, hoặc file JSON hỏng ⇒ **không khoá gì**: một cấu hình sai không bao
  giờ được phép chặn việc ghi.
- **Phạm vi**: ghi nội dung, đổi tên, di chuyển, upload vào thư mục khoá, xoá. Đọc, tìm kiếm, graph,
  export **không đổi**. Thư mục bị khoá cũng không phải nguồn để copy/move *ra* bằng trình duyệt — một
  luật duy nhất, không có ngoại lệ ngầm.
- **API**: phiên ghi vào đường bị khoá nhận `423 Locked` +
  `{error:"locked", path, reason, unlock}`. `GET /api/files` gắn `locked` + `lockReason` cho từng node;
  `GET /api/files/content` trả thêm `locked`, `lockReason`, `unlock` — đủ để editor dựng banner mà không
  cần request thứ hai. Riêng `POST /api/files/upload` kiểm tra trong handler (đường dẫn nằm trong body
  multipart, chỉ có sau khi multer phân tích xong).
- **Giao diện**: 🔒 ở cây file (tooltip = lý do); mở note bị khoá thì editor chuyển read-only và hiện
  banner `Read-only. <lý do>`; phím gõ không vào được editor (cùng cơ chế với chế độ reading).
- **Mở khoá có chủ ý** (`unlock`): `confirm` (nút **Edit anyway**, có hộp thoại xác nhận; từ đó mỗi request
  ghi mang header `x-unlock-locked: 1`) · `password` (hỏi mật khẩu operator, server kiểm tra bằng đúng hash
  của login) · `off` (không có nút nào — chỉ còn đường qua agent). Mặc định `confirm`, vì **một cái khoá
  không có lối ra sẽ dạy người dùng tắt khoá**.
- **Kiểm chứng**: 13 unit test (`server/src/services/locks.test.ts`: glob, parse cấu hình, cả ba chế độ mở
  khoá); `scripts/smoke-test.sh` scenario G — cây file đánh dấu đúng note bị khoá và không đánh dấu note
  bên cạnh, phiên ghi bị từ chối `423 locked`, **file không đổi một byte trên đĩa**, header mở khoá hoạt
  động, note không khoá vẫn lưu, và **key của agent ghi được đúng note đang bị khoá**; `deploy/smoke.sh`
  khẳng định lại trên **container thật** sau mỗi lần deploy (đọc `_system/locks.json` qua cây file, ghi thử
  vào thư mục khoá đầu tiên tìm được, rồi kiểm tra lần từ chối đó không để lại gì) — lần chạy đầu đã bắt
  ngay một lỗi thật (FR-20.1).
- **Không làm (non-goals)**: mã hoá nội dung note (khoá để chống **sửa nhầm**, không chống người có quyền
  truy cập filesystem — vault vẫn là markdown thuần, đó là thiết kế); phân quyền theo người dùng; khoá
  từng đoạn bên trong một note.
- **Tài liệu**: `docs/LOCKS.md` (cấu hình, các chế độ, phản hồi API), README (§ Features), và quy tắc trong
  vault của người dùng (`_system/SCHEMA.md`, `relats/routine.md`).

### FR-20 · Hai lỗi đường dẫn: note không tồn tại trả 500, và daily note về sai thư mục (issue #52, #55)
Mục tiêu: cùng một chỗ — không phân biệt được "không có file" với "đọc lỗi", và suy ra thư mục daily bằng
đường dẫn cứng.

- **FR-20.1 · Đọc note không tồn tại trả `500` (tìm ra bởi assert của FR-19)**: `GET /api/files/content`
  thử giải đường dẫn theo basename cho ca embed `![[image.png]]`; nếu vẫn không thấy file thì **vẫn đọc
  tiếp**, nên ENOENT của `readFileText` nổi lên thành 500. Sửa: sau khi giải basename, nếu vẫn thiếu thì
  trả `404 {error:"not_found", path}`. Assert tương ứng có trong `scripts/smoke-test.sh` scenario G.
- **FR-20.2 · Lệnh "Open today's daily note" ghi sai chỗ (issue #52)**: `web/src/lib/store.ts` hardcode
  `Daily/<iso>.md` ở **gốc vault**, nên với vault đặt daily note trong `relats/daily/` (đúng như vault này)
  mỗi lần bấm nút lại sinh một file rác ở gốc — lần theo dõi phải phát hiện, chụp lại và dọn. Sửa: chọn
  thư mục `daily/` **nông nhất** trong cây (khớp Obsidian mặc định), chỉ rơi về `Daily/` ở gốc khi vault
  **không có** thư mục daily nào; hành vi cũ giữ nguyên cho mọi vault chưa có thư mục daily.
- **Kiểm chứng**: `deploy/smoke.sh` trên container thật ở build `555fc60` (FR-20.2) và `b7233be` (FR-19 +
  FR-20.1) — 10/10 PASS, gồm cả hai assert mới của khoá; `npm test` và `scripts/smoke-test.sh` (31 PASS)
  sạch; `docs/DEPLOYMENT.md` ghi thứ tự giải đường dẫn daily note.

### FR-21 · Xem file PDF: pane xem + embed `![[x.pdf]]` (issue #57)
Mục tiêu: file PDF nằm trong vault nhưng **không xem được ở đâu cả** — mọi đường vào đều dẫn tới một tab
editor trống.

- **FR-21.1 · Pane xem PDF**: `EditorPane` (`web/src/components/Workspace.tsx`) chỉ có nhánh cho `.md`,
  canvas, ảnh, video, audio — mọi thứ khác rơi vào editor markdown, mà `store.openFile` chỉ đọc nội dung cho
  `TEXT_RE` (`md|markdown|txt|json|csv|canvas|css|js|ya?ml`), nên `/note/<path>.pdf` (deep link, click
  trong cây file, click wikilink) mở tab trống tên file dù `GET /api/files/content` đã phục vụ file đúng
  (`application/pdf`, có `Accept-Ranges`). Sửa: `fileViewKind()` trong `web/src/lib/media.ts`
  (`canvas|image|video|audio|pdf|text`) là **một** nguồn cho cả ba đường render; pane PDF là
  `<iframe class="pdf-fileview">` trỏ vào chính endpoint file — trình xem PDF của trình duyệt lo phân
  trang/zoom/tìm kiếm/in.
- **FR-21.2 · Embed `![[x.pdf]]`**: Live Preview render `PdfEmbedWidget` (khung + tên file bấm được để mở
  thành tab); Reading/Preview: `markdown.ts` phát ra **link trơ** mang `data-href` (href là URL file thật,
  nên renderer không chạy pass đó — vd trang public share — vẫn có link dùng được), rồi pass post-render của
  `Preview.tsx` (cùng pass với icon callout) thay bằng iframe. **Schema rehype-sanitize không được nới**:
  HTML thô trong note không có quyền chèn iframe (đúng lý do ```html block chỉ render trong khung sandbox
  khi người dùng bấm). `expandEmbeds` bỏ qua PDF để không nhồi byte của file vào markdown.
- **FR-21.3 · CSP `frame-ancestors`**: `'none'` → `'self'` (`server/src/index.ts`). Chính app khung nội
  dung của mình (`frameSrc`/`imgSrc` đã là `'self'`), nhưng `frame-ancestors 'none'` khiến trình duyệt từ
  chối nhúng file (log console `Framing … violates frame-ancestors 'none'`) và pane trống; `'self'` vẫn
  chặn mọi site khác.
- **FR-21.4 · Link tới file đính kèm không tồn tại không sinh note**: `store.openWikilink` trước đây tạo
  note mới cho **mọi** target có phần mở rộng chưa giải được, nên gõ sai `[[report.pdf]]` sinh file
  `report.pdf` ở gốc vault. Nay target thuộc nhóm file đính kèm (`isAttachmentTarget()`: ảnh/media/pdf) chỉ
  báo `File not found: …`; wikilink tới note vẫn tạo như cũ.
- **Giới hạn đã biết (đã xử lý ở FR-22)**: các định dạng nhị phân khác (`.xlsx`, `.docx`, `.zip`) trước đây
  rơi vào editor trống; từ FR-22 chúng mở **pane tải** trên cùng seam `fileViewKind`.
- **Kiểm chứng**: `npm test` **148 PASS** (thêm `web/tests/media.test.ts`, `web/tests/markdown.test.ts` và 3
  assert trong `web/tests/store.test.ts`); Chromium có trình xem PDF (Xvfb, headed) trên **bản sao** vault:
  deep link hiện đúng trang PDF trong pane (ảnh chụp có tiêu đề/mục lục), `![[x.pdf]]` render inline ở Live
  Preview và ở Preview (split pane), click tên file trong cây mở pane PDF, deep link sống qua `reload`,
  không lỗi console/pageerror, và `[[documents/nope.pdf]]` không tạo note nào; `deploy/smoke.sh` **13/13
  PASS** trên instance local (thêm 4 assert: CSP `frame-ancestors 'self'`, deep link SPA, file trả
  `application/pdf` inline, range `206 %PDF-`).

### FR-22 · Tải file nhị phân từ vault: pane tải + `Content-Disposition` (issue #59)
Mục tiêu: file **không có viewer** (Word/Excel/PowerPoint, nén, RTF) nằm trong vault nhưng **không lấy ra
dùng được** — mở thì ra editor markdown toàn byte nhị phân, mà tải thì mất tên file.

- **FR-22.1 · `?download=1` trên `GET /api/files/content`** (`server/src/routes/files.ts`): nhánh nhị phân
  (không phải text) nhận thêm `?download` / `?download=1|true|yes` và gửi
  `Content-Disposition: attachment; filename="<basename>"; filename*=UTF-8''<percent-encoded>`.
  Không có header này, trình duyệt đặt tên file theo segment cuối của URL ⇒ mọi file tải về đều tên
  `content` **không phần mở rộng** (đo được bằng Playwright: `suggested_filename = "content"`).
  Request không có `?download` giữ nguyên hành vi của FR-21: PDF vẫn `inline`, `Accept-Ranges: bytes`,
  range `206` — `Content-Disposition` chỉ được thêm khi được hỏi.
- **FR-22.2 · `attachmentDisposition()`** (`server/src/services/mime.ts`): dựng header, lấy basename từ
  đường dẫn, thay ký tự ngoài ASCII bằng `_` cho `filename` (fallback an toàn) và escape `"`/`\` để không
  cắt header; tên thật đi ở `filename*` theo RFC 5987 nên tên tiếng Việt vẫn giữ đúng khi lưu.
- **FR-22.3 · `fileViewKind()` trả `attachment`** (`web/src/lib/media.ts`): thêm `DOWNLOAD_EXT_RE`
  (`docx|xlsx|pptx|odt|ods|odp|rtf|zip|7z|tar|gz|tgz|bz2|xz`). Định dạng không nằm trong danh sách vẫn về
  `text` như cũ. `extLabel()` cho câu chữ trong pane ("PowerPoint files open outside the vault…").
- **FR-22.4 · Pane tải** (`web/src/components/Workspace.tsx`): nhánh `attachment` hiện tên file + nút
  **Download** trỏ `api.downloadUrl(path)`; icon `download` thêm vào `Icon.tsx`; style `.attachment-*`
  trong `obsidian.css`.
- **FR-22.5 · Kiểm chứng**: `npm run typecheck` 4 workspace sạch; `npm test` server **168 PASS**, web
  **149 PASS** (`server/src/services/mime.test.ts` mới + 5 assert trong `web/tests/media.test.ts`);
  Playwright (Chromium headed, Xvfb) trên instance thật LXC 107: mở file `.pptx` trong vault ⇒ trình duyệt
  tải file, tên lưu `operations-documentation-system-2026-09-27.pptx`, sha256 khớp bản build
  (`fd0aaf87…`), nội dung là zip hợp lệ (`PK`); PDF giữ `200 application/pdf` inline + range `206`.

### FR-23 · Chọn giá trị cho thuộc tính đóng: nút `▾` + danh sách giá trị (issue #61)
Mục tiêu: những thuộc tính có **từ vựng đóng** (`status`, `priority`, `origin`, `confidence`,
`severity`) không nên phải gõ tay — chọn từ danh sách, nhưng **không** chuẩn hoá ngầm giá trị lạ và
**không** cho giá trị nào bị mất.

- **FR-23.1 · Bảng từ vựng, thuần logic** (`web/src/lib/propOptions.ts`, mới): `PROP_PICK_LISTS` theo
  `relats/SCHEMA.md` — `priority` = `P1`–`P3`, `origin`, `confidence`, `severity`; `status` **theo loại
  trang** (`STATUS_BY_TYPE`): `task` = `open`/`in-progress`/`waiting`/`blocked`/`done`/`dropped`,
  `abnormality` = `open`/`contained`/`countermeasure-agreed`/`verified`/`closed`, `document` =
  `open`/`acted`/`archived` — **status của task không phải status của abnormality**, nên loại trang nào
  không có từ vựng trong SCHEMA (`system`, `entity`, …) thì **không** hiện picker (thà không có danh sách
  còn hơn danh sách sai: `accepted` của một ADR không phải status của task). `hasPickList(key, type)` /
  `pickListFor(key, type)` (khớp sau `trim`, bỏ phân biệt hoa-thường) và `optionsFor(key, current, type)`.
  Giá trị đang dùng được đánh
  dấu `current`; giá trị **không** có trong bảng được giữ nguyên và trả về **đầu danh sách** với
  `offList` ⇒ người dùng thấy đúng những gì note đang có, không bị "sửa hộ". Giá trị rỗng không sinh
  option nào (xoá giá trị là việc của nút × của hàng, không phải của picker). Không phụ thuộc DOM ⇒
  test được bằng `node:test`.
- **FR-23.2 · Nút `▾` ở Properties** (`web/src/lib/livePreview.ts`): `makeScalarField()` nhận thêm `key`
  của hàng; với khoá có pick-list, field được bọc trong `.prop-val-wrap` kèm nút `.prop-pick-btn`
  (`▾`, `aria-haspopup="listbox"`). `openPickList()` mount danh sách vào **`themedPopupHost()`**
  (`lib/theme.ts`) và dùng lại đúng các class sẵn có của menu thêm property
  (`.cm-props-dropdown.prop-val-dropdown`, `.cm-props-dd-item`) — popup mount ngoài wrapper theme sẽ mất
  palette (xem README, "Floating popups must mount inside the themed root").
- **FR-23.3 · Ghi đúng như gõ tay**: chọn một giá trị ⇒ `dataset.raw` + `textContent` của field rồi
  `mutate()`, tức cùng một đường frontmatter như gõ tay — **một** dòng `status:` đổi, phần còn lại của
  note không bị chạm (kể cả các khối `Update:` người dùng tự gõ). Field **vẫn là text sửa được**: giá trị
  ngoài bảng (`accepted`, `dropped` tuỳ vault) vẫn gõ được và không bao giờ bị ghi đè khi đọc. Escape và
  click ra ngoài đóng danh sách. `setType` (đổi *Property type*) dựng lại cả ô giá trị thay vì
  `replaceChild` vào chính field, vì field có thể nằm trong wrapper.
- **FR-23.4 · Không đổi phần còn lại**: `lib/tasks.ts` giữ nguyên id canonical + alias của board (không
  thêm cột mới, không đổi nhãn); không thêm tham số server/index nào — từ vựng nằm ở client, app chỉ ghi
  lại giá trị người dùng chọn.
- **FR-23.5 · Kiểm chứng**: `npm run typecheck` 4 workspace sạch; `npm test` server **168 PASS**, web
  **159 PASS** (`web/tests/propOptions.test.ts` mới, 10 case); Chromium headless (snap) trên instance tạm
  dựng bằng **bản sao** vault thật (không chạm vault LXC 107): **26 PASS / 0 FAIL** — `▾` chỉ xuất hiện ở
  khoá có từ vựng; danh sách đúng thứ tự SCHEMA với giá trị hiện tại được ✓ một lần; chọn `in-progress`
  ⇒ file `deliver-2027-budget-planning.md` đổi **đúng một dòng** `status:` và phần còn lại byte-identical
  (kể cả khối `Update:` người dùng tự gõ); reload giữ giá trị mới; một **abnormality page** thật hiện
  đúng từ vựng abnormality (không lẫn `in-progress`/`blocked`/`done` của task) và ✓ đúng `contained`; một
  **task có status ngoài bảng** (`wip-ish`, tạo trong bản sao vault) giữ nguyên giá trị, đứng đầu danh
  sách và **không** bị ghi lại; note `type: system` (ADR, `status: accepted`) **không** hiện picker và giữ
  nguyên text; console/pageerror rỗng; `bash deploy/smoke.sh` trên instance tạm **17 PASS / 0 FAIL**.

## 4. Yêu cầu phi chức năng (NFR)
- **Bảo mật**: password hash scrypt, JWT secret tự sinh, API key hash khi lưu, path traversal guard
  (chặn `..`, segment `.git`, symlink thoát vault — trừ khi realpath đích nằm trong `vault.allowedRoots`),
  CORS hạn chế, rate limiting (cả `/auth/login`:
  10 lần/15 phút — **khóa theo địa chỉ socket TCP thật, không theo `req.ip`/`X-Forwarded-For`** nên
  không thể bypass bằng cách xoay vòng XFF, **bất kể cấu hình `trust proxy`**; vì vậy `trust proxy` để
  mặc định bật (`true`, qua `TRUST_PROXY`) cho `X-Forwarded-Proto`/Secure-cookie hoạt động sau proxy;
  sau tunnel/proxy đặt `CLIENT_IP_HEADER` để khoá theo IP khách thật — header chỉ được dùng khi peer socket
  là proxy tin cậy, nếu không vẫn khoá theo socket). The default password (`123456`) is **only accepted when no other credential has
  been configured** (`auth.userPasswordHash`, `auth.passwordHash`, or the `WEBOBSIDIAN_PASSWORD` env
  var); only then is changing it mandatory right after the first login (`mustChangePassword`). That flag
  is **not** returned by `GET /auth/status` (an unauthenticated route), so it cannot be used to discover
  which instances still accept the default; clients read it from `/auth/login` and `/auth/me`. Security headers qua `helmet` + CSP (script-src 'self'+nonce; không ép HTTPS
  để giữ self-host HTTP; `frame-ancestors 'self'` để app tự nhúng file của mình — FR-21.3). Token git/PAT được redact khỏi mọi thông báo lỗi trả client + log. WebSocket
  `/ws` yêu cầu phiên đăng nhập hợp lệ. Plugin `id` được validate trước khi thành path segment; đổi
  `vault.path` qua API bị giới hạn trong `allowedRoots`.
- **Hiệu năng**: search < 100ms cho vault ~10k notes; lazy load file tree lớn. Asset build có hash
  (`/assets/*`) cache `max-age=1y, immutable`; `index.html` luôn revalidate.
- **Tin cậy**: atomic writes cho settings & notes; backup trước ghi đè; git ops không mất dữ liệu.
- **Khả chuyển**: chạy được trên Linux/macOS, ARM & x86.
- **Khả dụng**: responsive (desktop/tablet/mobile), dark/light theme.

---

## 5. API surface (tóm tắt)

### Web/session API (cookie auth)
```
POST   /auth/setup            # (legacy) set password lần đầu — vô hiệu khi đã có pass mặc định
POST   /auth/login            # login → cookie
POST   /auth/logout
POST   /auth/change-password  # đổi pass: { currentPassword, newPassword } (yêu cầu auth)
GET    /auth/me
GET    /api/files            # cây thư mục
GET    /api/files/*path      # đọc file (md/binary); note text kèm `version` (content-hash, CAS)
PUT    /api/files/*path      # ghi; nhận `baseVersion` tuỳ chọn (CAS) → lệch `409 version_conflict`
POST   /api/files/*path      # tạo / upload
PATCH  /api/files            # rename/move
POST   /api/files/copy       # copy đệ quy file/folder {from,to} (Paste sau Copy)
DELETE /api/files/*path      # xoá → .trash hoặc xoá hẳn (theo vault.deleteMode)
GET    /api/files/trash      # liệt kê file trong .trash
POST   /api/files/trash/restore   # khôi phục {path} về vị trí gốc
DELETE /api/files/trash/item # xoá vĩnh viễn 1 item trong trash
DELETE /api/files/trash      # empty trash (xoá hẳn toàn bộ)
GET    /api/search?q=...
GET    /api/tasks?folder=&status=&priority=&owner=&q=   # board tasks (ghi chú type: task), { tasks }
GET    /api/linkpreview?url=...   # OG metadata (title/description/image/domain) cho link preview card; SSRF-guarded, cache RAM
GET    /api/backlinks?path=...
GET    /api/git/status | POST /api/git/{pull,commit,push,sync}
GET/PUT /api/settings
GET/POST/DELETE /api/keys     # quản lý API key
GET    /api/plugins | POST /api/plugins/install | PATCH enable
GET    /api/shares            # list share (quản lý)
POST   /api/shares            # tạo share cho 1 note {path} → {id,...}
PATCH  /api/shares/{id}       # enable/disable {enabled}
DELETE /api/shares/{id}       # xoá share
```

### Public share (không auth) — `/public` & `/share`
```
GET    /public/shares/{id}        # nội dung note đã share {title, content} (404 nếu disabled,
                                  # 401 {passwordRequired} nếu có password & chưa unlock)
POST   /public/shares/{id}/unlock # {password} → set httpOnly cookie unlock (JWT 12h)
GET    /public/shares/{id}/file?path=  # file nhúng trong note (chỉ file note đó tham chiếu)
GET    /share/{id}                # trang HTML public — SERVER-RENDERED (SEO meta + OG + nội dung
                                  # note trong HTML; locked → form password noindex)
```

### Agent API (API-key auth) — `/api/v1`
```
GET    /api/v1/notes?offset=&limit=&sort=&order=&folder=   # list (paginate + order)
GET    /api/v1/notes/{path}?offset=&limit=                 # read (phân đoạn dòng) + version
PUT    /api/v1/notes/{path}                                # create/update ({content, base_version?})
PATCH  /api/v1/notes/{path}                                # append hoặc {find, replace, replaceAll?}
DELETE /api/v1/notes/{path}
GET    /api/v1/note-matches?path=&q=&case_sensitive=&limit=&context=
GET    /api/v1/search?q=...&limit=
GET    /api/v1/backlinks?path=
GET    /api/v1/tags
GET    /api/v1/tasks?folder=&status=&priority=&owner=&q=   # board tasks, scope `read`, { tasks }
```

---

## 6. Data model — `settings.json`
```jsonc
{
  "version": 1,
  "auth":   { "userPasswordHash": "scrypt$... (pass đã đổi; rỗng = dùng mặc định 123456)",
              "passwordHash": "scrypt$... (override khôi phục; rỗng = không có)",
              "jwtSecret": "..." },
  "vault":  { "path": "/vault", "allowedRoots": ["/vault"], "trash": ".trash", "deleteMode": "trash", "trashRetentionDays": 0 },
  "git":    { "enabled": false, "remote": "", "branch": "main",
              "token": "", "authorName": "", "authorEmail": "",
              "autoSync": false, "intervalSec": 300,
              "lfsPatterns": ["*.png","*.jpg","*.pdf","*.mp4"] },
  "search": { "fuzzy": 0.2, "indexFrontmatter": true },
  "api":    { "keys": [ { "id": "...", "name": "agent1",
                          "hash": "...", "scopes": ["read","search"],
                          "createdAt": "...", "lastUsed": "..." } ],
              "rateLimitPerMin": 120 },
  "ui":     { "theme": "obsidian-dark", "defaultView": "live", "showInlineTitle": true },
  "plugins":{ "enabled": ["dataview"], "installed": [] }
}
```

### `data/shares.json` (public share links — FR-10)
```jsonc
[
  { "id": "base64url-16-bytes", "path": "Folder/Note.md",
    "enabled": true, "createdAt": "2026-06-10T00:00:00.000Z",
    "passwordHash": "scrypt$...salt...$...hash..." } // optional — share không password thì bỏ field
]
```

---

## 7. Rủi ro & quyết định
- **Tương thích plugin**: nhiều plugin dùng API/DOM Electron riêng → chỉ đảm bảo subset. Quyết định: shim API phổ biến, fail mềm với API thiếu, log cảnh báo.
- **Bảo mật token git/API key**: lưu trong settings.json server-side (chmod 600), khuyến nghị mount qua secret/volume riêng.
- **File lớn**: bắt buộc Git LFS; cảnh báo khi commit file > ngưỡng mà chưa track LFS.
- **Đồng bộ xung đột**: v1 ưu tiên thông báo + manual resolve, không auto-merge phá dữ liệu.

---

## 8. Tiêu chí hoàn thành (Definition of Done) cho v1
1. Đăng nhập 1 password, mở vault, xem cây thư mục.
2. Mở/sửa/tạo/xoá note với editor + live preview + wikilinks/backlinks.
3. Search trả kết quả từ QMD < 100ms trên vault mẫu.
4. Cấu hình git, sync (pull/commit/push) thành công kể cả file LFS.
5. Tạo API key, AI Agent gọi `/api/v1` đọc/ghi/search thành công.
6. Cài & bật ít nhất 1 community plugin đơn giản.
7. `docker compose up` chạy toàn bộ stack.

## 2026-10-30: adaptive toolbar, drafts and conflicts

Status: in progress. Execution order: container-sized one-row toolbar with More menu, then persistent local drafts, then version-conflict resolution. Existing explicit scroll/wrap layouts remain supported. See `docs/superpowers/plans/2026-10-30-drafts-conflicts-adaptive-toolbar.md`.

### FR extension — local recovery and container-adaptive toolbar (2026-10-30)

Saved-copy cleanup (2026-11-01): browser recovery copies whose complete text exactly matches the current saved file in their captured vault scope are removed automatically. Compare without trimming or normalizing line endings. Group reads by file; throttle ordinary cleanup to 30 seconds and recheck on focus, filesystem events and successful saves. Atomically recheck the browser record's revision/content and scope before deletion. Preserve active unsaved editor copies, copies under review, unavailable/deleted files, and all differing text. Cleanup never writes or deletes a vault file.

- Authenticated `GET /api/files/draft-scope` returns a stable opaque `scopeId` for the canonical current vault within this installation. Registry is private JSON in the configured data directory.
- Browser drafts are IndexedDB records keyed by scope/path/writer, with monotonic revisions and conditional acknowledgement deletion. Local journal failure is visible and does not prohibit an explicit CAS server save. Draft content is excluded from shared UI-state and broadcast messages.
- Normal editor PUT includes the read `baseVersion`. Server rejection preserves local data and pauses that document's automatic saves. Recovery and conflict comparison require an explicit save; subsequent server changes require a new review rather than unconditional overwrite. Copy uses create-only version `''`.
- Unified comparison shows server changes against an editable local result, with base/local/server details. Canvas is whole-document JSON; interactive diff is disabled above 1 MiB or 20,000 lines.
- Toolbar `appearance.overflow` accepts `menu`, `scroll`, `wrap`. `menu` is the default for new configuration; explicit legacy values persist. Menu mode measures the available editor container, keeps group/color items atomic and puts the ordered suffix into More without shrinking buttons.
- Local storage can be cleared/evicted by the browser. The feature is not a complete offline app and does not implement Git merge resolution.

### Review follow-up (2026-10-30)

Browser recovery reads and writes may carry an optional `draftScopeId` (query for GET, JSON field for PUT). The server captures vault settings and verifies the scope inside the same vault operation; mismatch returns `409 draft_scope_changed` before reading/writing content. Existing callers omitting the field retain their API contract. Document sessions receive a fresh writer identity on reopen; successful conflict acknowledgements update the live base without a required reread. IndexedDB cleanup failure is reported separately from successful server persistence.

Viewport geometry is shared across formatting/recovery UI. Actual browser zoom 100/125/150/200% and emulated overlay/resizing keyboard layouts are covered by `web/tests/toolbarViewportBrowser.test.ts`. Physical mobile keyboard acceptance remains a separate manual check.

### Remote MCP transport (2026-10-30)

Optional `/mcp` Streamable HTTP, disabled by default, alongside unchanged stdio. Ten identical tools, request-scoped key/scopes, common operations and version conflicts. See [remote MCP contract](docs/superpowers/specs/2026-10-30-remote-mcp-design.md) and [operator/Perplexity guide](docs/MCP_REMOTE.md). Live Perplexity compatibility requires deployment acceptance.

### Built-in code file viewer (2026-11-01)

Mapped source/text files open in a read-only CodeMirror view with syntax highlighting, line numbers, search and copy in main and split panes. Settings → Code files manages extension/language mappings. UTF-8 only; preview limit 10 MiB, highlighting limit 1,000,000 UTF-16 code units. Code files are never executed or indexed as Markdown notes. Existing mapped text formats become read-only while enabled; disabling/removing mappings restores the legacy editor. Draft recovery and failed saves must preserve local text.

### Native embeds and fragment compatibility — FR-2 / FR-10 / FR-21 (2026-11-01)

- Preserve ordered task numbers, native checkbox states/strikethrough, literal filename titles and vault-controlled unsupported-file visibility. Bases behavior remains outside this compatibility batch.
- Use one scoped PDF.js reader for note embeds, whole-file/split views and public pages. Native-like controls include sidebar/outline, zoom/spreads/theme, file actions, source selection, text/annotation/offset fragments and bounded viewer geometry; browser-inapplicable OS commands stay unavailable.
- Wiki and standard Markdown embeds share note/heading/block selection and source-relative paths. Preserve task/quote/callout structure, media controls, image actions and Canvas previews. Opening a note source reveals the requested fragment without rewriting source; browser reload/history retain the target.
- Public parents never grant access to private child note bodies or their descendants. Each child requires its own enabled, visitor-unlocked publication; its assets retain that publication's scope. Public Canvas file/text attachments use explicit allowlists. Nested body reads are request-bounded to 64 attempts and 2 MiB, with permission and size checks before allocation.
- Authored HTTP(S) frames are rebuilt after sanitization as opaque-origin sandboxed frames; they cannot access parent DOM/storage/cookies or navigate the parent. Browser embedding/mixed-content restrictions remain in force.

Measured native evidence, regression coverage and remaining limits: `docs/embed-controls-audit-2026-11-01.md`.
