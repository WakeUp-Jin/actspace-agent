# Agent 运行即时日志

## 用户诉求

希望先在 Agent 运行关键位置打 console 日志，让终端和 `pnpm dev:log` 写出的终端日志文件能即时看到链路状态。后续还希望补每次运行一个完整链路日志文件，用于区分 Agent 执行错误、后端推送错误和前端渲染错误。

## 主要改动

- 在 `packages/agent-core/src/engine/bridge.ts` 增加 `[agent-run]` 日志：
  - turn 执行开始/完成/异常
  - Agent loop 生命周期
  - assistant text/thinking delta 计数和累计字符数
  - tool started / tool finished 及短 preview
- 在 `packages/desktop/src/main/index.ts` 增加 `[agent-ipc]` 和 `[main]` 日志：
  - `agent:run-turn` 请求、完成、失败
  - stream event 推送到 renderer
  - turn result 持久化开始/完成
  - 应用路径、数据目录、renderer 加载与 renderer 进程退出
- 将 renderer console 转发到 main 终端，使用 `[renderer-console]` 前缀，帮助判断前端渲染侧错误。
- 更新 `docs/RELIABILITY.md`，记录即时日志前缀和当前仍缺的“每次运行单独链路文件”能力。
- 追加实现每次 Agent turn 一个 JSONL 排障文件：
  - 新增 `packages/agent-core/src/observability/agent-run-log.ts`
  - main 在仓库根目录 `logs/agent-runs/` 下为每次 `agent:run-turn` 创建文件
  - bridge 将用户输入、AgentEvent、RuntimeStreamEvent 和最终 AgentTurnResult 写入同一个文件
  - 启动 run 前清理超过 24 小时的旧 run JSONL
  - `logRoot` 从 Electron 应用数据目录改为仓库根目录 `logs/`，方便开发时直接查看

## 设计动机

现有 `session.jsonl` 更适合会话恢复，不覆盖完整运行诊断链路；`agent:stream` 又只用于实时 UI，不落长期日志。先补即时 console 日志，可以直接复用已有 `pnpm dev:log` 的终端文件能力，让开发排障立刻能看到用户输入入口、Agent 执行过程、工具调用、后端推送和前端 console 输出。

即时 console 日志中只记录长度和短 preview，避免把完整用户输入、工具参数或模型输出大量写入终端日志。run JSONL 排障文件按用户要求保留完整输入、工具参数和工具结果，但只保存在本地日志目录，不提交到 Git。

## 验证

- `pnpm typecheck`
- `pnpm --filter @actspace/agent-core test`
