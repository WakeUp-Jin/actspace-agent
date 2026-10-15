# 轨迹问题修复复验 — 2026-10-15

状态：**本轮可执行检查已收束，未整体通过。** B03 请求选项、B04 列表、思考交互、watcher 和流式计算性能通过已列检查；失败状态行仍为灰色，红色要求失败。真实新词搜索、停止后输入框恢复、输出中途失败分支未取得本轮有效证据。工作区仍由 Claude Code 修改，稳定最终版本的验收门禁待补。

## 对象、版本与方式

- 依据：`tmp/codex-acceptance/brief-20261015-recheck.md`、上一轮 `acceptance-20261015.md`。本轮为修复定向复验，没有重新执行上一轮所有 A1–A8 项目。
- HEAD：`42b8ba405dd72efe39abd71eb0782b4e5e926af0`；分支 `fix/front_design_v1`，大量未提交改动。
- 只验收；主智能体和验收子智能体均未修复产品源码、测试、配置，未提交或推送。新增内容为本报告及本地验收脚本、证据；执行构建会更新忽略的构建产物。
- UI 委派 `gpt-6.1-sol`。原生 Computer Use 首次读取即报 `unsupported Codex auth method: apikey`，因此按复验说明改用 **Playwright 浏览器 / 隔离 Electron 自动化**。下文没有将其称为原生 CUA。
- renderer/main 均构建两次成功。第二次 renderer 在北京时间 **21:11:00** 完成，Electron 在 **21:11:01** 完成。后续 Electron 结论属于这次构建；Thinking OFF/ON 成功样本来自第一次构建。
- 检测到 timing、Composer、Settings、Conversation 等文件持续变化后，用户确认 Claude Code 仍在修改，并要求“先完成其他验收项”。据此完成独立检查，不反复追逐改动重建。不能将本报告视为最终工作区整体通过。
- 证据根目录：`tmp/codex-acceptance/20261015-recheck/`。下文文件名相对此目录；这些本地证据不随仓库分发。

## 验收点与执行路线

本轮检查点先按要求拆开；操作按可复用场景合并：

1. R01：真实 deepseek-flash 关闭 / 开启 Thinking 后请求、正文、自然完成。
2. R02：真实失败不展开 Worked 即可看到独立原因行；同时检查即时显示及红色。
3. R03：列表有序编号、无序圆点、嵌套缩进，浅 / 深主题与约 480px 窄窗。
4. R04：思考默认展开；A/B 记录的最近手动折叠行为；13px 与比正文浅一级的颜色。
5. R05：Desktop 全量测试中的 watcher；重复独立运行。
6. R06：2000 chunk split p95 < 2ms，以及轨迹相关回归。
7. R07：真实流式中进入轨迹、正文 / 预览增长、新词约 3 秒内可搜、停止后状态结束且输入框恢复。
8. R08：B01/B02 代表路线重新观察，保留旧开发窗口问题边界；O01 不因计算性能通过而关闭。

路线：浏览器网络 fixture 一次覆盖列表 / 思考及主题尺寸 → 独立 Electron 真实 Thinking OFF/ON → 第二次构建的无效 key 失败 → 有界真实流式路线。工程测试另行执行。截图只保留关键状态；受工具阻断的项目没有用后台事件代替界面通过。

## 逐项结果

| 验收点 | 结论 | 方法、证据与范围 |
| --- | --- | --- |
| R01 / B03 Thinking OFF | **通过** | 真实 Provider + 隔离 Electron 自动化；有 request/header、20 字符正文、turn/end completed；`thinking-completion-results.json`、`thinking-off-completed.png` |
| R01 / B03 Thinking ON | **通过** | 同上；有 header、正文、completed；`thinking-on-completed.png` |
| R02 / B03 独立失败行 | **通过 401 路线** | 隔离连接使用人工无效 key，真实请求返回 401；未展开任何东西，即时、1.5 秒后、刷新后均看到原因；不在 Worked 内。`invalid-key-results.json`、`failure-{immediate,settled,reloaded}.png` |
| R02 / B03 失败行红色 | **失败，B03-R1** | 三次实际 computed color 均为 `rgb(114,114,107)`，为灰色；源码与构建 CSS 核对见下 |
| 输出中途失败需刷新才显示 | **未覆盖该分支** | 本轮 401 在有效正文前失败。它证明此路线即时显示，不能证明输出后失败的更新路径已修复 |
| R03 / B04 列表 | **通过** | 浏览器网络 fixture；浅 / 深 × 1440 / 480：OL decimal、UL disc、嵌套 UL circle，缩进 18px。`static-ui-results.json`、`lists-*.png` |
| R04 思考默认与折叠行为 | **通过已列路线** | 1440 浅 / 深：默认展开；折叠 A→切 B 默认展开→回 A 仍折叠；再折叠 B→回 A 恢复展开。480 仅检查默认态 / 视觉；关闭详情导致卸载，不作为同组件状态保持证据。`static-ui-results.json` |
| R04 思考样式 | **通过** | 13px；浅色思考 `rgb(129,133,140)` / 正文 `rgb(15,17,21)`，深色思考 `rgb(173,178,184)` / 正文 `rgb(249,250,251)`。`thinking-*.png` |
| R05 / I01 watcher | **通过本轮样本** | 三轮全量中该文件均通过，另两次独立运行各 2 条通过；不能据此承诺永不偶发。`desktop-full-test-{1,2,3}.log`、`watcher-repeat-{1,2}.log` |
| R06 流式计算性能 | **通过** | 2000 chunk split total p95 **1.422ms < 2ms**；性能 5 条通过。`streaming-perf.log` |
| R06 轨迹回归 | **通过** | 9 文件 / 64 条通过，含 builder、relations、render-view、details、layout、live、search-index、streaming、timeline-view。`trajectory-regression.log` |
| R07 真实正文 / 预览增长 | **未补齐可复核证据** | 首轮曾记录 477→890 字符 / 1598ms，但现存两张增长截图来自不同故事，不能作为同会话截图对；第二次构建未补齐两时点有效证据 |
| R07 真正新词约 3 秒内可搜索 | **未覆盖有效结论** | 首轮查询缺预先保存的词及基线，后续受截图超时、轮询、页面关闭阻断；不登记为已确认搜索 Bug |
| R07 / B02 停止后恢复输入 | **未覆盖** | 最后运行后台 aborted，但没有有效的点击停止 / “正在停止”消失 / Composer 恢复证据，不能判通过 |
| R08 / B01 全新进程进入轨迹 | **代表路线未复现旧空态** | 多轮在约 3.2–8.7 秒出现助手行；不否定旧开发窗口持续空态，根因仍未定位。流式结果 JSON 与 UI 台账 |
| R08 / O01 偶发长帧 | **未关闭** | 本轮未重测浏览器帧间隔；计算性能门槛通过不代表没有长帧，也不沿用上一轮数字冒充本轮测量 |
| 稳定最终版本门禁 | **未覆盖 / 待停更** | 运行期间工作区持续变化，用户已确认；没有针对最终停更版本统一重建、全量通过与缺项复验 |

主智能体另行目视审阅了深色窄窗列表、浅色思考及即时失败截图；增长截图审阅发现不同会话，已排除其作为增长证据。各项自动化操作细节见 `ui-summary.md`。

## B03-R1（P2）：失败原因行仍为灰色

- 分类：**前端样式问题**。真实供应商 401 是刻意制造的验收条件，不是此次发现的后端缺陷。
- 复现：独立 Electron 数据目录 → 人工无效 key 的隔离 DeepSeek 连接 → 发送普通文本 → 对话中直接观察失败原因。无需展开 Worked；即时、等待及刷新均呈灰色。
- 预期：失败原因作为独立红色状态行展示。实际：独立行已实现，但颜色为 `rgb(114,114,107)`。
- 已核实原因：`apps/desktop/src/renderer/components/conversation/render-message.tsx:23` 的公共状态类含 `text-text-faint`；第 24 行错误类含 `text-on-danger`，第 98 行错误节点同时应用两者。当前构建 CSS 中，两条同优先级规则的 `.text-text-faint` 排在 `.text-on-danger` 后面，覆盖错误颜色；不能通过 class 属性中的书写顺序改变 CSS 层叠结果。
- 构建证据：`failure-color-css-order.json`；`index-BLNcibqF.css` 中两规则位置分别为 151824 / 152346。DOM 与颜色见 `invalid-key-results.json`。
- 本轮仅记录，没有修复。输出中途失败的实时同步问题是另一未覆盖分支，不与此颜色问题合并定论。

## 工程验证

| 检查 | 结果 | 证据 / 限制 |
| --- | --- | --- |
| renderer / Electron 两轮构建 | 通过 | `build-*.log`、`build-epoch2-results.json` |
| Desktop typecheck | 第二轮通过 | `typecheck-epoch2.log`；首次出现 3 个缺 timing 的 TS2741，随后检测到相应源码被其他进程修改，首次失败保留在 `typecheck.log` |
| token / theme / renderer bridge / current docs | 通过当次检查 | `checks-epoch2-results.json`，退出码均 0；最终报告后文档与 diff 检查另见 `final-checks-results.json` |
| 轨迹针对性测试 | 9 文件 / 64 条通过 | `regression-test-results.json` |
| 流式性能测试 | 5 条通过 | 40 chunk split p95 1.521ms；2000 chunk p50 0.954ms / p95 1.422ms |
| 普通事件重建 | 保留性能观察 | 同轮 settled rebuild p50 **41.860ms** / p95 **58.658ms**，机器并行负载与版本不同；没有把原因归到某个改动，也不能继续描述为本轮约 10ms |
| Desktop 全量第一次 | **失败** | 1860 通过 / 2 失败 / 7 跳过，另有一个导入失败 suite；composer-timing 文件在运行中被删除；session-ipc-budget 两条失败。`desktop-full-test-1.log` |
| Desktop 全量第二次 | **失败** | 1866 通过 / 7 失败 / 7 跳过；provider-model-settings 7 条失败，期间 Settings 文件变化。`desktop-full-test-2.log` |
| Desktop 全量第三次 | **失败** | 1875 通过 / 3 失败 / 7 跳过；3 文件失败。`desktop-full-test-3.log`、`desktop-full-test-3-results.json` |

第三轮失败分别为：

1. `runtime-v2-preload-bundle.test.ts`：esbuild 无法解析 `@actspace/shared/desktop-bridge`。
2. `conversation-view-tooltip.test.tsx`：找不到 `/33,361 Token/`。
3. `session-ipc-budget.test.tsx`：2000 事件会话打开测试超过 30000ms。

这三轮均为正在变动的混合 WIP 检查。**watcher 本身通过，不等于 Desktop 全量通过。** 没有据此证明其他失败与轨迹完全无关，也没有在本轮修复或不断重跑这些失败。

## 真实流式取证的限制

1. 首构建：新词搜索等待约 3.3 秒超时，但脚本没有事先落盘 query / 基线，候选还可能来自思考区域，不能确定是新正文搜索失败。曾记录增长数值，但两张现存截图内容不同，排除截图对证据，不据此判增长通过。
2. 第二次构建第一轮：助手轨迹出现后，截图 API 15 秒超时，阻断 search / stop；`stream-screenshot-timeout-results.json`。
3. 下一轮：默认 rAF 轮询长期不返回，额外 CDP 观察已有正文且后台 completed；为有界结束而关闭本次自建实例，不能算用户停止 UI 验收。`stream-raf-polling-blocked-results.json`。
4. 最后轮：改 Node 定时 evaluate；运行中报 `Target page, context or browser has been closed`，没有 pageerror，关闭原因未定位。会话 `35510b3d-56a8-4aa8-9c16-87fb37eeb01a` 有 2029 chunk，最终 aborted。仅支持后台结束，不支持停止交互 / 恢复输入通过。`real-provider-novel-search-results.json`。

本轮工具失败与产品 Bug 分开记录，不将超时或页面关闭直接认定为产品缺陷。上一轮真实增长 / 搜索 / 停止通过记录仍属上一轮，本报告没有把它们改写成本轮通过。

## 工作区与清理

- 指纹：`root-workspace-before.json`、`root-workspace-epoch2.json`、`root-workspace-final.json`、`final-workspace-comparison.json`。报告落盘前相对首次指纹有 33 个已存在文件内容变化、6 个新增、1 个删除；相对第二次构建前有 21 个变化、6 个新增；HEAD 未变。用户确认另一个工作进程仍在修改，因此不能宣称“验收后整个工作区指纹不变”。
- 第二次指纹至最终快照，trajectory、legacy-llm-adapter、render-message、review-workspace-watcher 相关既有文件没有内容变化。这支持相关定向结论的版本范围，不支持其他产品路径最终验收通过。
- 子智能体只写本地验收脚本 / 证据，主智能体写本报告 / 证据；未改产品源码、测试或配置。没有 stage、commit、push。
- 独立 0700 数据目录与 0600 临时凭据均清理；最终 `private-data-*` 和自建隔离 Electron 均为 0，见 `cleanup-evidence.json`。原用户设置没有修改，未主动关闭原 Electron / Chrome / Vite。最终进程快照没有找到原开发 Electron，不宣称其仍在运行，也不推断由谁关闭。

## 后续验收门禁

稳定停更后，应以同一份源码统一重建，并补齐真实正文 / 预览增长、新词搜索、主动停止与 Composer 恢复；需要覆盖输出中途失败时原因更新的特定分支。修复 B03-R1 后定向检查失败颜色。Desktop 全量仍需在稳定版本取得通过结果或明确每个失败的处理决定。B01/B02 原旧窗口异常、O01 长帧不因本轮代表路线而自动关闭。
