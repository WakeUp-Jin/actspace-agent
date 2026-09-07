# Agent 工具体验与轨迹布局调整 — 执行摘要

- 关联计划：[完成计划](../../exec-plans/completed/20260906-agent-tool-experience/README.md)
- 执行过程：[过程记录](execution-process.md)
- 执行模式：交互；用户已批准全部实现范围。
- 结果：实现、自动化与浏览器检查完成；真实 Electron IPC／Provider 验收未执行。

## 核心变更

| 项目 | 最终行为 |
| --- | --- |
| Thinking | Composer 设置经 IPC、DesktopApp、Runtime、Loop 进入请求；尊重模型能力、必选思考与 effort，并覆盖直接和代理传输。 |
| 参数与路径 | 参数分片仅显示稳定占位，prepared 后一次显示；状态和结果继续实时更新。内部路径相对显示，根为 `.`，外部绝对显示；Raw 与执行参数不变。 |
| 审批 | 默认仅 Bash 逐次操作审批；保留参数、路径、能力、Browser preflight 和硬拒绝检查。 |
| 轨迹 | 隐藏完整输入区，组件保持挂载；切回保留草稿、附件和模型，运行中提供 Stop。 |
| 子智能体 | 右侧 Running／Done 列表、详情与返回；委派开始记录子会话 ID，列表与执行内容持续刷新，会话切换和关闭清理轮询及迟到响应。 |
| Todo | 仅 id／merge 各补一句说明；新建省略 id，更新使用完整返回 id。activeForm、执行和界面不变。 |

## 已完成验证

- Desktop：`pnpm --filter @actspace/desktop test --maxWorkers=2`，87 个文件、615 项通过。默认并发曾使既有大日志测试超时，单独复跑及限制并发均通过，没有修改测试阈值。
- 受影响包：Core tools 16、Browser tools 6、Pi-ai 12、Subagent 6、Agent Loop 10、Shared 63 项通过；Todo 最小修复另有 Core Agent 11 项及临时会话真实 ToolRuntime 探针。
- 根 `pnpm typecheck`、`pnpm build` 通过；最后 Main 调整后 Desktop `typecheck` 和 `build:electron` 再次通过。
- Browser fixture：独立 renderer 端口 5175，浅／深主题，子智能体列表→详情→返回、轨迹隐藏输入区及 Stop、返回会话已操作查看。mock 只在显式测试页面，不进入产品入口。
- `pnpm check:docs`、`pnpm check:frontend-theme`、`git diff --check` 通过。独立验证服务已停止，用户原有开发服务未改动。

## 人工验证指引

1. 在更新后的 Electron 中选支持开关的模型，分别开启／关闭 Thinking 运行一轮；检查请求设置生效及思考折叠块显示。必选思考模型应遵循其能力，代理配置也需各验证一次。
2. 在临时工作空间运行 Read/List/Write 与 Bash：参数完成前仅稳定占位；文件工具不弹逐次操作审批，Bash 保留审批；内部路径相对显示，轨迹 Raw 保留原始参数。使用临时文件验证边界拒绝仍生效。
3. 输入草稿、添加附件并选择模型，切入轨迹：整个底部输入区消失；任务运行时 Stop 可用。切回会话确认三项状态保留。
4. 委派两个子智能体：右侧列表出现，完成顺序不影响身份；运行中打开详情能看到正文、Thinking 和工具，返回列表、切换会话及重开应用后仍对应正确任务。

## 验收边界

Computer Use 按日志中的 Electron app ID 和路径获取应用均返回 `Invalid app`，因此未完成真实 Electron 交互；没有重启用户应用或调用真实 Provider。浏览器 mock、构建和单元测试不能替代以上真实宿主验收。未提交、推送或操作用户 Todo；其他工作区改动保留。
