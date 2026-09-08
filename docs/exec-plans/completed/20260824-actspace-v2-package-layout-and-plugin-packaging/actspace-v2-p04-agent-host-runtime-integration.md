# P04：Agent Loop、Subagent 与 Host Runtime 接入

状态：实现与自动化门禁已完成；Desktop/CLI Host 已迁入 `apps/` 并于 2026-08-26 复验，真实 Electron UI/IPC 人工验收仍随 P05 发布门禁进行中。

父计划：[ActSpace v2 包拆分与真实插件包化](README.md)

依赖：[P02](actspace-v2-p02-core-session-context-packages.md)、[P03](actspace-v2-p03-llm-tools-capability-packages.md)

## 目标

在独立 Core、Session、LLM、Tools 等真实插件包之上组装完整 Agent Loop、Subagent、薄 Runtime facade 和现有 Desktop/CLI Host。Host 继续使用统一 RuntimeHandle 语义；固定前端只消费 Projection DTO，不能加载后端插件或新增前端页面。

## 范围

包含：

- `packages/core/agent-loop/` 的 main Turn/Step orchestration；
- `packages/subagent/` 的 one-shot Subagent、Agent、Explore descriptor；
- `packages/runtime/` 的 RuntimeHandle facade、boot/dispose ownership 和 public exports；
- `packages/host/` 的 Desktop/CLI Host Adapter；
- `packages/client/` 和 `packages/shared/src/runtime-v2/` 的 IPC/Projection 接入；
- `apps/desktop/`、`apps/cli/` 的加载路径替换；
- Runtime diagnostics、shutdown、approval、resume、run/chat parity。

不包含：

- 前端页面、样式、布局和交互信息架构重设计；
- 新 Agent 产品形态、Workflow、continuable Subagent、StandingMount；
- Browser Bridge 底层 Go/Extension 迁移；
- v1 Session 数据导入。

## 必读

- `AGENTS.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-agent-and-subagent.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`

## 允许修改

- `packages/core/agent-loop/`
- `packages/subagent/`
- `packages/runtime/`
- `packages/host/`
- `packages/client/`
- `packages/shared/src/runtime-v2/`
- `apps/desktop/`、`apps/cli/` 的 Host 加载和 IPC 接入
- 对应 focused tests 和 managed ESM packaging scripts

禁止修改：

- `apps/desktop/src/renderer/` 的视觉页面、样式和布局；
- `packages/session/` 的 Journal schema；
- `packages/llm/`、`packages/tools/` 的内部实现；
- Browser Bridge Go/Extension 源码；
- 旧 Session 数据。

## 任务

1. 将 main Agent Loop 从 monolith 中抽出，使其只通过 Core、Session、Prompt、Context、LLM 和 Tool package exports 驱动 Turn/Step。
2. 保持模型顺序、tool dispatch 有界并行、checkpoint、Inbox、Todo、cancel、repair 和 compaction 语义；Loop 不拥有物理存储或 Host stdout。
3. 实现 one-shot Subagent package：child Session、parent lineage、restricted Scope、工具子集、结构化结果、级联取消和不可续跑边界。
4. 实现 RuntimeHandle facade：boot 后只发布完整组合，提供 run/resume/abort/flush/diagnostics/stop/dispose，不导出 Cordis Context、Fiber、Session writer 或 AgentLoop class。
5. Desktop Host 通过现有 main/preload IPC 接入新的 RuntimeHandle 和 Projection DTO；保留既有 renderer 页面、样式、布局和主题机制。
6. CLI run/chat 通过同一 RuntimeHandle 语义接入；run 默认 ephemeral，chat 默认 persistent；保持 TTY/EOF/SIGINT/approval/exit code 契约。
7. 为三种 Host 增加 runtime package parity tests，证明不存在第二套 Agent Loop、Session writer 或 plugin loader。
8. 为退出流程增加 awaitable quiescent shutdown：无论是否存在 Kairos，都必须等待 RuntimeHandle flush/dispose 后退出。

## 验证

```bash
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/subagent test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/host test
pnpm --filter @actspace/client test
pnpm typecheck
pnpm build
pnpm test
git diff --check
```

人工边界：按 `docs/FRONTEND_VERIFICATION.md` 验证真实 Electron IPC、renderer reload、审批、退出 drain、浅深主题和现有页面布局；不以重新设计页面替代接入验收。

## 失败与回退

- Host 需要直接持有 Cordis Context：停止接入，补充 Runtime facade，而不是扩大 Host API。
- Renderer 出现样式或布局变更：revert renderer diff，只保留 IPC/Projection adapter。
- CLI/desktop 行为分叉：以 RuntimeHandle 语义和 shared DTO 为准，禁止 Host 内部重新实现 Loop。
- shutdown 未等待 flush/dispose：不允许进入 P05 cutover。

## 完成标准

- Desktop、CLI run、CLI chat 都通过独立 Host Adapter 使用同一 RuntimeHandle contract；
- 前端页面截图和样式未发生设计性变化；
- Agent Loop、Subagent、Host、Runtime facade 都是独立 package boundary；
- managed ESM package 可从 packaged Desktop/CLI 加载，且 dependency tree 只有一份 Cordis family。
- Desktop 与 CLI 的物理入口分别为 `apps/desktop`、`apps/cli`；`packages/` 中不存在产品 Host 应用。

## 依赖与消费者

- 依赖：P02、P03。
- 消费者：P05。

## 执行记录

执行记录：`docs/exec-runs/actspace-v2-p04-agent-host-runtime-integration/`。
