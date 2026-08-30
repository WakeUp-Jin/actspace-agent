# P03 执行过程

日期：2026-08-25

## 实施内容

- 将旧 `src/llm/` 迁移为 `@actspace/llm-service` 与 `@actspace/llm-pi-ai` 两个独立包。Service 包拥有 ActSpace Message/Stream/Failure/Usage/PreparedLlmCall/route lease 公共 ABI；pi-ai 与 legacy proxy 只在 provider 包内实现。
- 将旧 `src/tools/` 迁移为 `@actspace/tools-runtime`，把 approval port 提炼为 `@actspace/tools-approval`。
- 将 core tools 和 Browser tools 的 definition、policy、executor、Node capability、generated command registry、redaction 和 parity tests 迁移到独立包。
- Browser Tools manifest 声明 `browser` Host capability；不可用 Bridge 时返回结构化 `BROWSER_UNAVAILABLE`，不绕过 Tool Runtime。
- Tool Runtime 仍保持 prepare → policy/approval → checkpoint → body → ordered commit 顺序，Session 只由 Agent Loop 的 journal port 写 durable event。

## 验证命令

```text
pnpm --filter @actspace/llm-service test
pnpm --filter @actspace/llm-pi-ai test
pnpm --filter @actspace/tools-approval test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/tools-core-tools test
pnpm --filter @actspace/tools-browser-tools test
pnpm check:packages
pnpm typecheck
```

## 兼容边界

- `@actspace/llm-pi-ai` 没有把 pi-ai 类型重新导出到 Host、Session、Projection；Host 只看 `@actspace/llm-service` contract。
- `@actspace/tools-runtime` 只消费 `@actspace/tools-approval` 的 ApprovalBroker interface；具体工具不反向读取 Session 或 renderer DTO。
- Browser Bridge Go/Extension 实现尚未在 P03 改动，P05 负责顶层 `browser-bridge/` cutover 和全量 Browser gate。
