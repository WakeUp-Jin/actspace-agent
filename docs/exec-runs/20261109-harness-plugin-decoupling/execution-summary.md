# 后端插件包解耦 P1–P4 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261109-harness-plugin-decoupling.md`
- **执行过程**：`docs/exec-runs/20261109-harness-plugin-decoupling/execution-process.md`
- **执行模式**：夜间（云端 Agent 自主执行）
- **执行结果**：P1–P4 全部完成；计划已移入 `completed/`

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
| （P3）上下文装配登记表 | `packages/context/context-assembly/*`、`core/runtime/src/plugin-catalog.ts` | 新 Harness 内核条目 `context-assembly` 提供 `context.assembly`：来源按种类 + Agent 角色登记，工具结果观察者登记，`sourcesFor(role)` 搭注册表；必需种类来自 manifest `config.required` |
| （P3）来源插件与披露自己接线 | 八个 `context-*` 来源包、`context-disclosure/src/plugin.ts`、`context-engine/src/{compaction,engine,plugin}.ts` | `publish` 搬到 `@actspace/context-assembly`；后台任务 / 子智能体来源自己声明只给 `main`；披露经 `CompactionDisclosure.hydrate` + 协调器 `hydrator()` 接水合，向登记表登记来源与观察者 |
| （P3）`agent-factory` 不认识种类 | `core/runtime/src/harness/agent-factory-plugin.ts`、`src/manifests.ts` | inject `context.assembly` 代替 `context.source.*`；`createSources` / `observeContextToolResult` / `createContextEngine` 全部委托登记表；不再 import 披露包 |
| （P4）能力授予 | `core/tool-runtime/src/host-ports.ts`、`core/runtime/src/harness/{default-harness,default-harness-definition,agent-runtime-plugin}.ts` | `actspace.host.filesystem`（`FilesystemHostGrant`）与 `actspace.host.process`（`ProcessHostGrant`）替换四个 `actspace.host.tools.*`；`OPTIONAL_HOST_SHARED_SERVICES` 让 Host 可不给 |
| （P4）文件 / Shell 实现随插件产物 | `tool-fs-read/search/write`、`tool-shell` 的 `src/{plugin,manifest}.ts` | 插件 `apply` 用授予自己建 `node-ports`；无授予时注册但返回 `CAPABILITY_UNAVAILABLE`；manifest 改 `optionalInjects` |
| （P4）Host 只给授予 | `packages/host/agent-host/src/node-ports/tool-host-services.ts`、`apps/desktop/src/main/runtime-v2/tool-host-services.ts` | 两个 Host 只提供授予 + 网页 / 图片端口；CLI `--mock` 不给授予；`agent-host` 不再依赖四个工具包 |
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

5. **（P3）子智能体看不到后台任务 / 子智能体清单**
   - 验证方式：主 Agent 派一个子智能体，查看子会话的 `request/context` 或上下文面板。
   - 预期结果：主 Agent 的上下文有「后台任务」「运行中的子智能体」来源；子智能体与 fork 没有；`system` / `rules` / `skills` / `runtime` / `conversation` / `tools` 两边都有。

6. **（P3）披露启用时仍能恢复与水合**
   - 验证方式：Desktop 下让 Agent 读几个文件后触发压缩，重开会话。
   - 预期结果：压缩摘要含「相关文件」节，重开后披露状态恢复，上下文里仍有 `disclosure` 来源；行为与改前一致。

7. **（P4）文件与 Bash 工具在 Desktop / CLI 正常，`--mock` 下报不可用**
   - 验证方式：Desktop 与 `actspace-cli` 正常模式下 `read_file` / `grep` / `write_file` / `bash`；`actspace-cli --mock` 下调用任一文件工具或 `bash`。
   - 预期结果：正常模式行为与改前一致（含沙箱、审批、后台任务、强制退出时结束遗留进程）；`--mock` 下工具存在但返回 `CAPABILITY_UNAVAILABLE`，不报缺 Host 服务。

### 建议验证

1. **新会话 Header 的 `agentMembers`**
   - 验证方式：新建会话后查看 Session Header。
   - 预期结果：成员列表里没有 `actspace.prompt` / `actspace.compaction`，多了 `actspace.plugin-manager`；旧会话不受影响。

## Agent 已完成的验证

- `pnpm --filter @actspace/runtime test`：244 通过（含默认 Harness 装配、进化、Browser、统计启动）。
- `pnpm --filter @actspace/agent test`（18）、`agent-loop`（71）、`subagent`（30）、`tool-subagent`（2）、`plugin-manager`（6）、`cordis-adapter`（43）、`agent-service`（154）、`session-journal`（117）以及 `tool-web` / `tool-fs-*` / `tool-shell` / `tool-image-*` / `tool-browser` / `tool-todo` / `tool-background-tasks` 全部通过。
- `pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:docs`、`pnpm check:hot-path-reads` 通过。
- P2：`runtime`（248，新增产物拆分 / 单插件替换 / owner 漂移三个用例）、`cordis-adapter`（43）、`harness-control`（29）、`harness-evaluation`（12）、`plugin-manager`（6）通过；`pnpm test:contract-matrix`、`pnpm test:plugin-catalog`、`pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:hot-path-reads` 通过。

- P3：`context-assembly` 6、八个来源包与 `context-disclosure`（27）、`context-engine`（34）、`prompt`（9）通过；`runtime` 248 通过（含 `tool-composition` 真实树上的角色断言）。
- P4：`tool-fs-read` 9、`tool-fs-search` 5、`tool-fs-write` 6、`tool-shell` 119、`agent-host` 128、`agent-cli` 16、`desktop` 2898、`runtime` 248 通过；`pnpm typecheck`、`pnpm lint`、`pnpm check:packages`、`pnpm check:docs`、`pnpm check:hot-path-reads`、`pnpm check:desktop-build-graph`、`pnpm test:contract-matrix`、`pnpm test:plugin-catalog` 通过。

## 已知风险和遗留事项

- `tool-runtime` 有 3 个既有失败用例（process Grant、相对资源路径），在 `main` 上同样失败，与本次无关，未处理。
- `request/tools` 记录里的 `definitionDigest` 因 `modes` 字段加入会在升级后第一轮变化一次，属预期，没有比较逻辑依赖旧值。
- 形态仍由 Host 推导后传入；Harness 自进化替换工具插件时，新插件要么沿用被替换插件的 pluginId（形态成员照常匹配），要么像 `actspace.evolved.*` 那样作为进化插件进入 scope。
- P2 后每次 bootstrap / builtin-upgrade 发布 15 个产物而不是 1 个，`artifactRoot` 目录数相应增加；产物是内容寻址的，重复发布不产生新目录。
- 旧数据目录第一次用新版本启动会走 `builtin-upgrade`（内核产物内容变化、产物数量变化），属预期；选择记录的 `digest` 不再等于单个产物 id。

- P3 后缺必需上下文来源在第一次建 Agent 时报错，不在装配时；错误信息 `Required context source <kind> is unavailable.` 会出现在 Run 失败里而不是启动日志。
- P4 后 Host 不给授予时文件 / Shell 工具「存在但不可用」，与原来 `--mock` 行为一致；但一个真实 Host 漏提供授予不会在启动时报错，只会在工具调用时暴露。
- Shell 插件产物现在自带 `@actspace/sandbox/node-ports` 的 `spawnHostProcess` 与 `@actspace/background-tasks` 的打包副本；它们只经参数与 Host 登记表交互，不共享类身份。

## 后续建议

- 让内置工具插件携带可编辑源码，使 `plugin_manager` 能以内置工具为模板改写（P2 决策里预留）。
- 出现远程 / 虚拟文件系统需求时，再在 `tool-runtime` 抽文件系统服务接口，三个 fs 包改成提供者。
- `apps/cli/package.json` 里已无引用的 `tool-fs-*` / `tool-shell` 依赖可顺手清掉。
- 契约矩阵生成器已支持按 manifest 兜底 `declared` 行，可在后续把 `service-contract.ts` 里叶子插件的 owner 删掉。
