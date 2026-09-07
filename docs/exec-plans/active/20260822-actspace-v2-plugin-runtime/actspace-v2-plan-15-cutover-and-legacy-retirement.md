# P15：一次产品切换、旧后端退役与完整验收

状态：被 P00-P14 阻塞

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P13、P14，以及 P00-P14 全部验收完成

消费方：ActSpace v2 产品交付

Exec-run slug：`actspace-v2-plan-15-cutover-and-legacy-retirement`

## 1. 目标

在 no-return gate 全部通过后，把 v2 Runtime 改为 Desktop、CLI run 和 CLI chat 的唯一默认入口；删除候选选择分支、旧 `@actspace/agent-core`、旧 Session / Context / Tool / Loop、Kairos、fs-watch 与 SEA；完成配置收口、制品验收、文档事实切换和发布前回滚准备。

这是唯一允许宣告 ActSpace v2 完成的工作包。不能以 feature flag、双写、runtime fallback 或继续打包 v1 engine 的方式降低切换风险。

## 2. 切换前 hard gate

必须同时有证据：

1. P00-P14 状态均为完成，对应 exec-run 记录命令、fixture、失败注入和人工验收。
2. Cordis 五包与 pi-ai exact versions、registry install、exports、integrity 和 production dependency tree 已签收。
3. Session 17 个 golden cases、全部保留工具 parity、Host parity 和 shutdown quiescence 通过。
4. Desktop packaged candidate 完成真实 Provider、真实 Chrome/Extension/Go bridge、approval、Inbox、Todo、Agent/Explore、Compaction、repair 和浅深主题验收。
5. managed CLI artifact 完成 run/chat、TTY、signal、writer conflict 和安装目录 smoke。
6. `v1-final` tag 可解析，已知良好 v1 制品或可重复构建证据存在。
7. 当前工作区无尚未归属的 v2 冲突；用户改动没有被覆盖。
8. 用户明确批准执行 P15。计划获批不等于自动批准删除用户数据；本计划默认不删数据。

任一项缺失时 P15 保持 blocked，不做部分切换。

## 3. 删除与替换清单

### 3.1 Backend

- 删除 `packages/agent-core/` 和根 tsconfig / package scripts / workspace references 中的 `@actspace/agent-core`。
- Desktop/CLI 正式依赖改为 `@actspace/agent-runtime` 与 `@actspace/shared` runtime-v2 DTO。
- 删除旧 `SessionEvent` bridge、`session.jsonl` / `meta.json` / `context-state.json` writer、ContextManager、ToolManager / ToolScheduler、旧 LLM factory / provider implementations 和第二套 Agent Loop。
- 删除 `ACTSPACE_INTERNAL_RUNTIME_CANDIDATE` 读取、candidate branch 和 v1 fallback。

### 3.2 Kairos

- 删除 Agent Core Kairos runtime、Desktop `kairos-*` main/IPC/bootstrap、renderer page/components/state/tests、Shared contracts/aggregator/soul presets、settings / model purpose / usage 分支。
- 删除 Kairos product navigation、settings control、site copy 和 active architecture references。
- Git history 和本次 disposition history 足以追溯；旧设计文档从当前导航移除并移动到 `docs/references/legacy-v1/`，不继续作为现行规范。

### 3.3 fs-watch

- 删除 `plugins/fs-watch/` Rust crate、Skill、build assets。
- 删除 Desktop `fs-watch-service`、IPC/preload/settings UI/state/tests 和 Shared plugin/settings contracts。
- 删除 install/autostart/retry/config/root picker、Kairos linkage、package/release assets和当前导航。
- 不删除用户机器上已经安装的二进制或 watch data；另行清理需新的破坏性计划。

### 3.4 CLI SEA

- 删除 `scripts/build-agent-cli-binary.mjs`、`scripts/test-agent-cli-binary.mjs`、`scripts/agent-cli-binary-targets.json` 与 SEA runtime-assets 路径。
- 用 P14 managed packaging scripts 和 workflow 替换 `.github/workflows/agent-cli-binaries.yml`。
- 根 scripts 只保留 `package:agent-cli` / `test:agent-cli-package`，README/发布文档不再承诺单文件 binary。

## 4. 配置与数据

- settings schema 原子升级到 v3：保留 provider credentials refs、models、workspace、appearance、Skills、Browser 和其他仍存在的产品设置；移除 Kairos、fs-watch、旧 Runtime selector 和 SEA fields。
- 写入 v3 前完整 parse v2，创建 `settings.v2.backup.json` 与 SHA-256 digest；任一步失败不覆盖原设置并阻止启动。
- `secrets.json` 不复制、不重加密、不打印；只验证现有 credential refs 可解析。
- v2 使用 `<dataRoot>/sessions-v2/` 和 `<dataRoot>/runtime-v2/`；旧 `<dataRoot>/sessions/`、Kairos data、fs-watch binary/config 停止读取但保留原位。
- 更新 reset script，使默认只处理 v2 test/session data；任何 `--include-v1` 模式必须 dry-run 后要求交互确认，且不在自动发布流程调用。

## 5. 产品切换

### 15.1 默认入口

- Desktop app ready 始终 boot v2 RuntimeHandle；Boot failure 显示诊断并拒绝进入工作台，不回退 v1。
- CLI run/chat 始终加载 v2；run 保持默认 ephemeral，chat persistent。
- build/dev/package/clean/typecheck/test 顺序改为 shared -> agent-runtime -> CLI/Desktop。

### 15.2 旧符号机械扫描

- 新增 `scripts/check-v2-legacy-removal.mjs`，扫描源码、package graph、构建产物和 docs current navigation。
- forbidden set 至少包含 `@actspace/agent-core`、`ContextManager`、旧 ToolManager/ToolScheduler、`session.jsonl`、`context-state.json`、Kairos runtime / IPC、fs-watch IPC / binary、SEA blob / postject 和 candidate flag。
- 对历史归档和研究引用使用显式 allowlist；生产源码和制品零命中。

### 15.3 现有 active plan 收口

- 把依赖旧 Agent Team runtime 的 `docs/exec-plans/active/20260711-agent-team/` 移到 `discarded/`，注明 Team 不在 v2 范围，未来需基于 v2 重新设计。
- 把旧 Bash session allowlist 计划移到 `discarded/`，注明旧 ToolScheduler 方案被 v2 Tool ABI 取代；未来需求另立 plan。
- 仅剩人工验收的 active plans 按 `PLANS_GUIDE` 移到 completed，并保留尚未验证边界；不借本计划实现其额外功能。

## 6. 完整自动化与真实验收

### 6.1 Clean checkout

```bash
pnpm install --frozen-lockfile
pnpm run ci
pnpm typecheck
pnpm test
pnpm build
pnpm check:browser
pnpm package:desktop
pnpm package:agent-cli
pnpm check:docs
pnpm check:repo
pnpm check:secrets
git diff --check
```

还要检查生产 dependency tree 只有一份 Cordis family，package exports 无 deep import，Desktop/CLI 制品不包含 forbidden set，license / SBOM / provenance 完整。

### 6.2 Desktop

- 用隔离 userData 安装 packaged `.app`，首次 Boot 与 Startup Validation 正常。
- 完成 text、审批写工具、Browser、Agent、Explore、Todo、Skill、Compaction。
- active turn 提交 next-step，terminal 后提交 next-turn；重启后 Inbox 不重复 claim。
- renderer reload 做 snapshot/cursor resync；active approval/tool 时退出，重启后保守 repair。
- 修改插件 config 只显示 restartRequired，完整重启后生效。
- 检查 `journal.jsonl` Header、连续 seq、LF、无 BOM、无 secret、无旧 sidecar truth。
- 浅色、深色和跟随系统均可读；专用 renderer failure 回退 generic。

### 6.3 CLI

- managed artifact 在解包目录运行，不依赖 workspace。
- run 默认不产生 Session；`--persist` 和 `--resume` 正确落盘。
- text/JSON/JSONL、stderr diagnostics、non-TTY approval、SIGINT 130 正确。
- chat `/new` / `/resume`、TTY approval、EOF/SIGINT、跨进程 writer conflict 正确。

### 6.4 Plugins / failure injection

- 加载 built-in、显式 local path、managed exact npm package；invalid manifest、duplicate id、Host ceiling、required/optional frontend 和 restart-only 行为正确。
- 注入 short write/fsync/torn tail、unknown codec、checkpoint failure、LLM truncate/proxy disconnect、tool unload race、subagent parent crash、disposer timeout。
- 所有 timer/watcher/subprocess/socket/fd/lease 在 graceful shutdown 后静止；超时必须显示 blocker。

## 7. 回滚

- 发布前：revert P15 cutover commit，重新构建 v1；`sessions-v2/` 保留不动。
- v2 已安装但尚无外部副作用：安装 v1-final 制品并恢复 settings v2 backup；v1 不读取 v2 Journal。
- v2 已运行但仅产生 Session：保留 v2 Journal供以后 browse/export，回退 v1；不做格式降级。
- v2 已执行文件/网络/Browser 副作用：只回退代码和 Runtime，人工核对外部变化；不承诺 exactly-once 或自动撤销。
- 用户数据从不由本计划自动删除，因此代码回滚不依赖数据恢复。

## 8. 文档、history 与归档

- 把 v2 target docs 状态改为已落地，并更新 `docs/ARCHITECTURE.md`、`agent-current-module-map.md`、storage / observability、CLI、tool、Browser、frontend 和 security 文档。
- 更新 `docs/QUALITY_SCORE.md`、release notes、最终 history；按 `docs/learnings/WRITING_GUIDE.md` 生成 Cordis lifecycle / append-only Session / one-cutover rollback 的学习文档。
- 完成后把整个本计划目录移动到 `docs/exec-plans/completed/`，同步 `docs/exec-plans/README.md`。
- exec summary 明确记录所有未完成的真实验收；只要 hard gate 未完成，状态不得写“完成”。

## 9. 完成标准

- 源码、依赖、制品和用户入口只有 v2 Runtime。
- 完整范围与真实验收通过，不依赖 v1 fallback。
- 旧数据保留但不再读取；没有未经确认的数据删除。
- 文档从“目标设计”切换为“当前实现事实”，计划和 exec-run 生命周期正确归档。

