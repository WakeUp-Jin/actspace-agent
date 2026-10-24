# Renderer mock 场景矩阵 2026-10-22

方法：Playwright Chromium headless访问当前Vite renderer `http://127.0.0.1:5173/?mock=...`，每个场景独立页面，1280×900，等待场景所需延迟，记录 pageerror/requestfailed、正文首屏和截图。不是Electron/preload/IPC/持久化验收；场景内mock reject不当产品失败。

## 结果

11个当前文档场景均加载，pageerror/requestfailed均0，body非空，滚动宽度等于1280：`empty`、`no-workspace`、`streaming`、`long-session`、`context-pagination`、`approval-pending`、`approval-prefix`、`remote-host`、`sidebar`、`turn-deliverables`、`subagent-trajectory`。每个截图和汇总在 `tmp/codex-acceptance/20261021-actspace-full-acceptance/renderer-mock-20261022/`。

可见关键状态包括：无工作区发送提示、streaming运行中消息、40轮历史、审批/command_prefix卡、Host离线/读取失败、侧栏分组分页、轮尾改动与交付卡、子轨迹父会话。该批只证明renderer mock渲染和首屏数据，不把对应P2-D/F项或F8完整E1–E11记为通过；真实Electron/IPC、键盘/主题/窄窗、错误重试和后端契约仍按各自报告区分。
