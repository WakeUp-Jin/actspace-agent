# P00：Workspace 与包契约地基

状态：已完成；`apps/{desktop,cli,site}` 应用边界于 2026-08-26 补齐并复验。

父计划：[ActSpace v2 包拆分与真实插件包化](./README.md)

## 目标

建立 DSH 风格的 workspace package 分组和公开边界，为后续每个真实插件包提供独立 package.json、exports、TypeScript 配置、测试入口和依赖图。P00 不实现 Agent 业务语义，也不删除旧入口；完成后旧产品仍通过现有入口运行，新的 package boundary 可以单独被检查。

## 范围

包含：

- 根 workspace 的 package discovery、命名规则和依赖约束；
- `packages/runtime`、`packages/cordis-adapter`、`packages/boot`、`packages/bundle`、`packages/composition`、`packages/diagnostics` 的 package skeleton；
- `core`、`session`、`llm`、`context`、`prompt`、`tools`、`subagent`、`compaction` 的 domain README 和 package manifest ledger；
- `@actspace/*` package exports、NodeNext/strict/ESM 边界和 CJS Host bridge 约束；
- package dependency graph、禁止 sibling `src/` deep import 的 lint/test；
- 为 P01-P04 固定 package id、plugin id、Entry id 和 source ownership 表。

不包含：

- 业务实现迁移；
- Cordis Loader activation；
- 前端页面、样式和布局修改；
- 旧目录删除或 Browser Bridge 重命名。

## 必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/PLANS_GUIDE.md`

## 允许修改

- `package.json`
- `pnpm-workspace.yaml`
- 根 TypeScript / lint / package graph 配置
- 新增的 `packages/*/package.json`、`packages/*/README.md`、公共 `tsconfig` 和 boundary tests
- 本子计划和对应 exec-run 文档

禁止修改：

- `apps/desktop/src/renderer/` 页面、样式和组件布局；
- `browser-bridge/` 的实现；
- Session 数据文件；
- 旧 Runtime 的业务源码。

## 任务

1. 把目标目录登记为 workspace domain groups，明确 group README 与 leaf package 的关系。
2. 为每个目标 leaf package 创建独立 `package.json`，声明 `type: module`、NodeNext exports、严格依赖和测试脚本。
3. 建立 package id → plugin id → Entry id 的 ledger，避免 package version、plugin identity 和 Cordis Entry identity 混用。
4. 为 `packages/runtime` 定义薄 facade 责任；禁止其重新吸收 Session、LLM、Tools 或 AgentLoop 实现。
5. 为根仓库增加 boundary check：禁止 package 通过相对路径读取其他 package 的 `src/`，禁止 `@deepseek-ai/*/src/*` deep import，禁止通用 `packages/plugins/` 新入口。
6. 生成静态依赖图并检查是否存在 cycle；发现 cycle 时调整契约方向，不通过 barrel export 隐藏 cycle。

## 验证

```bash
pnpm install --frozen-lockfile
pnpm check:docs
pnpm check:repo
pnpm typecheck
pnpm test -- --runInBand
git diff --check
```

预期：workspace 能解析新增 package manifest；boundary check 能定位 deep import 和跨包 `src/` 引用；旧应用入口仍可构建。

## 失败与回退

- 如果 workspace package 解析失败，只回退 P00 的 manifest/config 变更，不删除旧 `packages/agent-runtime`。
- 如果依赖图产生 cycle，停止后续包迁移，先修正公共契约方向。
- 如果 frozen install 需要未批准的依赖版本，停止并记录到 P01/P02 的外部依赖门禁，不使用临时版本绕过。

## 完成标准

- 目标 package map 与设计规范一致；
- 每个目标 package 有独立 manifest、exports 和 owner；
- boundary tests 能阻止 monolith 回流、deep import 和通用 plugins 入口；
- P01-P04 可以按 ledger 直接选择文件所有权，无需重新决定目录。

## 依赖与消费者

- 依赖：无。
- 消费者：P01、P02、P03、P04。

## 执行记录

已完成：`docs/exec-runs/actspace-v2-p00-workspace-and-package-contracts/`。

## 2026-08-26 应用边界收口

- workspace discovery 增加 `apps/*`，Desktop、CLI、Site 从 `packages/` 迁入 `apps/`，package identity 和 exports 不变。
- package boundary verifier 同时扫描 `apps/` 与 `packages/`，要求应用保持 private，并拒绝可复用 package 反向依赖应用。
- TypeScript、Vite、Vitest、CI/CD、managed packaging、Astro prerender 和路径 fixture 已改用新目录；历史 history、completed/discarded plan 与 v1 legacy 保留原路径事实。
