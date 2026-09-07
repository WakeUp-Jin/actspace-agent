# P05：Browser Bridge、唯一切换与全量验证

状态：实现阶段已交付，发布门禁进行中；真实 Provider、Chrome Extension、签名/公证及 Desktop DMG 仍需人工/宿主环境验收（2026-08-26）。

父计划：[ActSpace v2 包拆分与真实插件包化](./README.md)

依赖：[P04 Agent Loop、Subagent 与 Host Runtime 接入](./actspace-v2-p04-agent-host-runtime-integration.md)

## 目标

完成从旧单包 Runtime 到 DSH 风格真实插件包结构的一次产品切换：收口 Browser Bridge 顶层能力目录，确认所有工具通过 Browser Tools Adapter 接入，退役旧 monolith、通用 plugins 入口、Kairos、fs-watch 和 `/eval` 可达路径，并在 clean checkout、managed CLI、packaged Desktop 和真实 Browser Bridge 上完成门禁。

## 范围

包含：

- `browser-bridge/` 到顶层 `browser-bridge/` 的结构迁移和文档同步；
- `apps/{desktop,cli,site}` 与 `packages/` 的最终产品入口/可复用 package 边界收口；
- Browser Bridge Go/Chrome Extension 独立构建和 Host capability 验证；
- 旧 `packages/agent-runtime/src/*` 单包入口和 monolith deep import 扫描、删除或不可达证明；
- 通用 `plugins/` 目录入口退役；
- Kairos、fs-watch、`/eval` 旧入口和配置字段的最终退役；
- workspace package graph、lockfile、production build、packaging、SBOM/notice 和 secrets 检查；
- v2 Session root、迁移参考数据和“不加载旧格式”检查；
- 一次 cutover commit、回滚点和 exec-run 完成记录。

不包含：

- 自动删除用户旧 Session；
- 前端页面视觉重设计；
- 插件市场、签名、自动更新、不可信代码隔离；
- 真实外部副作用的自动回滚承诺。

## 必读

- `AGENTS.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md`
- `docs/design-docs/agent-plugin-runtime/README.md`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-15-cutover-and-legacy-retirement.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/browser/agent-browser-use-index.md`

## 允许修改

- `browser-bridge/` 及其构建/协议文档；
- 旧 `packages/agent-runtime/` 入口和删除后的引用；
- `plugins/` 旧入口、Kairos、fs-watch、`/eval` 的代码/配置/脚本；
- 根 workspace、build、package、SBOM、notice 和 docs 导航；
- 新增 history 和本计划对应 exec-run 文档。

禁止修改：

- 用户旧 Session 参考数据的内容；
- 前端样式和布局；
- 任何未通过 P04 的领域实现。

## 任务

1. 在 dry-run 中列出所有旧单包入口、`src/` deep import、通用 `plugins/` 引用、Kairos/fs-watch/`/eval` 入口和制品路径。
2. 将 Browser Bridge 移到顶层 `browser-bridge/`，更新 workspace 排除、构建、协议、Host capability 和 docs 引用；保证 Go/Extension 可独立构建。
3. 删除或封闭旧 `@actspace/agent-runtime` monolith 的内部 exports，确保 Host 只能进入新 package facade 和公开 domain exports。
4. 确认所有 concrete tool package 都有 manifest、stable plugin/contribution id、activation/dispose test 和 Browser capability admission。
5. 运行 Session root 检查：新数据只写 `sessions-v2/<id>/journal.jsonl`；保留的一份旧数据只作为迁移参考，不触发加载或导入。
6. 在 clean checkout 执行自动化、managed CLI、packaged Desktop、真实 Provider、真实 Browser Bridge、TTY 和退出 drain 验收。
7. 只有所有门禁通过后创建唯一 cutover commit；在 history 中记录结构迁移、设计原因、保留的旧参考数据和回滚边界。
8. 收敛默认文档真相：根 README、架构/安全/可靠性、Session/Context/Analysis/Tool/Subagent 设计必须描述 v2；纯 v1 设计和基于 v1 的 active 计划转入历史层，并由机械检查阻止旧路径重新进入当前阅读区。

## 验证

```bash
pnpm install --frozen-lockfile
pnpm run ci
pnpm typecheck
pnpm test
pnpm build
pnpm package:desktop
pnpm package:agent-cli
pnpm check:browser
pnpm check:docs
pnpm test:current-docs
pnpm check:repo
pnpm check:secrets
git diff --check
```

源码与制品扫描必须证明：旧 monolith、通用 plugins 入口、Kairos、fs-watch、`/eval` 和 v1 Agent Core 不可达；前端页面布局和样式与重构前保持一致。

## 失败与回退

- Browser Bridge 构建或真实协议失败：只回退 Browser Bridge 迁移和 Browser Tools activation，不回退已验证的 Core/Session/LLM package。
- clean checkout 或 packaged smoke 失败：不创建 cutover commit，保留旧入口和 v2 Session 数据，修复后重跑。
- legacy scan 发现可达旧入口：停止切换，恢复旧入口可运行状态，不通过删除数据掩盖问题。
- 用户人工验收发现前端视觉变化：只回退 renderer 视觉 diff，保留 Host/IPC package migration。

## 完成标准

- Browser Bridge 顶层目录、构建和 Host capability 边界稳定；
- 所有领域核心和能力包是真实 workspace Plugin package；
- 旧单包、通用 plugins、Kairos、fs-watch、`/eval` 和 v1 engine 不在源码或制品可达图中；
- clean checkout、managed CLI、packaged Desktop、真实 Provider 和 Browser Bridge 门禁通过；
- 用户完成固定前端页面、Desktop、CLI、Provider 和 Browser 的人工验收；
- history、execution-process、execution-summary 和设计文档互相一致。
- 当前文档真相区不存在单包 Runtime、v1 Session sidecar 或已丢弃 active 计划的可执行声明；`check:docs` 同时验证当前路径与相对链接。

## 依赖与消费者

- 依赖：P04。
- 消费者：发布和后续插件开发；本计划完成后移动到 `docs/exec-plans/completed/`。

## 执行记录

执行记录：[`execution-process.md`](../../../exec-runs/actspace-v2-p05-browser-bridge-cutover-and-verification/execution-process.md) 与 [`execution-summary.md`](../../../exec-runs/actspace-v2-p05-browser-bridge-cutover-and-verification/execution-summary.md)。
