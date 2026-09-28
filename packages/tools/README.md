# 工具包

Tool Runtime 拥有通用注册、prepared execution、权限准入、checkpoint 和有序结果提交。具体能力由独立 leaf package 拥有：

- `filesystem-read/`：read_file、list_directory。
- `filesystem-search/`：grep、glob。
- `filesystem-write/`：edit_file、write_file、delete_file。
- `shell-tools/`：bash、bash_output、bash_kill。
- `web-tools/`：web、web_search、web_fetch。
- `image-generation/`：generate_image。
- `image-inspection/`：inspect_image。
- `todo-tools/`：todo_read、todo_write。
- `browser-tools/`：Browser Bridge Adapter。
- `approval/`：Host 审批契约。

每个能力包有 Static Manifest、Behavior Entry、公开 exports 和自身 lifecycle。CLI / Desktop 从专用 Host port 提供实现。生产运行时采用 restart-only。

协议和边界见 [Tool 插件边界](../../docs/design-docs/agent-plugin-runtime/agent-tool-plugin-boundaries.md)。
