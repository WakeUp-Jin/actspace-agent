# DOCS 检查与本地 Demo 迁移建议

状态：**原审计计划；2026-10-18 用户随后批准执行，31 个 HTML 已哈希校验备份并迁出，10 个计划已归档，文档漂移已校准。实施证据见 [本轮执行过程](../20261018-acceptance-fixes-docs-cleanup/execution-process.md)。用户明确取消备份页面打开检查。**

检查日期：2026-10-18。版本：`main a13f8a1ee10eed387da575d80ac000cc844f2bff`。本轮开始时工作区干净。用户要求先验收、记录 Bug；DOCS 先检查并列计划。以下保留最初审计的建议与统计；后续授权和实际执行以页首更新为准。

## 检查范围与结论

检查了 Git 跟踪的 DOCS 清单、全部 HTML 的用途与资源引用、近期功能对应的规范/计划/执行摘要，以及入口之间的状态一致性；运行仓库文档链接检查。没有逐句校审 1,911 个文档和资产，也不把机械检查通过等同于语义无漂移。

当前 `docs/` 有 1,911 个 Git 跟踪文件。其中 HTML **41 个、1,618,559 字节**：设计或验收 Demo 33 个（1,512,990 字节），学习 HTML 7 个，Session Viewer 1 个。统计使用 `git ls-files -z`，包含中文路径；早期按转义文本清单统计的 40 个遗漏了 `多智能体协作/space-demo.html`，以此处为准。

建议分为三类：

| 类别 | 数量 | 建议 |
| --- | ---: | --- |
| 已实现、已替代或明确废弃的 Demo | 31 | 获批后复制到桌面、校验备份，再移出仓库当前文件树；HTML 合计 1,342,261 字节，配套资源另计 |
| 仍被当前设计/验收直接依赖的 Demo | 2 | 先保留；待对应依赖处理和验收点收束后，再单独决定是否迁出 |
| 学习材料与诊断工具 | 8 | 保留，不按 `.html` 扩展名批量删除 |

移动 Demo 不代表相关产品已经全部验收通过。当前实现以 Markdown 规范和源码为准；验收状态以本轮及对应历史记录为准。

初轮之后已按用户授权补做[真实连接 Computer Use 验收](../20261018-recent-features-acceptance/real-provider-acceptance.md)：真实模型与文件交付等证据另行保留；路径别名工作区漏显示轮尾改动卡记为 DA02，历史轨迹助手计时缺失记为 DA03，见[Bug 交接](../20261018-recent-features-acceptance/bugs.md)。Demo 迁出不能丢失这些遗留问题，也不能把代表路径的系统打开通过扩大成全部文件类型通过。本计划的31项迁出建议没有执行，既有 DOCS 原件仍保留。

## 第一批：建议迁到桌面的 31 个文件

以下路径均相对仓库根目录。目标统一为桌面备份根下相同相对路径，完整映射规则见后文。

| 原路径 | 判断依据 / 需要同步的引用 |
| --- | --- |
| `docs/design-docs/frontend/anthropic-custom-connection-demo.html` | 对比原型明确不作为契约；`completed/20260926-custom-connection-setup-redesign.md` 已实现连接流程 |
| `docs/design-docs/frontend/approval-card-redesign.html` | 旧审批视觉原型；现行 Cursor 式审批与前缀授权已有实现。同步审批计划及 `ApprovalParts.tsx` 的溯源注释 |
| `docs/design-docs/frontend/composer-usage-dock-demo.html` | 已有 Composer 统计入口与弹层。`ComposerStatsPills.tsx`、`composer-stats.ts` 注释仍引用 Demo |
| `docs/design-docs/frontend/context-compaction-demo.html` | 压缩交互已实现；对应 `completed/20260929-context-compaction-timeline.md` 与执行记录 |
| `docs/design-docs/frontend/context-panel-demo.html` | 面板和 SQLite 接线已落地；`ContextPanelParts.tsx`、mock fixture、前端计划仍溯源到原型 |
| `docs/design-docs/frontend/design-token-convergence-demo.html` | 2026-09-26 设计对比，已由正式 token 和 `completed/20260926-frontend-design-token-convergence.md` 接替 |
| `docs/design-docs/frontend/ink-emerald-color-preview.html` | 历史四态配色样板；入口 README 和旧迁移计划有链接。未来主题验证使用实际 renderer/mock |
| `docs/design-docs/frontend/message-queue-demo.html` | 文件第 2 行明确“已废弃”，队列位置与现行设计相反；优先迁出 |
| `docs/design-docs/frontend/mobile-web-demo.html` | 早期 V1 对比；Web 已实现并改为 B·轻玻璃。文件顶部“未实现、未定稿”已过期 |
| `docs/design-docs/frontend/mobile-web-v2-demo.html` | B 方向已实施；顶部仍“未定稿”。依赖 Web tokens、icon 和本地验收截图，不能只搬 HTML |
| `docs/design-docs/frontend/model-connection-3-directions.html` | 方向 A 已实施为发丝卡片；对应 20261015 model-connection history |
| `docs/design-docs/frontend/model-connection-redesign-demo.html` | 已有模型设置 Markdown 规范与实现；历史方案不作为内容源 |
| `docs/design-docs/frontend/settings-redesign-demo.html` | 2026-09-25 定稿设计已实现，Demo 调节面板不属于产品 |
| `docs/design-docs/frontend/sidebar-redesign-demo.html` | 侧栏已合入 main；顶部“未实现、未定稿”过期。同步侧栏计划、摘要和 README |
| `docs/design-docs/frontend/tool-stream-typography-demo.html` | 排版已实现，当前规范为 `front-tool-stream-typography.md`；同步该规范及入口链接 |
| `docs/design-docs/frontend/turn-deliverables-demo.html` | 改动/交付卡已实现；顶部“未实现”过期，原生打开等验收边界仍应留在 Markdown |
| `docs/design-docs/site-v4/demos/A-paper-ink.html` | 落选方向，与下面文件成组备份；动态对比页的引用也要纳入 |
| `docs/design-docs/site-v4/demos/B-orbit.html` | 落选方向 |
| `docs/design-docs/site-v4/demos/C-deep-space.html` | 落选方向 |
| `docs/design-docs/site-v4/demos/D-stage.html` | 早期舞台方向 |
| `docs/design-docs/site-v4/demos/D1-paper-stage.html` | 中间对比方向 |
| `docs/design-docs/site-v4/demos/D2-mono-stage.html` | 中间对比方向 |
| `docs/design-docs/site-v4/demos/D3-starchart-stage.html` | 中间对比方向 |
| `docs/design-docs/site-v4/demos/D4-structure-stage.html` | 中间对比方向 |
| `docs/design-docs/site-v4/demos/D5-night-stage.html` | 中间对比方向 |
| `docs/design-docs/site-v4/demos/D6-paper-plugin-stage.html` | 用户选定方向已实现；`apps/site/DESIGN.md` 和 V4 计划仍引用 |
| `docs/design-docs/site-v4/demos/E-sprites.html` | 落选方向，依赖多张角色图 |
| `docs/design-docs/site-v4/demos/H1-hero-desktop-stage.html` | 首屏精修已实施；`apps/site/DESIGN.md` 仍有原型路径 |
| `docs/design-docs/site-v4/demos/index.html` | 对比导航，用模板字符串生成各 Demo 链接；随整个 demos 目录一起备份 |
| `docs/design-docs/website-redesign-demo.html` | V3 首页原型，当前正式实现已为 V4；顶部还指向退役 active 计划 |
| `docs/desktop-frontend-refactor/demo/composer-run-target-demo.html` | 输入框/队列/运行位置已有实现；同步重构 README、`front-workspace-git-worktree-context.md` |

以上“已实现”指对应行为有正式实现和记录，不指本轮全部产品验收通过。具体 Bug 与未覆盖项不能随原型迁出而丢失。

本地另留候选清单 `tmp/codex-acceptance/20261018-recent/engineering/docs-proposed-manifest.json`，记录上述 31 个当前原件的字节数、SHA-256 和建议目标路径。其状态为 `proposal_only_no_copy_or_delete`，只用于审阅和以后重新核对；尚未创建桌面备份，也不能把这份候选清单当成已完成备份的证明。

## 第二批：暂缓处理的 2 个 Demo

| 路径 | 暂缓理由 | 迁出前的具体条件 |
| --- | --- | --- |
| `docs/design-docs/多智能体协作/space-demo.html` | 已实现的是开发构建中的 mock 前端演示；Space 专题 README 与规范仍明确“设计/交互以它为准”，不代表真实协作 Runtime 已实现 | 核对 Markdown 是否独立说明现行演示行为，改掉当前规范对 HTML 的唯一依据依赖；保留“开发中演示、不能真实使用”边界。核对头像素材消费者后再选择备份子集 |
| `docs/exec-runs/20260928-composer-mentions-annotations/assets/pa2-annotation-demo.html` | PA2 已实施，但仍由 active 多阶段计划和逐项验收文档直接引用，PB 尚有后续工作 | 核对 PA2 尚未签收项目是否需要该对照；先把当前导航指向现行 Markdown 规范/PA2 验收结果，再决定迁出。不要连同未实施 PB 计划一起删除 |

这不是永久保留决定。将来可与第一批同样备份到桌面，但本轮不自动假定它们已无用途。

## 保留的 8 个 HTML

这些文件承载知识或工具，不是已实现功能的废弃 Demo：

- `docs/tools/session-viewer/session-viewer.html`：仍有相邻 README 作为诊断工具入口。
- `docs/learnings/2026-07/20260725-progressive-tool-disclosure.html`
- `docs/learnings/2026-07/agent-turn-cancellation-is-a-lifecycle-protocol.html`
- `docs/learnings/2026-07/observability-identities-must-follow-lifecycles.html`
- `docs/learnings/2026-07/static-content-sites-need-build-contracts.html`
- `docs/learnings/2026-07/streaming-ui-handoff-needs-source-exclusivity.html`
- `docs/learnings/2026-07/ui-state-is-not-a-data-request-plan.html`
- `docs/learnings/2026-08/tool-mediated-multimodal-context-boundaries.html`

`histories/`、`learnings/` 原文保持不变。旧术语和旧路径有历史语境，不能全局替换为当前事实。

## 文档漂移与更新清单

| 编号 | 文档及证据 | 建议更新 |
| --- | --- | --- |
| DOC01 | `docs/design-docs/index.md:27,65` 仍写 Context 联合设计“待审阅、未实施、联合验收未执行”；对应 completed 联合计划及 20261011 执行摘要已记录实现、M/Small 验收和取消 L 的决定 | 改为“实现已落地，已完成范围与未覆盖项见验收”；明确 L 大库剩余长测已由用户取消，不能重新自动安排或称全量通过 |
| DOC02 | `docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/README.md` 末尾仍说仅落设计、联合计划待审阅；`05-Context面板与SQLite联合设计.md` 标头说接线已实现，正文又把旧现状列为事实 | 区分“实施前基线”与“当前实现”，统一状态；当前 main 的 `fixed-renderer-ipc.ts:778–783` 已调用 ContextPanelService，数据库 `usage-read-model-schema.ts:12` 为 schema 9，面板契约为 2 |
| DOC03 | `docs/exec-plans/README.md` 将 Context 前端继续写成 `describeContextPanel` 返回 null；`front-Context面板后端数据需求.md` 的 10 月 11 日需求稿仍作为当前导航 | 将前端需求稿注明实施前缺口记录，导航指向联合设计、共享契约和最终验收；不要把旧 mock 过渡状态当现状 |
| DOC04 | `docs/exec-plans/README.md:19–32` 多个已实现计划仍处于 active，且“未提交/等审核”等描述与当前 merge 记录矛盾 | 按 `PLANS_GUIDE.md` 的实现完成即 completed 规则，逐文件审阅并列迁移；人工验收边界保留在摘要。不能为关闭条目而把未覆盖改成通过 |
| DOC05 | `active/20261017-site-v4-redesign.md:3`、对应 execution-summary 标头仍“未提交”；首页“不用截图”等旧决策与 T9/H1 追加段不一致，旧风险称开发计划没有 Harness/Actor | 将阶段 A 事实校准为已合入 main；明确以 T9/H1 最终实现为准，复核已被后续修改消除的风险；阶段 B 文档重写另立计划，不冒充完成 |
| DOC06 | `docs/exec-runs/20261015-sidebar-redesign/execution-summary.md` 仍写未提交、只剩 Electron 手测；20261015/16 统一验收与修复摘要已有更新证据 | 加当前状态与验收入口，保留原始版本结果；不要改写旧测试数量为本轮数量。侧栏登记刷新与焦点修复应合并进入当前说明 |
| DOC07 | `active/20261014-trajectory-dsh-parity.md`、`active/20261014-trajectory-streaming-split.md`、`active/20261014-harness-builtin-upgrade-fix.md` 和轮尾卡片计划状态落后于合并及后续统一验收 | 校准进度/归档位置；保留 DSH 双页、原生打开、旧 HMR 现场、O01 性能观察等具体未覆盖，不让“验收指标全部达到”覆盖已有性能观察 |
| DOC08 | `docs/exec-plans/README.md:24` 仍要求 Space Q1–Q8 拍板再开 T1–T11，但计划 T0 与 history 已记录确认和实施 | 改为“已实现的开发演示”，核对演示验收遗留；不得写成真实多 Agent 协作已交付 |
| DOC09 | `sidebar-redesign-demo.html:2`、`turn-deliverables-demo.html:2`、`mobile-web-demo.html:2`、`mobile-web-v2-demo.html:2` 的未实现/未定稿标头过期 | 若第一批直接迁出，只修当前 Markdown 导航与状态；无需先翻新即将退役的原型正文 |
| DOC10 | `docs/design-docs/website-introduction-site-design.md:44` 引用已删除的 `apps/site/SHOWCASE_PLAN.md`；官网旧 Demo 引用已改名 logo | 将当前内容/截图入口改为 `apps/site/DESIGN.md`、`SCREENSHOTS.md` 与当前首页功能块。不要为已退役 Demo 恢复正式源码里的旧 Logo 文件 |
| DOC11 | `docs/QUALITY_SCORE.md` 明示为 2026-09-08 快照；Terminal、官网数量、测试数量等不代表现状 | 保留快照说明；如用户要更新质量水位，按本轮证据重评并带日期，未验收区域保留边界，不机械替换计数 |
| DOC12 | `docs/FRONTEND_VERIFICATION.md` 仍有前端重构期 `*` 未落地测试标记；`docs/ARCHITECTURE.md` 树已写 web，但“已确认工程骨架”仍枚举 desktop/cli/site | 逐一核实这些测试是否已落地；明确 Web 真实 Host 验证与 Desktop mock 的差异，补工程骨架 web，避免把浏览器 renderer 当完整 Electron |
| DOC13 | 本轮原生 Desktop 观察停止后新发消息进入“已暂停/继续发送”队列；`front-中间消息区规范.md:377` 写“手动发送一条后恢复”，而 `agent-task-run-lifecycle.md:23` 写“发送新输入不解除暂停”；`App.tsx:885–923` 默认不恢复，显式继续调用 resume | 校准前后端规范，明确普通发送与显式继续的区别。Web WA01 是缺少暂停说明/恢复入口，不应通过删除后端暂停机制处理；若产品要改变手动发送语义，须另行批准实现方案 |

优先处理 DOC01–DOC10 和 DOC13。DOC11–DOC12 属于第二轮入口校准，不能无证据扩大为全仓重写。

## 计划归档的候选清单

以下仅是建议 old → new 映射，尚未执行。归档表示实现阶段结束，剩余验收点在记录中保留；与用户确认完成的产品验收不是同一结论。

- `docs/exec-plans/active/20261011-repo-cleanup.md` → `docs/exec-plans/completed/20261011-repo-cleanup.md`
- `docs/exec-plans/active/20261011-approval-card-cursor-style/` → `docs/exec-plans/completed/20261011-approval-card-cursor-style/`
- `docs/exec-plans/active/20261013-turn-deliverables-cards.md` → `docs/exec-plans/completed/20261013-turn-deliverables-cards.md`
- `docs/exec-plans/active/20261014-trajectory-dsh-parity.md` → `docs/exec-plans/completed/20261014-trajectory-dsh-parity.md`
- `docs/exec-plans/active/20261014-trajectory-streaming-split.md` → `docs/exec-plans/completed/20261014-trajectory-streaming-split.md`
- `docs/exec-plans/active/20261014-harness-builtin-upgrade-fix.md` → `docs/exec-plans/completed/20261014-harness-builtin-upgrade-fix.md`
- `docs/exec-plans/active/20261015-sidebar-redesign.md` → `docs/exec-plans/completed/20261015-sidebar-redesign.md`
- `docs/exec-plans/active/20261017-site-v4-redesign.md` → `docs/exec-plans/completed/20261017-site-v4-redesign.md`（阶段 A；阶段 B 仍独立）
- `docs/exec-plans/active/20261017-web-pwa-client.md` → `docs/exec-plans/completed/20261017-web-pwa-client.md`（实现已落地；D4 iPhone/Tailscale 仍未签收）
- `docs/exec-plans/active/20261007-multi-agent-collab-frontend-demo.md` → `docs/exec-plans/completed/20261007-multi-agent-collab-frontend-demo.md`（只归档 mock 前端实施，不代表 Runtime 实施）

有真正未完成实施的 settings 写入一致性、批注 PB 等不批量归档。每批同步 `docs/exec-plans/README.md`、当前规范和执行记录中的相对链接，检查同名目标冲突。

## 桌面备份与迁移步骤（待批准）

建议备份根：`/Users/wakeup-jin/Desktop/actspace-docs-demo-backup-20261018/`。若执行当天目录已存在，使用新后缀，不覆盖旧备份。

映射示例：

`docs/design-docs/frontend/sidebar-redesign-demo.html`

→ `/Users/wakeup-jin/Desktop/actspace-docs-demo-backup-20261018/docs/design-docs/frontend/sidebar-redesign-demo.html`

执行顺序：

1. 重新冻结 HEAD、dirty 状态和待迁文件清单，确保本轮后新增/修改的用户文件不被旧计划覆盖。纯 DOCS 实施使用独立分支，提交/推送仍按届时授权。
2. **先复制，后校验，再移除仓库原件。** 保持 repo 相对目录结构，在桌面写本地 `manifest.json` / `README.md`，记录原路径、SHA-256、字节数、基线 commit、迁移时间、用途及缺失依赖；桌面备份目录不进入本仓库。
3. 复制 Demo 所需的 CSS、icon、角色图、截图等最小依赖闭包。`mobile-web-v2-demo.html` 依赖 `apps/web/src/styles/tokens.css`、`apps/web/public/icons/icon.svg` 和动态截图路径；Site Demo 依赖 `apps/site/src/assets/brand/`、博客 covers 和截图。模板字符串构造的资源也要核对，不能只信静态正则。
4. 已缺失的 `actspace-logo.png`、`wide-light-detail.png` 在清单注明。若本地备份需要可运行预览，在备份侧恢复可取得的历史资产或建立明确记录的本地兼容副本，原始 HTML 保留；不能静默用新图声称还原了历史画面。缺截图不得伪造。
5. 备份前后逐文件哈希一致；从桌面打开自包含原型、Web V2、Site 对比页三个代表，确认资源路径与导航。无法恢复资源的文件记录具体缺项。该验证只检查备份可读，不是产品验收。
6. 哈希和依赖核对完成后，移除获批的 31 个 Git 跟踪 HTML 当前副本。与产品共用的 CSS/图片只复制，不删除；Space 配套素材本轮不随 HTML 扩大删除范围。要迁出其他素材须另有零消费者证据和明确清单。
7. 当前导航改为指向 Markdown 规范、正式应用和验收文档；在仓库保留简短退役清单（原路径、版本、用途、已本地备份说明），不把个人桌面路径变成共享文档的必需链接。histories/learnings 保持原样；历史引用按原 commit 回溯，不全局改写。
8. 同批处理上表 DOC01–DOC10、DOC13 的语义漂移与计划生命周期；每批运行文档检查并检查差异。无需重新写整套原型或重做产品实现。

仅移除当前文件树中的 Demo，不改 Git 历史；因此旧提交中的 HTML 仍存在。用户若要求从 GitHub 所有历史彻底移除，应另立历史改写任务，不能混入这次本地备份。

## 当前检查结果与后续验收

本轮 `pnpm check:docs` **失败，17 处**。具体构成：

- Web V2 Demo 1 处引用缺失的 `wide-light-detail.png`。
- Site V4 Demo 13 处引用已不存在的 `actspace-logo.png`。
- 旧官网 Demo 2 处引用同一旧 Logo。
- 官网设计 Markdown 1 处引用已删除的 `SHOWCASE_PLAN.md`。

这是当前版本结果；旧记录中的“314 处缺失截图链接”不作为本轮结果沿用。现行检查覆盖 current-truth 声明及 design-docs / exec-plans / exec-runs 的链接和 HTML 资源，不代表全仓每个历史句子均已复核。

实施后至少满足：

- 每个迁出原件都有桌面副本和一致的哈希，备份目录未进入 Git。
- 批准范围外的文件、用户会话、密钥、产品源码没有被移动或删除。
- 当前入口不继续依赖迁出的 HTML；保留文件的相对链接和资源可用。
- `pnpm check:docs`、`pnpm check:current-docs`、`git diff --check` 通过。
- 若更新 `apps/site` 内容，再跑站点 `check` / `test` / `build`；不因纯内部 DOCS 清理重跑不相关的完整产品测试。
- 文档中“已实现”“工程测试通过”“UI 通过”“未覆盖”各有独立证据，Bug 清单与未验收边界仍可访问。

以上为审计阶段原始计划；后续已按页首说明执行，不把最初的“未执行”当作当前状态。
