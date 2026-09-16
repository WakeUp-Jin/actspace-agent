# 当前上下文与会话累计 Token

状态：实现与自动化验证完成。真实窗口自动验收受 macOS 锁屏阻断；用户随后提供截图并要求简化展示，已按反馈完成。

## 范围与约束

- Shared 统一 Context 估算；Runtime 浏览缓存只缩减预览，升级缓存版本自动重建。
- Desktop、Session Projection 消费同一份统计，按 Journal 水位选取较新数据。
- 压缩后至下一次请求之间，使用有效 Surface 和最近请求的系统/工具配置估算；摘要只统计一次。按最终反馈，界面标题统一「上下文」，顶部只保留「累计 Token：xxx」。
- 顶部详情显示累计已报告用量；不修改 Journal 或 provider usage，不提交其他工作区改动。
- 只修改上述数据链、相关组件、测试和文档。回退通过恢复本轮差异及重建浏览缓存完成，保留用户日志。

## 步骤与验证

1. 已复现：分页将 52 条消息裁成 20 条，再估算造成少算。投影测试红跑 20,250 与 106,000 不一致。
2. 已实现：共享投影、缓存统计、压缩预计、累计用量展示。
3. 执行：完整/分页/历史页/冷启动缓存一致性测试；压缩前后、下次请求和累计不下降测试；UI 用量与标签测试。
4. 执行：依赖构建、Desktop 类型检查、renderer/Electron 构建、文档检查；Computer Use 查看真实会话顶部与输入框数值。

## 必读

`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/model-context/agent-token-usage-and-context-state.md`、`docs/FRONTEND_VERIFICATION.md`。
