# 执行过程

- 用户确认自动匹配加手动覆盖；检查到新建连接默认 reasoning=false、内部 OpenRouter 身份污染自定义 Chat 编码。
- 保留现有 Composer、会话和工作区并行修改，只编辑相关片段。

- shared 契约、SettingsService/ModelStore、Composer/设置表单及直连/代理 payload 已实现；自动匹配不猜强度，手动配置持久化。
- CheapRouter 对显式 `reasoning_effort: high` 返回 HTTP 200；无效强度探测超时，未宣称中转内部生效。
- 52 个 focused UI/Host 测试、35 个 pi-ai 测试通过；Desktop typecheck、Electron/Renderer build、docs check 通过。
- 全量 Desktop 681 项中 680 通过；唯一失败是并行工作区修改相关的 Add workspace 测试。
