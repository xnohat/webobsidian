<div align="center">

<img src="assets/logo.png" alt="USC Wiki Editor" width="128" />

# USC Wiki Editor

**面向 USC Wiki 的网页投稿编辑器，在浏览器中提供接近 Obsidian 的 Markdown 编辑体验。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

[投稿流程](#投稿流程) · [本地开发](#本地开发) · [Cloudflare 部署](#cloudflare-部署) · [项目结构](#项目结构)

</div>

---

## 项目简介

USC Wiki Editor 基于 [xnohat/webobsidian](https://github.com/xnohat/webobsidian)
进行二次开发。它读取 `hzxyayaya/USC-wiki` 仓库中 `contributions` 分支的
`docs/` 目录，让贡献者像使用 Obsidian 一样浏览和编辑 Wiki，并通过统一贡献账号
创建或更新 Pull Request。

这个编辑器不会把公开用户的修改直接写入 `main`：

```text
贡献者编辑
  → 统一贡献账号的 contrib/* 分支
  → Pull Request
  → USC-wiki:contributions
  → 审核后再由维护者统一合并到 main
```

仓库仍保留上游 WebObsidian 的完整自托管模式；本 README 主要说明 USC Wiki 的
公开投稿部署。通用部署配置可参考 [`.env.example`](.env.example) 和
[`docker-compose.yml`](docker-compose.yml)。

## 当前功能

- Obsidian 风格的文件树、标签页、侧边栏和明暗主题。
- CodeMirror 6 Markdown 编辑器，支持 Source、Live Preview 和 Reading 模式。
- Wikilink、嵌入图片、Callout、任务列表、KaTeX 和 Mermaid。
- 新建 Markdown 文件，以及拖放导入 Markdown、图片和附件。
- 搜索、标签、Properties、反向链接、链接解析和关系图只读数据。
- 编辑前识别当前文档关联的开放 PR，可继续原有投稿或创建新投稿。
- 继续已有 PR 时，从该 PR 的 head 分支加载文件树、正文和图片。
- 创建 PR、更新已有 PR、直接打开 GitHub，并在 PR 完成后释放投稿工作区。
- 投稿关联通过 GitHub 恢复，不依赖浏览器 `localStorage`；本地草稿只在匹配的
  投稿上下文中恢复。
- Cloudflare Workers 与 Netlify Functions 共用同一套 GitHub 投稿处理逻辑。

## 投稿流程

### 1. 打开文档

打开 Markdown 文档时，编辑器先通过 GitHub 查询是否存在修改过该路径的开放投稿 PR。
在查询完成前，正文不会进入可编辑状态。

### 2. 选择投稿工作区

- 有开放 PR：选择“继续修改 PR”或“基于 `contributions` 创建新投稿”。
- 没有开放 PR：进入新的投稿工作区。

选择已有 PR 后，文件树、Markdown 和图片都会从该 PR 分支重新加载，避免基于旧的
`contributions` 内容继续修改。

### 3. 编辑并提交

- 新投稿会创建 `contrib/YYYYMMDD-xxxxxxxx` 分支，并向 `contributions` 发起 PR。
- 已有投稿会向已选择的同一分支追加提交，更新原 PR。
- 提交窗口不能临时更换 PR 或手工填写任意分支。

### 4. 审核与清理

维护者先把通过审核的 PR 合并到 `contributions`。需要正式发布时，再统一将
`contributions` 合并到 `main`。编辑器检测到 PR 已合并或关闭后，会解除旧关联；
只有与已提交内容完全匹配的本地草稿才会被自动清理，较新的编辑仍会保留。

## 分支约定

| 分支 | 用途 | 自动部署 |
| --- | --- | --- |
| `main` | 上游代码基线，不接收 Wiki 投稿 | 否 |
| `cloudflare-production` | USC Wiki Editor 的生产版本 | 是 |
| `codex/*` | 功能开发与验证 | 否 |
| `USC-wiki:contributions` | 已审核、等待统一发布的 Wiki 内容 | Wiki 侧流程 |
| `cherryLucas:contrib/*` | 统一贡献账号创建的单次投稿分支 | 否 |

功能代码通过 PR 合并到 `cloudflare-production` 后，GitHub Actions 会执行测试、构建并
部署 Cloudflare Worker。Wiki 内容 PR 始终以 `contributions` 为目标，不直接修改 `main`。

## 本地开发

要求：Node.js 20 或更高版本、npm、Git。Cloudflare 本地调试还需要 Wrangler。

```powershell
git clone https://github.com/hzxyayaya/USC-Wiki-Editor.git
cd USC-Wiki-Editor
npm install
```

运行完整的上游 WebObsidian 开发环境：

```powershell
npm run dev
# Web: http://localhost:5173
# Server: http://localhost:8787
```

运行 USC Wiki 投稿模式：

```powershell
Copy-Item .dev.vars.example .dev.vars
# 在 .dev.vars 中填写 GITHUB_TOKEN
npm run build:contribution
npx wrangler dev --config wrangler.jsonc
```

`.dev.vars` 包含凭据，禁止提交到 Git。

## 环境变量

非敏感的仓库配置已经写入 [`wrangler.jsonc`](wrangler.jsonc)：

| 变量 | 当前用途 |
| --- | --- |
| `GITHUB_UPSTREAM_OWNER` | Wiki 主仓库所有者，当前为 `hzxyayaya` |
| `GITHUB_FORK_OWNER` | 统一贡献账号，当前为 `cherryLucas` |
| `GITHUB_REPO` | Wiki 仓库名，当前为 `USC-wiki` |
| `GITHUB_STAGING_BRANCH` | PR 目标分支，当前为 `contributions` |
| `PUBLIC_EDITOR` | `true` 时公开访问，不使用编辑器密码 |

以下内容必须使用本地 `.dev.vars` 或 Cloudflare 加密 Secret：

| Secret | 要求 |
| --- | --- |
| `GITHUB_TOKEN` | 必填；能够在贡献账号 fork 中创建分支和提交，并向主仓库创建 PR |
| `EDITOR_PASSWORD` | 仅在关闭 `PUBLIC_EDITOR` 时使用，至少 8 个字符 |
| `SESSION_SECRET` | 仅在关闭 `PUBLIC_EDITOR` 时使用，至少 32 个字符 |

当前生产配置为 `PUBLIC_EDITOR=true`，因此只需要 `GITHUB_TOKEN`。公开模式不等于直接
开放仓库写权限：服务端仍限制可投稿路径和文件类型，PR 目标固定为 `contributions`，
提交接口同时受 Cloudflare Rate Limiting 保护。

## Cloudflare 部署

首次部署前设置 Worker Secret：

```powershell
npx wrangler secret put GITHUB_TOKEN --config wrangler.jsonc
```

手动验证和部署：

```powershell
npm run typecheck
npm run typecheck:netlify
npm run typecheck:cloudflare
npm run test:netlify
npm run test:cloudflare
npm run test:web
npm run build:contribution
npx wrangler deploy --config wrangler.jsonc
```

正常发布请创建以 `cloudflare-production` 为目标的 Pull Request。合并后
[`deploy-cloudflare.yml`](.github/workflows/deploy-cloudflare.yml) 会自动完成相同的验证和部署。
GitHub Actions 还需要仓库 Secret：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

完整说明见 [Cloudflare 部署文档](docs/CLOUDFLARE_DEPLOYMENT.md)。Netlify 适配配置见
[`netlify.toml`](netlify.toml)。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Node 服务端和 Vite 开发服务器 |
| `npm run build` | 构建完整自托管版本 |
| `npm run build:contribution` | 构建 USC Wiki 投稿版本 |
| `npm run typecheck` | 检查服务端与 Web 类型 |
| `npm run typecheck:netlify` | 检查 Netlify 投稿后端 |
| `npm run typecheck:cloudflare` | 检查 Cloudflare Worker |
| `npm run test:netlify` | 运行 Netlify/GitHub 投稿测试 |
| `npm run test:cloudflare` | 运行 Worker 集成测试 |
| `npm run test:web` | 运行投稿编辑器前端逻辑测试 |

## 项目结构

```text
USC-Wiki-Editor/
├── cloudflare/                 # Cloudflare Worker 入口与测试
├── netlify/                    # 共用的 GitHub 投稿逻辑与 Netlify Functions
├── server/                     # 上游 Express 服务端
├── web/                        # React + Vite + CodeMirror 前端
├── docs/                       # 部署说明和技术文档
├── .github/workflows/          # cloudflare-production 自动部署
├── wrangler.jsonc              # Worker 非敏感配置
├── netlify.toml                # Netlify 构建配置
├── PRD.md                      # 产品需求与行为约定
└── IMPLEMENTATION_PLAN.md      # 实现进度和验证记录
```

Cloudflare 版本的请求路径：

```text
Browser
  ├── /api/*、/auth/* → cloudflare/worker.ts
  │                         → netlify/lib handlers
  │                         → GitHub API
  └── 其他路径          → Worker Static Assets / React SPA
```

## 安全边界

- Token 和密码只能放在平台 Secret 或本地 `.dev.vars`，不能提交到仓库。
- Worker 不向浏览器返回 `GITHUB_TOKEN`。
- 投稿路径必须位于 `docs/**`，并经过路径穿越检查。
- 常规 Markdown 写接口在公开部署中保持关闭，写入只能经过投稿 PR 流程。
- 选择已有工作区时，服务端会再次确认分支来自配置的 fork、格式合法、PR 仍然开放，
  且目标确实是 `contributions`。

## 开发约定

1. 需求和范围以 [`PRD.md`](PRD.md) 为准。
2. 功能状态同步更新 [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)。
3. 不记录 Token、密码或 API Key；所有文件路径必须防止越界。
4. 提交 PR 前运行对应的测试、TypeScript 检查和 contribution build。
5. 不要把功能分支直接合并到 `main`；生产编辑器以 `cloudflare-production` 为目标。

## 上游与许可证

本项目基于 [WebObsidian](https://github.com/xnohat/webobsidian)，遵循
[MIT License](LICENSE)。WebObsidian 与本项目均不隶属于 Obsidian.md。
