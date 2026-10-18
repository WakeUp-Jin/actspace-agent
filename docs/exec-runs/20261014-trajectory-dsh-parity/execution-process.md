# 轨迹页对齐 DeepSeek Harness — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261014-trajectory-dsh-parity.md`
- **执行模式**：交互
- **开始时间**：2026-10-14
- **结束时间**：2026-10-14

## 执行时间线

### 步骤 0：清理与准备

- **操作**：编译版对照页移到 `tmp/trajectory-demo-old/dsh-reference.html`；删除已否决方案的 handoff 文档和第 1 版 demo 备份；建 `shots/` 目录。
- **影响文件**：`docs/design-docs/frontend/trajectory-dsh-parity-handoff.md`（删）。其余在被 git 忽略的 `tmp/`。
- **决定**：D1、D2 用户未单独回答，按计划建议执行（停止进工具栏；supplement `op=add` 显示为上下文行）。

### 步骤 1：T1 颜色与字号 token、轨迹样式文件

- **操作**：
  - `tokens.css` 三个主题块各加 `--act-trajectory-*`（DSH 的 alias 色逐个解析成 rgb）和 `--act-json-*`；浅色块加 `--act-trajectory-ease`。
  - `tailwind.css` 加 `--text-act-3xs/4xs/5xs`（10/9/8px）。
  - 用一次性脚本（`tmp/trajectory-port/port-css.py`，不进仓库）把 DSH 的 Table / Timeline / Toolbar / views / JsonTree CSS module 转成全局 CSS：类名加前缀（`tj-`、`tjl-`、`tjb-`、`tjv-`、`json-tree-`），DSH 变量换成 ActSpace token，`run_code` 代码页签相关规则不搬，浮动输入框留白改为 0。
  - 新增 `styles/trajectory.css`、`styles/json-tree.css`，在 `index.css` 以 `layer(components)` 引入。
- **影响文件**：`R/styles/tokens.css`、`R/styles/tailwind.css`、`R/styles/index.css`、`R/styles/trajectory.css`（新）、`R/styles/json-tree.css`（新）。
- **决定**：计划写的是「组件只用语义类」。DSH 轨迹大量依赖伪元素、容器查询、`attr()` 和属性选择器，用 Tailwind 类无法一比一还原，所以改成全局 CSS 文件（先例：`space.css`、`diff.css`）。颜色仍然只在 `tokens.css` 定义，`color-mix` 只混 token。
- **验证**：`pnpm check:frontend-theme`、`pnpm check:frontend-tokens` 通过。

### 步骤 2：T2–T4 纯函数层

- **操作**：
  - `builder.ts` 补 7 种 cell 需要的字段：supplement `op=add` 与 `task_notification` 的 inbox claim 生成上下文记录；审批结论并入工具记录；重试、失败原因挂到请求。
  - 新增 `layout.ts`（Turn → Group → Cell、折叠、请求圆点分组）、`requests.ts`（每个步骤一个请求视图，重试折叠，压缩算请求）、`status.ts`（DSH 5 条状态规则）、`detail-tabs.ts`（页签表与 `pickTab`）、`format.ts`、`strings.ts`（DSH 中文文案）、`timeline.ts`（时间轴模型与结构签名）。
  - `ui/JsonTree.tsx` + `json-tree-model.ts`：移植 DSH 的 JSON 树（折叠、长字符串收起）。
- **验证**：`trajectory-builder.test.ts`、`trajectory-layout.test.ts`、`json-tree.test.tsx` 通过。

### 步骤 3：T5 表格、工具栏、数据源

- **操作**：
  - 新增 `TrajectoryToolbar`（时长、轮次、调用、搜索、停止）、`TrajectoryTable`（虚拟化：行数超过 100 或有更早历史时启用；首次滚到底，之后跟随尾部）、`TrajectoryRow`（`<tr>` 本身可点、可双击折叠、键盘 Enter/空格；请求圆点是唯一的行内按钮）。
  - `use-trajectory-source.ts`：`useFrameCoalesced` 把 projection 更新合并到每帧一次；开发态 fixture 懒加载，`streaming` 每 120ms 追加一个 chunk。
  - `use-trajectory-selection.ts`：选中按 recordId / 请求 key 保存，页签历史在 ref 里。
  - `TrajectoryView.tsx` 重写为装配层（约 230 行）。
- **决定**：已收起的轮次摘要按 DSH 写成「N 个步骤 · N 个工具调用」（计划正文写的是逗号）。隐藏的「实际时间」开关不渲染，省一个原生按钮。表格不加 aria-label，与 DSH 一致。

### 步骤 4：T6 时间轴（子智能体）

- **操作**：`TrajectoryTimeline.tsx`、`use-timeline-viewport.ts` 按 DSH 重写：三条泳道、拖选范围、右键平移、边缘自动平移、悬停提示、助手首 token / 解码分段。
- **决定**：点空白处会建最小范围并选中最近的记录（DSH 只聚焦）；不拖动的双击或右键清除范围。记为已知差异。
- **验证**：`trajectory-timeline-view.test.tsx` 6 条通过。

### 步骤 5：T7 详情面板（子智能体）

- **操作**：新增 `details/`：`DetailPanel`（头部、页签、拖拽宽度）、`RecordOverview`、`MessageBody`、`ToolBody`、`SystemBody`、`RequestBody`、`TimingFields`、`shared`；`trajectory/prompt-diff.ts` 自写按行 LCS 差异（不引入 `diff` 依赖）。删除旧的 `TrajectoryDetails.tsx`、`TrajectoryContent.tsx`、`presentation.tsx`。
- **验证**：`trajectory-details.test.tsx` 8 条、`prompt-diff.test.ts` 4 条通过。

### 步骤 6：T8 流式、T9 停止按钮

- **操作**：
  - 表格行 key 用 recordId，行组件自定义比较函数，只在显示字段变化时重渲；时间轴模型按 `timelineSignature` 缓存。
  - `ConversationView.tsx` 去掉单独的停止条，改为把 `onAbort` / `isAborting` 传给 `TrajectoryView`，由工具栏最右侧显示「停止」。
- **验证**：`trajectory-streaming.test.tsx`：5 帧内同一个 DOM 行、文字严格变长、时间轴只算 1 次；`useFrameCoalesced` 每帧最多提交一次。

### 步骤 7：集成、测试改写、检查

- **操作**：
  - 请求「选项」页签在未记录选项时不出现，抽成 `requestTabs()`，DetailPanel 和选中 hook 共用。
  - `trajectory-render-view.test.tsx`、`trajectory-relations.test.tsx` 改为中文名称，新增：停止按钮位置、双击折叠轮次、点请求圆点只开请求详情不选行。
  - `native-button-baseline.json`：去掉 `TrajectoryView`（9）、`TrajectoryDetails`（7）、`TrajectoryContent`（1）；加 Toolbar 4、Table 1、Row 1、details 共 8。轨迹相关文件合计 15（原 18，含时间轴 1）。保持原有条目顺序，只做增删。
- **验证**：见执行摘要「Agent 已完成的验证」。

### 步骤 8：T10 文档

- **操作**：`FRONTEND_VERIFICATION.md` 加「轨迹页 fixture」小节；`front-DSH轨迹能力迁移规范.md` 加「DSH 对齐实现」一节并修正已过时的两处（请求标记、停止位置）；写 histories。

### 步骤 9：T11 浏览器对照

- **操作**：dev renderer 起在 5188 端口（5173 被别的会话占用），用 playwright-core + 本机 Chrome 截 14 张图到 `shots/`，并截 DSH 参考页 `00-dsh-reference.png` 对照。之后删除 `tmp/trajectory-demo-old/check.mjs` 和 `tmp/deepseek-harness/.traj-demo/`。截图脚本留在 `tmp/trajectory-shots/`（被 git 忽略）。
- **测量**：见执行摘要。

### 步骤 10：T12 Electron

- **操作**：`verify-trajectory-electron.mjs` 已经跟不上代码：`SessionStore` 现在要单独传 storage，bridge 改成按域分组（`sessions.*`、`events.*`），首屏分页从 15 轮变成 20 轮，选择器还是英文。逐项修正后运行通过，证据图存为 `shots/14-electron-trajectory.png`。
- **决定**：轨迹页隐藏输入框（K7），草稿检查改成在对话视图填写、切到轨迹确认输入框不可见、切回确认草稿还在。

## 遇到的问题

- **问题**：渲染层文件里不能出现 "brand"、"warm" 字样（主题检查脚本），DSH 的主色变量名带 brand。
  - **应对**：改名为 `--act-trajectory-primary-new`。

- **问题**：vitest 只收 `src/**/test/**`，放在别处的临时测试找不到。
  - **应对**：临时测试放 `src/renderer/test/zz-*.test.ts(x)`，用完删除。
- **问题**：失败请求的错误为空。
  - **应对**：`requests.ts` 依次取记录错误、原始事件 `error`、最后一次重试的失败信息。
- **问题**：浏览器里第一次测流式行，长度一直是 30。
  - **应对**：是取样选错了行（切视图前先显示的是 mock 会话）。改成按 `assistant-running` 的 recordId 取样后，结果为同一节点、长度单调增长。

## 跳过或推迟的事项

- 真实 Provider 的流式会话没有在 Electron 里跑（无模型 key 的隔离环境），流式只由 fixture 回放和单测覆盖。
- 增量 builder 不做，见执行摘要的帧耗时。
