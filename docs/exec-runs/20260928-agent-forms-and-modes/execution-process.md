# 单一 Agent 形态与三模式 — 执行过程

## 基本信息

- 关联计划：`docs/exec-plans/active/20260928-agent-forms-and-modes.md`
- 执行模式：交互
- 日期：2026-09-28
- 状态：代码与确定性测试完成；真实 Chat/Plan 主要路线已验收，部分 Electron 路线待验收

## 执行时间线

1. 安装锁定依赖，核对旧 preset、AgentScope、Tool Runtime、Journal/Projection、Desktop 和 Headless 接入。
2. 建立唯一 `actspace.main` 形态成员清单，逐 AgentScope 绑定工具贡献；Prompt contributor 使用作用域注册与 disposer；记录形态成员、版本及独立组合摘要。必需成员不完整时失败，可选 Browser 缺失时不注册。共享 executor 仍由 Host 持有。
3. 定义 Chat/Plan/Agent 显式白名单。模型工具 schema 从形态成员和模式取交集；生产 Tool Runtime 要求不透明 Agent 绑定，并在准入、排队、审批后与进入执行体前校验。Chat 恰好 `web` 与 `generate_image`。
4. 增加 Session 模式事件、revision、Header、投影和索引缓存升级。Desktop 切换与 Run 使用会话级互斥；失败时不宣告切换成功。Headless 沿用持久模式或显式写入变更。fork 按截断点恢复。
5. Prompt 在 Chat 模式下不读取工作区 source；Chat 不消费 Skills，继续使用既有压缩阈值。Composer 统一三模式菜单，同会话切换，保留草稿和附件。
6. 修正受新 runtime-context 字段影响的旧测试；增加 AgentScope 隔离、组合摘要、直接工具门禁、模式变更后执行体拦截、fork 冷恢复断言。
7. 用 `pnpm dev:log` 启动本工作树 Electron。通过 Computer Use 观察三模式菜单、Chat 控件、同会话 Chat→Plan→Agent 切换；工作中的构建触发过 Vite 热重载，故草稿的跨热重载保持不作为验收结论。
8. 发现实时 Journal 更新未将 `agentMode` 回填到客户端 snapshot，可能使 UI 被旧缓存覆盖。修正实时投影并在切换成功后重新读取会话；无工作区时用系统目录选择器设置后重试。增加 Session 级后台 Bash 任务检查，运行中拒绝切换。
9. 完整退出重启 Electron 后确认当前新会话 Agent 模式仍显示。之后 macOS 锁屏且 Computer Use 无法自动解锁，停止实机操作；最终代码变动用自动化复验。
10. 用户保持屏幕常亮后恢复实机验收。第一次 Chat 搜索报 `Duplicate scoped registration core/identity`：Chat 与工作区的 Prompt contributor 曾同时注册到同一个 AgentScope。改为单一 registry/assembler，模式切换时替换贡献并在失败时恢复旧集合，补充 Chat→Plan→Chat 与失败回滚测试。
11. 重启当前工作树 Electron 后，实机 Chat 成功执行 `web` 搜索与 `generate_image`；图片在右侧预览可见。Journal 的 Chat 请求快照只含两个 schema，工具事件分别记录调用与结果。
12. 在同一 Session 切到 Plan，实机调用 `read_file` 和 `todo_write`，Journal 的请求快照记录 Plan 模式、修订号及十个允许工具。活动 Run 中模式控件禁用；切回 Chat 后历史、图片和 Todo 保留。
13. 浅色/深色检查模式菜单、勾选、控件和预览；从侧栏进入旧 Chat 再返回本次会话，模式和历史恢复。窄窗口拖拽未成功改变尺寸，保留为未覆盖。恢复原浅色主题。
14. 设置中的旧文案“Chat 形态”改为“Chat 模式”，移除 Composer 过期注释；没有改主题颜色。
15. 为无工作区 Chat→Plan 加服务层回归断言：`WORKSPACE_REQUIRED` 后 mode/revision 不变。重新启动当前工作树 Electron，原会话恢复为 Chat 且图片/Todo 保留；实机 fork 生成独立会话，fork Journal 继承边界处的 Chat 模式事件。
16. 在隔离 fork 中切 Agent，发起后台 `sleep 90`。审批卡片显示精确命令，批准后会话返回空闲但后台任务仍运行，切 Chat 被 `SESSION_BUSY` 拒绝。任务完成通知被下一轮消费后切 Chat 成功。UI 曾直接展示内部码，已将 busy/conflict/recovery 错误映射成中文提示；针对性 Desktop typecheck 和 50 个相关测试通过。

17. 再次启动同一工作树 Electron，在隔离 fork 附加临时 `.xyz` 文件并写验收正文。Chat→Plan→Chat 后两者保留；点击发送返回支持格式的中文错误，Journal 不含验收正文或新轮次。继续切 Plan→Agent，权限菜单均选中“自动”。用 macOS Window→Move & Resize→Left 验证浅色半屏窄布局：侧栏自动收起，菜单、焦点、错误、附件、正文和发送按钮无裁切。通过键盘移除临时附件、清空验收正文，恢复 Chat、窗口尺寸及侧栏。

## 验证记录

- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `pnpm --filter @actspace/desktop exec vitest run --testTimeout 20000 --maxWorkers 2`：116 文件、837 项通过。
- `pnpm --filter @actspace/core-agent test`：通过。
- `pnpm --filter @actspace/core-agent-loop test`：通过。
- `pnpm --filter @actspace/tools-runtime test`：27 项通过。
- `pnpm --filter @actspace/runtime exec vitest run src/test/desktop-fork.test.ts`：通过。
- 首次全仓并发执行时 CLI 进程用例触发 5 秒默认超时，桌面全量亦出现多个同类超时；停掉 dev watcher、给真实进程 CLI 用例 30 秒预算后，最终 `pnpm test` 全仓通过。CLI 单独及桌面限制并发重跑也通过。
- `pnpm check:frontend-theme`、`pnpm check:frontend-tokens`：通过。
- `pnpm check:docs`：因既有 `20260926-site-homepage-redesign.md` 位于 active 且顶部标为完成而失败；非本任务引入。
- 最终变动后重新执行全仓 `pnpm typecheck`、`pnpm build`、`pnpm test` 均通过；新增客户端实时快照和后台任务专项通过。
- 本轮最终 `pnpm typecheck`、`pnpm build`、frontend theme/tokens、`git diff --check` 通过。默认全仓 `pnpm test` 的桌面长文件渲染测试触发 5 秒超时，默认桌面复跑又有三个长渲染/轨迹用例超时；三个用例单独复跑通过，桌面全套以 `--testTimeout 30000 --maxWorkers 4` 运行 116 文件/837 项通过。默认全仓测试本轮仍记失败。

## 遇到的问题

- Computer Use 首次连接 Electron 超时，后续成功连接并读取原生窗口；每次原生树/截图调用有约一分钟延迟。
- 测试与 dev watcher 同时运行时，`packages/shared/dist` 重建会让 watcher 短暂报告解析错误并触发页面热重载。最终独立 build/typecheck 均通过；因此不把该时段的 UI 重载当成产品重启验收。
- 直接工具调用批次准入后，原模式集合若变化，初版只有静态快照。已补动态绑定回查，在 dispatch checkpoint 后及执行体前再次拒绝，executor 调用次数保持零。
- 首次真实 Chat 搜索揭示 Prompt contributor 在同一 AgentScope 重复注册；修正并加回归测试后，真实 Chat 搜索、生图和 Plan 只读探索均通过。

## 待验收

子任务期间切换、无工作区选择、深色窄窗口/忙碌禁用、既有 Grant 前后对照及新版阻塞提示实机复测尚未执行；附件保持、格式错误、浅色窄窗口和自动权限保持已补验。结果见执行摘要，不能由测试代替。
