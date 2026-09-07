# P04 执行过程

日期：2026-08-25

## 实施内容

- 将 one-shot Subagent、child Session、parent lineage、restricted preset、terminal publication 和 repair 迁移到 `@actspace/subagent`，并通过新 package exports 使用 Core/Session/LLM/Tools contract。
- 将 `RuntimeHandle` 收敛为薄 facade：只有 run、resume、list/get session、abort、flush、diagnostics、stop/dispose 和 boot manifest/state；不导出 Cordis Context、Fiber、Session writer 或 AgentLoop class。
- 将 Desktop/CLI 共用的 Host Runtime boundary 放入 `@actspace/host`，固定 renderer 只消费 `@actspace/client` 的 shared Projection DTO。
- 新增 quiescent stop 测试，确保 flush 后再 dispose；没有修改 renderer 页面、样式、布局或主题。
- 将三个产品 Host/部署入口收口到 `apps/desktop`、`apps/cli`、`apps/site`；package identity、Runtime facade、IPC/Projection 契约和现有页面行为保持不变。

## 验证命令

```text
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/subagent test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/host test
pnpm --filter @actspace/client test
pnpm typecheck
pnpm check:packages
pnpm build
pnpm test
pnpm check:site
pnpm build:site
pnpm test:agent-cli:process
```

## 人工验收边界

真实 Electron IPC、renderer reload、审批、退出 drain、浅/深主题和页面布局仍属于 `docs/FRONTEND_VERIFICATION.md` 规定的用户侧 acceptance gate。本轮没有把这些人工 gate 伪装成自动通过。
