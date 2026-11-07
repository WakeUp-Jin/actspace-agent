# Composer Slash Command 验收基线（归档）

从 `front-composer-slash-command.md`（已并入 `front-聊天输入框规范.md`）迁出。

## 自动化

- Slash 查询解析、过滤、排序和空态有纯函数测试。
- Composer 测试覆盖打开、关闭、过滤、键盘导航、IME、防误发送和浮层互斥。
- 模式切换、Context、Review、Compact 与 Skill 绑定分别有行为测试。
- `/compact` 的 App 路由测试继续通过，Slash 入口不创建普通 user message。
- 主题防回流检查通过。

## 浏览器 Renderer

- initial / follow-up、inline / stacked、普通宽度 / 480px 窄窗。
- Light / Dark 下默认、active、selected、loading、empty、error、disabled 状态。
- 菜单不遮挡发送按钮，内部滚动不带动消息区滚动。

## Electron 真实验证

- 真实 `skills.list` 加载、workspace 切换后的 Skill 刷新和 Retry。
- `/compact` 走真实 IPC，不要求调用付费模型。
- 自动化和浏览器结果不能替代 Electron main / preload / IPC 验收。

## V1 决策摘要

- 只有 `Functions` 与 `Skills` 两组；Functions 为 Plan、Agent、Compact、Context、Review（后增 `/side`）。
- Model、Reasoning、Image、New chat 不进 Slash；`/` 与 `+` 复用行为和 Skill registry，但不要求菜单内容一致。
- 不做自定义、排序、收藏、最近使用、频率统计，不做跨进程通用 Command Registry，不持久化菜单状态。
