## [2026-08-26 00:00] | Task: 完成 v2 多包插件化切换

### 🤖 Execution Context

- **Agent ID**: `root`
- **Base Model**: `GPT-5 / Codex`
- **Runtime**: `API`

### 📥 User Query

> 执行已确认的 P00-P05：从单一 ESM Runtime monolith 切换为 DSH 风格的独立领域 workspace packages + Cordis Plugin Entry。

### 🛠 Changes Overview

**Scope:** `apps/desktop`、`apps/cli`、`apps/site`、`packages/runtime`、`packages/core`、`packages/session`、`packages/llm`、`packages/tools`、`packages/subagent`、`packages/host`、`browser-bridge`、workspace/scripts/docs。

**Key Actions:**

- **Runtime cutover**：把 boot、projection、Profile composition 和 RuntimeHandle 放入 `@actspace/runtime`，Host/CLI/Desktop 只通过新 loader 和 domain exports 接入。
- **真实插件包**：Session、LLM、Prompt、Agent Loop、Tools、Browser Tools、Subagent 等均具备独立 manifest、behavior entry、exports、lifecycle tests。
- **旧路径退役**：旧 `packages/agent-runtime` 移出 workspace；通用 `plugins/`、旧 deep import、Kairos/fs-watch/`/eval` 生产引用严格扫描归零。
- **Browser capability**：Browser Bridge 顶层化为 `browser-bridge/`，并将 Desktop BrowserBridgeService 移出内部 `plugins/` 目录。
- **应用边界**：Desktop、CLI、Site 统一迁入根级 `apps/`，保留原 package identity、公共 API、命令和产品行为；`packages/` 只保留可复用 package，并由 verifier 禁止反向依赖应用。

### 🧠 Design Intent (Why)

ESM 只描述模块格式，不提供插件身份、生命周期或可替换边界。独立 workspace package + manifest + Behavior Entry + Effect-owned dispose 才能让 Cordis Loader 诊断和替换每个领域；`@actspace/runtime` 只保留 Host-facing 编排，避免再次形成隐藏 monolith。

### 📁 Files Modified

- `packages/runtime/`
- `packages/core/agent/`
- `apps/cli/`
- `apps/desktop/`
- `apps/site/`
- `packages/host/`
- `browser-bridge/`
- `scripts/check-package-cutover.mjs`
- `docs/exec-runs/actspace-v2-p05-browser-bridge-cutover-and-verification/`

### 追加修复：clean checkout 的声明构建顺序

首次在无 `dist/` 的临时 clean checkout 执行 `pnpm typecheck` 时，`@actspace/llm-pi-ai` 和 Session projection 先于其 workspace 依赖的声明产物运行，暴露了 dirty checkout 缓存掩盖的包边界问题。根 `typecheck:contracts` 现改为 `pnpm --filter @actspace/runtime... build`，先按 workspace 依赖图生成 Runtime 及其全部领域包声明，再执行全 workspace typecheck。

这保持了每个领域包的独立边界，同时让 frozen clean checkout 的 typecheck 与开发者已有构建缓存得到同一结果。

### 追加收口：应用入口迁入 `apps/`

应用目录迁移同步更新了 workspace/lockfile importer、TypeScript/Vite/Vitest alias、CI、Desktop/CLI package 脚本、Site 构建和仓库边界检查。直接字符串扫描无法发现由 `path.join()` 分段拼出的旧路径，因此真实 CLI process smoke 被保留为迁移门禁；它捕获并验证了最后一个旧 `packages/agent-cli` 路径。

迁移后离线 frozen install、全量 typecheck/build/test、Site 0 diagnostics/17 tests/22 pages、managed CLI package/smoke/process、Browser 静态检查和两个 Go module tests 通过。不含 `.git`、`node_modules`、`dist` 的隔离文件树仅只读复用 pnpm content-addressable store，重装后同样通过 typecheck/test/build、Site、CLI process、Browser/Go。Desktop portable app 已生成；DMG、签名/公证、真实 Provider、Chrome Extension 和唯一 cutover commit 仍是外部或用户授权门禁，没有记为完成。

### 追加复核：外部门禁的真实状态

Desktop main-only 本地凭据中实际已配置 DeepSeek 与 OpenRouter；`secrets.json` v2 明文 + `0600` 是当前安全规范明确记录的取舍，`safeStorage` 只用于旧 v1 密文迁移，因此没有擅自改变凭据存储格式。正式 Provider 网络服务的只读探针在当前 Codex 沙箱内均返回网络不可达，未输出凭据、响应正文或写回设置。

Chrome 已安装并运行，但 Codex/ChatGPT Chrome Extension 当前被禁用，ActSpace unpacked Extension 仍指向迁移前旧路径；Computer Use 也未获准访问 portable Actspace。遵守宿主授权边界，没有用 shell、AppleScript 或替代 UI 自动化绕过。真实 Provider、Chrome action、Electron UI、DMG/签名/公证和唯一 cutover commit 继续保留为未完成门禁。

恢复执行后，官方 Chrome 诊断确认 ChatGPT/Codex Extension 已安装并启用、没有 disable reason，Native Host manifest 也正确；但 Browser Runtime 仍无法取得 Chrome binding，只发现 Codex In-app Browser。ActSpace ABB socket 仍 offline，Computer Use 仍未获准访问 portable Actspace，DeepSeek 域名仍无法解析，`hdiutil`、codesign 和签名环境状态也没有改变。文档因此把当前阻塞从“Codex 扩展被禁用”修正为“扩展已启用但控制通道未建立”，并继续遵守不通过 shell 或替代 UI 自动化绕过 Chrome/Computer Use 授权的边界。

### 追加修复：排序 UI 测试的实时时间戳漂移

最终全量复验首次出现 Sidebar “See more”用例失败。测试一次创建 12 条 Session 时使用实时 `new Date()`，而产品会按 `updatedAt` 降序排序；并发负载足够高时后创建的第 9 条会进入前 8 条，导致单测独跑通过、全量测试偶发失败。

该场景改为显式递减的固定时间戳，产品排序、折叠逻辑和前端样式均未修改。目标用例连续 20 次通过，随后 Desktop 78 files / 522 tests、根全量 tests、build、Browser checks、managed CLI package/smoke/process 和 Site check/test/build 全部通过。P04 状态同时修正为“实现与自动化完成、真实 Electron 人工验收仍待 P05”，避免计划文字超出证据。

### 追加门禁：真实插件包结构与生命周期

完成标准审计发现，旧 `check:packages` 只验证 workspace exports、依赖环和 deep import，不能防止一个可装载 package 后续丢失 Static Manifest、Behavior Entry 或 lifecycle test。现在所有导出 `./plugin` 的 package 都必须具备 `src/manifest.ts`、`src/plugin.ts`、相应 exports 和 `lifecycle.test/spec`；codec 文件与 `./codec` export 必须成对存在。

Compaction、Context、Core Agent、Core Scope、Prompt 和 Subagent 补齐直接调用 Behavior `activate()` / `dispose()` 的独立 contract。临时负向 workspace fixture 证明缺少 lifecycle test 会使 boundary check 失败，真实 31-manifest workspace 与新增 package tests 均通过。

### 追加收口：当前文档真相区

源码已经完成 v2 多包切换，但默认文档仍散落 v1 单包 Runtime、`session.jsonl`/`context-state.json` sidecar、独立 Trace sidecar、ToolScheduler 和 Team/Kairos 当前入口声明。这会让后续开发者和 Agent 沿着已删除路径继续设计。

本轮把根 README、架构、安全、可靠性、Session/Context/Analysis、Tool 权限、Subagent 与测试设计收敛为当前 v2 事实；纯 v1 cache、Bash、approval 文档进入 `v1-legacy/`，基于 v1 的 Team V1 与 Bash allowlist 执行计划进入 `discarded/`，历史链接同步指向归档位置。

新增 current truth zone 检查：显式列出默认事实文件，拒绝单包 Runtime、失效测试路径、已丢弃 active 计划和 v1 Session 目录，并验证这些文件中的相对 Markdown 链接。正向仓库、旧路径 + 断链负向 fixture、合法链接 fixture 均已覆盖，`check:docs` 现在会运行该门禁。

Browser Bridge、真实 Provider、Electron、DMG/签名和 commit 仍按原外部门禁处理；本轮未修改浏览器代码、未删除用户旧数据、未提交或推送。
