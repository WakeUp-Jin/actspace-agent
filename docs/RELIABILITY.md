# 稳定性与可运维性

这里用来定义 `actspace` 当前的运行质量底线。

## 当前最小可靠性约定

- 应用启动时必须能初始化本地数据目录：
  - `sessions/`
  - `logs/`
  - `tmp/`
- renderer 不能直接访问文件系统；所有文件与 session 读写都必须走 preload + IPC。
- 应用启动后必须至少能完成两条路径之一：
  - 恢复本地已有会话
  - 在没有旧会话时，跑起一轮默认 turn
- 即使当前 provider 还是 mock，完整链路也应保持可运行：
  - 启动应用
  - 请求 bootstrap state
  - 读取 session list
  - 执行或恢复一轮 turn
  - 渲染消息流
  - 本地落盘

## 当前本地排障入口

- `pnpm dev`：本地开发启动桌面端。
- `pnpm typecheck`：检查跨包类型契约。
- `pnpm build`：检查当前桌面端和共享包是否可构建。
- `pnpm ci`：运行仓库级基础门禁。

## 当前主要可靠性缺口

- 还没有真正的结构化日志写入策略。
- 还没有 crash / provider error / write failure 的统一错误面板。
- 还没有自动化 smoke path 覆盖“启动 -> turn -> 恢复”。
- 当前 session 持久化格式和恢复链路仍需要持续收口，避免事件格式心智漂移。

## 后续建议维护的内容

随着真实 provider 和更多工具接入，这里建议继续补这些内容：

- 启动、健康检查和基本可用性要求。
- 日志、指标、链路的采集和访问约定。
- timeout、retry、backoff 的默认策略。
- 本地和 CI 的关键路径验证方式。
- 常见故障、排查路径和恢复步骤。

CI/CD 流程结构和 release 自动化的默认方案，统一写在 `docs/CICD.md`。
