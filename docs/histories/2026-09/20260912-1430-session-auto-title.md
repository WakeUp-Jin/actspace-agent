# 首条消息自动生成会话标题

## 用户诉求

新会话一直显示 New Chat，需要手动改名；恢复设计中的首条消息自动生成标题。

## 原因与变更

- App 创建 IPC 把占位文字持久化成正式标题，DesktopAppService 的空标题判断因此跳过命名。创建时不再提交占位标题。
- 原实现仅截断首条文本；现接入独立 utility route，遵循轻量任务模型及主模型回退配置，不要求 utility 模型具备工具能力。
- 会话级后台命名不阻塞主回复；错误、空输出、超时采用首条文本摘要。取消和串行写入保证手动命名优先，dispose 回收任务。
- Journal 提交观察器在合并 revision 时保留标题变化，App 同步侧栏和窗口标题。
- 历史标题不批量改写；纯图片无文本暂不命名。

## 验证

- 修复前运行新增服务回归，4 个用例因未调用标题模型而失败；修复后服务套件 11/11 通过。
- 覆盖后台生成、只生成一次、显式标题、手动改名竞态、错误与空输出兜底、多模态文本提取、dispose 取消。
- 主进程相关测试 10/10 通过；renderer 标题刷新与消息发送回归 2/2 通过。覆盖 utility 模型连接路由、Journal 通知合并、真实 Cordis carrier 和 renderer 占位/标题刷新。
- DesktopApp 构建、Electron main/preload 构建、Vite renderer 构建通过。
- Desktop 完整 typecheck 最终通过；早先并行工作中的 ProviderSettings description 缺失已由对应工作修正，本任务未修改该文件。
- 当前运行的是安装版 ActSpace，不是本次源码开发实例；真实 Provider 与新构建 Electron 首条消息验收仍需完成。

## 同类排查

App 其余三处 New chat 是本地预览或读不到会话时的显示兜底，不走创建 IPC，无需改动。手动输入 New chat 视作明确标题，继续保留。未迁移历史占位数据。

## 学习沉淀

命中可迁移、竞态陷阱和重复模式，新增 `docs/learnings/2026-09/background-title-ownership.md`。
