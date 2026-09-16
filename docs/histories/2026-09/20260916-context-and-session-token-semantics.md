## [2026-09-16] | Task: 区分当前 Context 与会话累计 Token

### 用户诉求

Context 统计应表示当前模型请求实际携带的上下文；压缩后上下文可以变小。会话累计 Token 需要独立展示。

### 变更

- 将 Context 投影集中到共享的 `projectContextState`，分页浏览缓存只截短预览，不截短统计数值。
- Context 状态增加 `basis`，区分当前请求、最近一次请求和下次请求预计上下文。
- 按用户最终确认的简约展示：顶部会话详情只显示一行「累计 Token：315K」，移除上下文占用行、进度条和累计用量下拉说明；Context 弹窗与右侧面板标题统一为「上下文」。
- 压缩后从有效 Surface 计算下次请求预计上下文，避免把历史已压缩消息算回去。

### 验证

- 固定渲染投影回归测试覆盖分页预览截断。
- shared、session projection、runtime 构建通过。
- Desktop 全量 typecheck 仍受工作区已有测试类型错误阻断，Electron main/preload typecheck 单独通过。
