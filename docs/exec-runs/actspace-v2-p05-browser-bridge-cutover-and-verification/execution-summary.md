# P05 Browser Bridge、唯一切换与全量验证 — 执行摘要

## 执行状态警告

⚠️ 源码切换和自动化门禁完成；真实 Provider、Chrome Extension、DMG、签名/公证和唯一 cutover commit 仍是人工/宿主环境边界。

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260824-actspace-v2-package-layout-and-plugin-packaging/actspace-v2-p05-browser-bridge-cutover-and-verification.md`
- **执行过程**：`docs/exec-runs/actspace-v2-p05-browser-bridge-cutover-and-verification/execution-process.md`
- **执行模式**：交互
- **执行结果**：实现完成，发布门禁待人工验收

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Host-facing runtime cutover | `packages/runtime/`、`apps/cli/`、`apps/desktop/` | Desktop/CLI 通过新 runtime facade 和 domain exports 启动 |
| 应用边界收口 | `apps/{desktop,cli,site}`、`pnpm-workspace.yaml`、lockfile、CI/scripts | 可运行/打包/部署入口与可复用 packages 分离，package identity 与行为保持不变 |
| 旧 monolith 退役 | `tmp/retired/agent-runtime/`、`pnpm-lock.yaml`、cutover checks | 旧源码不在 workspace 或生产可达图；本地保留 ignored rollback archive |
| Browser Bridge 顶层化 | `browser-bridge/`、Desktop BrowserBridgeService | Browser capability 与通用 `plugins/` 目录分离 |
| Go cache 与 extension checks | `browser-bridge/apps/cli/main.go`、`scripts/check-browser-command-registry.mjs` | 测试可继承受限宿主的 GOCACHE；locator/extension contract 固定 |
| 文档和执行记录 | `apps/README.md`、`packages/README.md`、site contributing、P05 exec-run/history/learning | 当前阅读路径、应用边界与旧路径退役状态同步 |
| 当前文档真相门禁 | 根文档、`docs/design-docs/`、`scripts/check-current-docs.mjs` | v2 默认阅读区、v1 legacy/discarded 分层和断链/旧路径负向检查 |

## 必须验证

1. **真实 Provider + CLI/Runtime**
   - 验证方式：在用户已配置的 provider 环境运行 managed CLI 的真实请求和 resume。
   - 预期结果：请求通过新 `@actspace/runtime` loader，Session 只写 `sessions-v2/<id>/journal.jsonl`。

2. **真实 Chrome Extension/Browser Bridge**
   - 验证方式：启动 `browser-bridge`，reload unpacked extension，执行 `abb doctor --json`、capability probe 和一条只读 Browser Tool。
   - 预期结果：Native Messaging、socket、Host capability admission 和 Browser Tools activation 均为 ready。

3. **Packaged Desktop**
   - 验证方式：在允许 `hdiutil`/codesign 的宿主运行 `pnpm package:desktop`，再启动 portable app 做 reload/quit/flush。
   - 预期结果：DMG/签名制品生成，退出等待 RuntimeHandle dispose 完成。

## Agent 已完成的验证

- `pnpm typecheck` 通过。
- `pnpm test` 通过；Desktop 78 files/522 tests，CLI 6 files/14 tests。
- `pnpm build` 通过；portable Electron app 构建完成。
- `pnpm package:agent-cli` 与 `pnpm test:agent-cli:package` 通过。
- `pnpm check:package-cutover -- --strict`、`pnpm check:v2-legacy-removal -- --strict`、`pnpm check:packages` 通过。
- `GOCACHE="$PWD/.tmp/go-cache" go test ./...`（CLI 与 protocol）通过。
- `GOCACHE="$PWD/.tmp/go-cache" pnpm check:browser`、`pnpm check:docs`、`pnpm check:repo`、`pnpm check:secrets`、`git diff --check`、`bash scripts/ci.sh` 通过。
- 应用迁移后 `pnpm check:site`、`pnpm test:site`（17 tests）、`pnpm build:site`（22 pages）和 `pnpm test:agent-cli:process`（2 tests）通过。

## 2026-08-26 收尾复核

- `pnpm install --frozen-lockfile --offline`、`pnpm run ci`、`pnpm typecheck`、`pnpm test`、`pnpm build` 再次通过；CLI TTY/SIGINT/exit-drain 测试通过。
- `pnpm package:agent-cli` 与 `pnpm test:agent-cli:package` 再次通过；当前产物位于 `apps/cli/dist`、`apps/desktop/dist`、`apps/desktop/dist-electron`，`dist/desktop-app/{dist,dist-electron}` 和 managed CLI `dist` 的旧 monolith/retired path 扫描均为 0 命中。
- `pnpm package:desktop` 已构建 portable `dist/desktop/Actspace.app`，仅在 `hdiutil create` 生成 DMG 时因宿主权限失败；没有生成 `release-manifest.json`，也没有把失败记为发布通过。
- Provider 环境变量配置数为 0，但 Desktop main-only `secrets.json` v2 实际已配置 DeepSeek 与 OpenRouter；只读正式网络探针在当前 Codex 沙箱内均返回 `network`，未输出凭据、响应正文或写回设置。`abb doctor --json` 显示 Native Messaging manifest 正常、local RPC socket offline。Chrome `Secure Preferences` 中 unpacked Extension 仍指向退役的 `plugins/browser-bridge/apps/chrome-extension`，真实 reload/权限和只读 Browser action 仍需用户验收。
- Clean checkout 首次 typecheck 暴露了 `dist/*.d.ts` 构建顺序问题；已将根 `typecheck:contracts` 改为 `pnpm --filter @actspace/runtime... build`。最终 clean checkout `70f3d85` 在无缓存状态下通过 frozen install、typecheck、test、build、managed CLI package/smoke、Browser/Go、CI、docs/repo/secrets/diff；产物旧路径扫描仍为 0。
- Desktop、CLI、Site 后续统一迁入 `apps/`；离线 frozen install、31 manifests、boundary/strict scan、全量 typecheck/test/build、Site、CLI package/process、Browser/Go 门禁再次通过。不含 `.git`、`node_modules`、`dist` 的隔离快照在只读复用 pnpm content-addressable store 后，也通过 frozen install、typecheck/test/build、Site、CLI process、Browser/Go。该迁移尚未创建 cutover commit。
- 最终完成审计首次捕获 Sidebar 排序测试的实时时间戳漂移：全量并发下后创建的 fixture 会被 `updatedAt` 排进前 8 条。改为明确的固定时间顺序后，目标用例连续 20 次、Desktop 522 tests、根全量 tests、build、Browser、CLI 和 Site 门禁均通过；产品代码和视觉未改动。
- 同一审计补齐插件包机械契约：6 个领域 package 新增直接 `activate()` / `dispose()` lifecycle test；`check:packages` 现在强制 `./plugin` package 的 manifest/plugin/lifecycle，以及 codec 文件与 export 一致性。负向 fixture 已证明缺少 lifecycle contract 时门禁失败。
- 恢复执行后重新检查真实宿主：Chrome `151.0.7922.174` 已运行，ChatGPT/Codex Chrome Extension 已安装且启用、Native Host manifest 正确，但 Browser Runtime 仍无法取得 Chrome binding；ActSpace ABB socket 仍 offline。Computer Use 仍未获准访问 portable Actspace，DeepSeek 域名仍无法解析，最小 DMG 探针仍返回“设备未配置”，codesign identity 和签名环境仍为 0。
- 默认文档阅读路径已改为 v2：Session 使用 `sessions-v2/<id>/journal.jsonl`，Context/Usage/Analysis 从 Journal Projection 派生，工具使用真实 Tool Runtime ABI，Subagent 使用 one-shot child Session。纯 v1 cache/Bash/approval 设计和失效 Team/Bash active 计划已归档；`pnpm test:current-docs` 以正向仓库和负向 fixture 守卫当前路径与 Markdown 链接。

## 已知风险和遗留事项

- `hdiutil` 在当前宿主返回“设备未配置”，DMG 尚未生成；有效 codesign identity 为 0，签名/公证环境变量配置数为 0，签名/公证未执行。
- Desktop 已配置 DeepSeek/OpenRouter 凭据，但当前 Codex 沙箱无法解析 DeepSeek 域名，真实 Provider 请求仍未通过；ABB Native Messaging manifest 正常但 socket offline。上一轮曾观察到 unpacked Extension 的迁移前路径，当前加载路径仍需在 Chrome 中 reload 后以真实 action 验证。
- Codex/ChatGPT Chrome Extension 当前已启用且 Native Host 正确，但控制通道仍未连接；按官方恢复流程需用户授权打开一个 Chrome 窗口后重试，仍失败时从 Codex 插件 UI 重装 Browser plugin。
- Computer Use 尚未获准访问 portable Actspace，且沙箱禁止 renderer dev server 绑定本地端口；Electron 固定页面、reload/quit/flush 仍需用户授权或人工验收。
- 未执行 commit/push；计划中的唯一 cutover commit 需要用户在人工门禁通过后完成。
