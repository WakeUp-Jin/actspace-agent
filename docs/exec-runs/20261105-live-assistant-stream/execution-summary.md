# 流式输出只走实时通道 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261105-live-assistant-stream.md`
- **执行过程**：`docs/exec-runs/20261105-live-assistant-stream/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（实机功能清单 §9 待用户逐项确认）

## 实机内存对比（2026-11-06）

同一工作区 `learn-subagent`、同类问题，记录器 `tmp/heap/monitor.mjs`，数据在 `tmp/heap/run1/`、`tmp/heap/run2/`。

| 指标 | run1（改前） | run2（改后） |
|---|---|---|
| 工作量 | 32 次请求 / 47 次工具，6620 条 chunk | 26 次请求 / 45 次工具，0 条 chunk |
| 主进程累计分配 | 11.47 GB | 2.04 GB |
| 主进程 JS 堆峰值 | 1043 MB | 122 MB |
| 跑完后主进程常驻堆 | 307 MB | 60 MB |
| 主进程内存峰值 | 1195 MB | 394 MB |
| 面板总内存峰值 | 1921 MB | 1114 MB |
| 界面进程内存峰值 | 651 MB | 588 MB |

改后主进程分配的最大来源是 `requestContext` 投影的 `view`（约 0.7 GB）：每条带 surface 的事件（工具结果、助手消息）都对整个对话重算一遍 `projectContextState`，其中 `estimateTokens` 用 `[...value].filter` 逐字展开字符串，约 0.45 GB。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 新会话不写 `assistant/chunk`，消息带 `firstTokenAt` | `agent-loop/src/loop.ts`、`session-journal/src/core-codecs.ts` | 去掉按 token 线性放大的持久事件 |
| 计时读 `firstTokenAt`，旧会话从 chunk 补算 | `session-projection/src/facts.ts`、`session-controller.ts`、轨迹 `builder.ts` | TTFT / TPS 口径不变 |
| 无关事件不改 `requestContext`；投影不深拷贝 | `runtime/src/projection/durable-session.ts`、`session-projection/src/registry.ts` | 去掉 58% 分配来源 |
| 关系校验按 `readsHistory` 才读历史 | `codec-registry.ts`、`invariant-validator.ts`、`storage.ts` | 去掉 17% 分配来源 |
| 删除无调用方的实时事件缓冲 | `runtime-registry.ts` | 跑完后常驻 307 MB 的来源 |
| 实时底稿 `LiveOutputBuffer` + `sessions.liveOutput` | `shared/runtime-v2/live-output.ts`、`runtime-registry.ts`、`fixed-renderer-ipc.ts`、agent-host | 界面重载、子 Agent、远程会话补回未定稿文字 |
| 恢复运行从底稿接着显示 | `client/live/live-run.ts`、`live-runs/live-baseline.ts`、`transcript.ts` | 替代从日志 chunk 拼进行中文本 |
| 轨迹流式层读实时运行 | `trajectory/builder.ts`、`live.ts`、`TrajectoryView.tsx`、`client/live/request-output.ts` | 占位按请求生成 |
| 删除 chunk 专用批处理 | `live-envelope-batcher.ts`（删）、`api/live-events.ts`、`desktop-session-bridge.ts`、`session-store.ts`、`client/sessions/chat.ts` | 新会话不会再触发 |
| 远程协议 `sessions.output` 改为 `afterRevision` | `agent-host/src/rpc.ts`、`desktop-adapter.ts`、`apps/web/src/sessions/session-observer.ts` | 不兼容改动，三端需同版本 |

## 人工验证指引

### 必须验证

1. **主进程内存对比**
   - 验证方式：`ACTSPACE_INSPECT_MAIN=9229 pnpm dev`，另开终端 `node tmp/heap/monitor.mjs tmp/heap/run2 --wait-new`；同一工作区 `learn-subagent`、同一问题跑一次约 60 秒的运行。
   - 预期结果：累计分配、JS 堆峰值、跑完后常驻、面板总内存峰值都明显低于 run1（11.5 GB / 1 GB / 307 MB / 1921 MB）。
2. **实时出字与重载补回**
   - 验证方式：发一条会长时间输出的问题，输出中按 Cmd+R 重载界面。
   - 预期结果：重载后已输出的文字立刻补回，之后继续出字，不重复、不缺字；回复完成后只剩一份。
3. **子 Agent 面板**
   - 验证方式：让 Agent 委派子 Agent，在右侧面板看子会话。
   - 预期结果：子会话进行中的文字可见，完成后显示定稿内容。
4. **轨迹流式**
   - 验证方式：运行中切到轨迹视图，选中正在输出的助手行看「预览」。
   - 预期结果：一个请求一行占位，文字逐帧增长，行不跳动；完成后变成完整记录，行位置不变。
5. **TTFT / TPS 与旧会话**
   - 验证方式：看新会话的会话统计胶囊；打开一个 11-05 之前的旧会话看对话、轨迹、统计。
   - 预期结果：新会话有 TTFT / 输出速度；旧会话显示和计时与以前一致。

### 建议验证

1. **远程会话重新观察**
   - 验证方式：连接远程 Host，运行中切走再切回，或在 Web 端刷新。
   - 预期结果：未定稿文字补回，不重复。需要远程 Host 与客户端同版本。

## Agent 已完成的验证

- `pnpm typecheck`：通过。
- 测试：
  - agent-loop 66、session-journal 107、session-projection 25、session-persistence-jsonl 29、runtime 117、agent-host 63、context-engine 27、client 79（1 跳过）、shared 195：全部通过；
  - `apps/desktop` 2743 通过（5 跳过）、`apps/web` 136：全部通过。
- 检查：`check:current-docs`、`check:docs`、`check:ipc-channels`、`check:renderer-bridge`、`check:frontend-tokens`、`check:frontend-theme`、`check:packages`、`check:harness-events`、`check:v2-legacy-removal`、`check:repo`、`check:desktop-build-graph`、`test:contract-matrix`：全部通过。
- 轨迹流式性能（`TRAJECTORY_PERF=1`）：一帧流式 p95 约 0.05ms，与片段数（40 / 2000）无关；定稿层重建 p95 约 17ms，只在日志事件到达时发生。

## 已知风险和遗留事项

- **远程协议不兼容**：`sessions.output` 的 `offset` 改为 `afterRevision`，旧客户端连新 Host（或反过来）读底稿会报参数错误。
- **Web `BashRow`**：改动前就把 `sessions.output`（模型未定稿正文）当成 bash 输出显示，本次没有修。
- **远程侧缺单测**：桌面远程适配器的底稿回放、Web `session-observer` 没有新增自动化测试。
- **崩溃丢字**：应用在消息写入前崩溃时，这次调用已输出的文字不进入持久记录（规范 §4 已接受，与改动前的实际结果相同）。

## 后续建议

- 实机内存对比完成后，把四个指标写进本摘要，计划移到 `completed/`。
- 单独修 Web `BashRow` 的输出来源，并补远程侧的底稿回放测试。
