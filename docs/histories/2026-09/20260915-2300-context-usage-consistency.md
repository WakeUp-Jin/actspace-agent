## [2026-09-15 23:00] | Task: 修复上下文百分比口径不一致

### Execution Context

- Agent: Codex / root
- Base model: GPT-6
- Runtime: Codex Desktop

### 用户诉求

会话顶部、上下文弹窗和输入框显示不同百分比，需统一并修复。

### 变更

- `fixed-renderer-projection.ts` 从最近请求的完整 ContextState 派生 ContextUsageSnapshot；累计 provider usage 仅保留为 cumulativeTokens，不再除以模型窗口。
- Composer 优先使用完整 ContextState；WorkbenchLayout 不再用整体序列化估算覆盖完整分项投影。
- 移除 Composer、ConversationView、ContextRenderView、WorkbenchLayout 和 SessionHoverPreview 中累计 provider usage 到 Context 的回退链路。共享旧适配函数暂无消费者，本轮保留导出以避免额外接口清理。
- WindowChromeBar 每次打开顶部详情重新取数，保留进行中的请求去重。
- 更新 Token Usage 与 Context Projection 设计文档；补充累计量与当前占用口径的学习速记（命中可迁移、有陷阱两条）。

### 验证

- Desktop focused Vitest：6 files / 138 tests passed。
- 回归红绿：原实现下累计 549K 与分项 49K 投影、Composer 百分比测试失败；恢复旧 Workbench 优先级与顶部缓存逻辑后，整页一致性及重开刷新测试失败。恢复修复后全部通过。
- Runtime dependency build、Desktop typecheck、renderer build、Electron build、check:docs、本次涉及文件的 git diff --check 通过。全工作区检查发现另一个并行修改的测试文件有行尾空格，本轮未修改该文件。
- 最初 Electron 构建因依赖 dist 落后于当前工作区源码失败；重建依赖后通过。
- 真实 Electron 窗口验收尚未完成：日志中的开发实例在 Computer Use 中不可用，当前可发现的 ActSpace 是已安装实例；没有以旧实例冒充本次构建的验收。
- 保留工作区其他并行修改，未提交。

### 验收路径

启动本次构建的桌面端，打开已有会话，比较顶部详情、输入框百分比与 ContextPopup；关闭详情并在请求完成后重新打开，确认数字更新。这里只需观察已有数据，不需要为验收发送真实 Provider 请求。
