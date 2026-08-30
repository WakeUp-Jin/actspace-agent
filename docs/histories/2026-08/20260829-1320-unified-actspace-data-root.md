# 统一 ActSpace 数据根目录

- **用户诉求**：CLI 与 Desktop 不应默认把 Session 写入两个不同的数据目录；统一目录名为大小写敏感的 `ActSpace`，并检查旧数据目录的清理边界。
- **主要变更**：新增跨 Host 的平台数据根解析契约；CLI 与 Electron Desktop 默认使用同一 canonical root；macOS 使用 `~/Library/Application Support/ActSpace`，Linux 使用 `$XDG_DATA_HOME/ActSpace` 或 `~/.local/share/ActSpace`，Windows 使用 `%APPDATA%/ActSpace`；显式 `--data-dir` 与 `ACTSPACE_DATA_DIR` 继续优先。
- **命名同步**：Desktop `productName` 与默认显示名统一为 `ActSpace`。
- **数据安全边界**：旧 lowercase data root、v1 `sessions/`、Electron Cache 和历史运行时数据不在本轮自动删除或混合读取；需要迁移时必须另立可审核流程，避免静默丢失用户 Session 或凭据。
- **验证**：新增跨平台优先级测试，并执行 typecheck、CLI/Desktop 回归、文档检查和 `git diff --check`。
