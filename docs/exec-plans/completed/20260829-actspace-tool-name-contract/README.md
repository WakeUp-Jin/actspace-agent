# ActSpace Tool Name 全量切换执行计划

状态：已完成（2026-08-29；真实 Provider smoke 与两项旧 CLI Cordis 夹具迁移保留人工门禁）

确认日期：2026-08-29

执行模式：交互模式。用户审核设计与计划后，逐步执行；本计划不授权提交、发布、删除 Session 或修改 workspace 文件。

## 1. 目标

把 Agent 工具的模型可见身份从 namespaced `toolId` 全量切换为 DSH 风格的扁平 `name`。`read_file` 将从模型 schema 直接进入 Provider wire、Agent Loop、Tool Registry、Tool Runtime、Session 事件、Cordis hooks、通知和 projection；`pluginId` 独立保留为归属与 provenance，`registrationId` 独立保留为运行时 lease 身份。具体工具 executor 的实现逻辑和行为测试保持不变。

## 2. 设计真源

- [ActSpace Tool Name 与 Plugin Namespace 契约](../../../design-docs/agent-plugin-runtime/agent-spec-tool-name-contract.md)
- [Tool Runtime 内核与外壳边界](../../../design-docs/agent-plugin-runtime/agent-spec-tool-runtime-boundary.md)
- [ActSpace v2 Tool Runtime ABI](../../../design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md)
- [DSH 风格 Session 事件模型](../../../design-docs/agent-plugin-runtime/agent-spec-dsh-event-model.md)
- [Agent Loop Cordis 插入面与通知面](../../../design-docs/agent-plugin-runtime/agent-spec-agent-loop-cordis-surface.md)
- `tmp/deepseek-harness/packages/core/tools/src/index.ts`
- `tmp/deepseek-harness/packages/core/session/src/types.ts`
- `tmp/deepseek-harness/packages/llm/llm-deepseek/src/serialize.ts`
- `tmp/deepseek-harness/packages/llm/llm-deepseek/src/translate.ts`
- `tmp/deepseek-harness/docs/tool-catalog.md`

## 3. 范围

### 包含

- Tool Definition、Registry、prepared execution、executor context、result、approval 和 scheduler 的 Agent Tool identity；
- Core、Browser、Todo、Subagent 的 first-party registrations、manifest contribution、preset 和 tool filter；
- LLM Message / Stream、Agent Loop tool-call collection 和 provider adapter wire；
- Session `tool/call` / `tool/result` codec、replay、通知、diagnostics、live progress、artifact owner 和 Runtime projection；
- CLI run 的 `--json` 输出和真实 Provider tool-call smoke；
- 名称合法性、重复注册、scope visibility、直接 `read_file` lookup 和旧字段禁用的 contract tests；
- 相关当前设计文档、execution run 记录、history 和学习沉淀（实现完成后）。

### 不包含

- read/list/edit/write/bash/Browser Bridge 的 executor body、路径策略、协议和业务行为重写；
- Workspace Open Tool（外部编辑器打开文件）的独立 `WorkspaceOpenToolId`；
- CLI chat、Goal/Schedule producer、Session 旧格式迁移或双写；
- Provider SDK 更换、Tool Runtime 事件模型重新设计或 Cordis 9 个插入点重新定义；
- 插件市场、不可信代码隔离、签名发布和外部服务部署；
- 为了保留旧字段而新增 encoded name、wire alias 或 namespace mapping。

## 4. 组件数据流

```text
Provider schema / response
        │  name=read_file
        ▼
LLM Service + Agent Loop
        │  visible name / call name
        ▼
Tool Registry ─────── pluginId=actspace.core-tools
        │  registrationId=opaque lease only
        ▼
Tool Runtime shell
        │  policy / approval / hooks / journal adapter
        ▼
Existing executor kernel
        │
        ├── Session tool/call + tool/result { name, pluginId }
        ├── Cordis tools/* payload { name, pluginId }
        └── notification / projection / CLI JSONL { name, pluginId }
```

## 5. 实施切片

名称字段跨越超过 8 个 package、Host 和 projection 文件，不能按单个字段逐步发布；P01 是一次原子 API cutover。P00 和 P02 可独立合并，P01 必须在一个变更切片中完成全部编译依赖。

| 子计划 | 文件 | 交付重点 | 独立性 |
|---|---|---|---|
| P00 | [p00-contract-and-inventory.md](./p00-contract-and-inventory.md) | 固化 contract、生成受影响清单、准备失败保护和测试矩阵 | 可独立合并；不改变运行时行为 |
| P01 | [p01-atomic-runtime-cutover.md](./p01-atomic-runtime-cutover.md) | 全部 Agent Tool identity 与 Provider/Session/Loop 代码原子切换 | 一个原子实现切片；完成后系统可运行 |
| P02 | [p02-verification-and-handoff.md](./p02-verification-and-handoff.md) | 完整验证、旧引用清理、CLI smoke、history/learning 收口 | 可独立合并；P01 后的硬化与交付 |

## 6. 不可违反的实现边界

1. `name` 是唯一模型/runtime lookup key；不得恢复 `pluginId/name` 拼接。
2. `pluginId` 必须独立存在于 registration、permission、provenance 和 durable event 中。
3. `registrationId` 只用于 lease、drain 和诊断，不进入 Provider 或 Session 业务身份。
4. `toolId` 不能作为 Agent Tool 公共字段、codec fallback 或 provider adapter 输入。
5. `WorkspaceOpenToolId` 不是 Agent Tool identity，不做机械替换。
6. executor body、参数 schema、artifact、redaction、Browser Bridge 协议和行为测试默认冻结。
7. 新 Session 从空 Journal 开始；旧 Session 不 importer、不兼容、不双写。
8. 所有名称在 registration admission 阶段验证 `^[a-zA-Z0-9_-]+$`。

## 7. 依赖与外部条件

- 不新增 npm 依赖；实现使用现有 TypeScript、pnpm workspace 和测试工具。
- 本地 contract、typecheck、unit/integration tests 不需要 API key。
- 真实 DeepSeek CLI smoke 需要当前已有的 credential resolver / provider credential；不会把 key 写入文档、Session、日志或 stdout。
- 不依赖外部 MCP、浏览器登录态或第三方 CLI；Browser Bridge parity 只使用现有 fixture / mock，真实 Chrome 仍是独立发布门禁。

## 8. 验证总表

### P00 验证

- 设计文档和索引链接无断链；
- 生成当前 first-party 工具清单，确认 Core 14、Browser 11、Todo 2、Subagent 2 的迁移边界；
- contract fixture 覆盖合法 `read_file`、非法 namespaced 名称、重复 name、独立 pluginId 和 opaque registrationId；
- 明确 Workspace Open Tool 排除清单。

### P01 验证

- `pnpm --filter @actspace/tools-runtime test`；
- `pnpm --filter @actspace/core-agent-loop test`；
- `pnpm --filter @actspace/llm-service test`；
- `pnpm --filter @actspace/llm-pi-ai test`；
- `pnpm --filter @actspace/session-journal test`；
- 相关 package `typecheck`；
- OpenAI Chat / Responses / Anthropic / pi-ai wire contract：每条都断言 `name: "read_file"`，不出现 `/` 或 `.`；
- Agent Loop：Provider 返回 `read_file` 后直接 capture，不经过 mapping；
- Session：`tool/call` / `tool/result` 只接受 `name`，replay/resume/retry/abort 仍保留该名字；
- Tool parity：read/list/edit/write/bash/Browser Bridge 的既有行为测试保持通过。

### P02 验证

- `pnpm run typecheck`；
- `pnpm test` 或仓库当前等价的完整测试命令；
- `pnpm run check:docs`；
- `pnpm run check:current-docs`；
- `pnpm run check:package-cutover`；
- `rg` 检查生产代码不再把 Agent `toolId` 送入 `function.name`、Responses `name`、Anthropic `name`、Tool Registry 或 Session codec；
- 运行一次无工具和一次含 `read_file` 的 CLI `run --json`，确认 stdout JSONL 稳定、stderr 诊断独立、进程在 flush 后退出；
- 若凭据可用，再运行真实 `deepseek-chat` smoke，确认不再出现工具名 400；否则保留明确的人工验收命令，不伪造通过结果。

## 9. 风险与最小回退

| 风险 | 缓解 |
|---|---|
| 全量字段改名漏掉某个 package | P00 清单 + P01 编译失败驱动 + P02 `rg` / typecheck / full test |
| 插件之间出现扁平 name 冲突 | registration fail-fast，输出双方 pluginId、scope 和来源 |
| 误改 Workspace Open Tool | 明确排除 `WorkspaceOpenToolId`，按 import/domain 审核，不做全仓库替换 |
| 工具行为被身份迁移意外改变 | 冻结 executor body，运行逐工具 parity；失败只回退 shell/identity 适配 |
| Provider 仍有某条路径使用旧字段 | 四条 wire contract + CLI smoke；adapter 不允许自行 mapping |
| 旧 Session 无法读取 | 这是已确认的 v2 全量切换语义；不做 importer，回退只回滚代码，不改数据 |

回退动作：回滚本次代码变更切片，保留设计、计划和验证记录；不删除 Session、不改 workspace 文件、不提交凭据、不恢复隐式 mapping。

## 10. 计划状态

- [x] 2026-08-29：确认 DeepSeek 400 的根因是 namespaced Agent Tool name 进入 Provider wire。
- [x] 2026-08-29：核对 DSH 直接使用扁平 `name` 的 Registry、Session 和 DeepSeek serializer/translator。
- [x] 2026-08-29：完成设计规范与子计划草案。
- [x] 用户审核设计规范和执行计划。
- [x] P00 contract/inventory。
- [x] P01 atomic runtime cutover。
- [x] P02 verification/handoff（本地验证完成；真实 Provider smoke 推迟）。

## 11. 执行文档

实施开始时创建：

- `docs/exec-runs/20260829-actspace-tool-name-contract/execution-process.md`
- `docs/exec-runs/20260829-actspace-tool-name-contract/execution-summary.md`

## 12. 实际执行结果

- 代码切换与本地验证已完成；执行记录见 `docs/exec-runs/20260829-actspace-tool-name-contract/`。
- `pnpm run typecheck`、`pnpm test`（最终重跑后 522 Desktop tests 与 CLI 14 tests 均通过）、文档检查和 package cutover 检查通过。
- 真实 DeepSeek smoke 未执行：当前环境未提供 `DEEPSEEK_API_KEY`；请按执行摘要中的人工指引在有凭据环境运行。

本轮已完成设计规范、执行计划、运行时切换和本地验证；执行过程与摘要见 `docs/exec-runs/20260829-actspace-tool-name-contract/`。
