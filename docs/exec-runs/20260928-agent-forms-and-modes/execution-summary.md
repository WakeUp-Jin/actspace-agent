# 单一 Agent 形态与三模式 — 执行摘要

## 基本信息

- 关联计划：`docs/exec-plans/active/20260928-agent-forms-and-modes.md`
- 执行过程：`docs/exec-runs/20260928-agent-forms-and-modes/execution-process.md`
- 执行模式：交互
- 执行结果：代码实现、真实 Chat 搜索/生图、Plan 只读探索/Todo 与主要 Electron 路线已验证；部分交互路线仍未覆盖

## 核心变更

| 变更 | 主要位置 | 结果 |
|---|---|---|
| 唯一 Agent 形态 | `packages/core/agent/src/agent-form.ts`、`packages/runtime/src/runtime/agent-factory-plugin.ts` | 每个 AgentScope 激活成员贡献，释放时清理；Header 保存实际成员与组合摘要 |
| 三模式工具边界 | `packages/core/agent/src/agent-mode-policy.ts`、`packages/tools/runtime/src/` | Chat 仅 `web`、`generate_image`；Plan/Agent 显式集合；生产 Runtime 从可信绑定校验 |
| 持久模式 | `packages/session/journal/`、`packages/runtime/src/projection/`、`packages/desktop-app/src/service.ts` | 模式事件、revision、fork、重建索引与 Run 接纳贯通 |
| Desktop/Headless/UI | `apps/desktop/src/`、`packages/headless/src/runner.ts`、`packages/client/src/sessions/session.ts` | 同会话三模式菜单与 IPC；按模式决定 Prompt、Skills、工具及压缩；实时缓存同步模式修订号 |
| 后台任务切换阻塞 | `packages/tools/core-tools/src/`、`packages/desktop-app/src/service.ts` | Bash 任务运行期间拒绝切换；按 Session 身份查询 |

## 自动化结果

- 通过：`pnpm typecheck`、`pnpm build`；桌面以 `--testTimeout 30000 --maxWorkers 4` 运行 116 文件/837 测试全过；Core Agent、Loop、Tool Runtime、Runtime fork、客户端实时模式快照、后台 Bash 与本次新增的 Prompt 模式贡献切换专项；前端 theme/tokens 检查。
- 首次全仓并发 `pnpm test` 因本机同时运行 dev watcher，CLI 真实进程和部分桌面用例触发 5 秒超时；停掉 watcher、将该 CLI 进程用例超时设为 30 秒后，最终 `pnpm test` 全仓通过。CLI 单独及桌面限制并发重跑也通过。
- 本次收尾时默认 `pnpm test` 的桌面长文件渲染用例又触发 5 秒超时；单独桌面默认并发复跑有 3 个同类超时。三个用例单独重跑通过，限制并发且提高超时后桌面 837/837 通过；本次默认全仓命令仍记录为失败，不等同于通过。
- `pnpm check:docs` 被既有 active 计划 `20260926-site-homepage-redesign.md` 顶部已完成状态阻断；本任务未更改该计划。

## Computer Use 验收点

实机为当前工作树的 `Actspace Dev 1e9f-6d88`；执行时按主会话、执行与阻塞、恢复与视觉三条路线组织。下表按原验收点回报。测试/源码结果另列，不充作界面通过。

| 点 | 结果 | 实机证据与界限 |
|---|---|---|
| U1 | 通过 | 新建 Agent 会话；Composer 菜单仅 Agent、Plan、Chat 三种模式，未见形态入口。 |
| U2 | 通过 | 同一侧栏会话完成 Chat→Plan→Agent 及有消息后的 Chat→Plan→Chat；历史、Todo、图片仍在，未见新增归档项。空会话草稿保持已观察；隔离 fork 加入临时 `.xyz` 附件和正文后，Chat→Plan→Chat 均保留两者，Session Journal 只追加模式事件。 |
| U3 | 通过 | 实机 Chat 成功调用 `web` 并给出来源，随后调用 `generate_image`，右侧预览显示蓝圆白底图片。Journal 的每个 Chat `request/context` 快照工具名均恰好为 `generate_image`、`web`；`tool/call`/`tool/result` 与 `request/header.agentMode=chat` 对应。 |
| U4 | 部分通过 | Chat 隐藏 Skills、工作区和权限控件；Chat 请求快照只列两工具，工作区 source 读取零次由自动化 spy 证明。没有逐项审计真实 Prompt 文本的所有工作区贡献。 |
| U5 | 部分通过 | 实机 Plan 调用 `read_file` 读取 README，并以 `todo_write` 留下两项 Todo；Journal 的 Plan 请求快照列出设计中的十工具集合及 `agentMode=plan`。禁止写文件/Shell 和 full-access 下 executor 零调用由 Runtime 测试证明，未在实机触发负向调用。 |
| U6 | 部分通过 | Chat/Plan 活动 Run 中模式控件禁用；隔离 fork 的 Bash 审批期间会话显示“等待审批”，命令核对为 `sleep 90`。批准后后台任务运行，尝试切 Chat 被服务端 `SESSION_BUSY` 拒绝；任务完成通知被消费后可切回 Chat。拒绝时 UI 曾直显内部码，已映射为可读提示并通过类型检查；提示文案尚未再做实机复测。子任务期间切换未覆盖。 |
| U7 | 部分通过 | 实机 Chat 发送 `.xyz` 附件被格式校验拒绝，明确列出支持格式，正文与附件保留；Journal 未出现验收正文或新轮次。无工作区的目录选择与重试已接入并有服务层测试，但当前 Desktop 新会话默认绑定注册工作区，未形成无工作区实机场景。 |
| U8 | 通过 | 完整退出并重启本工作树 Electron 后，验收会话仍显示 Chat 且图片/Todo 保留；侧栏既有旧 Chat 空会话恢复为 Chat。实机 fork 生成独立会话，fork Journal 继承到边界的 Chat 模式事件。 |
| U9 | 部分通过 | 浅色与深色大窗口菜单均可辨、无遮挡；深色 Plan 勾选与 Chat 切换可见。后续使用 macOS Window→Move & Resize→Left 成功进入半屏窄窗口：侧栏自动收起，浅色三模式菜单、勾选、附件错误、草稿、发送按钮和焦点无裁切。深色窄窗口及忙碌禁用状态未复验；已恢复原窗口尺寸、侧栏和浅色主题。 |
| U10 | 部分通过 | 同会话在 Chat/Plan 间切换后，搜索、生图、Plan 回复与 Todo 均仍可见；后续 Chat→Plan→Agent 后权限菜单仍选中“自动”，对应 Journal 仅追加模式事件，未见权限变更事件。既有 Grant 前后对照未覆盖。 |

## 后续人工验证

1. 补验无工作区 Chat→Plan/Agent 的选择目录路线；当前 UI 新会话会默认绑定工作区，可使用受控的无工作区 Session fixture。附件保持与不兼容格式拒绝已完成。
2. 补验子任务期间的模式切换，并对审批阻塞与新版可读错误提示做实机复测；Runtime 负向工具调用继续由确定性测试负责。
3. 补验深色窄窗口及忙碌禁用视觉；核对既有 Grant 前后状态。浅色窄窗口和“自动”权限保持已验证。
4. 处理仓库既有 active 计划状态后重跑 `pnpm check:docs`。

## 已知边界

旧 Session 保留原 Header/Journal，通过旧 preset 映射恢复；没有回填新组合字段。真实 Browser、打包 Electron 与签名不属于本次通过范围。当前形态只有一个静态内建组合；新形态和插件市场尚未设计。
首次锁屏曾中断实机路线；本轮在用户保持屏幕常亮后恢复了实机验收。首次 Chat 搜索因同一 AgentScope 重复注册 `core/identity` 失败；修正模式贡献切换后，真实搜索、生图和 Plan 调用成功，并增加回归测试。
