# ActSpace DSH 轨迹页面完整能力迁移 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260905-actspace-dsh-trajectory-parity/README.md`
- **执行模式**：交互
- **开始时间**：2026-09-05 12:00
- **结束时间**：2026-09-05 13:20

## 执行时间线

### 步骤 1：计划落地与基线确认

- **操作**：将用户批准的 Phase 0–5 方案写入 active execution plan；确认 DSH 运行页、当前 ActSpace fixture、trajectory projection 和工作树状态。
- **影响文件**：本计划、执行记录。
- **决定**：Phase 5 延后到用户浏览器验收后；Phase 0–4 本轮连续执行。
- **验证**：已读取 DSH 页面 accessibility tree，确认 toolbar、timeline、table、原始 TOOL 行、Request/Assistant/User/Details 结构。

### 步骤 2：Phase 0 迁移基线与设计契约

- **操作**：审查 DSH `ui-trajectory` 的 contract、Definitions、snapshot builder、layout、timeline、virtual rows、search 和 detail inspector；新增 ActSpace 迁移设计文档。
- **影响文件**：`docs/design-docs/frontend/front-DSH轨迹能力迁移规范.md`。
- **决定**：保留 DSH 全部 runtime 能力；仅排除独立 tab 系统。原始 Journal event 保留 source/raw 可追溯能力，默认 ledger 仍聚合 assistant/chunk。
- **验证**：完成本地源码映射，并通过 DSH 运行页面 accessibility tree 对照确认。

### 步骤 3：Phase 1 runtime contract 与 builder

- **操作**：新增 JSON-safe runtime contract、raw node 关联归并、assistant partial、tool/result/approval 配对、turn/step、timeline mode、search index、detail source 和 virtual rows。
- **影响文件**：`apps/desktop/src/renderer/trajectory/contract.ts`、`builder.ts`、`index.ts`、`apps/desktop/src/renderer/test/trajectory-builder.test.ts`。
- **决定**：Phase 0–4 先在 renderer 使用纯函数和 mock，不修改 shared projection、Journal 或 IPC。
- **验证**：`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/trajectory-builder.test.ts` 通过（2 tests）；renderer `tsc --noEmit -p tsconfig.json` 通过；`git diff --check` 通过。

### 步骤 4：Phase 2 fixture loader

- **操作**：新增显式 query fixture loader，提供 complete、running、errors、long、empty 五种状态。
- **影响文件**：`apps/desktop/src/renderer/trajectory/fixtures.ts`、`apps/desktop/src/renderer/test/trajectory-fixtures.test.ts`。
- **验证**：fixture 与 builder focused tests 通过（4 tests）；renderer TypeScript 检查通过。

### 步骤 5：Phase 3–4 renderer 重做与浏览器检查

- **操作**：重写 `TrajectoryView`，接入 runtime builder、fixture loader、TanStack virtualizer、四种 timeline mode、Turn/Call 折叠、搜索、详情 tabs 和 source/raw 追溯。
- **影响文件**：`apps/desktop/src/renderer/components/TrajectoryView.tsx`、`docs/histories/2026-09/20260905-1258-dsh-trajectory-renderer.md`。
- **决定**：不复制 DSH tab 系统；保留 ActSpace 会话标题单按钮。默认 ledger 显示语义 records，streaming chunk 通过 partial/source 追溯。
- **验证**：浏览器 renderer 检查 toolbar、timeline、ledger、Composer 和 Chat/Trajectory 切换；修正 virtual row 的重复 Turn header。focused trajectory tests 8/8、renderer TypeScript、主题契约和 `git diff --check` 均通过。

### 步骤 6：DSH 交互与语义对齐复验（进行中）

- **触发**：用户对初版 mock 页面提出视觉和交互差异，要求以 DSH 当前运行页为准重新校准。
- **参考证据**：通过 Computer Use 读取 `http://127.0.0.1:3080/` 的 accessibility tree，确认 Turns/Calls 为可切换 checkbox，Turn 编号嵌入第一条消息，时间轴支持拖拽聚焦，详情内容随消息类型变化。
- **计划改动**：隐藏时间模式条；调整主 ledger 的语义标签和 Turn 摘要；修复 Turns/Calls 折叠；按 assistant/tool/user/system/request 类型重组详情；增加时间轴范围选择。
- **边界**：继续保留每个 Journal event 的 source/raw 关联和虚拟化能力；不进入真实 Projection / IPC。
- **结果**：上述改动已完成，focused trajectory tests 8/8、renderer TypeScript、renderer build 和 `git diff --check` 通过。主题检查仍命中既有 legacy brand naming 阻塞，未由本轮引入。

### 步骤 7：复核发现并启动 correction pass（2026-09-06）

- **触发**：用户复核截图后指出 SYSTEM 行、Turns、时间轴动画、Assistant/Tool 详情仍与 DSH 不一致。
- **证据**：重新读取 DSH `requestOnly`、prompt-change、Turn/Calls collapse、timeline gesture、assistant metrics 和 detail tabs 实现，并实际点击 DSH 的 Turns/Calls 控件确认状态变化。
- **结论**：前一轮只完成了 renderer 骨架，不能把 Phase 3/4 标为完成。当前共同根因是 raw lifecycle/request facts 被错误降级为普通 UI 行，contract 也缺少 DSH detail/timing 字段。
- **行动**：并行修正 projection contract/builder、TrajectoryView 交互和 focused tests；Phase 5 继续保持等待用户验收。

## 遇到的问题

尚未记录。

## 跳过或推迟的事项

- 真实 Session Projection / preload / IPC 接入：等待 Phase 0–4 浏览器验收。

### 步骤 8：核心 UI 修正与现场复验（2026-09-06）

修复请求事实初始化、SYSTEM 去重与初始位置、审批状态不能提前完成工具、不同 Step fixture、长 fixture ID 冲突和时间重叠。工具组摘要保留全部子记录身份；虚拟化删除生产环境全列表 fallback；范围选择只聚焦与淡化，不删除行。增加 User Source、Assistant 完整时间指标、Tool Schema/Timing；空会话 Composer 切换保留草稿。

在 DSH 与 ActSpace 浏览器分别点击对照，验证两种主题、窄屏底部详情、Turn/Calls、Tool tabs、Step 2、拖选、Escape、搜索和 144 Turn 虚拟化。开发服务曾因沙箱 EPERM 不能监听 5173，经授权启动后完成浏览器验证。指定 viewport override 没有生效，使用工具实际返回的 571px 窄屏和此前宽屏画面，不以设定值冒充实际尺寸。

本轮以核心 UI 修正为验证范围；完整 DSH 迁移尚有明确缺项，列于计划和摘要。没有启动真实 Electron，也没有进入 Phase 5。

### 步骤 9：补齐前端计划项并收尾（2026-09-06）

增加完整 Turn 分页窗口和 Load earlier history 入口，保留滚动锚点；timeline 选择早期记录时自动扩展窗口。增加请求边界入口、详情栏指针/键盘 resize、提示词逐行增删 diff、递归子工具折叠和父级跳转，并补充回归。

浏览器复验 1280px 宽屏浅/深主题：提示词 Diff 正确展示增删行；详情宽度拖至 630px；请求入口显示 Provider/Model/Options/Usage/Timing；子工具折叠和父级跳转生效。滚轮缩放可见 span 从 23 变为 8，双击清除选区。31 项 focused tests、desktop typecheck、renderer build、main/preload build、主题/文档检查通过。

Electron 已按 dev-runtime 身份启动。Computer Use 按日志返回的 appId 和 appPath 均返回 Invalid app，应用列表也未提供该临时应用；因此实机窗口门禁未签收。启动日志有 Chromium cache 结构错误，未删除或修改用户缓存。Phase 0–4 前端实现完成，Phase 5 与用户验收门禁保持待办。

## 2026-09-06 内容块关联修复

1. 用户批准 Phase 4 收尾方案。源码证实 DSH 的 AssistantToolCalls / SourceBlocks 使用 callId → openCallSummary；ActSpace 详情未消费 sourceBlocks，Hierarchy 仍按最近 Assistant 猜测。
2. 增加 `trajectory-relations.test.tsx`，先在未修复代码运行：两个用例失败（归属/Schema 缺失、摘要混入内容块）。随后补齐身份关联、共享内容块渲染、完整 Schema 和双向导航。
3. fixture 加入有序 thinking/text/tool-call 与 assistantMessageId、完整工具定义；long 批次递归重映射新增身份字段。移除列表请求徽标，保留详情请求入口。
4. 新测试扩展到四项，覆盖同 Step 多 Assistant、同名调用、未返回结果、缺失引用、历史 Schema、孤立调用、User Raw/Source、嵌套父级、搜索/时间范围与折叠解除、跨本地历史窗口跳转。
5. 工程验证：35 项 focused tests、desktop typecheck、renderer build、main/preload build 通过；renderer 保留既有大 chunk 提示。
6. Computer Use 对 DSH 完成 Preview → Tool Summary → Assistant Summary → Raw 实际点击。ActSpace 验证同路径、折叠与不匹配搜索下的工具定位、Raw 第二个调用对应 bash 结果、Schema 浅深主题、Running 无结果状态。一次 HMR 将页面重置到 Chat，重新进入 Trajectory 后复验通过。
7. Computer Use 使用开发应用名称和 bundle ID 均返回 Invalid app，Electron 窗口未验收；不把 main/preload 构建当作实机通过。Phase 5 未执行。

## Phase 5（2026-09-06）

用户接受前端后批准真实接入。先追溯 AgentLoop、Inbox、LogicalRequestSnapshot 与 ToolResult 生产字段，发现 user/message.data 无正文、tool/result.modelOutput 未被读取，修复 raw DTO 和展示适配。Journal snapshot 与 event 读取固定在同一 revision，避免运行中两次读取交错。

真实历史按 20 Turn 累计窗口传输，保持绝对编号和已加载窗口。Session bridge 校验 envelope、value 和 snapshot 的版本身份；修复 runtime gap、disposed reply；stream failure 新 messageId 通过精确 requestId 关闭对应 partial。

发现旧 desktop live delta 的 throughJournalSeq 固定为 0；增加实际 Cordis session/event 监听，以 40ms 合并通知。测试直接使用 Cordis dispatch carrier，确认正确读取所属 sessionId。

隔离 Electron 第一轮通过 Journal/preload/IPC/分页/详情。第二轮的草稿断言误用 textarea.innerText，改为 inputValue 后，commit notifications、草稿切换和 reload 全部通过。未修改 Composer 产品代码。

针对性回归中的 TTFT 期望从 step/start 调整为 request/header，因此 fixture 800ms 改为 700ms；generation 不变。最后补失败流 ID 更换的终态回归。
