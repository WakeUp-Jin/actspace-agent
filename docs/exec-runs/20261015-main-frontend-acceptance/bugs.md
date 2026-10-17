# main 前端统一验收 Bug 记录

版本：main `00e5a159d2bc45fe6f6a7ec4d4da7a5162a9f745`。仅验收，未修复。本轮记录已汇总，最终结论以 [验收台账](acceptance.md) 为准。

## MN01 — 失败原因行仍为灰色（P2，前端）

- 关联：T11 / T12，历史 B03-R1。失败原因现在独立显示且即时更新，但红色要求仍不满足。
- 复现：隔离 Electron 配置无效 key，或本地兼容 SSE 输出后返回终态失败；不展开 Worked，观察轮末失败行，刷新后再次观察。
- 实际：失败原因可见、刷新一致，computed color 为 `rgb(114,114,107)`，不是红色。
- 核实原因：`apps/desktop/src/renderer/components/conversation/render-message.tsx` 的 `TURN_STATUS_LINE_CLASS` 含 `text-text-faint`，失败分支又拼接 `text-on-danger`，两种颜色类同时存在；当前构建 CSS 同级优先级下前者覆盖后者。JSX 类名的先后不能保证最终 CSS 优先级。
- 影响：错误与普通状态视觉层级相同，违背本轮明确红色验收标准；失败原因可见性本身已改善。
- 建议：后续修复让错误/正常状态只选择一种颜色 token，按浅/深主题 computed color 定向复验；本轮不改样式。
- 证据：轨迹组 `failure-immediate` / `reloaded` 状态 JSON 与截图，精确目录见本文末尾证据索引。

## MN02 — 停止或中途失败后已输出正文消失（P1，后端终态持久化与前端交接）

- 关联：T08 / T12。停止恢复通过，不应因此判正文保留通过。
- 复现 A：真实 Provider 长正文输出，UI 点击停止，等待 aborted 终态，返回对话。停止前同记录正文 154→258 字；停止后只剩用户消息和 Stopped。
- 复现 B：本地 OpenAI 兼容 SSE 服务先发 20 个真实正文 chunk，界面已显示 `Partial text`，再返回不可重试 error；终态后正文消失，刷新后仍消失。
- 实际：两条 Journal 的最终 `assistant/message` 均为 `content: []`，finishReason 分别 `aborted` / `failed`。不是仅丢了流式截图或 UI 尚未加载。
- 已核实链路：`packages/core/agent-loop/src/loop.ts` 的 `collectStream()` 已有 `text` 聚合及空 content 时转文本块的逻辑；但循环的 `delayMs === null` 分支写入失败/终止消息时明确写死 `content: []`，然后 step/end 并 throw，未使用已聚合 `output.content`，也没有 surface append。持久层因此没有部分正文；流式 overlay 结束后聊天转入持久投影，正文消失。若 stream 直接 throw，另一个 catch 会调用 `failedStreamOutput()` 清空聚合，该分支也应在修复时审查，当前受控 error 样本无需靠该推断成立。
- 影响：用户主动停止、网络/提供方中途失败会丢掉已看到的答案；刷新也无法从聊天历史恢复。原始 chunk 可能还在 Journal，不代表聊天正文保留。
- 建议：后续定义失败/终止的部分正文持久化与 surface 行为，保证同 messageId 交接；同时处理直接 throw 和正常 error/aborted 事件，避免仅在 UI 做兜底掩盖持久层缺失。分别复验主动停止、error、throw 及重载，防止重复消息/工具调用被错误执行。
- 证据：真实 `real-JkX5OT/stop-final-body.json`、`stopped-editable.png`；受控 `real-azhrr6/partial-before-failure.png`、`results.json`、`failure-immediate` / `reloaded`，完整根目录见本文末尾证据索引。

## MN03 — 失败重试漏算模型用时（P2，宿主统计）

- 关联：S03；基础真实 TTFT/TPS、刷新恢复及正常多请求不受本样例否定。
- 复现（独立宿主 reducer 探针）：同一步，r1 请求头在 1s，4s `llm/retry`；1s 重试等待；r2 请求头在 5s，6s 首 token，9s assistant/message。事件顺序对应 AgentLoop 的正式重试路径。
- 预期：按本轮计划的有效请求合计，模型用时应为 3s + 4s = 7s；若按 DSH 整步边界口径，应是 9s，需在修复时明确等待时间与请求准备是否计入。无论哪种口径，当前 4s 都丢掉第一次调用。
- 实际：宿主 `llmMs=4000`、TTFT=1000ms、decodeMs=3000、decodeTokens=30。只计算最后一次成功请求。
- 核实原因：`packages/session/projection/src/facts.ts` 的 sessionStats 不处理 `llm/retry`；后一次 request/header 直接覆盖同 step 的 startedAt，前一次请求没有结算机会。AgentLoop 对可重试失败只发 llm/retry、不发 assistant/message，不能依赖现有 message 结算来补齐。正常多步用例不会暴露这个问题。
- 影响：遇到 429/503 等重试时会话模型用时偏小；统计口径与“累加完整会话模型用时”以及 DSH 对齐声明不一致。没有实测真实 Provider 故障，本结论为构建后的宿主 reducer + 正式运行源码对照，不冒充 UI/真实网络故障样本。
- 建议：先明确按请求还是整步含等待的口径，然后覆盖重试开始/结算状态；不要因为费用重试已计入就认为用时也正确。增加后续修复的定向用例：失败重试→成功、重试等待中停止、最终失败、重开历史。
- 证据：`tmp/codex-acceptance/20261015-main/engineering/stats-probe.json`、`probe-stats.mjs`；现有正式 tests 通过并不包含该失败重试用时断言。

## MN04 — 侧栏搜索按 Esc 关闭后焦点丢到 BODY（P3，前端键盘交互）

- 关联：V02；SB01 搜索、清空、Esc 关闭本身通过。
- 复现：打开侧栏标题行「搜索会话」，输入或聚焦搜索框，按 Esc；检查当前键盘焦点及下一次 Tab 路线。
- 预期：返回刚打开搜索的按钮，键盘用户能继续该处操作。
- 实际：搜索关闭后 `document.activeElement.tagName === "BODY"`，没有回到「搜索会话」。同路线视图菜单 Esc 则正确回到「视图选项」。
- 已核实原因：`SidebarSectionHeader.tsx` 的 SidebarSearchBox 挂载时主动 focus input，Escape 只调用 onClose；`SidebarSessions.tsx:70` 的 closeSearch 只关闭状态并清查询，导致聚焦输入卸载，没有恢复触发器焦点的路径。
- 影响：键盘操作位置丢失；不影响鼠标搜索或查询结果，不将整个搜索功能判失败。
- 建议：后续为搜索触发器保留 ref，在 Esc / 关闭按钮等主动关闭后恢复焦点；失焦自动关闭应尊重用户新焦点，避免无条件抢回。定向复验 Esc、关闭按钮、空搜索点击外部以及视图切换。
- 方法与证据：Playwright 浏览器 sidebar fixture + 源码对照；`sidebar-workspace/run-001/focus-visual-results.json`、`search-esc-focus.png`。不冒充原生 CUA。

## O01 — 长帧与普通事件定稿层重建继续保留（已有观察，性能）

- 关联：T15 / T16。增量纯 chunk 达标，不代表普通事件或整个浏览器没有长帧。
- 本轮计算采样：2000 chunk split p95 0.368ms；非 chunk 触发的 settled rebuild p50 12.908ms / p95 22.543ms，超过单帧 16.8ms 预算。
- 浏览器 quiet-window：短回放 198 帧，p95 16.7ms / max16.8ms；长回放 680 帧，p95 16.8ms / max100ms，其中 2 帧 >50ms。同行在可见期间未换 DOM；离尾后详情继续增长。
- 核实边界：普通事件全量重建是已知实现路径；尚未用 profiler 归因长回放的每个长帧，不能把 100ms 全部归因于同一函数。开发服务器、浏览器调度和 GC 也可能贡献。
- 建议：后续修复前在工具密集长会话做 performance trace，将重建、布局/绘制和 GC 分开；按用户既定后续性能方案处理，不在本轮改实现。
- 证据：`engineering/trajectory-perf.log`、`trajectory-stats/frames-DMhymv/streaming-long-raw.json`、`long-visible-node-analysis.json`。

## 证据索引与交接

所有本地证据相对 `tmp/codex-acceptance/20261015-main/`，不随仓库分发。JSON 中仅保留脱敏数值/测试正文，临时凭据与完整原始 Journal 已清理。

| 问题 | 主要证据 |
| --- | --- |
| MN01 | `trajectory-stats/invalid-4ICly2/invalid-key-results.json`；`trajectory-stats/real-azhrr6/results.json`、`failure-immediate.png` / `failure-reloaded.png` |
| MN02 停止 | `trajectory-stats/real-JkX5OT/growth-first.json` / `growth-later.json`、`stop-final-body.json`、`stopped-editable.png` |
| MN02 中途失败 | `trajectory-stats/real-azhrr6/partial-before-failure.png`、`results.json`、`terminal.json`、`failure-immediate.png` / `failure-reloaded.png` |
| MN03 | `engineering/stats-probe.json`；根下 `probe-stats.mjs` |
| MN04 | `sidebar-workspace/run-001/focus-visual-results.json`、`search-esc-focus.png` |
| O01 | `engineering/trajectory-perf.log`；`trajectory-stats/frames-DMhymv/` |

建议修复顺序：先 MN02（已见正文丢失），再 MN01 / MN03，随后 MN04；O01 单独性能归因。修复后按关联验收点定向复验，再补相关自动化门禁，不要求复跑不受影响的全部路线。本轮没有修复任何项。
