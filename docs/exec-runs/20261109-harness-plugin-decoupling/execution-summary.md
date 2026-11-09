# 后端插件包解耦 P1 / P2 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261109-harness-plugin-decoupling.md`
- **执行过程**：`docs/exec-runs/20261109-harness-plugin-decoupling/execution-process.md`
- **执行模式**：夜间（云端 Agent 自主执行）
- **执行结果**：P1、P2 完成；P3–P4 留在计划里待后续轮次

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `ToolDefinition` 新增必填 `modes` | `packages/core/tool-runtime/src/definition.ts` | 工具自己声明在哪些模式可见；漏声明或未知值在归一化时拒绝，保持 fail-closed |
| 所有内置工具声明 `modes` | 各 `tool-*` 包、`subagent/src/tools.ts`、`plugin-manager/src/{plugin,build}.ts` | 按设计文档 §5 的表声明；进化工具由 `build.ts` 固定为 `["agent"]` |
| `core/agent` 不再列工具名 | `packages/core/agent/src/{agent-mode-policy,agent-form}.ts` | `allowedAgentModeTools(mode, definitions)` 按定义过滤；`defineMainAgentForm` / `agentFormComposition` / `activateAgentFormTools` 只做契约与激活 |
| 形态成员从插件目录推导 | `packages/core/runtime/src/main-agent-form.ts`、`cordis-adapter/src/manifest.ts` | Harness 加载且 manifest 声明了 `contributions.tools` 的条目就是成员；`prompt` / `compaction` 退出，`plugin-manager` 进入 |
| Host 经端口把形态交给 Harness | `agent-host-port.ts`、`startup/boot.ts`、`agent-factory-plugin.ts` | `actspace.host.agent.agentForm`；Harness bundle 不 import 插件目录 |
| Subagent 工具 owner 改为贡献它们的条目 | `packages/subagent/subagent/src/tools.ts` | `pluginId` 从 `actspace.subagent` 改为 `actspace.subagent-tools` |
| 装配测试守住产品策略 | `packages/core/runtime/src/harness/default-harness.test.ts` | Chat / Plan / Agent 三个集合与推导出的成员在真实装配上断言 |
| （P2）默认 Harness 两层产物 | `runtime/scripts/build-default-harness.mjs`、`src/plugin-catalog.ts`、`src/harness/default-harness.ts` | 内核一份代码分割闭包发布为 `actspace.default-harness`；每个 `isHarnessToolPlugin` 条目单独打成 `plugins/<entry>/plugin.js`，按 catalog 的 pluginId / 版本 / 来源发布；composition 带真实多份 manifest 与每条目 `artifactId` |
| （P2）内置工具插件可单独替换 | `default-harness.test.ts`、`agent-runtime-plugin.ts` | 一条 `replace` 补丁换掉 `filesystem-read` 的产物，内核与其余插件不变，兼容性检查通过；pristine 判定改按 `provenance` |
| （P2）service-contract owner 漂移测试 | `default-harness.test.ts`、`cordis-adapter/src/service-contract.ts` | owner / providerOwner / providerId 必须与贡献该服务的插件包、条目一致；修正 `tools.browser` 的错误包名并重新生成契约矩阵 |

## 人工验证指引

### 必须验证

1. **三种模式的工具可见集合没有变**
   - 验证方式：启动桌面端或 CLI，分别在 Chat、Plan、Agent 模式下让模型列出可用工具（或查看 `request/tools` 记录）。
   - 预期结果：Chat 恰好 `web`、`generate_image`；Plan 没有 `bash`、文件写入、Browser、`agent_codex` / `agent_claude_code`；Agent 没有 `web`，有 `plugin_manager`、`harness_inspect`。

2. **自进化产出的工具只在 Agent 模式**
   - 验证方式：用 `plugin_manager` 开发一个候选工具并激活，切到 Plan / Chat。
   - 预期结果：进化工具在 Plan / Chat 不可见，在 Agent 可见。

3. **（P2）内置工具插件按产物拆开**
   - 验证方式：`pnpm --filter @actspace/runtime build` 后查看 `packages/core/runtime/dist/default-harness/`；启动应用后用 `harness_inspect` 查看当前选择。
   - 预期结果：根目录是内核文件 + `files.json`，`plugins/` 下 14 个目录各有 `plugin.js`；选择里有 15 个产物，`filesystem-read` 等条目的 pluginId 是 `actspace.filesystem-read` 这类 catalog id，`agent-factory` 等条目仍是 `actspace.default-harness`。

4. **（P2）升级后旧数据目录自动换到新内置产物**
   - 验证方式：用一个在旧版本上只跑过内置 Harness（没做过进化）的数据目录启动新版本。
   - 预期结果：启动时记录一条 `builtin-upgrade` 选择，会话正常；做过进化补丁的数据目录保持原选择不被覆盖。

### 建议验证

1. **新会话 Header 的 `agentMembers`**
   - 验证方式：新建会话后查看 Session Header。
   - 预期结果：成员列表里没有 `actspace.prompt` / `actspace.compaction`，多了 `actspace.plugin-manager`；旧会话不受影响。

## Agent 已完成的验证

- `pnpm --filter @actspace/runtime test`：244 通过（含默认 Harness 装配、进化、Browser、统计启动）。
- `pnpm --filter @actspace/agent test`（18）、`agent-loop`（71）、`subagent`（30）、`tool-subagent`（2）、`plugin-manager`（6）、`cordis-adapter`（43）、`agent-service`（154）、`session-journal`（117）以及 `tool-web` / `tool-fs-*` / `tool-shell` / `tool-image-*` / `tool-browser` / `tool-todo` / `tool-background-tasks` 全部通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:docs`、`pnpm check:hot-path-reads` 通过。
- P2：`runtime`（248，新增产物拆分 / 单插件替换 / owner 漂移三个用例）、`cordis-adapter`（43）、`harness-control`（29）、`harness-evaluation`（12）、`plugin-manager`（6）通过；`pnpm test:contract-matrix`、`pnpm test:plugin-catalog`、`pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:hot-path-reads` 通过。

## 已知风险和遗留事项

- `tool-runtime` 有 3 个既有失败用例（process Grant、相对资源路径），在 `main` 上同样失败，与本次无关，未处理。
- `request/tools` 记录里的 `definitionDigest` 因 `modes` 字段加入会在升级后第一轮变化一次，属预期，没有比较逻辑依赖旧值。
- 形态仍由 Host 推导后传入；Harness 自进化替换工具插件时，新插件要么沿用被替换插件的 pluginId（形态成员照常匹配），要么像 `actspace.evolved.*` 那样作为进化插件进入 scope。
- P2 后每次 bootstrap / builtin-upgrade 发布 15 个产物而不是 1 个，`artifactRoot` 目录数相应增加；产物是内容寻址的，重复发布不产生新目录。
- 旧数据目录第一次用新版本启动会走 `builtin-upgrade`（内核产物内容变化、产物数量变化），属预期；选择记录的 `digest` 不再等于单个产物 id。

## 后续建议

- P3：`agent-factory-plugin` 的上下文来源与 Loop 扩展点改为注册式；composition 现在已有真实多份 manifest，可顺带评估把形态推导挪进 Harness（需要 `mountHarness` 把 manifests 交给树）。
- P4 见计划里程碑；之后再考虑让内置工具插件携带可编辑源码，使 `plugin_manager` 能以内置工具为模板改写。
- 契约矩阵生成器已支持按 manifest 兜底 `declared` 行，可在后续把 `service-contract.ts` 里叶子插件的 owner 删掉。
