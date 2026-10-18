# 近期功能 Bug 与后续修复交接

日期：2026-10-18。基线：`main a13f8a1ee10eed387da575d80ac000cc844f2bff`。

本轮只验收、记录和只读定位，**没有修复**。以下复验要求供用户后续统一安排，不构成本轮修复授权。UI 缺陷、工程检查失败、文档漂移和验收环境限制分别登记，避免把工具故障算成产品 Bug。

后续状态：用户已批准独立修复阶段，本文保留初次验收现场；修复与定向复验结果见[修复摘要](../20261018-acceptance-fixes-docs-cleanup/execution-summary.md)。

| 编号 | 类型 | 结论 |
| --- | --- | --- |
| WA01 | P1 产品缺陷 | Web 停止/失败后队列暂停，缺少可用恢复入口 |
| WA02 | P2 产品缺陷 | Web 窄屏审批按钮可点高度30px，低于44px规范 |
| DA01 | P2 产品缺陷 | Desktop 约482px宽度时 Composer/Context 左侧越界 |
| DA02 | P2 产品缺陷 | 路径别名工作区真实写文件成功，但轮尾改动卡被漏掉 |
| DA03 | P2 产品缺陷 | 历史轨迹助手详情丢失可重建的首 Token、生成时长和吞吐量 |
| ENG01 | 工程门禁失败 | Runtime tool-composition 连续两次15秒超时，原因未定 |
| DOC00 | 文档门禁失败 | 17处失效引用；漂移与迁移另见DOCS计划 |

## WA01 · Web 停止或失败后，同会话后续消息永久排队

状态：已复现，待修复。优先级：P1；Web 的会话恢复路径被阻断，建议优先修复。影响验收点：Web W13、W14 的恢复分支；可能影响重连后的暂停会话，尚未扩展推断为通过或失败。

方法：`gpt-6.1-sol` 使用独立 Playwright 浏览器、当前生产 Web 构建、真实本地 Host 和受控 synthetic Provider 验证。属于工程 UI 验证，非原生 Computer Use；未使用真实外部模型凭据。

复现 A（用户主动停止）：

1. 配对隔离 Host，在新会话使用可控 Provider 发送 `FIXTURE_HOLD stop acceptance`。
2. 看到流式正文及运行状态后点击停止，界面显示“已停止”。
3. 同会话发送 `after stop normal`。
4. 新消息进入排队托盘，超过两分钟没有启动；Provider 没有新请求。释放旧 Provider 等待后仍未恢复，刷新页面仍留在队列。

复现 B（模型请求失败）：

1. 新会话选择受控 `fixture-error`，首条请求返回 HTTP 400 terminal-error。
2. 界面显示可读 `invalid-request` 错误。
3. 切回正常 `fixture-main`，发送 `normal after failure`。
4. 新消息同样停在队列，等待后 Provider 没有新请求。另建新会话的第一条消息可以执行，因此不是全 Host 离线。

预期：停止/失败后，用户能理解会话状态，并通过正常界面继续工作；再次发送不应被静默接纳为永不执行的队列项。若队列必须显式恢复，需存在可发现的恢复入口，且遵守停止时不自动放行旧队列的约束。

当前源码链支持的定位：

- `docs/design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md:23` 明确停止/失败后暂停，发送新输入不解除暂停。Desktop 原生界面存在“已暂停/继续发送”，Web 没有对应恢复入口；暂停本身不是 Bug。另一个前端规范写手动发送后恢复的矛盾记作 DOC13，等待文档计划统一。
- `apps/web/src/sessions/use-composer.ts:30` 的 `send()` 仅调用 `tasks.submit`；该 controller 没有恢复队列操作。
- `packages/agent-service/src/run-manager.ts:79` 的 `stop()` 先暂停 ledger；`:73` 的恢复是独立操作，`:121` 调度器遇到 `paused` 直接返回。
- `packages/agent-service/src/task-projection.ts:68` 在非 completed 的结束状态保持队列暂停。
- Host 协议已有 `tasks.command op=resume`。这说明不能简单删除后端暂停语义；修复方案应校准 Web 的状态呈现和继续执行入口。上述是只读定位，没有通过修改源码验证根因修复。

证据：同目录 `screenshots/web-after-stop-queued-idle.png`、`web-after-stop-reload.png`、`web-after-failure-queued.png`（本地截图，不随仓库分发）；`tmp/codex-acceptance/20261018-web-site/engineering-results.json` 中 W13、WA01、W14 记录与脱敏 Provider 请求计数。完整操作结果见 [Web/官网验收](web-site-acceptance.md)。

修复后定向复验：停止/立即失败/流式后失败三种状态；已有排队项与停止后新发项；刷新及重连；继续操作只执行一次；旧队列不得在用户尚未决定时自动逃逸。至少补跨真实 Host 的恢复验证，不能只 mock `tasks.submit` 成功。

## WA02 · Web 窄屏审批按钮的可点高度低于触控规范

状态：已确认尺寸不符合现行规范，待修复。优先级：P2。影响验收点：Web W20 的审批触控尺寸；允许/拒绝的功能路径仍可操作，不能扩大解释为审批失效。

方法：独立 Playwright 浏览器，在当前生产 Web 构建、真实隔离 Host、受控 Provider 下观察。属于浏览器工程 UI 验证，没有用 iPhone 真机验证实际误触率。

复现：

1. 在隔离 Web 会话触发 Bash 审批，切为 390×844 深色视口，滚动至审批卡。
2. 测量“运行”按钮的实际 DOM 边界：`x=316, y=616.1875, width=50, height=30`；页面没有横向溢出（`scrollWidth=clientWidth=390`）。
3. 核对按钮本体及周围点击区域实现：`PillButton` 直接渲染绑定操作的 `<button>`，没有额外扩大命中区域的 wrapper 或伪元素。

预期：`docs/design-docs/frontend/front-web-pwa客户端规范.md:289` 要求可点区域不小于 44×44px。实际审批按钮的可点高度只有30px。

只读定位：`apps/web/src/styles/web.css:155–178` 的 `.pill-btn` 默认高度30px、xs为26px；`apps/web/src/ui/PillButton.tsx` 没有扩展点击区域；`apps/web/src/pages/session/ApprovalCard.tsx:62–64` 的“拒绝”“本会话允许”“运行/允许”均使用该组件。当前已测量“运行”按钮，不声称逐个测量全站所有按钮；其他消费者应在后续修复时核对。

证据：本地 `screenshots/web-approval-390-dark-visible.png`；`tmp/codex-acceptance/20261018-web-site/engineering-results.json` 的 `W20-approval-visible` 条目。

修复后定向复验：390px及更窄支持尺寸下，审批各操作的实际命中区域至少44×44px，按钮之间不重叠，长命令/前缀不挤出操作；浅深主题、允许和拒绝仍正确。若扩展共享组件，补查排队托盘的相关按钮，不能只扩大视觉背景后仍保留原点击区域。

## DA01 · Desktop 最小宽度附近 Composer 与 Context 弹层左侧越界

状态：已通过原生 Computer Use 重复复现，待修复。优先级：P2。影响 Desktop V02；C01 的宽屏口径验证与窄屏几何问题分开记录。

环境：当前固定构建的隔离 Electron，浅色主题；原生拖动窗口至截图964×1722物理像素，约482px CSS宽。`apps/desktop/src/main/window-security.ts:24` 明确 `minWidth: 480`，属于产品支持的窗口范围。

复现：

1. 在有历史的隔离会话中缩窄窗口至约482px CSS宽，关闭侧栏/右侧面板。
2. 点击 Composer 状态栏的 Context 百分比，打开上下文用量浮层。
3. 观察浮层左边框位于窗口外，标题贴左并部分裁切；Composer 左圆角同样越出窗口。
4. 关闭浮层，再从百分比入口重开，保持同样裁切。

预期：支持的最小窗口宽度内，Composer 与上下文浮层保持可见边界、内容不被窗口裁掉；仍能完成关闭和查看完整上下文。

证据：本地 `screenshots/native-context-light-narrow.png`、`native-context-narrow-reopened.png`。同处“本机”文字换行作为观察保留，不单独扩大为第二个缺陷。

只读线索：`apps/desktop/src/renderer/components/Composer.tsx:41` 的窄屏宽度声明、`:463–466` 的 footer anchor；`ContextPopup.tsx:13` 跟随 anchor 宽度、`:88` 关闭碰撞规避。可能涉及父布局/状态行最小宽度或 anchor 的实际几何；尚未用修改代码确认具体原因。

修复后定向复验：480、约482、600px及常规宽度，浅深主题；侧栏/右面板开关、有无用量及长模型名；Context 开关、完整面板、Composer 输入发送、状态栏浮层和焦点。检查真实 Electron，不仅浏览器 mock。

## DA02 · 路径别名工作区的文件改动卡漏显示

状态：真实 Provider + 原生 Computer Use 已复现，待修复。优先级：P2。影响补验 R05 / Desktop D01 的轮尾改动卡；不能扩大为文件没有写入或 present 交付失效。

环境：当前 HEAD 固定构建，默认真实 `deepseek-flash` 连接，新建专用测试会话 `RealAcceptance-20261018-Main`（`075e242e-606b-4912-bd23-df3572ab2f7d`）。工作区登记路径 `/tmp/actspace-real-20261018-88xbant8/workspace` 在 macOS 上实际指向 `/private/tmp/actspace-real-20261018-88xbant8/workspace`。这是验收专用 Git 仓库，不是产品仓库。

复现：

1. 通过原生文件选择器登记上述 `/tmp/` 路径，新建测试会话。
2. 设置中确认“显示本轮代码改动”为开启；本轮没有修改这个原值。
3. 正常 UI 发送任务，让真实模型调用 `write_file` 创建两行的 `acceptance-one.txt`，再调用 `present` 交付该文件。
4. 工具写入成功，Worked 内存在 Write 记录；交付卡、右侧预览、系统文本编辑器和 Finder 定位均可用，但最终回复下没有相应的单文件改动卡。
5. CmdR 刷新，交付卡仍在，改动卡仍缺失。
6. 同会话第二轮修改原文件、新增文件、创建后删除临时文件并 present 两文件；工具全部成功，仍没有轮尾改动卡。

对照：在另一个新登记的 `/private/tmp/actspace-real-20261018-88xbant8/canonical-workspace` 新会话执行同类两轮操作，单文件 `+2/-0`、两文件 `+5/-2` 的改动卡正常，临时新建后删除文件不入卡，第1/2轮 Review 与 hover diff 可用。该对照只帮助界定路径分支，不抵消原别名工作区的失败。

预期：工作区内成功完成的文件修改应出现在轮尾改动卡，工作区路径的合法别名不应使同一文件被当作工作区外文件过滤。

只读定位与数据对账：

- 本次 Journal 的 `write_file` 结果 seq573 已完成，`detail.result.path` 为 `/private/tmp/…/acceptance-one.txt`；会话 header 的 `cwd` 为 `/tmp/…/workspace`。
- `packages/tools/filesystem-write/src/node-ports.ts:106` 的资源复核返回 canonical path，`:155` 再用工作区字符串计算展示路径；别名不一致时保留绝对路径。
- `packages/client/src/sessions/tool-card.ts:82` 的 `workspaceOutputMetadata` 使用词法相对路径判断；当前输入被判到工作区外，缺少 `outputRelativePath`。
- `apps/desktop/src/renderer/components/turn-tail/turn-tail-data.ts:107` 无相对路径就跳过改动项。present 返回相对路径，因此仍生成交付卡。
- 使用本次专用事件调用当前已构建 `toolPreview`，原 root 产生缺少相对路径的 preview；仅工程比较改用 `realpath(root)` 后产生 `acceptance-one.txt`。这支持路径口径不一致的定位，没有修改代码或声称修复已经验证。

证据：本地 `screenshots/real-changes-setting-on.png`、`real-alias-refresh-no-changes-card.png`、`real-alias-round2-no-changes-card.png`；对照 `real-canonical-single-turn-review.png`、`real-canonical-multi-turn-review.png`；脱敏 `tmp/codex-acceptance/20261018-recent/engineering/real-turn-path-audit.json`。逐项结果见 [真实连接补充验收](real-provider-acceptance.md)。

修复后定向复验：`/tmp`/`/private/tmp`、合法符号链接与普通真实路径；相对/绝对工具入参；单文件、多文件、新建后删除；流式到完成、刷新后回读；第N轮 Review、present 和系统打开。不可直接移除工作区边界检查来让卡片出现。

## DA03 · 历史轨迹助手详情的首 Token 和生成计时缺失

状态：真实 Provider + 原生 Computer Use 已确认，工程数据链复现支持定位；待修复。优先级：P2。影响补验 R02 的轨迹计时一致性。Thinking 开关、思考正文和 Token 分拆仍可单独通过，不扩大为实际请求失败。

复现：

1. 在本轮 `RealAcceptance-20261018-Main` 会话，使用真实 `deepseek-flash` 完成 Thinking ON 的第2轮短回复。
2. 刷新并从历史打开轨迹，选择“第2轮 · 第1步”的助手消息详情。
3. 模型、114 Token（52推理+62正文）、思考和正文正确，总时长992ms；但首 Token 延迟、生成、吞吐量均显示“首 token 时间不可用”。

预期：已有完整持久日志的请求，其轨迹详情可以呈现有依据的首 Token 和生成计时；缺失数据时不捏造。该请求完整日志的开始、首 chunk、完成分别为 `04:52:56.915Z`、`04:52:57.442Z`、`04:52:57.907Z`，可得 TTFT 527ms、生成465ms、约245.2 tok/s。之前观察的数值来自用量/计时弹窗，**没有证据证明刷新前同一个轨迹详情曾正确**，因此不将缺陷写成仅刷新触发的回归。

只读定位与工程复现：

- `packages/runtime/src/session/session-controller.ts:97` 的默认历史读取调用 `slimHistoryWindow`；`:323` 移除已有定稿消息的 `assistant/chunk`。
- 本次 `assistant/message` 没有保存 `firstTokenAt`。`apps/desktop/src/renderer/trajectory/builder.ts:395` 依赖消息字段或 chunk 推导首 Token，因此精简历史中得到 null。
- 只对本次白名单验收会话调用当前已构建的 `slimHistoryWindow`，再经当前源码的轨迹 builder 比较：完整事件计算前两轮 TTFT 为924/527ms、生成583/465ms；精简历史两轮均为 null，Token 与总时长仍在。
- 此比较不修改产品输入或代码，也不等同修复验证。宿主会话统计使用全量投影，其数值正确不抵消轨迹详情缺失；无需为此恢复传输全部历史 chunk，具体方案留待修复阶段。

证据：本地 `screenshots/real-thinking-trajectory-detail.png`；脱敏 `tmp/codex-acceptance/20261018-recent/engineering/real-trajectory-timing-audit.json`。逐项结果见 [真实连接补充验收](real-provider-acceptance.md)。

修复后定向复验：普通/Thinking、重试/失败/停止、打开历史/刷新/重新启动、较长会话的分页；轨迹详情和时间轴与全量日志有据一致。缺少 chunk 的旧历史仍应如实显示不可用；不得假造首 Token、重复累计 usage 或引入全量事件传输退化。

## ENG01 · Runtime tool-composition 测试连续超时

状态：已复现工程门禁失败，产品原因未定；待定位。不能将“测试超时”直接认定为某个 UI 功能损坏。

命令与结果：

1. `pnpm --filter @actspace/runtime --filter @actspace/core-agent-loop --filter @actspace/session-projection --filter @actspace/context-engine --filter @actspace/context-compaction test`：其他四包通过；Runtime 55 通过、1 失败。
2. 在其他检查完成后独立执行 `pnpm --filter @actspace/runtime exec vitest run src/harness/tool-composition.test.ts`：同一测试仍在 15,000ms 超时，1 失败。

失败项：`packages/runtime/src/harness/tool-composition.test.ts:12`，`boots the checked-in tree with shell and Todo disabled, leaves file tools available, and requires restart`。测试涵盖装配、禁用 shell/Todo、租约、shutdown 失败重试、权限变化后的恢复；当前错误没有给出卡住的具体 await，不能仅凭测试标题定位。

本地日志：`tmp/codex-acceptance/20261018-recent/engineering/runtime-test.log`、`runtime-tool-composition-recheck.log`。均保留原始失败；没有改 timeout、skip 测试或放宽断言。

后续：先定位具体生命周期阶段，区分 harness 资源释放缺陷、恢复死锁与测试设施问题；修复后原超时配置下通过该单测及 Runtime 全量，再复验相关 Host 生命周期。当前 Host 进程测试 7 项通过不能抵消本项失败。

## DOC00 · 当前文档检查 17 处失效引用

状态：本轮已确认，暂不清理或修改既有 DOCS。`pnpm check:docs` 失败，构成为 Web Demo 缺截图 1、Site V4 Demo 旧 Logo 13、旧官网 Demo 旧 Logo 2、官网 Markdown 缺 `SHOWCASE_PLAN.md` 1。

文档漂移 DOC01–DOC13、31 个 Demo 迁出清单、2 个暂缓项和桌面备份步骤统一见 [DOCS 检查与清理计划](../20261018-docs-audit/cleanup-plan.md)。这组问题建议按批准后的文档计划处理，不为退役 Demo 恢复产品源码中的旧资产。

## 非产品 Bug：验收限制

- CU-B01：浏览器 tab API 创建调用返回 `unsupported Codex auth method: apikey`。初轮 Web/官网原生 Computer Use 未覆盖；工程浏览器证据单独列出。真实连接补验中 native `getApp` 可读取 Chrome 的既有页面，但没有本轮已配置真实 Host 的 Web 路线，未继续操作旧页面；不能扩大称全部原生 Chrome 或 Computer Use 不可用。
- 真实 Provider 的部分路径已在 [补验](real-provider-acceptance.md) 实测；首次停止时点不明未签收，后续带时间戳的定向补验已确认真实取消、部分保留、显式继续和刷新无重复，未新增停止 Bug。iPhone Safari / Tailscale、系统安装和其他缺现场数据的点仍按分报告保留未覆盖，不能当作通过，也不能自动当作产品 Bug。
- 旧验收中的 MN01–MN04 等只在当前版本复现后结论成立；旧“已修复”文字不作为本轮实测通过。

每个问题均保留复现、证据和定向复验条件，后续修复另行安排。
