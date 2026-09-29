# Tool 插件边界与 Todo 领域事件

状态：实现完成，自动化验收结果见 [执行摘要](../../exec-runs/20260928-tool-plugin-boundaries/execution-summary.md)。

## 领域包

Tool Runtime 只拥有注册、参数验证、权限准入、prepared execution、调度、checkpoint 和有序结果提交。具体工具定义、permission contract、Node Host 实现与清理逻辑由各工具包拥有。Runtime 的 Profile composition 依赖各包的 Static Manifest，公开 Runtime API 不再转导出具体 executor。

| 包 | 工具 | Host port |
|---|---|---|
| `@actspace/tools-filesystem-read` | read_file、list_directory | `actspace.host.tools.filesystem-read` |
| `@actspace/tools-filesystem-search` | grep、glob | `actspace.host.tools.filesystem-search` |
| `@actspace/tools-filesystem-write` | edit_file、write_file、delete_file | `actspace.host.tools.filesystem-write` |
| `@actspace/tools-shell-tools` | bash、bash_output、bash_kill | `actspace.host.tools.shell-tools` |
| `@actspace/tools-web-tools` | web、web_search、web_fetch | `actspace.host.tools.web-tools` |
| `@actspace/tools-image-generation` | generate_image | `actspace.host.tools.image-generation` |
| `@actspace/tools-image-inspection` | inspect_image | `actspace.host.tools.image-inspection` |
| `@actspace/tools-todo-tools` | todo_read、todo_write | Session / Projection 服务 |

`browser-tools` 保留原有 Browser Bridge Host 边界。文件工具之间不复用注册、permission audience 或 Host factory；小型路径校验 helper 保存在各自包内，均复用 Tool Runtime 的 canonical resource 契约。

## 启动与生命周期

1. Profile / Bundle 组合各插件 manifest，Patch 可以禁用或移除一个工具 entry。
2. Boot 仅加载启用插件的 Codec。内置 Codec 根据已准入的 transport/package 元数据从公开 `./codec` export 加载。
3. checked-in `cordis.yml` 与可信 transport inventory 校验一致，再由 Include 的启动 patches 将禁用结果应用到真实插件树。
4. Todo Behavior 注册 Contributor；SessionReadModel 在创建 registry、安装通用事实 projection 后统一应用 Contributor，再 ensureSession / restore / replay。
5. 工具 Behavior 从专用 Host port 创建资源，注册工具，并在 Context effect 清理时 drain/dispose registrations 和 Host 资源。注册失败回滚本次已注册项。

生产仍为 restart-only：配置变化通过 `requestRestart` 进入 `restartRequired`，启动 patches 不提供在线热替换。

## 权限和 Scope

文件读、搜索、写分别使用 `actspace.filesystem-read`、`actspace.filesystem-search`、`actspace.filesystem-write` audience，permissionDomain 等于对应包名，policyVersion 为 1。Desktop 仅信任这三个 audience。旧聚合插件的 grant 不会转换或匹配到新插件。

Agent Loop 将可见工具集合传入 `ToolPreparedEnvironment.allowedToolNames`。Tool Runtime 在参数解析、permission admission 和 body 前再次检查；越界调用返回 `TOOL_SCOPE_DENIED`，写入 `permission/scope-denied`，不执行 body。插件未装载或已卸载时 registry 拒绝调用，错误为 `TOOL_NOT_FOUND`。

## Todo 事件断点

- owner：`actspace.todo`。
- type：`plugin/actspace.todo/todo-write`。
- eventVersion：1；criticality：required。
- TodoService、工具 schema、Codec、`todos` projection 全部由 `todo-tools` 拥有。
- Todo item 按 `todoId + revision` 合并；替换列表对遗漏项写 cancellation delta。
- Core Journal 只有 12 个核心 Codec。旧 `todo/write` 没有兼容 Codec，也不做转换或数据迁移。
- 旧 required Todo 事件产生 `UNKNOWN_REQUIRED_CODEC`，Session accessState 为 browse-only；新 Todo 插件不会解释旧事件。

Projection Contributor 必须在 Session 读取前注册。注册重复 Contributor id 或重复 projection key 会失败；首次应用后禁止追加 Contributor。Contributor 不拥有事件订阅、第二套快照服务或独立 projection cache。

## 后续边界

Plan Profile / Plan preset 由后续大设计决定。本轮只实现通用 scope 输入。真实 Provider、Chrome、Electron packaged lifecycle、签名和公证需要各自的外部验收，本轮自动化结果不代表这些门禁通过。
