## [2026-11-09 13:30] | Task: 清零 CodeQL Code scanning 存量告警（42 → 2）

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 这里还显示有 42 个是什么情况（GitHub Security › Code scanning 截图）……嗯嗯可以的。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`packages/client/client`、`packages/llm/llm-pi-ai`、`packages/subagent/subagent`、`packages/english-learning/english-learning`、`packages/composition/cordis-adapter`、`packages/fs/tool-fs-read`、`packages/host/agent-host`、`packages/core/agent-loop`、`apps/desktop`、`apps/web`、`scripts/`、`.github/codeql/codeql-config.yml`

**Key Actions:**

- **本地复现**：GitHub 的 code-scanning API 对 integration 返回 403，改为下载 CodeQL CLI 2.27.4，用与工作流相同的 `--codescanning-config=.github/codeql/codeql-config.yml` 建库并以 `security-and-quality` 分析，得到与 GitHub 完全一致的 42 条；修完复扫只剩 2 条。
- **`js/polynomial-redos` × 9 + `js/regex/missing-regexp-anchor` × 1**：新增 `@actspace/shared` 的 `trimTrailing(value, chars)`（字符扫描），替换 `data-root`、`custom-connection-address`、`stream-blocks`、`deepseek-files`、`subagent/messages` 里的 `/[chars]+$/`；`model-catalog-match` 新增 `stripModelTag`（`indexOf(":")` 切片）供 `model-thinking-profiles` 复用；`model-layers` 的 `(latest)` 后缀改为 `endsWith` + `trimEnd`；`check-package-cutover` 的 `test` 目录判定加 `(?:^|[\\/])` 锚点。
- **`js/file-system-race` × 17**：统一改为「先 `open`，再用同一 `FileHandle` 做 `stat` 与 `readFile`」，check 与 use 之间路径不会被替换。涉及 `browser-bridge-service`（`readOwnedFile` / `readRegularFile`）、`runtime-registry`（`readAttachmentBytes`）、`workspace-fs-service`、`cordis-adapter/plugin-artifact`、`tool-fs-read/node-ports`、`agent-host` 的 `admin`（`O_NOFOLLOW` 代替 `isSymbolicLink()`）/ `config`（去掉 `readFile` 前多余的 `access`）/ `uploads`（truncate 后在同一句柄上读回算 digest）、`package-agent-cli.mjs`（`readlink` 优先，EINVAL 再 `readFile`，去掉 `lstat`）、`benchmark-usage-json-baseline.mjs`（`w+` 打开，用 `file.read(buf, 0, size, 0)` 回读）。
- **`js/file-access-to-http` × 4**：`verify-usage-package.mjs` 把 fixture 路径改为通过环境变量传入；`fetch-nono.mjs` 的 `nono-version.json` 改为 `import ... with { type: "json" }`，`readNonoVersion()` 不再接文件参数；`scripts/acceptance/**` 加入 `paths-ignore`（验收脚手架，与既有 test / fixtures 忽略一致）。
- **其余单条**：deepseek 上传缓存键改为以 `apiKey` 作 HMAC-SHA256 密钥而非直接 `update()`（`insufficient-password-hash`）；`english-text` 的去标签改为不动点循环（`incomplete-multi-character-sanitization`）；`subagent/messages` 的 `escapeXml` 补 `"` → `&quot;`（`incomplete-html-attribute-sanitization`）；PWA Service Worker 的 `message` 处理先校验 `event.origin === self.location.origin`（`missing-origin-check`）；`use-session-observation` 的 `loadOlder` / `refresh` 在 observer 缺失时返回 `Promise.resolve()`（`missing-await`）；`App.tsx` 的 `handleCopyTranscript` 与 `agent-loop/loop.ts` 去掉无用赋值（`useless-assignment-to-local`）。

### 🧠 Design Intent (Why)

- 42 条全部是 11-08 刚合入的 CodeQL 工作流首次全量扫描存量代码的结果，没有真实可利用漏洞，但 `security-and-quality` 的 quality 类告警会长期挂在 Security 页签并让后续 PR 的 CodeQL 结果难以辨认，一次清零比逐条 dismiss 更可维护。
- `file-system-race` 没有用 dismiss：先 `open` 再用句柄 `stat` 是真正消除 TOCTOU 的写法，代价只是把检查挪到 `try/finally` 内；`admin.ts` 原来靠 `lstat().isSymbolicLink()` 拒绝符号链接，`O_NOFOLLOW` 在 open 时就拒绝，语义更强（Windows 下该常量为 `undefined`，按位或得 0，退化为普通打开）。
- 正则类告警改用字符扫描而不是「换个等价正则」：`/[\\/]+$/` 这类在超长输入下的回溯是真实的，`trimTrailing` 是 O(n) 且可被多个包复用。
- 剩余 2 条 `js/regex-injection`（`scripts/diagnostics/heap-monitor/analyze.mjs:116/140`）保留代码：这是本地诊断 CLI，正则就是用户自己传入的 `--filter` / `pattern` 参数，属于文档化功能，应在 GitHub 上以 Won't fix dismiss。

### ✅ Verification

- `pnpm lint`、`pnpm typecheck` 全部通过。
- 受影响包测试：`shared`（224）、`client`（85）、`llm-pi-ai`（146）、`subagent`（30）、`english-learning`（21）、`cordis-adapter`（43）、`tool-fs-read`（8）、`agent-host`（128）、`agent-loop`（71）、`apps/web`（141）、`apps/desktop` 全量（2898）全部通过；`node --test scripts/test/fetch-nono.test.mjs`（4）通过；`node scripts/check-package-cutover.mjs` 0 finding。
- 本地 CodeQL 复扫：42 → 2，剩余两条即上文 heap-monitor。

### 📁 Files Modified

- `.github/codeql/codeql-config.yml`
- `apps/desktop/scripts/benchmark-usage-json-baseline.mjs`
- `apps/desktop/scripts/verify-usage-package.mjs`
- `apps/desktop/src/main/browser-bridge-service.ts`
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`
- `apps/desktop/src/main/workspace-fs-service.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/web/src/pwa/sw.ts`
- `apps/web/src/sessions/use-session-observation.ts`
- `packages/client/client/src/live/stream-blocks.ts`
- `packages/composition/cordis-adapter/src/plugin-artifact.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/english-learning/english-learning/src/english-text.ts`
- `packages/fs/tool-fs-read/src/node-ports.ts`
- `packages/host/agent-host/src/admin.ts`
- `packages/host/agent-host/src/config.ts`
- `packages/host/agent-host/src/uploads.ts`
- `packages/llm/llm-pi-ai/src/deepseek-files.ts`
- `packages/subagent/subagent/src/messages.ts`
- `packages/util/shared/src/custom-connection-address.ts`
- `packages/util/shared/src/data-root.ts`
- `packages/util/shared/src/index.ts`
- `packages/util/shared/src/model-catalog-match.ts`
- `packages/util/shared/src/model-layers.ts`
- `packages/util/shared/src/model-thinking-profiles.ts`
- `packages/util/shared/src/trim-trailing.ts`（新增）
- `scripts/check-package-cutover.mjs`
- `scripts/package-agent-cli.mjs`
- `scripts/sandbox/fetch-nono.mjs`
- `docs/CICD.md`
