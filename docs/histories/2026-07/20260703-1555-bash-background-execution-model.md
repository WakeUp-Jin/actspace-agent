# Bash 后台执行模型落地（E1–E4）

## 用户诉求

在设计文档定稿后（见 `20260703-1008-bash-execution-model-design.md`），从设计派生 execution plan 放入 `docs/exec-plans/`，并立即执行：把 bash 工具从「同步执行 + 超时杀进程」升级为「输出有界 + 超时转后台 + 事件通知」的执行模型。

## 主要改动

### 计划

- 新建 `docs/exec-plans/active/20260703-bash-execution-model/`（README + 三份子计划），E5 沙盒明确不在本组计划内（与 allowlist Phase 3 合并另行立项）。

### E1 输出管道收口

- `render-result.ts`：截断回填指明 read_file offset/limit + grep 检索落盘文件，禁止重跑加 `| head`。
- `executor.ts`：启动失败文案带 command/cwd；截断不算失败（测试钉住）。

### E2+E3 后台运行与 blockMs 语义

- `run-process.ts`：sink 模式重构为句柄式 `startProcessSink`（`wait` / `kill` / `ensureOutputFile` / `onChunk`，不内置超时），`runProcessStreaming` 变成其「超时杀进程」包装，ripgrep 等旧调用不受影响。
- `task-registry.ts`（新）：模块级单例注册表（Agent deps 每 turn 新建，任务必须跨 turn 存活），终态回调生成 `<task_notification>` 入队；`harvestSession` / `harvestAll` 收割。
- `executor.ts`：`timeoutMs` → `blockMs`（默认 30s，clamp [1s, 600s]，0 = 立即后台）；到点不杀进程转后台返回 taskId + 落盘路径；转后台瞬间进程恰好退出的竞态按前台结果返回。
- 新工具 `bash_output`（增量读 + tail 模式 + 64KB 上限）/ `bash_kill`（进程组 SIGTERM→SIGKILL，抑制冗余终态通知）。
- `engine/bridge.ts`：接上此前空置的 `getSteeringMessages`——每次 LLM 调用前 drain 该会话待投递通知 + 附运行中任务清单，以 `source: "task_notification"` 的 UserMessage 注入。
- `desktop/main/index.ts`：before-quit 同步 `harvestAll()`（detached 子进程不随 app 退出，必须显式对进程组发信号）；registry 订阅 → `bash_task_update` 经 `agent:stream` 推前端（turn 内外统一）。
- shared 契约：`BashPreview` 增 `backgroundTaskId/backgroundStatus/outputFilePath`；`RuntimeStreamEvent` 增 `bash_task_update`；`UserMessagePayload.source` 标记注入消息，selectors 把 task_notification 映射为 tool 样式块而非用户气泡。
- 前端：`BashRunBlock` 后台状态徽标；`App.tsx` 维护 taskId → 最新状态覆写层。

### E4 输出订阅与卡死看门狗

- `output-monitor.ts`（新）：行缓冲增量扫描 `notifyOnOutput.pattern`（debounce ≥ 5s、行长截 4KB 防 ReDoS、attach 前命中暂存 20 条）；45s 无输出 + 尾行匹配交互提问模式的双条件看门狗，输出恢复发 stall_recovered 复位前端徽标。
- 订阅只对实际转后台的任务生效；前台完成的命令输出已全量回填，忽略订阅。

## 设计动机

- **长命令没有失败分支**：blockMs 是「模型等多久」不是「进程活多久」，超时转后台替代杀进程，常驻进程「一直活着」即成功。
- **事件回流替代轮询**：终态通知 / 输出订阅 / 看门狗三个事件源在 turn 边界经 steering 注入，工具描述明确禁止 sleep 轮询。

## 验证

- 新增测试：`bash-background.test.ts`（13 例）、`bash-output-monitor.test.ts`（8 例，fake timers）、bridge steering 注入 2 例、selectors 2 例、BashRunBlock 徽标 2 例。
- 全仓 typecheck 通过；全仓测试仅 `settings-service` 1 例存量失败（stash 基线复现，与本次无关）。
- 手工验收（dev 三项：转后台通知、blockMs 0 + bash_output/kill、退出无孤儿进程）待开发者执行。

## 关键文件

- `packages/agent-core/src/tools/tools/bash/`（executor / task-registry / background-tools / output-monitor / definition / permissions / render-result）
- `packages/agent-core/src/tools/subprocess/run-process.ts`
- `packages/agent-core/src/engine/bridge.ts`、`packages/agent-core/src/adapters.ts`
- `packages/shared/src/session.ts`、`session-selectors.ts`
- `packages/desktop/src/main/index.ts`、`renderer/App.tsx`、`renderer/components/messages/BashRunBlock.tsx`
- `docs/exec-plans/active/20260703-bash-execution-model/`、`docs/exec-plans/tech-debt-tracker.md`（3 条新债务）
