# ActSpace v2 P15：一次切换与旧能力退役 - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-15-cutover-and-legacy-retirement.md`
- **当前状态**：源码交付完成；真实 Provider、Chrome 扩展与签名发布保留为人工验收边界
- **检查时间**：2026-08-23

## 已满足的前置证据

- `v1-final` tag 可解析。
- P00、P04、P06、P07、P08、P10、P11 的本地实现和自动化合同已通过；P01/P02/P03 已通过 DSH published-build 的 public API/lifecycle smoke。
- Agent Runtime 当前 36 个测试文件中 153 个测试通过，6 个真实 published-package smoke 由环境变量显式开启并已通过。
- CLI/Desktop v2 isolation typecheck、repo scripts、docs、repo hygiene、secrets、v2 legacy static scan 和 diff check 通过。
- CLI 全量 v2 测试 6 个文件、14 个测试通过，另有 2 个真实进程 SIGINT smoke；shared v2 契约测试通过。
- RuntimeHandle、TrustedBootCandidate、CLI/Desktop resource disposer 的失败清理可重试语义已通过回归测试。
- CLI `run` / `chat` 已删除 v1 分支和候选环境变量，直接使用 v2。
- CLI direct smoke 已通过：mock persistent run 创建 `sessions-v2/<id>/journal.jsonl`，resume 保持同一 Session ID 并继续追加事件；ephemeral run 不创建持久 Session。
- Desktop main/preload/renderer 根入口已改为 v2-only，固定 renderer 在 Boot 失败时显示诊断，不再回退旧 Agent engine；Main-only credential/provider/OpenRouter catalog/model/prompt/appearance/Quick Open 设置已接通；Desktop 10 个测试文件、32 个测试、typecheck 与 production/root build 通过。
- Desktop settings 磁盘格式 v3 迁移、v2 原文备份/SHA-256、Provider credential IPC、Session-owned attachment/artifact 和 allowlisted specialized renderer 已完成自动化验证。
- Workspace 文件浏览与 Git Review 已通过 `runtime-v2:shell:*` 回到固定桌面壳；Terminal main/preload 契约已接回并在 `node-pty` 缺失时 fail-closed。xterm renderer 和 native/package smoke 仍未通过。
- CLI 真实 PTY chat、approval、EOF、跨进程 writer conflict、首次/二次 SIGINT 及 Desktop/CLI Host DTO parity 已通过；managed artifact 仍未在独立安装目录验证。
- Desktop managed build/CI 已移除 SEA workflow 和 `postject` 根依赖；旧 SEA 脚本已删除。
- Kairos/fs-watch 的 Desktop main、renderer 页面、组件、状态、共享设置字段、旧 Session/IPC 事件和站点产品入口已删除；旧 Browser Bridge 仍作为 Host capability 保留。
- `sessions-v2/` 已成为 Desktop roots 的唯一 Session root，旧 sessions 不读取。
- P15 本地 failure matrix 已覆盖 short write、append fsync、torn tail、unknown codec、checkpoint failure、三路 LLM truncate、proxy disconnect、tool unload race、Subagent parent crash、FAILED/PENDING Fiber、LLM/Tool lease timeout 和 Runtime disposer timeout。

## 未满足的 no-return gate

1. 通过用户批准的 `127.0.0.1:7897` 代理执行 `pnpm install --ignore-scripts`，Cordis/pi-ai 与 Desktop 依赖恢复；lockfile、real published-package smoke 和 packaged/managed 构建均已验证。
2. 根 `pnpm build`、`pnpm typecheck`、`pnpm test`、Desktop typecheck/test/build、CLI package smoke 和 real development Electron launch 均已通过。
3. Browser Bridge CLI/protocol Go 测试、TTY/EOF/SIGINT 和跨进程 writer conflict 已通过；`abb doctor --json` 的 Native Messaging manifest 正常。真实 Chrome Extension 连接和真实 Provider 调用仍由用户手动验收，本轮未自动触发。
4. Git 跟踪的 `packages/agent-core`、fs-watch、Kairos 与 `/eval` 入口均已退役；前端固定布局未改动，设置页仅将 Host Plugin 的用户可见名称改为“扩展”。

## 本次执行命令与结果

| 命令 | 结果 |
|---|---|
| `ACTSPACE_REAL_CORDIS=1 ACTSPACE_REAL_PI_AI=1 ... vitest run` | 6/6 passed；含 PENDING→ACTIVE、patch、relative/file/bare import、last-good 与 tree rollback |
| `... vitest run`（`packages/agent-runtime`） | 36 files，153 passed，6 skipped by default |
| `... vitest run`（`packages/agent-cli`） | 6 files，14 passed |
| `pnpm test:agent-cli:process` | 2 passed；首次 SIGINT 结构化 abort，第二次 SIGINT 强制退出 130 |
| `... vitest run`（`packages/shared/src/runtime-v2/test`） | passed |
| `pnpm --filter @actspace/desktop test` | 10 files，32 passed；含 settings migration、attachment、approval、OpenRouter catalog、provider network、generic/specialized renderer、fixed shell 和侧栏 resize |
| `pnpm --filter @actspace/desktop typecheck` | passed |
| `pnpm --filter @actspace/desktop build` | passed；production renderer/electron build |
| `pnpm build` | passed；按 shared -> agent-runtime -> CLI/Desktop 顺序完成 |
| `GOCACHE=/private/tmp/abb-go-cache go -C ... test ./...`（Browser Bridge CLI 与 protocol 两个 module） | passed |
| `pnpm check:browser` | passed；静态 registry、locator、cursor 与 extension primitive contract |
| `./browser-bridge/skill/scripts/abb doctor --json` | Native Messaging host `ok`；local RPC socket `offline`，需在 Chrome reload unpacked extension 并接受 history/debugger 权限 |
| CLI mock persistent run + `--resume` | passed；同一 Session ID，Journal 追加事件 |
| `pnpm check:docs` | passed |
| `pnpm check:repo` | passed |
| `pnpm check:secrets` | passed |
| `node scripts/check-v2-legacy-removal.mjs --strict` | passed（切换后的生产入口与 v2 目录） |
| `git diff --check` | passed |
| Runtime fault injection（Session / LLM / Tool / Subagent / Boot / shutdown） | passed；child crash resume 幂等、截断流不发布 done、lease timeout 可恢复且无残留 deadline timer |
| `pnpm install --ignore-scripts` via user-approved proxy | passed |
| `pnpm typecheck` | passed |
| `pnpm run test` | passed |
| packaged Desktop / managed CLI build and smoke | passed；制品未签名/未公证 |

## 回退边界

- Desktop 和 CLI 正式源码入口已是 v2-only；制品已生成，但未签名/未公证，不宣告正式发布。
- v2 使用独立 `sessions-v2/`，保留一个不加载的 `legacy-session-reference/` 供迁移参考，其他旧 Session 已移入用户 Trash。
- Git 跟踪的 Agent Core、fs-watch、Kairos 和 `/eval` 入口已退役；前端布局和样式没有改动。

## 解阻条件

发布前仍需用户完成真实 Provider、Chrome Extension 和签名/公证验收；本轮不自动发起付费模型请求，也不执行发布或提交。
