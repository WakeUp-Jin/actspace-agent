# actspace Bash 执行与审核组件样式计划

## 目标

实现消息流中的 Bash 工具展示组件，包括正常执行态和需要审核的 pending 态。组件风格参考用户提供的两张截图：正常 Bash 展开后是一个单层命令输出容器；审核态是一个紧凑的 Shell 工具审核块，显示命令、原因、权限模式和操作按钮。

本计划只负责前端表现、fixture 和视觉验收，不负责工具调度状态机和 Bash executor。

## 范围

- 包含：
  - Bash 正常执行组件。
  - Bash 审核 pending 组件。
  - approved、denied、expired、cancelled、running、success、failed 状态样式。
  - renderer fixture 和 mock 状态。
  - 与中间消息区规范同步。
  - 浏览器 mock、截图和 Electron 视觉验收。
- 不包含：
  - ToolScheduler 实现。
  - approve/deny IPC 的真实后端恢复。
  - Bash 命令执行器。
  - 全局权限设置页。

## 设计来源

- `docs/design-docs/frontend-ui/中间消息区规范.md`
- `docs/design-docs/agent-core/权限设计规则和原则.md`
- 用户提供的参考图：
  - 正常 Bash 展开态：`/Users/wakeup-jin/Desktop/actspace-learing-design/PixPin_2026-05-24_10-58-40.png`
  - Bash 审核态：`/Users/wakeup-jin/Desktop/actspace-learing-design/PixPin_2026-05-24_13-40-30.png`

## 相关代码路径

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`（拟新增）
- `packages/desktop/src/renderer/components/messages/BashApprovalBlock.tsx`（拟新增或合并）
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/styles.css`
- `packages/shared/src/session.ts`
- `docs/design-docs/frontend-ui/中间消息区规范.md`

## 正常 Bash 组件规则

### 折叠行

- 形态接近 Read 工具行。
- 不加工具图标。
- 不加外围卡片边框。
- 文案类似：`Ran Typecheck agent-core with env module cd, pnpm`。
- 末尾是 disclosure chevron。
- 命令前缀简写以低对比文字展示，例如 `cd, pnpm`。

### 展开体

- 折叠行下方只有一个浅色单层容器。
- 容器直接包住完整命令和输出。
- 不再给命令行单独嵌套一个框。
- 不再给输出单独嵌套一个框。
- 右上角可以有轻量省略号操作。
- 输出使用等宽字体，支持长行换行和垂直滚动。

### 状态

- `running`：标题用 `Running ...`，输出区域可显示实时输出。
- `success`：标题用 `Ran ...`。
- `failed`：标题仍用 `Ran ...`，但展开体显示 exit code 和错误输出。
- `denied/cancelled`：标题说明未执行，展开体显示原因。

## Bash 审核组件规则

### 外观

- 审核态是一个轻量边框块，因为它需要承载用户操作。
- 宽度与消息正文对齐，不做大弹窗。
- 顶部一行显示 shell 小图标或终端符号、动作摘要和省略号。
- 中间显示命令行，形式类似 `$ echo "测试需要额外权限的命令"`。
- 下方显示 `Reason: Not in allowlist: ...`。
- 底部左侧显示权限策略选择，例如 `Allowlist (with Sandbox)`。
- 底部右侧显示操作：`Skip`、`Allow`、`Run`。

### 行为

- `Skip`：拒绝本次执行，结果为 cancelled。
- `Allow`：允许相似命令或加入本会话 allowlist，首版需要明确文案范围。
- `Run`：只允许本次执行。
- 审核详情可展开查看完整参数，但默认折叠。

### 与正常 Bash 的关系

- pending 态通过审核后，组件应转为 running/success/failed 的正常 Bash 组件。
- denied/expired 后仍留在消息流中，显示最终状态，不消失。
- 同一条工具调用不应该在消息流里出现两个互不相关的块。

## 重点问题

1. 审核态是否使用终端图标？
   - 截图里有小终端符号；但普通 Bash 工具行不需要图标。倾向：审核块可以使用小终端符号，因为它是操作面板，不是普通日志行。
2. `Allow` 和 `Run` 文案是否容易混淆？
   - 需要在 UI fixture 中比较：`Allow once / Allow similar / Run` 或保留截图风格。
3. 正常 Bash 展开容器高度如何控制？
   - 倾向：max-height + 内部滚动，避免长输出冲掉消息流。
4. 审核块是否需要 composer 上方提醒？
   - 本计划只做 inline block；全局提醒留给暂停/会话边界计划或后续 UI 计划。

## 里程碑

1. 定义 shared message block 的 Bash/approval 展示字段。
   - 验证：fixture 能表达正常执行和 pending 审核。
2. 实现 Bash 正常执行组件。
   - 验证：匹配参考图一的单层容器结构。
3. 实现 Bash 审核 pending 组件。
   - 验证：匹配参考图二的审核信息层级和按钮布局。
4. 覆盖所有状态 fixture。
   - 验证：pending、running、success、failed、denied、expired、cancelled 都有样本。
5. 完成浏览器与 Electron 验收。
   - 验证：桌面宽屏、窄窗口、长输出、中文命令都不重叠。

## 验证方式

- `pnpm typecheck`
- `pnpm build`
- `pnpm dev:log`
- 浏览器 mock：
  - 打开 `http://127.0.0.1:5173/`。
  - 截图确认正常 Bash 与审核 Bash 组件层级。
  - 检查按钮文本不溢出。
  - 检查命令长行换行和输出滚动。
- Electron 验证：
  - 用 fixture 或真实 Bash 触发正常执行和审核态。
  - 检查消息流滚动、composer、右侧面板不被遮挡。

## 与其他计划关系

- 依赖 `docs/exec-plans/completed/actspace-tool-permission-scheduler-plan.md` 提供 approval request 字段。
- 依赖 `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md` 提供 expired/cancelled 状态语义。
- 消费 `docs/exec-plans/completed/actspace-bash-tool-plan.md` 的 Bash 结果字段。

## 进度记录

- [x] 定义 Bash/approval 展示字段。
- [x] 实现正常 Bash Run 组件。
- [x] 实现 Bash approval 组件。
- [x] 更新 fixture 和前端设计文档。
- [x] 完成浏览器 mock 截图验收。
- [x] 完成 Electron 真实窗口 smoke 验收。

## 决策记录

- 2026-05-24：审核面板样式从权限调度计划中拆出。原因是视觉和交互需要根据 Bash 组件参考图反复校准，不应该阻塞后端状态机。
- 2026-05-24：Bash 正常态和审核态使用同一个 `kind: "bash"` message block 承载，以状态区分 pending/running/success/failed/denied/expired/cancelled，避免同一 tool call 在消息流里分裂成多个块。
- 2026-05-24：浏览器 mock 已完成桌面宽度和窄窗口验收，确认普通 Bash 外层保持日志行，只有展开输出使用单层容器；审核态保持单个轻量操作面板。
- 2026-05-24：复用已运行的 `http://127.0.0.1:5173` 启动 Electron，真实窗口可加载 renderer、恢复会话并切换消息流。由于 approval runtime 尚未接通，Electron 内暂时没有真实 pending Bash 可触发；审核态样本仍以浏览器 fixture 验收为准，真实触发归入权限调度/暂停恢复计划。
