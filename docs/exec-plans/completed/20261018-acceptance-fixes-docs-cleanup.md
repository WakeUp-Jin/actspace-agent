# 验收缺陷修复与文档迁出

状态：实现与文档迁出完成。定向复验结果和未覆盖边界见[执行摘要](../../exec-runs/20261018-acceptance-fixes-docs-cleanup/execution-summary.md)；按用户授权一次提交并创建 PR，不自动合并。

基线：`main`，`a13f8a1ee10eed387da575d80ac000cc844f2bff`。

## 范围与顺序

1. 依据 [缺陷交付](../../exec-runs/20261018-recent-features-acceptance/bugs.md)，修复 WA-01 队列恢复、WA-02 审批触控尺寸、DA-01 窄窗布局、DA-02 别名路径产物卡、DA-03 历史轨迹性能指标及 Runtime 生命周期测试超时。先复现、确认根因，再做最小修复和回归。
2. 按 [DOCS 清理计划](../../exec-runs/20261018-docs-audit/cleanup-plan.md) 更新漂移内容；31 个 HTML 及本地依赖先备份到桌面、校验 SHA-256，再从仓库移除；2 个待实现 Demo 和 8 个教学/工具 HTML 保留。历史记录保持原始语境。
3. 运行受影响包测试、类型检查、构建和文档约束；由 gpt-6.1-sol 执行定向 Computer Use 复验，未覆盖项继续明确记录。
4. 检查差异与秘密信息，更新 history / 执行摘要；仅提交本轮变更，一次 commit，push 修复分支，创建指向 main 的 PR。

## 完成标准

- 已确认缺陷有回归证据；真实交互、工程检查和未覆盖项分别报告。
- 桌面备份可恢复，原始 HTML 哈希一致，仓库当前链接与计划索引有效。
- 不删除既有用户数据，不改写 Git 历史；PR 待审，不自动合并。
