# pi-ai 1.5.0 与复用内置服务商 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261108-pi-ai-builtin-providers.md`
- **设计**：`docs/design-docs/agent-plugin-runtime/agent-llm-core-pi.md` §17
- **执行模式**：交互
- **执行结果**：代码与自动化完成；真实 Key 与 Electron 实机检查未做

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 依赖升级 | `packages/llm/llm-pi-ai/package.json`、`pnpm-lock.yaml` | pi-ai 1.5.0，openai 7.19.0，Anthropic SDK 0.129.0 |
| 用量补丁移植 | `patches/@earendil-works__pi-ai@1.5.0.patch` | 三种协议的原始 usage 仍附带 `actspaceWireUsage` |
| 内置服务商地址表 | `packages/llm/llm-pi-ai/src/builtin-providers.ts` | 34 个地址；按需导入单个 `providers/<id>` |
| 复用内置服务商 | `pi-ai-stream.ts` | 包装 Provider 转给内置实现；认识的模型取 pi-ai 的协议、地址、思考表、兼容开关，容量用我们的设置；去掉服务端换模型 |
| 思考参数 | `pi-ai-stream.ts`、`reasoning-options.ts` | 认识的内置模型交给 pi-ai；其余保留 ActSpace 规则；自动时去掉推断字段 |
| 代理 | `pi-ai-stream.ts`、`pi-ai-adapter.ts`、两个 Host | 请求级 `fetch`；代理不再进兼容 backend；失败仍归类 `proxy` |
| 回放身份 | `pi-ai-stream.ts` | 信封仍用 ActSpace 稳定 id；交给 pi-ai 的历史用内置服务商 id |
| 版本号 | 两个 Host、`PiAiAdapter` | `actspace.desktop-pi-ai.v3`、`actspace.cli-pi-ai.v3`、`pi-ai-1.5.0` |

## 自动化结果

- `@actspace/llm-pi-ai`：tsc 通过，146/146（新增 21 个内置服务商用例、2 个 backend 选择用例）。
- Desktop：`pnpm typecheck` 通过；`src/main` 616 通过 / 1 跳过。
- `@actspace/agent-host`：tsc 通过，64/64；`test:agent-host:process` 0 失败。
- `check:docs`、`check:packages`、`test:package-boundaries`、`test:current-docs` 通过。
- `pnpm install --frozen-lockfile --offline` 通过。

## 人工验证指引

### 必须验证

1. **各服务商发消息**
   - 验证方式：`pnpm dev`，分别用 DeepSeek、Kimi、Anthropic、OpenAI、OpenRouter、一个自定义中转，开思考、带一次工具调用发消息；再关思考发一次。
   - 预期结果：都能正常回复；思考开关生效；第二轮回复不报思考签名错误；用量胶囊有花费。
2. **代理**
   - 验证方式：在任一官方连接上开代理（如 `http://127.0.0.1:7897`）发消息；再把代理地址改成不存在的端口发一次。
   - 预期结果：开代理能回复；坏代理报「代理」类错误，不是普通网络错误。

### 建议验证

1. **OpenRouter 账单金额**：OpenRouter 连接发一条消息，花费仍显示服务商实际扣款。
2. **DeepSeek 图片**：DeepSeek 连接发一张图片，仍能识别。
3. **旧会话续聊**：打开升级前带思考的 Anthropic 会话继续发消息，不报签名错误。

## 已知限制

- 复用地址但 pi-ai 不认识的模型 id，思考参数仍按 ActSpace 规则；新模型要等 pi-ai 升级后才走 pi-ai 的档位表。
- 智谱通用 API、MiniMax OpenAI 接口、火山方舟不在 pi-ai 内置地址里，行为不变。
