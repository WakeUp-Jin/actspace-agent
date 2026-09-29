# 单一 Agent 形态与三模式

## 用户诉求

将已讨论的唯一插件组合形态、Chat/Plan/Agent 三模式和 Chat 两工具边界整理为设计规范及执行计划，先审核后实施；用户随后明确授权开始执行。

## 本轮变更

- 新增 `docs/design-docs/agent-runtime/agent-forms-and-modes.md`，区分已确认方向与 D1–D5 实施建议。
- 新增 `docs/exec-plans/active/20260928-agent-forms-and-modes.md`，列出迁移位置、任务、失败回退、自动化与 Computer Use 验收点。
- 登记设计与计划索引，在旧 Chat 设计顶部链接后续目标，保留当前行为说明。

用户授权后在同一任务继续实施：

- `packages/core/agent/` 的唯一形态清单包含 Prompt、Core Tools、Todo、Subagent、Compaction 和可选 Browser。每个 AgentScope 绑定成员工具贡献，释放时清理；Prompt contributor 也跟随作用域生命周期。
- `packages/tools/runtime/` 引入可信 Agent 绑定，在准入和执行体前按模式校验；Chat 仅 `web` 与 `generate_image`，Plan/Agent 使用显式名单。
- Journal/Header、Projection、Desktop App Service、Headless、Composer 接入持久的模式与 revision，fork 按截断点重放，旧 preset 只读兼容。
- 客户端实时 Journal 投影同步模式修订号，Desktop 切换成功后刷新会话；缺工作区时显式选择目录。Core Tools 向 Desktop 暴露按 Session 查询的后台 Bash 任务状态，任务运行时拒绝切换。
- 更新旧 Chat 规范、发布记录和执行摘要；没有第二形态、插件市场或工具包物理拆分。

自动化通过 typecheck、build、限制并发的 Desktop 837 项、Core Agent/Loop/Tool Runtime/Runtime fork 专项以及主题 token 检查。首次默认并发全仓测试有 5 秒超时；停掉 dev watcher 并调整真实进程 CLI 用例超时后，全仓 `pnpm test` 通过。Computer Use 验证菜单和同会话切换，外部服务、深色窄窗口等实机点未覆盖，详见执行摘要。插件作用域与模式门禁的通用经验另记学习文档。

继续实机验收时，首次 Chat 搜索揭示同一 AgentScope 的 Prompt contributor 重复注册；模式贡献改为单一 registry 内替换，失败时恢复旧集合，并补回归测试。真实 Chat 搜索和生图、Plan 读文件和 Todo 均通过，Journal 请求快照分别证明 Chat 恰好两个 schema 和 Plan 十工具集合。深色菜单及旧 Chat 会话恢复已实机验证；设置中的旧“Chat 形态”文案同步为“Chat 模式”。本轮 typecheck/build 与限制并发的桌面 837 项通过，默认并发全仓测试仍有长渲染用例的 5 秒超时。

最终又以受控无工作区 Session 验证切 Plan 被拒绝且 mode/revision 不变；重启当前工作树 Electron 后确认 Chat 与历史保留，实机 fork 及 Journal 检查确认新会话继承边界处模式。窄窗口、无工作区目录选择、附件不兼容和子任务期间切换仍未实机覆盖。

隔离 fork 上补做后台 Bash 审批和阻塞路线：`sleep 90` 经审批后后台运行，切换返回 `SESSION_BUSY`；完成通知收束后切回 Chat 成功。UI 直显内部码已改为可读提示，相关 Desktop 类型检查及 50 项测试通过。子任务切换和新版提示的实机复测仍留在执行摘要。

## 文档验证

- 新设计与计划的 Markdown 链接均可解析；`node scripts/check-current-docs.mjs` 和 `git diff --check` 通过。
- `pnpm check:docs` 被既有 `20260926-site-homepage-redesign.md` 在 active 中声明已完成的生命周期问题阻塞，本轮未改动该计划。

## 2026-09-29 补充实机验收

隔离 fork 的 Chat→Plan→Chat 保留正文和临时附件；不兼容格式发送明确报错、草稿保留，Journal 未创建新轮次。浅色半屏窄窗口的模式菜单、错误、焦点和 Composer 无裁切，侧栏自动收起。Plan/Agent 的“自动”权限保持。临时草稿已清理，应用恢复 Chat、原窗口尺寸和侧栏；剩余验收仍见执行摘要。

## 2026-09-29 main 集成验证

按用户授权创建 `codex/agent-forms-and-modes` 并提交功能，再集成 main 的工具拆包及 Chrome 连接改动。形态成员改为七个独立工具插件；后台任务查询迁入可选 Shell 服务；保留工具 scope 拒绝审计与动态模式门禁、Todo 投影贡献、附件准入计数和模式校验。旧 Core Tools 源码继续退役。

合并版本通过 typecheck、build、package boundaries、current docs；Desktop 119 文件/868 测试、Runtime 35、Tool Runtime 29、Core Agent 18、Agent Loop 20、CLI 13、Shell 6 测试通过。原先尚未覆盖的实机门禁仍保留，集成版本未重新运行整套 Electron 实机路线。
