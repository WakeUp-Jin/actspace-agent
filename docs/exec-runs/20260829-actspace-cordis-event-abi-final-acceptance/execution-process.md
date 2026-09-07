# ActSpace Cordis 事件 ABI 与 CLI run 最终验收 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-29 21:45
- **结束时间**：2026-08-29 22:07
- **凭据处理**：使用 `/Users/wakeup-jin/.config/actspace/cli-real.env` 的 env-file 注入；未在命令参数、日志或验收文档中展开 key。

## 执行时间线

### 步骤 1：检查工作区与 provider 配置边界

- **操作**：确认当前工作区存在大量用户已有 dirty changes；只读检查 real-provider env 文件字段存在，不打印值。
- **影响文件**：无。
- **验证**：原工作区未执行 `git clean`、`git reset` 或删除操作。env 文件权限为 `0644`，这不是本轮自动修改项，见遗留事项。

### 步骤 2：构建 Runtime 与 CLI

- **操作**：先观察到 Runtime 与 CLI 并发构建会因 shared/dist 清理产生竞态；随后按依赖顺序执行 `pnpm --filter @actspace/runtime... build` 和 `pnpm --filter @actspace/agent-cli build`。
- **影响文件**：仅构建产物；原工作区源码未修改。
- **验证**：顺序构建 exit 0。clean-room 中同样按顺序构建并通过。

### 步骤 3：包级核心回归

- **操作**：执行 Session Journal、Session Persistence、Agent Loop、ToolRuntime、Headless 的 test 与 typecheck。
- **影响文件**：无源码改动。
- **验证**：Journal 9/9、Persistence 34/34、Agent Loop 4/4、ToolRuntime 17/17、Headless 2/2；五个包 typecheck 全部 exit 0。

### 步骤 4：真实 provider 无工具 run

- **操作**：使用 `deepseek-v4-flash`、`--persist`、`--jsonl` 执行一次只返回固定短文本的任务。第一次在默认沙箱中因网络限制 exit 3；获得网络批准后重跑。
- **影响文件**：只写入 `/private/tmp/actspace-real-acceptance.bMmz1H/data/` 下的临时 Session 数据。
- **验证**：真实 provider 返回 `REAL_PROVIDER_OK`，exit 0；Session `47cef122-ec63-4393-8cab-749f4030f4e5`，单步、16 个 event records（含 seq 0–15 和 end-seed）、snapshot `throughJournalSeq=15`、`accessState=read-write`。Journal header 记录 `actspace.kernel@2.0.0` 与 `actspace.core@2.0.0`，并含 manifest/codec digests。

### 步骤 5：真实 provider resume / replay

- **操作**：对同一 Session 使用 `--resume 47cef122-ec63-4393-8cab-749f4030f4e5` 发起第二个真实请求。
- **影响文件**：同一临时 Session Journal 追加第二个 turn。
- **验证**：返回 `REAL_RESUME_OK`，sessionId 保持不变；snapshot `turnCount=2`、`completedTurnCount=2`、`stepCount=2`、`throughJournalSeq=30`。Journal seq 连续，第二轮从 seq 17 继续，尾部 `session/end-seed.lastSeq=30`。

### 步骤 6：真实 provider 工具调用

- **操作**：要求模型必须调用 `read_file(path=README.md, offset=1, limit=8)`，禁止写文件。
- **影响文件**：只读 `/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent/README.md`；没有工具写入。
- **验证**：Session `0c83b861-4091-46fa-999c-c0d072812686` exit 0，返回 `TOOL_READ_OK`。真实两步 loop 记录：
  `assistant/message(finishReason=tool-calls)` → `tool/call` → `tool-workflow/run-start` → `tool/result(status=completed)` → 第二个 `step/start` → `assistant/message(finishReason=stop)`。
  工具注册为 `actspace.core-tools/read_file`，结果包含 README 第 1–8 行，snapshot `steps=2`、`tools[0].state=completed`、`throughJournalSeq=90`。

### 步骤 7：Journal、脱敏与旧总线取证

- **操作**：检查成功工具 Session 的 header、事件类型/顺序、tool call/result、request header/context、secret scan 和 runtime dist。
- **影响文件**：无。
- **验证**：Journal event seq 0–91 连续；request header 均为 `route=default`、`model=deepseek-v4-flash`；两条 `request/context` 均未命中 `apiKey|authorization|bearer|sk-...`；Journal secret scan 为 CLEAN。`packages/cordis-adapter/dist`、`packages/core/agent-loop/dist`、`packages/tools/runtime/dist`、`packages/headless/dist`、`packages/runtime/dist`、`apps/cli/dist` 均无 EventHub/eventEmitter/EventContext 运行时命中。补充观察：`--jsonl` 的 live projection 在工具运行期间主要输出 run-state/assistant-delta，未单独暴露 `tool/result`；工具事实仍完整落在 Journal/snapshot。成功 run 的 live `throughJournalSeq` 也保持 `-1`，最终 snapshot 才给出正确 checkpoint。

### 步骤 8：SIGINT 与 managed CLI 回归

- **操作**：执行 `pnpm run test:agent-cli:process` 与 `pnpm run test:agent-cli:package`。
- **影响文件**：无。
- **验证**：两次 SIGINT process tests 通过并返回约定 code 130；managed CLI package smoke 通过。

### 步骤 9：clean-room 隔离副本

- **操作**：将当前工作树复制到 `/private/tmp/actspace-clean-room.LyP2Yu`，排除 `.git`、`node_modules`、`dist`、`.env` 等；在副本中执行 frozen install、构建、typecheck、全仓 test、package/cutover/legacy 检查和 CLI mock smoke。
- **影响文件**：只写入明确的 `/private/tmp/actspace-clean-room.LyP2Yu`，原工作区不变。
- **验证**：在线 `pnpm install --frozen-lockfile` exit 0（离线首次因缺少 `esbuild@0.21.5` tarball 失败，未回退到原 `node_modules`）；Runtime/CLI build、typecheck、全仓 522 Desktop tests、CLI 14 tests、Cordis 20 passed + 1 skipped、process 2/2、package boundary、strict cutover、strict legacy removal 均通过；隔离 CLI mock 返回 `ok:true,status=completed`。

## 遇到的问题

- **并发构建竞态**：Runtime build 会清理 shared/dist，和 CLI 并发时短暂造成 `@actspace/shared` 缺失；改为依赖闭包完成后再构建 CLI，顺序构建稳定通过。
- **默认沙箱无网络**：第一次真实 provider 请求返回 connection error；网络批准后的同一命令成功，说明不是插件或模型路由错误。
- **clean-room 离线依赖缺口**：复制的 pnpm store 缺少 `esbuild@0.21.5`，在线 frozen install 补齐后通过；没有复用原工作区 `node_modules`。

## 跳过或推迟的事项

- **P05 deterministic retry/error CLI fixture**：`apps/cli/src/runtime-v2/llm-adapter.ts` 当前 mock 只覆盖固定成功文本与 abort；没有 deterministic tool/retry/error switch。真实 provider 的 tool/no-tool 成功只能作为补充证据，不能替代本计划规定的 retry/error fixture，因此 P05 保持 BLOCKED。
- **真实 provider error/retry/abort 现场**：没有用临时网络请求冒充 deterministic fixture；abort 已由 managed process tests 覆盖，retry/error 留待补充 fixture 后再验收。
- **live event cursor / tool notification**：durable event collection 已通过，但 CLI JSONL live projection 是否需要实时暴露 tool/result 与 throughJournalSeq，需要单独决定是否补充为后续观察面验收。
- **Electron/Chrome/Browser Bridge/CLI chat/Goal/Schedule producer**：按计划明确不在本次范围。

## 设计一致性观察

- `docs/design-docs/agent-plugin-runtime/agent-spec-dsh-event-model.md` 将 seq 描述为从 1 开始；当前 `agent-spec-session-format-v1.md`、实现和测试统一从 0 开始。本轮按当前 Session Format v1 判定 Journal 连续性通过，但两份规范需要后续明确哪一份是真源。
