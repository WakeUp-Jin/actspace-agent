# Request 模型事实与设置状态的边界

这次 Context 面板改造暴露了一个可迁移的 Agent 架构原则：模型配置是可变设置，某次请求实际使用的模型能力则是不可变的请求事实。两者不能只靠 UI 当前选择互相替代。

## 为什么要在 prepare 阶段固化事实

请求真正发送前，Agent Loop 已经完成 route、model 和消息组装。此时解析 `contextWindow` 并写入 `request/header` 与 `request/context.prepared`，可以让后续投影回答“这次请求按什么容量计算”，而不是回答“现在设置页默认是什么”。重试请求复用同一组事实，也能避免运行中设置变化导致同一轮显示漂移。

## 与 settings 的关系

- `settings.json` 保存用户可修改的模型定义、默认模型和任务绑定。
- Session Journal 保存某次请求的 model facts 和完整 request snapshot。
- Renderer 只消费 Journal projection；旧 Session 没有该字段时显示未知，不填入看似合理的默认值。

## 常见陷阱

1. 在 renderer 中直接读取当前选中模型，会把历史请求错误地映射到新模型。
2. 为兼容旧数据写入固定 200K，会把“未知”伪装成“确定”，并让百分比产生误导。
3. 只记录 provider usage 两桶，会丢失 system prompt、rules、skills、tool definitions 等实际上下文组成。

对应变更记录：`docs/histories/2026-09/20260902-0015-context-model-facts-and-popup.md`。
