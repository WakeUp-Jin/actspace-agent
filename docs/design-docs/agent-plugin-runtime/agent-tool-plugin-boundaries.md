# Tool 插件边界与 Todo 领域事件

已实现；自动化验收结果见 [执行摘要](../../exec-runs/20260928-tool-plugin-boundaries/execution-summary.md)。

## 领域包

Tool Runtime 只拥有注册、参数验证、权限准入、prepared execution、调度、checkpoint 和有序结果提交，另外定义两份能力授予的形状（`src/host-ports.ts`）：`actspace.host.filesystem`（`FilesystemHostGrant`：工作区根、artifact 解析、ripgrep 路径）和 `actspace.host.process`（`ProcessHostGrant`：工作区根、临时目录、强制结束钩子）。具体工具定义、permission contract、Node 实现与清理逻辑由各工具包拥有。Runtime 的 Profile composition 依赖各包的 Static Manifest，公开 Runtime API 不再转导出具体 executor。

文件和 Shell 工具的实现随 Harness 产物打包（插件 `apply` 用授予里的根目录创建自己的 `node-ports`），Host 只保留能力门禁、审批和授予；授予是可选注入，没有时工具注册但返回 `CAPABILITY_UNAVAILABLE`。网页和图片工具仍由 Host 端口构造实现（凭据和模型绑定在 Host）。

| 包 | 工具 | Host 侧 |
|---|---|---|
| `@actspace/tool-fs-read` | read_file、list_directory、present | 授予 `actspace.host.filesystem`（可选） |
| `@actspace/tool-fs-search` | grep、glob | 授予 `actspace.host.filesystem`（可选） |
| `@actspace/tool-fs-write` | edit_file、write_file、delete_file | 授予 `actspace.host.filesystem`（可选） |
| `@actspace/tool-shell` | bash | 授予 `actspace.host.process`（可选）、`actspace.host.background-tasks`、`actspace.host.session` |
| `@actspace/tool-background-tasks` | task_list、task_output、task_stop | `actspace.host.background-tasks` |
| `@actspace/tool-web` | web、web_search、web_fetch | `actspace.host.tools.web-tools` |
| `@actspace/tool-image-generation` | generate_image | `actspace.host.tools.image-generation` |
| `@actspace/tool-image-inspection` | inspect_image | `actspace.host.tools.image-inspection` |
| `@actspace/tool-todo` | todo_read、todo_write | Session / Projection 服务 |

`browser-tools` 保留原有 Browser Bridge Host 边界。文件工具之间不复用注册、permission audience 或 Host factory；小型路径校验 helper 保存在各自包内，均复用 Tool Runtime 的 canonical resource 契约。

## 启动与生命周期

1. Profile / Bundle 组合各插件 manifest，Patch 可以禁用或移除一个工具 entry。
2. Boot 仅加载启用插件的 Codec。内置 Codec 根据已准入的 transport/package 元数据从公开 `./codec` export 加载。
3. checked-in `cordis.yml`（由插件清单 `PLUGIN_CATALOG` 生成）与可信 transport inventory 校验一致，再由 Include 的启动 patches 将禁用结果应用到真实插件树。
4. Todo Behavior 注册 Contributor；SessionReadModel 在创建 registry、安装通用事实 projection 后统一应用 Contributor，再 ensureSession / restore / replay。
5. 工具 Behavior 创建资源（文件 / Shell 用能力授予自己建 Node 实现，网页 / 图片从专用 Host port 取），注册工具，并在 Context effect 清理时 drain/dispose registrations 和这些资源。注册失败回滚本次已注册项。

Host/codec 变更仍需受控重启；执行工具由独立 Harness 装配，新选择只影响后续 Run，旧 Run 的工具树保留至租约释放。启动 patches 不原位修改已运行的树。

## 权限和 Scope

文件读、搜索、写分别使用 `actspace.filesystem-read`、`actspace.filesystem-search`、`actspace.filesystem-write` audience，permissionDomain 等于对应包名，policyVersion 为 1。Desktop 仅信任这三个 audience。旧聚合插件的 grant 不会转换或匹配到新插件。

Agent Loop 将可见工具集合传入 `ToolPreparedEnvironment.allowedToolNames`。Tool Runtime 在参数解析、permission admission 和 body 前再次检查；越界调用返回 `TOOL_SCOPE_DENIED`，写入 `permission/scope-denied`，不执行 body。插件未装载或已卸载时 registry 拒绝调用，错误为 `TOOL_NOT_FOUND`。

## Todo 事件断点

- owner：`actspace.todo`。
- type：`plugin/actspace.todo/todo-write`。
- eventVersion：1；criticality：required。
- TodoService、工具 schema、Codec、`todos` projection 全部由 `todo-tools` 拥有。
- Todo item 按 `todoId + revision` 合并；替换列表对遗漏项写 cancellation delta。
- Core Journal 只有 14 个核心 Codec。旧 `todo/write` 没有兼容 Codec，也不做转换或数据迁移。
- 旧 required Todo 事件产生 `UNKNOWN_REQUIRED_CODEC`，Session accessState 为 browse-only；新 Todo 插件不会解释旧事件。

Projection Contributor 必须在 Session 读取前注册。注册重复 Contributor id 或重复 projection key 会失败；首次应用后禁止追加 Contributor。Contributor 不拥有事件订阅、第二套快照服务或独立 projection cache。

## 后续边界

当前唯一主形态具有 Chat / Plan / Agent 三种模式；工具集合通过形态贡献、模式白名单和委派上限收窄，详见[形态与模式](../agent-runtime/agent-forms-and-modes.md)。真实 Provider、Chrome、Electron packaged lifecycle、签名和公证需要各自的外部验收，本轮自动化结果不代表这些门禁通过。
