# Permission Runtime 基础切换

## 用户诉求

重新设计权限模块，不保留旧兼容策略；先交付可独立使用的基础权限 Runtime 和一次审批，把 Desktop Session Grant、project 持久化与跨平台 sandbox 留到独立后续计划。

## 本次改动

- 权限模式直接收敛为 `default/full-access`，删除 `trusted/yolo` 及自动批准分支。
- Tool Runtime 使用结构化 file/process resource，统一执行全局边界、工具判断、一次审批和审批后复验。
- 文件工具在 admission 与 syscall 前分别解析资源，覆盖 missing target、symlink、非普通文件、敏感配置和 protected 路径。
- Bash 与删除保持逐次审批；`full-access` 不改变 Bash sandbox，也不绕过敏感资源规则。
- 新增 strict `permission/mode-set`、`permission/asked`、`permission/decided`、`permission/scope-denied` 事件；Session 恢复当前 mode。
- Desktop 和 CLI 统一为 `once/deny`，Desktop 增加 mode 控件；删除旧 `allow_similar` 与 Browser Session approval cache。
- 修复初始 projection revision 为 `-1` 时第一份 Session envelope 被错误忽略的问题。

## 兼容性影响

- 不迁移旧权限 mode、approval decision、preset 或 required permission event。
- 受影响的历史 Session 只能 browse-only，不能按旧权限语义恢复执行。
- Session Grant 尚未实现；后续只在 Desktop 文件 exact/subtree 场景单独交付。

## 验证

- 全仓 typecheck 通过。
- Tool Runtime、core-tools、Journal、Projection、Client、CLI 与 Desktop 自动化通过。
- 文档门禁、contract matrix 漂移检查、旧符号扫描和 `git diff --check` 通过。
- 真实 Electron 主题矩阵、真实 Browser、跨平台 sandbox、DMG、签名和 notarization 保留为人工或独立验收边界。
