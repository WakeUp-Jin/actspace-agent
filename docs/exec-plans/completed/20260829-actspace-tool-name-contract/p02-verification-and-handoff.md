# P02：验证、旧引用清理与交付收口

状态：已完成（真实 Provider smoke 待 credential/网络条件）

## 目标

证明 P01 后所有模型可见工具名合法且跨层一致，确认没有遗留的 Agent `toolId` wire 路径，并把 CLI run、文档、history 和学习沉淀收口。P02 不新增运行时语义，可独立合并到已完成的 P01。

## 自动验证

1. 运行工具、Agent Loop、LLM、Session、Runtime projection 和 CLI 相关 package tests。
2. 运行相关 package typecheck，再运行 `pnpm run typecheck`。
3. 运行 `pnpm run check:docs`、`pnpm run check:current-docs` 和 `pnpm run check:package-cutover`。
4. 用 AST/文本双重检查生产代码：OpenAI `function.name`、Responses `name`、Anthropic `name`、pi-ai `tools[].name` 均来自 `LlmToolDefinition.name`；Registry、Session codec 和 projection 不再接受 Agent `toolId`。
5. 扫描 first-party manifests，确认所有模型可见名字符合 regex 且无重复。

## CLI 验收

本地 mock：

```bash
node apps/cli/dist/cli.js run \
  --input "请读取 README.md 并简要说明" \
  --json \
  --workspace /tmp
```

检查：

- stdout 只有稳定 JSONL 结果；
- stderr 只包含诊断/approval 文本；
- tool call 使用 `name: "read_file"`；
- Session `tool/call` 与 `tool/result` 可 replay；
- 进程等待 tool/handler settlement、flush 后退出。

真实 Provider smoke（已有 credential 时执行）：

```bash
node apps/cli/dist/cli.js run \
  --input "请简单回答 OK" \
  --model deepseek-chat \
  --json \
  --workspace /tmp
```

必须确认不再出现 `Invalid 'tools[0].function.name'`。没有 credential 时记录为人工门禁未执行，不把 mock 结果冒充真实 Provider 通过。

## 文档与学习收口

- 更新 `docs/design-docs/agent-plugin-runtime/README.md`、`docs/design-docs/index.md` 和 `docs/exec-plans/README.md` 的入口；
- 按 `docs/HISTORY_GUIDE.md` 记录本次身份契约切换和未覆盖的人工 Provider 门禁；
- 若本轮命中新概念、可迁移模式或反直觉陷阱，按 `docs/learnings/WRITING_GUIDE.md` 写入学习文档；
- 已创建并填写 `docs/exec-runs/20260829-actspace-tool-name-contract/` 的 execution-process 与 execution-summary。

## 交付门

- 自动测试、typecheck、文档检查和旧引用扫描通过；
- 工具行为 parity 无回归；
- CLI mock smoke 通过；
- 真实 DeepSeek smoke 的执行状态、凭据前提和剩余人工门禁明确记录；
- 没有提交、发布或删除动作，除非另行获得授权。
