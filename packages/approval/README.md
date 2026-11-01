---
description: "危险操作前先征求人的同意，或让模型自动判断低风险操作能否放行。"
kind: "package-group"
---

# approval

两个相互独立的包：`approval` 定义“向人请求批准”的端口（`ApprovalBroker`），`auto-review` 用模型判断低风险操作能否直接放行。谁决定“要不要问”由工具自己的权限评估和权限模式（`default` / `auto-review` / `full-access`）决定，不在这里。

## 包

| 包 | 角色 | 类别 | 默认 | 职责 |
| --- | --- | --- | --- | --- |
| `approval` | 接口 | 会话 | 开 | 审批端口：`ApprovalBroker.requestApproval(request, signal)` 的类型与插件入口；提供 `tools.approval`，需要 Host 能力 `approval` |
| `auto-review` | 实现 | 会话 | 开 | 自动审批：输入当前操作和有来源的上下文，输出 `{approved, reason}`；无工具、无执行权、无新持久事件；提供 `approval.auto-review` |

## 包之间怎么连

- `approval` 只提供 `tools.approval` 服务和 `ApprovalBroker` 接口类型；真正的审批界面由 Host 实现（桌面端是 `apps/desktop` 里的 `DesktopApprovalBroker`）。`tool-runtime`（在 [`core/`](../core/README.md)）inject `tools.approval`，工具权限评估要求询问时走审批。
- `auto-review` inject `llm.service` 和 `llm.auxiliary-requests`。会话插件 `agent-factory` 取 `approval.auto-review`，在 `auto-review` 模式下用它复核；超时（30 秒）、取消、复验和回退到人工由运行时负责。
- Host 通过 `auto-review` 这条 LLM 路由绑定已连接的模型；桌面端默认跟随当前会话模型。

## 入口与测试

- `approval/src/approval-port.ts`、`plugin.ts`；`auto-review/src/review.ts`、`prompt.ts`（固定策略）、`context.ts`。包 README 见 [auto-review](auto-review/README.md)。
- 测试在各包 `src/test/`：`pnpm --filter @actspace/approval test`、`pnpm --filter @actspace/auto-review test`。
- 权限规则见[权限模型](../../docs/design-docs/execution-safety/agent-tool-permission-model.md)。

## 怎么扩展

换审批方式（例如新的审批界面）：Host 提供另一个 `ApprovalBroker` 实现，包不用改。要调整自动审批的判断，改 `auto-review/src/prompt.ts` 里的固定策略。通用步骤见[总地图](../README.md)。
