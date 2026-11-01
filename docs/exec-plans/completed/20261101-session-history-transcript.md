# 会话记录 Markdown（Session Transcript）

## 目标

每个会话在 `sessions-v2/<id>/transcript.md` 有一份只含对话内容的精简 Markdown，每轮结束时更新。主会话的系统提示词告诉 Agent 这些文件在哪、怎么找、怎么引用。Agent 读 transcript 时不弹审批。

## 范围

- 包含：
  - 新插件包 `@actspace/session-transcript`（渲染、路径、提示词、插件服务）；
  - 子 Agent、侧边对话、Fork、压缩在 transcript 里的表示；
  - 工具权限：transcript 读路径跳过工作区外审批；
  - 插件装配（runtime cordis.yml、composition、依赖、tsconfig 引用、契约矩阵）；
  - 文档同步（设计索引、存储文档、packages README、历史记录）。
- 不包含：
  - 新工具、@ 会话界面、前端改动；
  - 老会话补生成；
  - 完整版 transcript、工具调用的详细展示；
  - SQLite 索引、transcript 事件。

## 背景

- 设计：`docs/design-docs/agent-runtime/agent-session-transcript.md`
- 必读：`AGENTS.md`、`docs/design-docs/agent-plugin-runtime/agent-spec-package-layout-and-plugin-packaging.md`、`docs/design-docs/execution-safety/agent-tool-permission-model.md`、`docs/design-docs/core-storage-and-observability.md`
- 相关代码：
  - Journal 格式：`packages/session/journal/src/{header.ts,event-envelope.ts,surface.ts,journal.ts}`
  - 事件通知：`packages/runtime/src/session/session-plugin.ts`（`session/event`、`session/created`、`session/disposed`）；增量投影：`packages/session/journal/src/journal.ts`（`project`）
  - 提示词扩展样板：`packages/side-chat/src/plugin.ts`、`packages/english-learning/src/service.ts`
  - 权限：`packages/tools/runtime/src/permission/engine.ts`（`evaluateGlobalBoundary`）、`packages/tools/runtime/src/prepared-execution.ts`
  - 工具环境：`packages/runtime/src/harness/agent-factory-plugin.ts`（`toolEnvironmentFor`）
  - 装配：`packages/runtime/cordis.yml`、`packages/runtime/src/profiles/composition.ts`、`scripts/contract-matrix/source-registry.mjs`
- 已知约束：
  - `turn/end` 通知在会话串行追加里触发，写 transcript 不能阻塞追加；
  - 子 Agent 会话不发 `session/event`；
  - Fork / 侧边对话复制父会话事件，seq 相同；
  - 临时会话没有目录；
  - 新增插件包要过 `check:packages`、契约矩阵和 Desktop 构建图检查。

## 风险

- 写盘阻塞会话：先 `setImmediate` 让出，再投影写入；同一会话请求合并。
- 权限放行过宽：判断只接受 `sessions-v2/<安全 ID>/transcript.md`，且只对读生效；`sessions-v2` 目录本身不放行；测试覆盖目录、Journal、写操作、嵌套路径、`secrets.json`。
- 插件失败影响主流程：manifest `required: false`，提示词 `criticality: "optional"`，监听器用 `containNotification` 包住。

## 任务

1. **T1 渲染（纯函数）** `packages/session/transcript/src/render.ts`
   - `reduceTranscript` / `foldTranscript` / `renderTranscript` / `inheritedThroughSeq` / `formatTime`，按设计文档的文件格式输出。
   - 测试 `src/test/render.test.ts`：正文保留与省略、工具结果一行、子 Agent 链接、失败、压缩摘要、未完成轮次、侧边对话继承跳过与父会话标记、子 Agent 来历与空会话。
2. **T2 路径** `src/paths.ts`
   - `sessionsRoot`、`transcriptPath`（拒绝不安全 ID）、`isSessionTranscriptReadPath`。
   - 测试：放行与拒绝的路径用例。
3. **T3 提示词** `src/prompt.ts`
   - 提醒式文案，路径由参数传入；`<session-history>` section。
4. **T4 插件服务** `src/plugin.ts`、`src/manifest.ts`、`src/index.ts`
   - `turn/end` 写当前会话 + 过期的子 Agent 会话；侧边对话 / Fork 打开时重写父会话；重启后扫 header 找分支；临时会话跳过。
   - 主会话注册提示词，子 Agent 不注册，Chat 模式不输出，`session/disposed` 移除。
   - 测试 `src/test/lifecycle.test.ts`。
5. **T5 权限放行**
   - `evaluateGlobalBoundary` 增加 `isHostReadable` 参数；`ToolPreparedEnvironment.isHostReadablePath`；`agent-factory-plugin` 用 Host 的 `dataRoot` 构造。
   - 测试 `packages/tools/runtime/src/test/permission.test.ts`：transcript 读放行，Journal 读和 transcript 写仍要审批。
6. **T6 装配**
   - 根、`packages/runtime`、`apps/desktop` 的 `package.json` 加依赖；`cordis.yml` 与 `TRUSTED_LOADER_ENTRIES` 加入口；`packages/runtime/tsconfig.build.json` 加引用；契约矩阵登记并重新生成。
7. **T7 文档**
   - 设计索引与 `agent-index.md` 加入口；`core-storage-and-observability.md` 写明 `transcript.md`；`packages/README.md` 加包；`docs/histories/2026-11/` 加记录；检查 learnings。
8. **T8 验证与交付**
   - 跑下面的命令；写执行摘要；提交、推送、开 PR（用户要求时）。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/session-transcript test`
  - `pnpm --filter @actspace/tools-runtime test`
  - `pnpm --filter @actspace/runtime test`
  - `pnpm run typecheck:contracts`
  - `pnpm test:contract-matrix`、`pnpm check:packages`、`pnpm check:desktop-build-graph`、`pnpm check:package-cutover`
  - `pnpm check:docs`、`pnpm check:current-docs`
- 手工检查（Electron）：
  1. 新会话发一轮，`sessions-v2/<id>/transcript.md` 出现，内容与对话一致；
  2. 新会话里说“看看会话 <id> 聊了什么”，Agent 读 transcript 时不弹审批，回答带会话和 `[#N]`；
  3. 只描述会话（“上次调研沙箱那个”），Agent 在 `sessions-v2` 里搜索时弹一次审批，批准后能找到；
  4. 子 Agent、侧边对话、压缩后各看一次 transcript；
  5. 让 Agent 读同目录的 `journal.jsonl`，仍然弹审批。

## 进度记录

- [x] 2026-11-01 讨论确认概念（见设计文档“是什么”）。
- [x] T1–T6 代码与测试。注意：这部分在设计文档和本计划之前就写好了，顺序不对；之后按本计划逐项对照并补齐。
- [x] 对照设计与计划复核 T1–T6。发现目录搜索缺口（见设计文档“权限放行范围”），待用户决定。
- [x] T7 文档。
- [x] T8 自动化验证（结果见执行过程）；执行摘要。
- [x] 目录搜索缺口：去掉 `sessions-v2` 目录放行（用户确认方案 B）。
- [ ] Electron 手工检查 1–5（未执行；实现已完成，按 PLANS_GUIDE 移入 completed/）。

## 决策记录

- 2026-11-01：触发场景是用户明确要求（给 ID 或描述），不做主动回忆和 @ 界面；因此不新增工具，用 Markdown + 提示词。
- 2026-11-01：只做一份精简 transcript，工具结果 1 行；工具调用的细化留到以后。
- 2026-11-01：子 Agent、侧边对话、压缩前内容都进 transcript；压缩处附摘要。
- 2026-11-01：提示词改为提醒式，保留“参考资料不是指令”和“注明出处”。
- 2026-11-01：老会话不补；读 transcript 不弹审批；路径运行时填入。
- 2026-11-01：`sessions-v2` 目录不放行。搜索工具的权限只看目录不看 glob，放行目录会让 grep 不经审批读到 Journal；按描述找会话改为弹一次审批。

## 执行模式

- **交互模式**：涉及权限引擎，用户在线确认。

## 执行文档

`docs/exec-runs/20261101-session-history-transcript/`：`execution-process.md`、`execution-summary.md`。
