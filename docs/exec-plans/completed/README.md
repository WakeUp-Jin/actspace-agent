# 已完成的执行计划索引

这里的计划实现已经完成，原文保持不动；本页只做检索。人工验收边界保留在各计划正文和对应的[执行摘要](../../exec-runs/README.md)里，不代表全部验证通过。生命周期规则见 [执行计划](../README.md)。

共 208 项，按日期从新到旧；无日期前缀的早期计划排在最后。

另有 [design-archive/](design-archive/)：docs 整理时从前端设计文档里拆出的决策表、测试清单、交接记录和早期重构稿，只做追溯。

| 日期 | 计划 | 一句话 |
|---|---|---|
| 2026-11-09 | [Desktop 安全遗留清零](20261109-desktop-security-debt.md) | safeStorage 迁异步、子进程不再继承凭据 env、Browser Bridge 源码目录由 main 对话框选择、主文档 CSP 经 `onHeadersReceived` 下发、IPC 审计禁止裸 `ipcMain.handle`；`style-src` 仍留 `'unsafe-inline'`；Electron 真机走查未做 |
| 2026-11-08 | [CI 重新上线与桌面发布流水线](20261108-ci-pipelines.md) | P1–P5 随 #48 / #57 / #58 合入 main：CI 必红修掉并分层加缓存、Dependabot / CodeQL、`v*` tag 四平台打包 + 草稿 Release、Electron 39 → 45；首个 tag 实发、Windows 与 Electron 45 实机走查未做 |
| 2026-11-08 | [上下文面板整理](20261108-context-panel-polish.md) | 上下文事件写清变化、明细分页并入「再显示」、去掉卡片边框；合入 main #45；Electron 实机检查未做 |
| 2026-11-08 | [pi-ai 1.5.0 与复用内置服务商](20261108-pi-ai-builtin-providers.md) | 连接 Base URL 命中 pi-ai 内置服务商时复用其协议、思考参数与请求头，代理改走请求级 fetch；合入 main #41；真实 Key 与 Electron 实机检查未做 |
| 2026-11-08 | [子智能体单行卡片、来信卡片与面板实时动态](20261108-subagent-compact-cards.md) | 派发卡片改单行，实时动态移到右侧列表，`agent_message` 改为来信卡片；合入 main #37；Electron 实机检查未做 |
| 2026-11-07 | [统计页重做（使用统计 + Harness 统计）](20261107-stats-redesign.md) | 两页按 demo 第 4 版重做，只算页面显示的数，统计库 Schema 17 → 18 整库重建；合入 main #38；Electron 真实数据走查未做 |
| 2026-11-07 | [编辑提问重发与空闲发送不进队列](20261107-edit-resend-rewind.md) | 点提问卡片原地编辑后从该轮重来，`tasks.submit` 带 `rewind`；空闲发送不闪队列；合入 main #36 |
| 2026-11-07 | [对话内容只存一份：surface 只做标记](20261107-surface-derived.md) | envelope 的 `surface` 不再带 `node`，节点由 `surfaceNode(event)` 从 `data` 推出；旧会话按用户确认删除；合入 main #35 |
| 2026-11-07 | [上下文引擎不再每次请求复制对话](20261107-context-trusted-surface.md) | 日志交出的对话视图登记为已信任，上下文引擎直接引用；run8 实测 `stateDigest` 239 → 87 MB；合入 main #35 |
| 2026-11-07 | [流式 Markdown：尾部解析降频与解析器常驻](20261107-markdown-stream-throttle.md) | 流式尾部最多每 100ms 解析一次，两次解析之间原样显示；run8 实测渲染进程 Markdown 约 722 → 48 MB；合入 main #35 |
| 2026-11-06 | [请求记录只在变化时写完整内容](20261106-request-record.md) | 提示词、工具拆成只在变化时写的事件，`request/context` 只留小字段，估算从日志推算；run4 日志 8.57 → 1.60 MB；合入 main #35 |
| 2026-11-05 | [流式输出只走实时通道](20261105-live-assistant-stream.md) | 新会话不再持久化 `assistant/chunk`，`assistant/message` 记 `firstTokenAt`，主进程保存未定稿底稿；合入 main #35 |
| 2026-11-08 | [模型目录价格锁定与删除运行时刷新](20261108-catalog-price-lock.md) | 生成脚本改合并模式（已有条目锁定、只新增、不删除、改价清单、报告），删除 Desktop 运行时目录刷新；Electron 实机检查未做 |
| 2026-11-04 | [卡顿与内存修复](20261104-perf-jank-fix.md) | journal 增量续读 + LRU 缓存、空闲会话释放、流式 IPC 合并、渲染订阅隔离与懒加载、客户端追加与缓存上限；Electron 实机验收未做 |
| 2026-11-04 | [docs 整理：前端设计规范重建与冗余清理](20261104-docs-reorg.md) | 前端四份必读规范与区域规范路由表、设计文档唯一索引、执行记录与学习文档去重、文档检查加严 |
| 2026-11-03 | [子智能体与后台任务改造 — 执行计划总览](20261103-subagent-background-redesign/README.md)（目录） | S1–S6（留痕、后台 Bash、子智能体核心、Fork、外部 Codex / Claude Code、界面与设置）完成，验收修复 BUG-01/02/03，合入 main 的 #32（「#32 外观 + S6 数据」） |
| 2026-11-03 | [子 Agent 列表与详情顶部栏样式调整](20261103-subagent-style.md) | 右侧「子 Agent」面板换成用户在 demo 里选定的样式：列表用设置页分组卡（右上 token、右下耗时），详情顶部栏精简成一行（返回 · 头像标题 · 模型 · 状态耗时 · 轨迹切换） |
| 2026-11-02 | [Context 面板 · Bash 命令统计](20261102-context-bash-stats.md) | 右侧「上下文」最底下新增「Bash 命令」卡片（调用、失败、合计耗时、程序与子命令分布） |
| 2026-11-02 | [Markdown 编辑与渲染（文档面板 CM6 实时预览 + 聊天区 Markdown）](20261102-md-render.md) | 「文档」面板的预览和源码换成同一个 CodeMirror 6 实时预览编辑器（光标所在元素露出标记、可直接编辑，T1–T16，规范） |
| 2026-11-01 | [功能减法 — 执行计划总览](20261101-feature-subtraction/README.md)（目录） | P1–P5、S1–S4 完成（分支 架构优化，提 PR 合入 main，已合并 main 上的会话记录 Markdown） |
| 2026-11-01 | [Harness 统计（第一期：数据层 + 设置页）](20261101-harness-stats.md) | 2026-11-01 T1–T12 已实现，自动化验证完成；尚未验证的是 Electron 真实 Host 下页面打开、切 tab、改筛选和会话进行中自动刷新 |
| 2026-11-01 | [插件结构 — 执行计划总览](20261101-plugin-structure/README.md)（目录） | 已完成（2026-11-02，分支 架构优化 本地提交 e9e41914…15ceb558，未合入 main） |
| 2026-11-01 | [会话记录 Markdown（Session Transcript）](20261101-session-history-transcript.md) | 新插件 @actspace/session-transcript 每轮结束写 sessions-v2/<id>/transcript.md，主会话提示词告诉 Agent 怎么读历史会话 |
| 2026-11-01 | [10 月 31 日修复与 11 月 1 日功能统一验收](20261101-unified-acceptance.md) | 2026-11-01 同版本64点、7组执行结束，44通过/11失败/9未覆盖 |
| 2026-10-25 | [压缩的前端回显（A1）](20261025-compaction-display.md) | 对话里压缩改为居中分隔线（条数、压缩前 → 约压缩后 tokens、耗时、「在轨迹中查看」），摘要只在轨迹看 |
| 2026-10-25 | [工具沙箱的出沙箱与回退](20261025-sandbox-escape-fallback.md) | T0–T6 完成（分支 feat/sandbox-refactor，提 PR 合入 main） |
| 2026-10-25 | [沙箱第一期：地基 + 工具沙箱（macOS / Linux）](20261025-sandbox-v1-tool-sandbox.md) | T0–T10 完成（分支 feat/sandbox-refactor，提 PR 合入 main） |
| 2026-10-25 | [沙箱第二期：评估沙箱（macOS / Linux）](20261025-sandbox-v2-evaluation-sandbox.md) | T0–T8 完成（分支 feat/sandbox-refactor，提 PR 合入 main） |
| 2026-10-25 | [官网 V5：文档、博客与更新日志改版](20261025-site-v5-docs-blog-updates.md) | 文档 A4 小舞台、博客 Q2 列表 + R3 头部 + M2 正文、更新日志 U1 时间轴 |
| 2026-10-22 | [后台任务：后台 Bash、后台子智能体与任务工具](20261022-background-tasks.md) | T1–T10 完成（feat/background-tasks 已合并入 fix/settings-model-select） |
| 2026-10-21 | [设置 › 模型：获取可用模型弹窗与连接详情 V3](20261021-model-acquisition-picker.md) | 去掉启用开关（迁移删掉停用模型）、所有连接用「获取可用模型」弹窗手动勾选、新连接为空并自动弹窗、手动添加按 ID 自动补全、行内移除 + 8 秒撤销、连接字段失焦即保存 |
| 2026-10-21 | [设置 › 模型：四层数据模型与页面重做](20261021-model-provider-redesign.md) | A–E 完成，旧 provider 页面、多 Key、billingMode 与旧 IPC 删除 |
| 2026-10-21 | [侧边对话（Side Chat）](20261021-side-chat.md) | 插件 @actspace/side-chat、openSideChat IPC、右栏 sideChat tab、/side 与侧栏数量完成 |
| 2026-10-21 | [子智能体轨迹：父轨迹只留一行，右侧面板看子轨迹](20261021-subagent-trajectory.md) | 父轨迹只留 agent 一行，详情「查看轨迹」在右侧子 Agent 面板打开子会话轨迹（对话 / 轨迹切换，窄面板详情在下半部分） |
| 2026-10-18 | [验收缺陷修复与文档迁出](20261018-acceptance-fixes-docs-cleanup.md) | 5 个产品缺陷及 Runtime 测试已修复，31 个 Demo 经桌面备份和哈希校验后迁出 |
| 2026-10-18 | [Context 面板「路径」卡片](20261018-context-paths-panel.md) | 卡片、预判字段与 mock 完成，自动化测试和浏览器截图通过；交接文档 P1–P8 Electron 验收未执行，见执行摘要 |
| 2026-10-18 | [Context Step 更新、压缩与路径面板接口](20261018-context-step-update.md) | T1–T5 后端、刷新与交接完成；路径 UI 留给 CloudOps，验证边界见执行摘要 |
| 2026-10-18 | [DeepSeek 搜索聚合与可选抓取](20261018-deepseek-web-tools.md) | 三路聚合、独立启停与默认关闭的付费抓取已实现；工程与mock UI通过，原生CU和真实Provider边界见执行摘要 |
| 2026-10-18 | [会话查询授权与替我审批](20261018-permission-auto-review.md) | 查询会话授权、判断插件、模型设置与结果审计完成；398 项定向测试通过，追加真实 Electron 交互、路由缺陷修复复验及原生 Computer Use |
| 2026-10-18 | [Session 数据存储职责与增量运行态重构](20261018-session-storage-refactor.md) | 代码与本轮自动化完成；Session 文件事实、增量写入、有界近期正文、背压和派生查询职责，限制见执行摘要 |
| 2026-10-18 | [轨迹上下文分类与子工具接线](20261018-trajectory-context.md) | 轨迹时间、来源分类与直接子会话工具展示已实现；验收边界与既有持久化失败单列 |
| 2026-10-17 | [Bash 完全权限与审批恢复修复](20261017-bash-full-access.md) | 2026-10-17 实现及定向回归完成，真实 Electron 已复验等待中切换并继续执行 |
| 2026-10-17 | [官网 V4：运行空间叙事与纸本插件舞台](20261017-site-v4-redesign.md) | 阶段 A（T1–T9、H1 首屏精修）已合入 main；以 T9/H1 的真实截图与桌面插件舞台为最终实现 |
| 2026-10-17 | [Web / PWA 客户端](20261017-web-pwa-client.md) | A1–D3 已实现并合入 main；D4 iPhone + Tailscale 真机验收仍未覆盖，不因归档改成通过 |
| 2026-10-15 | [默认工作区改为首次启动兜底](20261015-default-workspace-first-run.md) | 2026-10-15 实现与自动化验证完成（未提交，分支 fix/session-default） |
| 2026-10-15 | [main 新增功能与轨迹遗留项统一验收计划](20261015-main-frontend-acceptance.md) | 2026-10-16验收收束，60项53通过/5失败/2部分覆盖，4个Bug与O01观察完整交接 |
| 2026-10-15 | [左侧会话栏改版：DSH 的干净 + Cursor 的细节 + 按时间分组](20261015-sidebar-redesign.md) | 侧栏实现已合入 main；后续登记刷新和焦点修复见统一验收与修复记录 |
| 2026-10-14 | [内置 Harness 连续升级与验收修复](20261014-harness-builtin-upgrade-fix.md) | 内置 Harness 连续升级已实现；旧 Vite 缺失样式阻塞是当时现场，当前基线可启动并完成真实调用 |
| 2026-10-14 | [轨迹页对齐 DeepSeek Harness](20261014-trajectory-dsh-parity.md) | 轨迹页对齐实现已合入；DSH 双页逐项比对及 O01 性能观察不视为已关闭 |
| 2026-10-14 | [轨迹页流式拆分：定稿层与流式层](20261014-trajectory-streaming-split.md) | 定稿/流式拆分实现已合入；原记录中的基准只代表当时 fixture，不等于所有原生性能通过 |
| 2026-10-13 | [轮尾改动卡与交付文件卡](20261013-turn-deliverables-cards.md) | 改动卡、present 交付卡已实现；原生关联应用及远端下载的未覆盖边界保留 |
| 2026-10-11 | [工具审批卡 · Cursor 式（D 方向）](20261011-approval-card-cursor-style/README.md)（目录） | 前端与 Bash 前缀授权已实现；真实审批行为的分项覆盖见近期验收 |
| 2026-10-11 | [上下文管理引擎 V2：生命周期、模块状态与插件包拆分](20261011-context-management-engine-v2/README.md)（目录） | 物理 Context 插件拆包、长期 Context、Runtime/Host/IPC Projection 接线与后端自动化完成 |
| 2026-10-11 | [Context 面板前端重做（mock 先行）](20261011-context-panel-frontend.md) | 右侧 Context Tab 换成五区块面板（当前上下文、会话统计、明细对比、趋势、事件），会话内容点行跳轨迹 |
| 2026-10-11 | [Context 面板数据补齐与 SQLite 联合执行计划](20261011-context-sqlite-integration/README.md)（目录） | 实现和本轮验收收尾，M/Small结果见报告；用户取消L剩余长测，保留测试失败及资源观察边界 |
| 2026-10-11 | [仓库文档与 packages 清理](20261011-repo-cleanup.md) | 实现与自动化验证已完成；兼容层及暂无消费者包的退役条件继续保留 |
| 2026-10-11 | [使用统计 SQLite / Worker 统一验收与缺陷修复计划](20261011-usage-sqlite-acceptance.md) | 联合验收子计划同步收尾，已接受性能限制和未验证范围原样保留 |
| 2026-10-11 | [使用统计 SQLite 读模型与 Worker 一次性实施计划](20261011-usage-sqlite-read-model.md) | 代码收口，保留未修缺陷和未通过性能门禁；统一验收由上方独立 active 计划接管，不能据此视为验收通过 |
| 2026-10-07 | [Desktop 验收问题 B03 / B08 / B12 修复](20261007-desktop-acceptance-b03-b08-b12.md) | Review自动更新、搜索凭据即时生效、工作树首发与持久绑定已修复；真实Electron连续更新、同会话断开搜索和工作树冷重启复验通过 |
| 2026-10-07 | [Harness 自进化 V1 实施计划](20261007-harness-evolution-v1.md) | 官方 Skill、Manager/HMR、会话局部版本与次消息生效已实现；自动化和制品验证通过，真实模型与桌面覆盖见摘要 |
| 2026-10-07 | [多智能体协作（Space）前端演示](20261007-multi-agent-collab-frontend-demo.md) | T0 决策及 T1–T11 前端演示已完成；数据仍是 mock，不代表 Runtime 多 Agent 协作已经交付 |
| 2026-10-06 | [上下文引擎真实验收问题修复](20261006-context-acceptance-bugfix.md) | 原7项确认问题及新增启动锁问题已修复；227项定向测试、真实Electron和19次转换值复验通过，边界见执行摘要 |
| 2026-10-06 | [上下文管理引擎执行计划](20261006-context-management-engine/README.md)（目录） | P1–P4 实施完成，Context/来源/压缩/披露接线与自动化通过；首次桌面测试异步异常和真实模型未覆盖范围见执行摘要 |
| 2026-10-05 | [Agent 重构最终清理与验收](20261005-agent-refactor-final-closeout/README.md)（目录） | 代码、文档、根目录清理与自动化完成，35/35 界面验收通过；两项产品缺陷修复复验，保护记录与范围限制见摘要 |
| 2026-10-05 | [00 Desktop 前端重构总执行计划](20261005-desktop-frontend-refactor/00-%E6%80%BB%E6%89%A7%E8%A1%8C%E8%AE%A1%E5%88%92.md)（目录） | 实现完成，已归档，待人工验收（2026-10-11）。2026-10-06 用户批准 00 与 09–17，按 §1 顺序连续执行 |
| 2026-10-04 | [重构收尾：代码与文档清理](20261004-agent-refactor-cleanup.md) | 本批完成，保护 histories/learnings 和既有工作区修改 |
| 2026-10-04 | [Agent 重构第二轮清理](20261004-agent-storage-and-cleanup/README.md)（目录） | 实施完成；原剩余 UI 子项由 10-05 最终收尾逐项补验通过 |
| 2026-10-03 | [Agent Harness 插件化与 Host 分离](20261003-agent-harness-host-refactor/README.md)（目录） | P1–P5 实施与计划范围验收通过，P5 错误反馈修复经 Sol 实机复验；手机 Web、自进化具体工作流与真实云部署留待独立计划 |
| 2026-10-01 | [性能面板与会话投影优化](20261001-performance-monitor-projection.md) | 低频按需监控、历史批量折叠、上下文计算复用；自动化通过，人工验收和开销对比边界见执行摘要 |
| 2026-09-30 | [压缩耗时与辅助模型路由修复](20260930-compaction-duration-utility-fix.md) | 真实摘要耗时持久化、utility 路由优先与旧 journal 兼容；98 项定向测试及真实 Electron 复验通过，见修复报告 |
| 2026-09-29 | [统一验收缺陷修复](20260929-acceptance-bugfixes.md) | Chat工具拒绝结算、旧历史恢复、子会话检查点/读取/索引、字体预览、开发启动竞态与文件缓存隔离已修复，定向实机复验通过 |
| 2026-09-29 | [对话流里的上下文压缩：进行中、分隔线与摘要](20260929-context-compaction-timeline.md) | 手动 /compact 与自动压缩共用一套中文 UI——进行中计时 + 不确定进度条、完成分隔线可展开摘要、失败红色分隔线可重试、无需压缩只在 Composer 提示 |
| 2026-09-28 | [外观强调色](20260928-accent-palette.md) | 外观页新增默认 / 蓝 / 紫 / 粉 / 橙 5 个强调色，驱动发送按钮、开关开启态、焦点、链接、文字选中与分割线拖动 |
| 2026-09-28 | [单一 Agent 形态与 Chat / Plan / Agent 模式执行计划](20260928-agent-forms-and-modes.md) | T1–T7 已实现；主要实机路线通过，T8 剩余验收见执行摘要 |
| 2026-09-28 | [聊天回复 Mermaid 图表渲染](20260928-chat-mermaid-diagrams.md) | 闭合的 mermaid 渲染为固定 Codex 浅色图表，支持查看/复制源码、PNG 导出与缩放平移预览 |
| 2026-09-28 | [Chrome 扩展连接、启动与使用体验闭环](20260928-chrome-connect-experience.md) | 已暂停，移入 completed。2026-11-01 功能减法把浏览器改为可选插件（扩展 › 插件 中开启，默认不加载） |
| 2026-09-28 | [Tool 插件边界拆分与 Todo 领域迁移](20260928-tool-plugin-boundaries.md) | 七个独立工具插件与 Todo 领域事件、Projection Contributor、调用时 scope gate 和启动禁用已实现 |
| 2026-09-26 | [自定义服务与 Anthropic 连接流程重做](20260926-custom-connection-setup-redesign.md) | 目录合并为一条「自定义服务」，新增两步向导和只填 Key 的官方 Anthropic 页面 |
| 2026-09-26 | [Desktop build speed](20260926-desktop-build-speed.md) | 依赖闭包去重、TypeScript 项目图增量构建、Client 与提示词监听 |
| 2026-09-26 | [前端设计 token 收口与视觉修复](20260926-frontend-design-token-convergence.md) | 字号、圆角、阴影、z-index、动效时长全部 token 化并由 pnpm check:frontend-tokens 防回流 |
| 2026-09-25 | [工具审批卡重设计](20260925-approval-card-redesign.md) | 5 类审批组件统一为一行审批条（读取/搜索/编辑/写入/删除）与底部按钮卡片（Bash/浏览器），共享部件与测试已完成 |
| 2026-09-25 | [审批重载恢复与 Chat fork 写锁修复](20260925-approval-reload-chat-fork-fixes.md) | 恢复 pending 卡片与停止能力、统一 fork writer 生命周期、复制附件及替换引用 |
| 2026-09-25 | [设置中心视觉重设计](20260925-settings-visual-redesign.md) | 统一内嵌分组与控件、即时保存与“已保存”提示，新增「能力 → 搜索」页，使用统计微调 |
| 2026-09-24 | [Anthropic 自定义连接、手动模型与价格执行计划](20260924-anthropic-custom-model-pricing.md) | Claude Code 常见的 Anthropic Messages 根地址、显式测试、短缓存开关、连接内手动模型与四类价格已完成 |
| 2026-09-24 | [主 Agent Chat 形态执行计划](20260924-main-chat-form.md) | 固定 Session preset、Chat 两工具、Prompt cache 动态尾部、首版附件与可调压缩阈值已实施 |
| 2026-09-22 | [LLM Core Pi 执行计划](20260922-llm-core-pi.md) | M0–M4 的请求配置冻结、retry lease、Host prepare、pi-ai backend policy、replay envelope 和自动化验证已实施 |
| 2026-09-22 | [Session 三类读模型统一计划](20260922-session-three-read-models.md) | Canonical fold、三种 DTO/watermark、observation、Global Session/Usage Index、Window resource cap 和 Client target 收口已完成 |
| 2026-09-21 | [Session 投影一次性切换](20260921-session-projection-cutover.md) | Host Registry、可删除 checkpoint 与 Client raw window 已接通，旧路径退役 |
| 2026-09-20 | [Session 事件持久化与检查点重构执行计划](20260920-session-event-persistence/README.md)（目录） | accepted/durable 分离、persistence coordinator、必需 checkpoint policy 和生命周期通知已实施 |
| 2026-09-19 | [官网博客搬运与功能文档整理](20260919-site-content-migration.md) | 新增 4 篇原文、核对 37 张正文配图，按模块整理 27 页文档；22 处截图占位待人工补充 |
| 2026-09-19 | [Site 设计迁移](20260919-site-design-migration.md) | 正式 Astro site 接入已确认布局；博客 3:2 封面、折叠多选筛选。自动验证完成，视觉验收见执行摘要 |
| 2026-09-19 | [官网展示与截图占位](20260919-site-showcase.md) | 六组滚动图文、35 张截图对应24篇文档40处占位与浅紫引用完成；真实素材待用户交付 |
| 2026-09-16 | [当前上下文与会话累计 Token](20260916-context-and-session-tokens.md) | 统一完整请求统计与压缩预计；顶部累计 Token 简约展示，自动验证通过，真实窗口边界见执行摘要 |
| 2026-09-16 | [会话切换与后台运行](20260916-session-background-runs.md) | 按会话隔离 stream、后台工具状态与历史校准，补切换回归与桌面验收 |
| 2026-09-16 | [消息流排版与工具摘要实施计划](20260916-tool-stream-typography.md) | 统一过程行、邻接间距和 Bash 摘要；自动验证已完成，真实桌面与主题矩阵边界见执行摘要 |
| 2026-09-15 | [会话与长历史按需加载](20260915-progressive-session-loading.md) | 摘要和长消息真分页、大工具详情与轨迹按需；真实交互验收及并行改动的类型检查阻塞见执行摘要 |
| 2026-09-15 | [只读子智能体与实时活动行](20260915-readonly-subagents.md) | 只读白名单、300 步收尾与事件驱动翻页卡片已实现，保留真实运行验收 |
| 2026-09-13 | [C 方案：工具流与子 Agent 消息布局](20260913-c-tool-stream-layout.md) | Explored 归组、Thought 同组和紧凑 Agent/Explore 右侧详情入口已实现 |
| 2026-09-13 | [工具进度、文件产物、模型目录与图片链路修复](20260913-tool-artifact-provider-image-ux.md) | Write/Edit 变动行数、右侧文件打开、聊天代码块、Kimi 模型发现、Session Artifact 图片预览和 DeepSeek Files API 已完成 |
| 2026-09-13 | [工具结果交互与后台通知修复](20260913-tool-result-interaction-fixes.md) | 通知 provenance、结果 disclosure、Read 右侧打开、Explore 子 Agent 面板和图片错误归一化已完成 |
| 2026-09-12 | [自定义模型推理能力](20260912-custom-model-reasoning.md) | 已被 设置 › 模型重做取代（2026-10-21），本计划不再推进。模型级 reasoningConfig 改为每个模型声明的思考档位（ModelThinking）和用户修改（settings.models.overrides） |
| 2026-09-12 | [工具输出引用与失败反馈修复](20260912-tool-output-references.md) | 大 Bash 输出回读、图片协议与失败恢复已修复；自动化通过，安装态与真实 Provider 验收待执行 |
| 2026-09-10 | [DeepSeek V4.1 Flash、目录发现与价格更新](20260910-deepseek-v41-flash.md) | 模型、目录、图片和价格实现完成；真实图片请求通过，完整设置交互与主题截图边界见摘要 |
| 2026-09-08 | [日常主界面中文统一](20260908-desktop-chinese-ui.md) | 保留模式、思考档位和工具执行展示；renderer 验证与 Electron 主界面/设置检查完成，验证范围见摘要 |
| 2026-09-06 | [英语辅助学习插件执行计划](20260906-actspace-english-learning/README.md)（目录） | 代码实施完成并归档；自动化结果、浏览器验证及未完成的 Electron / MiniMax 实机门禁见执行摘要 |
| 2026-09-06 | [使用统计页面与费用更新执行计划](20260906-actspace-usage-statistics/README.md)（目录） | 设置入口改为“使用统计”，借鉴 Maka 的清晰信息结构并统一 ActSpace 视觉 |
| 2026-09-06 | [Agent 工具体验与轨迹布局调整](20260906-agent-tool-experience/README.md)（目录） | Agent 工具体验与轨迹布局调整，实现与自动化完成，Electron/Provider 人工项见摘要 |
| 2026-09-06 | [Agent 工具流式渲染修复计划](20260906-agent-tool-stream-rendering/README.md)（目录） | Agent 工具流式渲染修复，实现与自动化完成，Electron/Provider 人工项见摘要 |
| 2026-09-05 | [ActSpace DSH 轨迹页面完整能力迁移](20260905-actspace-dsh-trajectory-parity/README.md)（目录） | ActSpace DSH 轨迹页面完整能力迁移，Phase 0–5 完成，真实 Projection/IPC 与隔离 Electron 验收通过 |
| 2026-09-01 | [ActSpace Context 面板与模型能力事实收敛](20260901-actspace-context-model-facts/README.md)（目录） | 2026-09-09 补齐全仓 typecheck/test；G1 通过，Electron/真实 Provider/截图 G2 仍保留人工验收 |
| 2026-09-01 | [ActSpace 模型设置页面 Maka 风格重做执行计划](20260901-actspace-model-settings-maka-redesign/README.md)（目录） | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-09-01 | [ActSpace 会话内轨迹视图切换](20260901-actspace-trajectory-session-view/README.md)（目录） | ActSpace 会话内轨迹视图切换，标题行单按钮，中心 Chat/Trajectory 视图 |
| 2026-08-30 | [ActSpace Profile-first Runtime 精简与 RuntimeHandle 删除](20260830-actspace-profile-first-runtime-simplification/README.md)（目录） | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-08-30 | [ActSpace 设置中心重构执行计划](20260830-actspace-settings-center-refactor/README.md)（目录） | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-08-29 | [ActSpace P0：Agent Scope 模型重构](20260829-actspace-agent-scope-model/README.md)（目录） | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-08-29 | [ActSpace Cordis 原生事件 ABI 与 EventHub 退役计划](20260829-actspace-cordis-event-abi-and-eventhub-retirement/README.md)（目录） | ActSpace Cordis 原生事件 ABI 与 EventHub 退役，实现完成 |
| 2026-08-29 | [ActSpace 核心 Cordis Service 化与能力 seam 实施计划](20260829-actspace-core-cordis-services/README.md)（目录） | ActSpace 核心 Cordis Service 化与能力 seam，Phase 1–5 完成 |
| 2026-08-29 | [ActSpace DSH Agent Loop / Session / Tool Shell 核心重构](20260829-actspace-dsh-core-rebuild/README.md)（目录） | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-08-29 | [ActSpace DSH 风格插件组装与 Agent 启动实现计划](20260829-actspace-dsh-plugin-assembly-and-agent-startup/README.md)（目录） | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-08-29 | [ActSpace DSH 风格 Runtime 全量插件组装计划](20260829-actspace-dsh-runtime-full-plugin-composition/README.md)（目录） | ActSpace DSH 风格 Runtime 全量插件组装，Phase 1–6 自动化实施完成 |
| 2026-08-29 | [ActSpace Tool Name 全量切换执行计划](20260829-actspace-tool-name-contract/README.md)（目录） | 已完成（2026-08-29；真实 Provider smoke 与两项旧 CLI Cordis 夹具迁移保留人工门禁） |
| 2026-08-24 | [ActSpace v2 包拆分与真实插件包化执行计划](20260824-actspace-v2-package-layout-and-plugin-packaging/README.md)（目录） | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-08-22 | [ActSpace v2 插件化 Agent Runtime 完整交付计划](20260822-actspace-v2-plugin-runtime/README.md)（目录） | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-08-08 | [Agent Todo 工具 V1 执行计划](20260808-agent-todo-tools.md) | 已完成（自动化验收通过；真实 Electron 视觉与点击验收保留为人工边界） |
| 2026-08-02 | [Actspace 本地明文凭据存储迁移](20260802-local-plaintext-credential-storage.md) | 让开发版与本地安装版继续共用 <userData>，将 secrets.json 从依赖系统安全存储的 v1 密文升级为主进程专用的 v2 明文凭据文件，并以 0600 权限、原子写入和失败保护保证本地更新与重启后的稳定读取 |
| 2026-08-01 | [分析观测与工作台交互收口](20260801-analysis-observability-ui-polish.md) | 修复 Workspace 菜单误触、右侧 Tab 选中态过重，以及分析观测页面信息密度、相邻请求比较和 Tools 筛选语义问题 |
| 2026-08-01 | [2026-08-01 分析观测会话索引](20260801-analysis-session-index.md) | 恢复最初参考 Demo 已确认的“会话索引 -> 单会话钻取”结构：从设置进入分析观测时先展示全部未归档会话的轻量索引，用户选择会话后再进入现有 Agent Run / Turn / LLM Call 两栏详情 |
| 2026-08-01 | [Composer 图片附件可用性修复](20260801-composer-image-attachments.md) | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-08-01 | [2026-08-01 Environment 分支选择与创建（已完成）](20260801-environment-branch-selector.md) | 让用户从顶部 Environment 的当前分支行查看、搜索和切换本地分支，并从同一入口创建并 checkout 新分支 |
| 2026-08-01 | [2026-08-01 全局快捷唤起](20260801-global-quick-open-shortcut.md) | 在设置中提供可配置的系统级快捷键，让用户从其他应用快速唤起紧凑 Actspace 窗口，并按指定会话、指定工作区或侧边栏第一个项目进入可立即输入的聊天状态 |
| 2026-08-01 | [图片分析工具实施计划](20260801-image-inspection-tool.md) | 2026-08-01 实现与自动化验证已完成并归档；同日已通过 Computer Use 完成 Electron 设置 UI 与持久化验收 |
| 2026-08-01 | [运行态反馈与图片预览回读修复](20260801-running-feedback-and-attachment-rehydration.md) | 实现已完成，2026-09-08 按计划生命周期归档；历史记录中的真实宿主、人工验收及回归证据边界继续保留，本次未重跑产品验收 |
| 2026-07-31 | [DeepSeek OpenAI 思考强度迁移执行计划](20260731-deepseek-openai-thinking-effort.md) | 将 ActSpace 内置 DeepSeek 模型从 Anthropic Messages 主线切换到 OpenAI Chat Completions，并让 Thinking 只提供 High / Max 两档、默认显式使用 Max |
| 2026-07-31 | [Terminal 启动、关闭与开发进程可靠性修复计划](20260731-terminal-startup-shutdown-reliability.md) | 修复本地开发命令收到 Ctrl+C 后无法可靠退出的问题，消除数据目录重复初始化日志，并把右侧 Terminal 的首次启动与关闭过程变成单一、可见、可回收的状态流 |
| 2026-07-30 | [Agent 分析观测生产页面执行计划](20260730-agent-analysis-observability-page.md) | 2026-08-01 实现完成并归档。自动化验证已完成；真实 Electron 长会话、Retina 与多 provider 人工验收仍由发布验收单独执行，不影响计划生命周期 |
| 2026-07-30 | [2026-07-30 Composer Slash Command 菜单执行计划](20260730-composer-slash-command-menu.md) | 在现有 Composer 中增加一个由 / 触发的紧凑快捷菜单，以 Functions 与 Skills 两组展示真实可用能力 |
| 2026-07-30 | [2026-07-30 Git-first Review Workbench 总计划](20260730-review-workbench/README.md)（目录） | 把旧的 Uncommitted raw diff 升级为 Codex-like 右侧 Git Review Workbench：六种真实 scope、结构化 Diff、upstream Branch 比较、紧凑单行工具栏、真实 Review Options… |
| 2026-07-30 | [右侧面板文件视图优化（新鲜度 / 阅读体验 / 高亮覆盖 / 大文件 / CSV）](20260730-right-panel-file-view-optimization.md) | 让右侧面板的文件视图从「一次性快照 + 窄覆盖高亮」变成可信、可读、可导航的代码阅读区：打开的文件在磁盘变化后能被感知并显式重新加载 |
| 2026-07-30 | [2026-07-30 右侧 Terminal 总执行计划](20260730-right-panel-terminal/README.md)（目录） | 在不破坏 Agent Bash 安全模型和现有右侧对象面板的前提下，为每个普通聊天会话提供绑定真实 workspace / worktree 的交互式 Terminal |
| 2026-07-29 | [Agent 分析观测数据对齐与 HTML 原型执行计划](20260729-agent-observability-data-alignment.md) | 将当前被前端、IPC 和持久化误称为 turnId 的 Agent Run 关联键统一改为 agentRunId，暴露并持久化后端真实 Turn 与 LLM Call 层级，建立本地安全 trace 文件，为分析观测页面提供可还原的请求、响应、工具… |
| 2026-07-29 | [Composer 模式、Image 与 Skills 实施计划](20260729-composer-modes-image-skills.md) | 把 Composer + 菜单从无行为的 demo 升级为真实能力入口：提供 Chat / Plan / Agent 三种有明确运行时权限的模式，让 Image 调起只选图片的原生文件选择器，并让 Skills 展示真实 registry、支持… |
| 2026-07-29 | [2026-07-29 Environment 与本地 Git 操作执行计划（已完成）](20260729-environment-and-local-git-actions.md) | 在聊天态顶部实现可真实使用的编辑器选择器和 Environment 控制面：识别 This Mac / Git Worktree、展示未提交变更与当前分支、创建分支、提交当前 workspace 全部改动、按 upstream / remote 状态推送… |
| 2026-07-29 | [Workspace、Git Branch 与 Worktree 执行上下文计划](20260729-workspace-git-worktree-context.md) | 把初始 Composer 当前静态的 Workspace / main / Local 展示升级为一条真实、可恢复的本机执行上下文链路：用户可以选择最近 Workspace、选择本地 Git branch、使用 This Mac 或在首次发送时创建隔离… |
| 2026-07-29 | [Workspace 侧边栏操作与会话 Tooltip 执行计划](20260729-workspace-sidebar-actions.md) | 让用户可以直接从左侧 Workspace 文件夹打开 Cursor、安全归档该 Workspace 的全部会话、或将该 Workspace 从侧边栏隐藏 |
| 2026-07-28 | [图片生成日志与会话产物栏改造](20260728-image-artifact-presentation.md) | 修复开发态生成图片无法渲染的问题，把 generate_image 从大型行内预览卡改为与 Read 同级的单行工具日志，并在每轮最终回复下展示可点击的输出产物栏 |
| 2026-07-28 | [桌面端 480px 窄窗适配执行计划](20260728-narrow-window-layout.md) | 让 actspace 桌面端窗口可以稳定缩小到 480px，并在窄窗下将左右面板切换为覆盖式交互，保证聊天、设置、Usage 与 Kairos 的核心内容可读、可操作 |
| 2026-07-28 | [更新日志内容契约与时间线重构](20260728-updates-changelog-redesign.md) | 把 docs/releases/feature-release-notes.md 从“功能域 / 用户价值 / 技术摘要”表格改为按发布日期组织的公开 Changelog，并让 /updates 直接展示“日期、发布标题、新功能、改进、问题修复” |
| 2026-07-27 | [ActSpace 官网与内容站 V1 实施计划](20260727-actspace-site-v1.md) | 在 packages/site 交付一个可独立开发、完整静态构建并通过 GitHub Pages 发布的 ActSpace 中文官网 |
| 2026-07-27 | [图片生成工具 V0 Execution Plan](20260727-image-generation-tool.md) | 实现主 Agent 的 generate_image 工具：用户在设置页配置 OpenAI-compatible 图片服务的 API Key、Base URL 和模型名称后，Agent 可按 prompt / size / n 生成 1–10 张图片… |
| 2026-07-26 | [会话 Fork 与 Copy 执行计划](20260726-session-fork-copy.md) | 在左侧会话行右键菜单中增加 Copy ID、Copy Transcript 与 Fork，让用户能复制稳定的会话标识、导出可读对话文本，并从当前持久化事实创建一个可继续交互的独立会话分支 |
| 2026-07-25 | [Browser 工具渐进式披露执行计划](20260725-browser-tool-progressive-disclosure.md) | Browser Bridge 可用时，运行时继续稳定注册全部浏览器 executor，但普通模型调用默认只看到 browser_help 入口 |
| 2026-07-25 | [Frontend brand consumer audit](20260725-frontend-color-system-migration-audit.md) | 前端品牌色使用点审计清单 |
| 2026-07-25 | [Ink & Emerald visual preview acceptance record](20260725-frontend-color-system-migration-preview-acceptance.md) | Ink & Emerald 色板预览页的视觉验收记录 |
| 2026-07-25 | [Ink & Emerald 前端配色迁移计划](20260725-frontend-color-system-migration.md) | 将 ActSpace 桌面端从“单一蓝色 brand 同时承担按钮、选中、focus、运行和图表”迁移到明确的语义颜色系统： |
| 2026-07-25 | [Ink & Emerald 前端设计系统文档收口计划](20260725-ink-emerald-design-system.md) | 把已确认的“中性灰阶工作台 + 黑色主操作 + 翡翠绿 operational accent”写成 ActSpace 的正式前端设计事实，清除 Cursor 营销站橙色、冷蓝品牌主色和旧组件色彩职责之间的冲突，同时明确本轮只更新文档、不宣称代码 token… |
| 2026-07-24 | [多供应商 LLM、模型管理与任务模型执行计划](20260724-multi-provider-llm/README.md)（目录） | Plan 0-5 与 Plan 7 完成；Plan 6 及 DuckCoding 真实连接仍待用户统一手动验收 |
| 2026-07-17 | [Browser Locator Runtime 自研重写执行计划](20260717-browser-locator-runtime-rewrite.md) | 在 browser-bridge 内重写一套 ActSpace 自有的页面 Locator Runtime：不复制 Codex bundle、不依赖 Playwright 运行时，通过结构化 Locator、页面内 DOM/ARIA 语义、自动等待与… |
| 2026-07-17 | [Agent stream turn routing 修复](20260717-stream-event-turn-routing.md) | 消除多个 Agent turn 重叠运行时 renderer 重复消费同一流式 delta 的问题，并保证旧 turn 的异步完成不会清空或覆盖当前可见 turn 的 UI 状态 |
| 2026-07-17 | [Agent Turn 中止与会话恢复修复计划](20260717-turn-abort-recovery.md) | 让用户在 LLM 流式输出、工具审批等待或前台 Bash 执行期间点击 Stop 后，当前 turn 能快速收敛为明确的 aborted 终态，Composer 恢复输入，并且中断轮次在切换会话、下一次发送和应用重开后仍可从 session.jsonl 重建 |
| 2026-07-12 | [Browser 输出保真 V1 执行计划](20260712-browser-output-fidelity-v1.md) | 修复 Browser Use 读取结果在进入模型上下文前被通用截断或摘要的问题：让 browser_dom.snapshot 在 50,000 字符预算内逐节点保真，让 browser_help 的精确 action schema 在 20,000… |
| 2026-07-10 | [Browser Use 执行计划总览](20260710-browser-use/README.md)（目录） | Plan 0-pre 至 Plan 5、M0-M6 全部完成，已进入 completed 归档 |
| 2026-07-04 | [Bash 沙盒执行层（E5 第一期）](20260704-bash-sandbox/README.md)（目录） | 把 bash 工具从「直接 spawn + allowlist 审批」升级为「沙盒优先执行」： |
| 2026-07-03 | [Bash 执行模型开发计划（总览）](20260703-bash-execution-model/README.md)（目录） | 从 docs/archive/v1/design-docs/execution-safety-agent-bash工具设计文档.md 派生的历史实施计划组 |
| 2026-06-08 | [Kimi 备用模型接入 + DeepSeek DSML 泄漏兜底 执行计划](20260608-kimi-backup-and-dsml-guard.md) | 让用户可以在聊天框、Explore 子代理、Kairos 三处把 Kimi（kimi-k2.6）作为可选模型 |
| 2026-06-06 | [Explore 内置子代理执行计划](20260606-explore-subagent.md) | 把现有 agent 工具拆成两件事：agent 回归「通用、全面」子代理（主模型 + Panel，行为不变），并新增内置 explore 子代理——聚焦小范围探索、跑便宜模型（默认 deepseek-v4-flash、可设置覆盖）、由主模型自动… |
| 2026-06-04 | [Context Compaction 时间线样式修复计划](20260604-context-compaction-timeline-bugfix.md) | 修复 /compact / 自动上下文压缩在消息流中的视觉层级：Context Compaction 必须作为独立 timeline item 展示，而不是贴到上一条 assistant 回复里，也不再使用卡片、pill 或图标 |
| 2026-06-04 | [清理运行时 Mock 假数据执行计划](20260604-runtime-mock-data-cleanup.md) | 把普通产品运行路径里的 mock / demo / fake 数据清理掉，让桌面端首屏、设置页、Composer、Sidebar、Lab 等用户可见区域只展示真实数据、空态或明确的未接入状态 |
| 2026-06-03 | [Agent Skill 加载执行计划](20260603-agent-skill-loading.md) | 已完成并归档。实现已落地到 packages/agent-core/src/skills/ 和 packages/desktop/src/main/agent-runtime-context.ts |
| 2026-06-03 | [Session Hover Card 执行计划](20260603-session-hover-card.md) | 左侧会话列表 hover/focus 信息卡片：完整 workspace 路径、最近使用模型和 context 使用情况，只读展示 |
| 2026-06-02 | [2026-06-02 会话归档功能计划](20260602-archived-chats.md) | 为 actspace 桌面端补齐会话归档能力：用户可以从左侧会话栏归档非当前会话，归档后的会话从普通会话列表隐藏，并进入设置页的「归档会话」分区 |
| 2026-06-02 | [/compact 命令前端接入计划](20260602-compact-command-ui.md) | 把 /compact 做成主聊天流里的可执行系统事件：用户在 Composer 输入 /compact 后触发一次手动上下文压缩，消息流中依次展示执行前、执行中、执行完成三种状态 |
| 2026-06-02 | [Workspace Registry 持久化执行计划](20260602-workspace-registry.md) | 把当前由 session list 临时推断出来的 Workspaces，收敛为一个稳定的本地注册表：<dataRoot>/workspaces.json |
| 2026-06-01 | [actspace 的 pi 风格 LLM 契约对齐与 Kimi 公共入口收口计划](20260601-pi-style-llm-contract-alignment.md) | 把 actspace 的 LLM 相关契约收敛到更接近 pi 的三层结构：模型元数据明确区分 api 与 provider，LLM service 按 api 分成 AnthropicMessagesService /… |
| 2026-05-31 | [Local Desktop Updater](20260531-local-desktop-updater.md) | 在桌面端设置页提供“本地更新”能力：用户选择本机 actspace 源码目录后，可点击按钮让当前安装版应用从该源码重新打包、替换当前 .app，并重启应用 |
| 2026-05-30 | [2026-05-30 Context 缓存与 Usage 修复计划簇](20260530-context-cache-and-usage/README.md)（目录） | 围绕「上下文的绝对控制 + DeepSeek 高缓存命中」这条产品主线，一次性收口三件互相关联的事： |
| 2026-05-30 | [2026-05-30 工作区文件浏览器计划](20260530-workspace-file-explorer.md) | 在右侧面板新增一个轻量「工作区文件浏览器」：左侧常驻可折叠文件树（rail），点文件用已有渲染视图开成普通 Tab |
| 2026-05-29 | [外观页 · 深色主题专项（计划 B）](20260529-appearance-dark-theme.md) | 让 actspace 桌面端支持浅色 / 深色 / 跟随系统三态主题，并在「设置 → 外观」提供切换 |
| 2026-05-29 | [外观页 · 字体设置 + 界面缩放（计划 A）](20260529-appearance-fonts-and-zoom.md) | 在「设置 → 外观」分区落地用户可调的字体与字号能力： |
| 2026-05-29 | [Composer 多形态布局与子组件拆分计划](20260529-composer-layout-variants.md) | 把 Composer 从单一 follow-up 输入条改造成可复用的组合式输入系统，支持已有会话底部 follow-up、新会话居中输入、无附件紧凑态、有附件展开态等形态 |
| 2026-05-29 | [DeepSeek Anthropic Service 与原生联网搜索接入计划](20260529-deepseek-anthropic-service.md) | 在不删除现有 DeepSeek OpenAI-compatible 路线和 Kimi 辅助搜索路线的前提下，新增 DeepSeek Anthropic-compatible LLM service |
| 2026-05-29 | [设置页（Settings Page）开发计划](20260529-settings-page.md) | 为 actspace 桌面端新增一个独立的「设置」页面（整页接管：进入设置后左侧聊天侧栏替换为设置导航，主区显示设置内容），并补齐当前完全缺失的「运行时配置」能力：用户可在 UI 里配置 DeepSeek / Kimi 供应商 API Key、默认模型、主… |
| 2026-05-28 | [前端样式所有权收口计划](20260528-frontend-style-ownership-cleanup.md) | 已完成。2026-05-29 完成样式所有权收口、旧全局 CSS 下线验收、Browser mock 和 Electron 真窗 smoke |
| 2026-05-28 | [Tailwind 剩余 UI 迁移调整计划](20260528-tailwind-remaining-ui-migration.md) | 已完成。2026-05-29 通过审计确认 Settings / Placeholder / Remaining Pages 无剩余普通 UI legacy selector，并完成全局 CSS 收口验收 |
| 2026-05-27 | [主系统提示词文件与 Bash 工具选择边界计划](20260527-agent-tool-capabilities-breakdown/01-bash-tool-choice-boundary.md)（目录） | 把主 Agent 系统提示词收敛为一个用户可见、可编辑、可覆盖的文件，并在这份文件里写入首版工具选择边界，降低主 Agent 对 bash 的过度使用 |
| 2026-05-27 | [2026-05-27 基础 Bug 与可用性修复计划](20260527-bugfix-foundation_%E4%BB%A3%E7%A0%81%E7%BC%96%E5%AE%8C%E9%9C%80%E6%89%8B%E5%8A%A8%E9%AA%8C%E8%AF%81.md) | 集中修复 2026-05-27 使用 bug 小记中已经影响基础可用性、展示正确性和用户信任感的问题 |
| 2026-05-27 | [2026-05-27 前端交互与样式补齐计划簇](20260527-frontend-interaction-polish/README.md)（目录） | 补齐工作台中用户已经能看到但尚未接入、样式未完成或交互不完整的前端功能。完成后，模型菜单、附件、Context 按钮、Workspace 添加、设置页、会话状态和 Composer 视觉应形成一套可用的桌面端体验 |
| 2026-05-27 | [2026-05-27 右侧工作区视图计划](20260527-right-panel-views.md) | 把右侧区域从静态设计推进为可用的对象浏览工作区。第一版优先支持文件预览、HTML 渲染、完整 Context 只读视图和 Kairos 状态视图，让用户可以一边聊天一边查看当前对象和运行状态 |
| — | [actspace Bash 执行与审核组件样式计划](actspace-bash-approval-ui-plan.md) | 实现消息流中的 Bash 工具展示组件，包括正常执行态和需要审核的 pending 态 |
| — | [actspace Bash 工具开发计划](actspace-bash-tool-plan.md) | 为 actspace 增加 Bash 工具本体：definition、权限检查、命令执行器、结果结构化和测试 |
| — | [Actspace Cache Loss Audit 执行计划](actspace-cache-loss-audit-plan.md) | 为 actspace 增加一条低成本缓存失效排查链路：当 llm_usage 真实 cache hit ratio 低于阈值时，在 session.jsonl 中留下轻量 cacheStatus/cacheAuditId 索引，并把上一轮与当前轮真实送入… |
| — | [actspace DeepSeek + Kimi 混合能力接入计划](actspace-deepseek-kimi-hybrid-capabilities.md) | 让 actspace 首版只支持 DeepSeek 与 Kimi 两个真实 provider，并形成清晰的混合能力策略： |
| — | [Grep/Glob rg 工具与 UI 改造计划](actspace-grep-glob-rg-tools-and-ui.md) | 将 actspace-agent 中新增的 grep 和 glob 工具收敛成独立、可测试、用户可见语义清楚的文件检索能力： |
| — | [actspace 并行计划 3：Agent 后端运行时按 Skill 重建（已拆分）](actspace-parallel-agent-runtime-rebuild.md) | 按照 .agents/skills/llm-agent-dev 的架构约束，把当前 mock 后端重建为 V1 基础版 Agent Runtime：包含 LLM Service、Context Pipeline、Tool Registry、Execution… |
| — | [actspace 并行计划 1：前后端契约与 Mock Fixtures 重建](actspace-parallel-contracts-and-fixtures.md) | 建立一层稳定、类型化、可被前端和后端同时依赖的契约层，让 renderer / main / agent-core / shared 不再各自猜测数据结构 |
| — | [actspace 并行计划 2：前端高保真还原与桌面体验修复](actspace-parallel-ui-fidelity-rebuild.md) | 按 docs/design-docs/frontend/README.md 的定稿文档和图片重建桌面端工作台 UI，让实际 Electron 窗口接近已认可的浅色蓝白设计，而不是当前骨架页面 |
| — | [actspace 真实 Agent Turn 链路修复计划](actspace-real-agent-turn-chain-fix.md) | 新建会话和普通真实会话默认调用真实 DeepSeek provider |
| — | [actspace Tailwind 样式架构接入计划](actspace-tailwind-style-architecture.md) | 已完成。2026-05-29 完成旧 styles.css / legacy-* 下线、剩余 UI 切片审计、全量命令验证、Browser mock 和 Electron 真窗 smoke |
| — | [actspace Token Usage 与 Context Control 数据地基计划](actspace-token-usage-context-control-foundation.md) | 建立 token usage、成本统计、轻量 context snapshot 和当前 context state 的数据地基，让 actspace 能按每次模型回复记录真实消耗，并为前端 Context 弹窗和未来上下文绝对控制能力提供稳定数据来源 |
| — | [actspace 工具暂停恢复与会话边界计划](actspace-tool-pause-session-boundary-plan.md) | 明确工具执行进入 awaiting_approval 后，Agent 运行如何暂停、恢复、取消，以及用户切换会话、刷新窗口、关闭应用或进程重启时 pending 工具状态如何处理 |
| — | [actspace 工具权限调度流程计划](actspace-tool-permission-scheduler-plan.md) | 建立工具调用从 LLM tool call 到执行结果回填的完整调度流程，为 Bash 审核、未来 Write/Edit 审核和外部网络工具审核提供统一状态机 |
| — | [actspace UI Bug 修复计划](actspace-ui-bug-fix-plan.md) | 对当前浏览器 mock UI 做完整验收后，集中修复交互 bug 和设计稿还原偏差 |
| — | [actspace Usage Statistics from session.jsonl](actspace-usage-statistics-session-jsonl-plan.md) | Usage Statistics 页面接入由 session.jsonl 聚合的真实统计快照（token、成本、缓存、工具调用、热力图、趋势、每日明细） |
| — | [actspace 工作台 SplitView 底座计划](actspace-workbench-split-view-foundation.md) | 把聊天态工作台从固定列宽布局升级为 actspace 自研的 SplitView 底座，先解决左侧会话栏和右侧对象面板可调宽、中间聊天区受保护的问题，并为后续接近 IDE 的拖动与区域编排保留清楚边界 |
| — | [bug-fix-plan](bug-fix-plan.md) | web_fetch 等早期工具缺陷的集中修复计划 |
| — | [Chat Markdown 与工具结果展开](chat-markdown-tool-results.md) | 已完成。聊天 Markdown 渲染链路已落地并在 Markdown 编辑与渲染中重做 |
| — | [Permission Runtime 基础切换](permission-runtime-foundation.md) | default/full-access、结构化资源、once/deny、敏感边界、审批后复验、Session mode 与 Desktop/CLI Host 直接切换完成 |
| — | [Desktop Session Scope Grant](session-scope-grants.md) | Desktop 核心文件 exact/subtree Session Grant、Journal 恢复、Runtime 匹配、审批选择、管理与撤销已完成 |
| — | [左侧会话栏向 Cursor 对齐执行计划](sidebar-cursor-alignment.md) | 把 packages/desktop 的左侧会话栏向 Cursor 桌面端侧边栏对齐：视觉密度、信息架构、状态点位置三层都做调整，并引入 Workspaces 分组结构（按本地仓库 cwd 自动归类），同时为后续的 Lab 和 Usage 页面预留占位入口 |
