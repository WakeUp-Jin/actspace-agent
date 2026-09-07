# ActSpace DSH 轨迹页面完整能力迁移

## 目标

将 ActSpace 会话内 Trajectory 视图重做为 DeepSeek Harness 风格的完整轨迹工作台：保留 DSH 的 runtime 类型、原始事件行、前端关联归并、真实时间缩放、时间线、搜索、折叠、详情 inspector 和虚拟化 ledger；只排除 DSH 的独立 tab 系统，继续使用 ActSpace 会话标题内的 Chat / Trajectory 单按钮切换。先完成浏览器可调试的完整 mock 与 renderer 实现，待用户在浏览器确认视觉和交互后，再进入真实 Session Projection / IPC 接入。

## 范围

- 包含：
  - DSH `ui-trajectory` runtime 类型与数据流的迁移映射。
  - ActSpace 完整 trajectory snapshot、record、turn、timeline、virtual row、search、detail 类型。
  - 完整 mock snapshot 与显式 `trajectoryFixture` 开发入口。
  - 前端原始事件关联和归并，包括 assistant partial、tool call/result、request、approval、retry、error、compaction。
  - DSH 风格 toolbar、timeline、连续 ledger、Turn/Step 分组、折叠、搜索、详情 inspector、长文本预览。
  - 完整虚拟化和真实时间/持续时间缩放算法。
  - 保持 Composer、会话 Shell、右侧 Files/Review/Context/Terminal 边界稳定。
  - 真实 Session Projection/preload/IPC、完整 Turn 历史窗口与 Journal commit 刷新。
  - 针对性测试、renderer/build/theme/diff 验证、执行记录和 history。
- 不包含：
  - DeepSeek Harness 独立 tab 系统、tab 路由或 tab 状态管理。
  - Journal 存储格式迁移、删除 `assistant/chunk`、真实网络 mock API。

  - Electron 打包、签名、公证、真实 Provider/Browser 外部能力验收。

## 背景

- 相关文档：
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/frontend/front-主题与配色规范.md`
  - `docs/design-docs/agent-runtime/agent-turn-layers.md`
  - `docs/design-docs/agent-observability-trace-model.md`
- 参考实现：
  - `tmp/deepseek-harness/packages/client/ui-trajectory/src/`
  - DSH 当前运行页 `http://127.0.0.1:3080/`
- 当前代码：
  - `apps/desktop/src/renderer/components/TrajectoryView.tsx`
  - `apps/desktop/src/renderer/fixtures/trajectory-complete.json`
  - `packages/session/projection/src/trajectory.ts`
  - `packages/shared/src/runtime-v2/projection.ts`
- 已知约束：
  - 工作树已有大量与本任务相关和无关的未提交修改，必须保留并避免宽泛回滚。
  - 此前存在 `check:docs` 登记阻塞；2026-09-06 续执行时复跑已通过。
  - 颜色必须使用主题 token，浅色和深色都要验证。

## 数据流

```text
Journal events
    ↓
RuntimeV2TrajectorySnapshot (raw nodes)
    ↓
trajectory snapshot builder
    ├─ request / assistant / tool / approval / retry / compaction association
    ├─ partial assistant aggregation
    ├─ turn / step layout
    ├─ timeline scale and range
    ├─ search index
    └─ virtual row grouping
    ↓
TrajectoryView
    ├─ toolbar
    ├─ timeline
    ├─ virtualized ledger
    └─ details inspector
```

## 风险与缓解

- 风险：DSH 类型依赖其 runtime，直接复制会把外部包和不可序列化对象带入 ActSpace。
  - 缓解：先做类型映射，保留语义字段和算法，不复制 DSH 专有运行时依赖；跨进程边界只允许 JSON-safe DTO。
- 风险：前端重新实现关联逻辑后出现 tool/result、partial、retry 错配。
  - 缓解：fixture 覆盖成功、失败、审批、重试、运行中和缺失字段；builder 写纯函数测试。
- 风险：大轨迹一次性渲染导致滚动卡顿。
  - 缓解：保留 virtual row 结构、测量、overscan 和 load-older sentinel；用大 fixture 做渲染测试。
- 风险：真实时序缺失导致 timeline 误导。
  - 缓解：显式区分 sequence、equal-width、duration、actual-time；缺失 timing 使用确定 fallback，并在详情显示缺失。
- 风险：重做中心视图破坏 Composer 草稿和右侧面板。
  - 缓解：不卸载 Conversation Shell；只切换中心 viewport；Phase 5 完成时执行独立 Electron 验收。

## 里程碑与任务

### Phase 0：DSH 迁移基线与契约

1. 完成 `ui-trajectory` 类型、builder、layout、timeline、virtual rows、search、detail 的路径和字段映射。
2. 在 `docs/design-docs/frontend/` 建立 ActSpace 轨迹迁移设计文档，写清保留/适配/排除项。
3. 验证当前 DSH 页面结构与当前 ActSpace 代码差异。

验收：映射文档可独立指导实现；无代码变更进入下一阶段。

### Phase 1：完整 runtime 类型和纯函数 builder

1. 在 `apps/desktop/src/renderer/trajectory/`（必要时共享类型放入 `packages/shared`）建立 JSON-safe trajectory contract。
2. 实现 raw node → records/turns/timeline 的纯函数 builder，支持前端关联归并。
3. 实现 duration/time scale、source sequence、detail projection、search index、virtual row grouping。
4. 为每个关联和边界写针对性 Vitest。

验收：builder 测试覆盖 happy path、partial、tool pair、retry/error/approval/compaction、missing timing/usage。

### Phase 2：完整 mock snapshot 和开发入口

1. 用完整 snapshot 替换当前过窄 fixture，包含多 Turn/Step、长文本、多工具、审批、重试、失败、中止、压缩、运行中和原始 chunk。
2. 增加 `trajectoryFixture=complete|running|errors|long|empty` 解析，默认真实运行不加载 mock。
3. 为 fixture schema 增加运行时校验和测试。

验收：浏览器 renderer 可通过 URL 稳定加载每种状态；无 IPC 时页面仍可读。

### Phase 3：DSH 风格 renderer 结构

1. 重做 `TrajectoryView` 为 toolbar → timeline → virtualized ledger → details inspector。
2. 移除大标题、dashboard 统计卡片和 UUID 主标题；采用连续扁平 ledger。
3. 实现 Turn/Step/record 行、可追溯/可展开的 raw event 行能力、tool/result 关联展示、partial 聚合、折叠、搜索和选择联动；默认语义 ledger 不把每个 assistant/chunk 逐条呈现。
4. 使用主题 token 完成浅/深主题样式和响应式布局。

验收：浏览器截图和交互检查通过；Composer 固定、窄屏详情转底部抽屉。

### Phase 4：虚拟化、时间线和细节完善

1. 接入完整 virtual row measurement、overscan、load earlier sentinel。
2. 接入真实 duration/time scale、idle gap、missing timing fallback 和 timeline range focus。
3. 完成 detail tabs：overview、rendered、raw、source、input、output、schema、options、usage、timing、diff。
4. 增加大数据量和边界回归测试。

验收：大 fixture 滚动只渲染可见行；时间线和 ledger 选择联动；详情可追溯 source sequence/raw ref。

### Phase 5：真实 Projection / IPC 接入（已完成）

1. 将 mock source 替换为 Session Projection adapter。
2. 保持 runtime contract 不变，接入 preload/IPC、revision refresh、running snapshot 和 load older history。
3. 执行 Electron 真实验证，再决定是否归档计划。

## 验证方式

- 工程命令：
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm run check:frontend-theme`
  - `git diff --check`
  - 针对性 `pnpm vitest` trajectory tests
- 浏览器：
  - `http://127.0.0.1:5173/?trajectoryFixture=complete`
  - running/errors/long/empty 状态
  - 参考 DSH 页面逐项对照 toolbar、timeline、ledger、details
- Electron（Phase 5 前只做现有边界回归）：
  - Chat / Trajectory 切换、Composer 草稿、右侧面板不破坏。

## 进度记录

- [x] 确认范围：仅排除 DSH tab 系统。
- [x] 完成 Phase 0 类型与组件迁移映射。
- [x] 完成 Phase 1 runtime contract、builder 和测试。
- [x] 完成 Phase 2 完整 mock 与 fixture 入口。
- [x] Phase 3 renderer、按角色详情、双主题与响应式布局已完成浏览器复验。
- [x] Phase 4 虚拟化、fixture 历史加载、范围聚焦/缩放、详情 resize、prompt diff、request 边界和嵌套工具已完成；真实分页 transport 留在 Phase 5。
- [x] 用户浏览器验收通过，2026-09-06 明确批准开始 Phase 5。
- [x] Phase 5 真实 Projection / IPC 接入，隔离 Electron 验收通过（2026-09-06）。

## 决策记录

- 2026-09-05：保留 DSH 全部轨迹能力（runtime 类型、虚拟化、真实时间缩放、前端关联归并、原始事件行），唯一排除其 tab 系统。
- 2026-09-05：Phase 0–4 先完成，Phase 5 必须等待用户完成浏览器样式和交互验收后再执行。
- 2026-09-05：流式 chunk 保留在 raw nodes、partial 聚合和详情中；ledger 默认按 DSH 规则显示聚合后的 assistant/partial 状态，不逐 chunk 生成普通文本行。

### Refinement pass 2026-09-05：DSH 交互与语义对齐

- 顶部只保留 `Duration / Turns / Calls / Search`；时间轴内部继续使用真实 duration、wall time 和 sequence 算法，不再显示独立的模式切换条。
- Turn 编号显示在该 Turn 第一条语义消息的左上区域；折叠后显示 `… N steps · M tool calls` 摘要，不增加独立 Turn 行。
- 主 ledger 使用 DSH 的 `SYSTEM / USER / ASSISTANT / TOOL` 语义标签；request、context、turn、step 和原始 chunk 仍保留在 source/raw 详情中以便追溯。
- Turns 与 Calls 控件必须实际改变虚拟行分组；Calls 折叠保持调用结果配对关系。
- 时间轴支持点击选择记录和拖拽范围筛选 ledger，选区与详情选择联动。
- 详情面板按记录类型提供最小必要内容：assistant 为 Summary/Preview/Raw，tool 为 Summary/Payload/Result/Timing，内部 request/context 只在详情中展开。

### Correction pass 2026-09-06：复核后修正实现边界

- 当前 Phase 3/4 不再视为完成。复核确认原实现把 request/header、request/context、lifecycle facts 误当作普通 SYSTEM 行；只有显式 prompt change 才能生成可见 SYSTEM。
- 主 ledger 只显示 DSH 语义 cell；原始 Journal event 继续保留在 raw/sourceSequences 和详情追溯链中。`requestOnly` 作为不可见请求边界附着到下一条可见内容，不单独占用普通行。
- Turns 只折叠包含多条可见内容的 Turn，保留首条消息并追加步骤/工具摘要；Calls 折叠 assistant 后连续的 tool/subtool 组，不按单个 callId 粗粒度隐藏。
- 时间轴范围选择采用 DSH 的 pointermove draft、hover、最小拖动和 focus/dim，不删除范围外 ledger 行。
- 详情 contract 增加 assistant 的 step start、first token、completion、TTFT/Generation/Throughput，以及 tool 的 schema、payload/result/timing；不同消息类型使用不同 tabs。
- 本修正阶段只改 renderer projection、mock fixture、组件和 focused tests；不进入 Phase 5 的真实 Projection/IPC 接入。

## 执行模式

- **交互模式**：人在线，Phase 0–4 连续执行；Phase 5 作为用户验收后的独立门槛。

## 执行文档

- `docs/exec-runs/20260905-actspace-dsh-trajectory-parity/execution-process.md`
- `docs/exec-runs/20260905-actspace-dsh-trajectory-parity/execution-summary.md`

### 2026-09-06 续执行结果

- complete fixture 重建为 96 个原始事件、6 个 Turn、多个 Step；覆盖审批、重试、失败、中止、压缩、缺失指标和正在生成。
- long fixture 递归重映射关联 ID 并偏移时间，覆盖 144 个 Turn；增加 fixture envelope、事件序号、重复 key 和时间格式校验。
- SYSTEM 仅展示真实 prompt 快照，初始 prompt 位于 Turn 之外；重复 header/context/title/lifecycle 不进入普通 ledger。
- 拆分 timeline、details、presentation 组件；修正 Turns/Calls 成组折叠、稳定虚拟 key、时间范围 focus/dim；拖选、Escape 清除、搜索均经浏览器交互复验。
- Assistant 提供 Request Timing；Tool 提供 Summary/Payload/Result/Schema/Timing；User 提供 Summary/Preview/Raw/Source，标题为 Turn N · Message。
- 空白会话切到轨迹仍保留底部 Composer 和草稿；增加相应回归测试。
- 开发 fixture 支持 `trajectoryTheme=light|dark` 临时预览，不写入应用偏好；生产 renderer 不启用 fixture。
- 补齐前端历史加载按钮（按完整 Turn 扩展本地窗口、保留滚动锚点）、可拖动 inspector 宽度、逐行 prompt diff、请求边界按钮和递归父工具折叠/跳转。原始 DSH Cordis 类不直接引入，继续使用 ActSpace JSON-safe 语义适配。
- Phase 5 未进入；Electron 进程已启动，但 Computer Use 不识别临时应用 ID/路径，真实窗口点击验收尚未完成，不以浏览器或 main/preload 构建代替。

### 最终验收记录（2026-09-06）

- focused 31 项测试、desktop typecheck、renderer build、main/preload build、主题检查通过；`check:docs` 当前也通过。
- Browser Use 现场验证：1280px 宽屏浅/深主题、571px 窄屏底部详情、Turns、Calls、User Source、Assistant Step 2/Timing、Tool 全 tabs、失败/空态、历史加载、嵌套工具、Prompt Diff、请求入口和详情 resize。
- 时间轴拖选后边界与淡化正确；滚轮缩放后可见 span 从 23 变为 8；双击和 Escape 清除选区。右键平移已实现，尚无真实右键拖动手势验收证据。
- 接下来由用户确认这版视觉和交互；仅在用户批准后进入 Phase 5，并补完 Electron 实机验收。

### 2026-09-06 消息内容与工具关联收尾（已完成，待用户验收）

- 补齐内容块顺序与 callId → Tool → result 关联，工具归属从明确消息 ID / 调用块解析，禁止按邻近行猜测。
- Summary / Preview / Raw 共用关联入口；Tool Hierarchy 返回 Assistant 或父工具。导航展开折叠、加载本地历史，并解除阻挡目标的搜索/范围聚焦。
- User / Assistant Raw 显示原始内容块；完整 Journal 留在 Source events。Schema 显示调用当时的名称、描述、参数定义；Payload 保留实际参数。
- 移除 ledger 请求编号，详情 Request 入口保留。补 fixture、身份错配和导航回归测试。
- 验证：focused tests 红绿、desktop typecheck、renderer/main/preload build、主题与文档检查、DSH / ActSpace 浏览器点击与浅深主题、尝试 Electron 窗口边界复验。
- Phase 5 仍未获准，真实 Projection / IPC 接入不在本轮范围。

收尾结果：内容块、调用归属、双向导航、Raw 和完整 Schema 已完成；新回归先在旧实现失败，再于修复后通过。35 项 focused tests、desktop typecheck、renderer/main/preload build 通过。浏览器实际对照 DSH 的 Preview → Tool → Assistant → Raw，验证 ActSpace 搜索/折叠后导航、Raw 第二个调用、完整 Schema 浅深主题和 Running 无结果状态。Electron 的开发名称与 bundle ID 仍无法被 Computer Use 识别，窗口验收保留。

### Phase 5 实施（2026-09-06，用户已批准）

- 真实 Journal DTO 保留 surface/source，适配 request/context.snapshot、工具 modelOutput/inputSchema 和 inbox claim。
- 主进程将所有投影固定在同一 Journal revision；preload 使用共享输入契约。
- 历史每次增加 20 个完整 Turn；通过现有 IPC 返回累计窗口，刷新保留已加载范围。此分页限制轨迹传输与构建，暂不改 Journal 存储读取。
- Session bridge 验证版本和身份，处理并发加载、切会话与销毁；流式 Assistant 到最终消息保持稳定 ID。
- 补真实事件形状、窗口/版本边界、bridge 和 renderer 回归，最后做浏览器和 Electron 实测。

## 最终验收与边界

Phase 0–5 实现完成，用户已接受展示；真实 Journal/preload/IPC 的隔离 Electron 实测通过。详细命令与证据见 execution-summary。未执行真实 Provider 长会话、超大 Journal 性能、外部 Browser、打包签名/公证，不能由本次测试推定通过。计划归档 completed。
