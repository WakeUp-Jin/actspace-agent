# Tool 插件边界拆分与 Todo 领域迁移 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260928-tool-plugin-boundaries.md`
- **执行过程**：`docs/exec-runs/20260928-tool-plugin-boundaries/execution-process.md`
- **执行模式**：交互
- **执行结果**：实现完成；自动化与外部门禁分层记录如下

## 核心变更

| 变更 | 位置 | 结果 |
| --- | --- | --- |
| 独立工具插件 | `packages/tools/{filesystem-read,filesystem-search,filesystem-write,shell-tools,web-tools,image-generation,image-inspection}/` | 各包拥有 manifest、Behavior、Host port、工具、权限和清理；聚合 `core-tools` 已退役 |
| Todo 领域插件 | `packages/tools/todo-tools/` | `todo_read`、`todo_write`、required Codec 和 `todos` Projection Contributor 归属同包 |
| 通用内核 | `packages/tools/runtime/`、`packages/session/projection/` | 调用时 scope gate；Contributor 在 restore 前应用 |
| 启动组合 | `packages/runtime/`、`apps/cli/`、`apps/desktop/` | 启用插件才装载 Codec 与 Behavior；生产仍为 restart-only |
| 协议断点 | `packages/session/journal/` | 旧 `todo/write` 不兼容、不迁移；旧 required 事件为 `UNKNOWN_REQUIRED_CODEC` / browse-only |

## 验收点与结果

| 验收点 | 结果 | 证据 |
| --- | --- | --- |
| 七个插件包与 Todo 的 manifest、exports、lifecycle、独立注册与 dispose | 通过 | package boundary 检查、各包测试、Runtime 跨包测试 |
| 参数错误、缺失能力、scope deny、权限 audience 与 executor 故障 | 通过 | `packages/runtime/src/test/tool-contracts.test.ts`、Tool Runtime 权限测试 |
| 新 Todo 写入、Journal、projection、读回及持久化 checkpoint 恢复 | 通过 | `packages/tools/todo-tools/src/test/lifecycle.test.ts`、`packages/runtime/src/runtime/session-projection.test.ts` |
| 旧 Todo Journal 明确降级、拒绝 resume，无兼容 Codec | 通过 | 持久 JSONL fixture 与 Codec 测试 |
| 禁用 Shell/Todo 后实际 Cordis 不挂载、Codec 不装载；变更要求重启 | 通过 | `packages/runtime/src/runtime/tool-composition.test.ts` |
| CLI 真实进程启动/退出 | 通过 | `pnpm test:agent-cli:process`：2/2 |
| 全仓 build、typecheck、test | 分层复核完成；默认全量测试未通过 | `pnpm build`、`pnpm typecheck` 通过。默认 `pnpm test` 的 Desktop 部分有 14 项 5 秒超时、822 项通过；修复旧测试 import 后，4 worker / 15 秒的完整 Desktop 复跑为 834 通过、3 项 UI 超时。受影响的 Desktop Host/Projection/图片配置定向测试通过；3 项超时所在文件以单 worker / 30 秒复核，27/27 通过 |
| package cutover、current docs、Desktop build graph、仓库卫生 | 通过 | 对应检查命令退出 0；cutover 输出仍有两项站点历史 `/eval` 发现 |
| `pnpm check:docs` | 受独立计划阻塞 | 官网首页 active 计划顶部已声明完成，但该计划 T10 尚未完成；本轮未更改 |
| 真实 Provider、Chrome/Browser、Electron packaged、签名、公证 | 未覆盖 | 各自仍需外部门禁；自动化结果不替代真实环境验收 |
| Computer Use UI 验收 | 未覆盖 | 本轮没有 renderer/UI 变更；没有进行真实界面操作 |

## 人工验证指引

1. **旧会话升级风险**：在隔离的数据副本中打开含旧 required `todo/write` 的 Session。预期仍可浏览已有历史，诊断为 `UNKNOWN_REQUIRED_CODEC`，不能继续执行；不要用原始用户数据做写入实验。
2. **真实 Desktop 主 Agent**：启动 `pnpm dev:log`，创建新 Session，要求模型使用 Todo 工具写入并读取，再关闭重启后打开该 Session。预期 Todo 内容与状态一致，诊断无 projection key 冲突。此项依赖真实模型与 Electron 环境，未在本轮执行。
3. **安装态组合**：在正式打包环境验证工具 Host port、图片/网络配置和关闭清理，再执行签名、公证与 Browser Bridge 门禁。当前自动化 build 只证明源码与构建链路。

## 已知边界

- 不提供旧 `todo/write` 事件兼容、转换或数据迁移。需要旧 Todo 的 Session 应留在旧版本读取。
- Plan Profile/preset 属后续独立设计；本轮只提供通用 scope 强制检查。
- `pnpm check:docs` 的官网计划状态错误和 cutover 中两项站点 `/eval` 发现不属于本计划修改范围，应由站点任务分别处理。
