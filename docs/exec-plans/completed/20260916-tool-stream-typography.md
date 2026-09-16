# 消息流排版与工具摘要实施计划

状态：实现完成；剩余真实桌面和 system 双主题验收见执行摘要。
日期：2026-09-16。
执行模式：交互模式；用户批准本计划并要求开始后，按以下范围连续推进，范围外协议或业务变化再确认。

## 目标

将已认可的 demo 排版应用到真实消息流：统一过程行、收敛 Thinking 邻接间距、区分动作与目标、缩短 Bash 摘要，保持工具执行事实、现有操作和状态生命周期。

设计唯一入口：[消息流排版与工具摘要规范](../../design-docs/frontend/front-tool-stream-typography.md)。视觉基线：[demo 调整后](../../design-demos/tool-stream-typography-demo.html)。demo 的调整前为示意，不作像素复刻基线。

## 必读与约束

- `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/core-beliefs.md`。
- `docs/CODING_BEHAVIOR.md`、`docs/FRONTEND_VERIFICATION.md`、`docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`。
- `docs/design-docs/frontend/front-中间消息区规范.md`、`front-主题与配色规范.md`、`front-agent-tool-stream-rendering.md`（后两项位于同一 frontend 目录）。
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`、`docs/coding-standards/team/frontend-style-scope-conventions.md`。
- `docs/design-docs/frontend/front-progressive-session-loading.md`：详情加载和分页的当前契约。

当前工作区已有 staged/unstaged 修改，包含同名组件和 projection。执行开始记录 `git status --short` 与本轮涉及文件的 diff；只改本计划对应片段，禁止整文件恢复、清理、提交或推送其他任务改动。

没有新依赖、服务、设置、命令、凭据或第三方 API。沿用 React、Tailwind、Vitest、现有 demo/fixture 与浏览器能力。实际执行不需要真实模型请求，先用固定 fixture 验证，再用已有真实会话做 Electron 验收。

## 范围与代码所有权

预计生产改动超过 8 个文件，不能作为单个 CSS 数字调整处理。以下为允许范围，逐项按实际需求修改，不为凑文件数量创建抽象。

| 路径 | 职责 |
| --- | --- |
| `apps/desktop/src/renderer/components/ConversationView.tsx` | 相邻消息布局与过程/正文分类 |
| `apps/desktop/src/renderer/components/messages/ToolActivityGroup.tsx` | Worked 内外的间距归口 |
| 同目录 `ThinkingBlock.tsx`、`AssistantReply.tsx` | 明确行高、取消外部间距、Thinking disclosure |
| 同目录 `toolLogStyles.ts`、`ToolLogLine.tsx` | 统一行基线、拆分动作/目标/元数据 |
| 同目录 `BashRunBlock.tsx`、`FileDiffBlock.tsx` | 应用同一基线，保留审批、生成进度、diff |
| `apps/desktop/src/renderer/styles/tool-result.css` | 修正字体继承及重复外边距，仅限工具作用域 |
| 新建同 messages 目录 `messageFlowStyles.ts`（需要时） | 相邻间距与基线唯一常量入口，不建通用 UI 框架 |
| `apps/desktop/src/main/runtime-v2/fixed-renderer-tool-preview.ts` | Bash 展示标题与完整原因的保留 |
| 同 runtime-v2 目录 `fixed-renderer-stream-adapter.ts`、`fixed-renderer-projection.ts` | 仅在字段透传需要时同步，实时/回读同源 |
| `packages/shared/src/session-selectors.ts` | 仅在已有 Bash 字段被丢弃时修正转换；不扩持久契约 |
| messages 下 `SubAgentTranscriptModal.tsx`、`ExploreRunBlock.tsx` | 仅容器间距与复用验证需要的局部适配 |

只读审查 `packages/shared/src/session.ts` 中 BashPreview 字段。若方案必须改变 shared 类型、Runtime 输出、事件结构或引入新服务，停止该扩展并给出证据；这不属于本轮已定义实施范围。

不重做分组、字体系统、Markdown、Sidebar、Composer、Agent 活动行与右侧对象布局。既有 Read 打开文件与 disclosure 分工不照搬 demo。保留文件生成进度、按需详情和真分页。

数据方向保持单向：

```text
Runtime/Journal 已有事实
  → Main 共享 toolPreview（实时与回读）
  → 已有 MessageBlock 转换
  → ConversationView / ToolActivityGroup 统一相邻布局
  → Thinking / ToolLog / Bash / FileDiff / Assistant 各自渲染
```

## 执行切片 A：统一排版和间距

独立交付结果：即使切片 B 尚未完成，产品也能保持原摘要文案正常运行，字号与间距已一致。

1. 用现有 ConversationView 测试装配真实组件样例，新增显式 fixture `apps/desktop/src/renderer/test/fixtures/tool-stream-typography-preview.html` 及同名 `.tsx`，包括截图中的连续 Thinking/Read/Edit/Bash/正文。fixture 不进入生产路由。
2. 在当前未修改组件上记录 light/dark 基线；读取 Thinking 后工具、Read 两种结果分支和 Bash 的 computed style 与 bounding box。判别额外空白是否包含空消息或隐藏内容；不改事件语义来掩盖空白。
3. 在 message flow 局部实现设计表里的 5/14/23/18px 相邻规则，明确 Bash 属于过程行；审批/系统通知回退既有间距。Worked 内外只应用一次最终回复边界。
4. 移除这批组件的外部 `-mt-1`、`mt-0.5` 和结果 disclosure margin 补偿。展开内容内部 7px、尾部 8px 由统一规则表达；独立组件不得依赖外层某个 gap 才能正确排版。
5. 工具/Thinking 基线为 14px、22px、400；Read 无预览、有预览、可打开文件三种分支一致。保留用户字体设置、相同左边缘与 focus ring。
6. Thinking 箭头在展开态保留可见，保留最终完成时自动收起与手动重开；不改变流式状态、审批控件和生成进度。
7. 同步中间消息区规范的排版与箭头规则，只把已实现部分标为已实施。

验收：浏览器测得折叠过程行高度/间距一致；Thinking → Bash 与 Thinking → Read 无异常跳距；文件按钮不因结果内容而变大；Worked 收起/展开正常；正文不会挤进工具行。

## 执行切片 B：工具摘要与完整详情

独立交付结果：在 A 上缩短工具摘要并保留全部详情；不依赖数据迁移。

1. `ToolLogLine.tsx` 根据现有结构化字段分别渲染 action、target、meta；Read 的点击与结果展开维持各自入口。未知工具保留可靠原文回退，不从自由文本解析新业务字段。
2. Bash 主行只显示状态动作、命令和可信的短状态；不使用 `Ran + 完整执行 summary`。已有 intent 留详情，缺失命令回退工具名。
3. Main builder 的 Bash 终态标题使用稳定工具标题；完整失败原因放已有 reason/stderr，成功 summary 仅在存在需要保留的信息时进入现有详情展示，不丢原始工具输出，也不让大输出回流快照。renderer 对旧标题保持可读回退，不能给历史标题再次拼前缀制造重复。
4. 核验实时、完成、历史恢复的 reason/exitCode/durationMs/environment 透传。缺失事实保持未知；不从 summary 反解析 sandboxed/exitCode。若只有长原因，主行保留 Denied/Failed 与命令，详情完整展示。
5. 正常沙盒信息进入详情，“真实环境”“未执行”、后台状态与 pending 审批提示继续在主行；不修改审批决策与执行状态映射。
6. 同步工具预览规范 Bash 摘要/环境显示与实时回读说明，不提前宣称 Runtime 新能力。

回归用例：成功、非零退出、拒绝、过期、取消、pending、后台运行、无命令/原因/环境、长命令；主行精简但完整原因仍可读取。旧会话与新事件对同一事实展示一致，未执行不得出现成功退出码。

## 测试与验收

优先更新已有真实行为测试，不写只断言 class 字符串等于实现的镜像测试。

- `apps/desktop/src/main/test/runtime-v2-tool-preview.test.ts`：状态与完整原因保留、元数据缺省、摘要精简。
- `apps/desktop/src/main/test/runtime-v2-tool-stream.test.ts`、`runtime-v2-fixed-renderer-projection.test.ts`：实时/回读一致、完整详情引用保留。
- `apps/desktop/src/renderer/test/bash-run-block-tooltip.test.tsx`：Bash 主行/详情、未知环境、审批动作回归。
- `apps/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`、`file-diff-block.test.tsx`、`agent-run-block.test.tsx`：既有点击、diff、生成进度与 Agent 入口。
- 新增 `apps/desktop/src/renderer/test/tool-stream-typography.test.tsx`：Thinking 完成后收起及手动重开、Read 两种分支的操作、工具/正文顺序。布局尺寸用浏览器 fixture 测，不用 jsdom 推断实际高度。

命令（仓库根目录）：

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/desktop exec vitest run src/main/test/runtime-v2-tool-preview.test.ts src/main/test/runtime-v2-tool-stream.test.ts src/main/test/runtime-v2-fixed-renderer-projection.test.ts src/renderer/test/bash-run-block-tooltip.test.tsx src/renderer/test/conversation-view-tooltip.test.tsx src/renderer/test/file-diff-block.test.tsx src/renderer/test/agent-run-block.test.tsx src/renderer/test/tool-stream-typography.test.tsx
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop build:renderer
pnpm --filter @actspace/desktop build:electron
pnpm check:frontend-theme
pnpm check:docs
```

如果改变 session-selectors 转换，另跑 `pnpm --filter @actspace/shared test`。基线或并行任务失败要注明文件与原因，不能把未通过描述为本轮通过，也不借机修范围外代码。

浏览器：`pnpm --filter @actspace/desktop dev:renderer`，使用启动日志中的地址打开 `/src/renderer/test/fixtures/tool-stream-typography-preview.html`。检查设计矩阵全部状态，保存 light/dark 代表截图、375px 窄列截图及 computed style/间距读数。system 浅深由浏览器主题仿真或宿主切换验证，未实际覆盖就明确留门禁。

Electron：`pnpm dev:log`，从日志识别本 workspace 的 appName/appId；检查已有真实工具会话、Worked、文件打开、diff、历史恢复和详情加载。截图不含敏感命令/路径。浏览器 fixture 不能替代该层验收。

## 风险与回退

| 风险 | 处理 |
| --- | --- |
| demo 的布局不同于真实嵌套容器 | A 的真实组件 fixture 先测盒模型，避免叠加 gap；最终以真实渲染为准 |
| 日志摘要精简丢掉唯一错误原因 | B 的测试先固定完整原因可访问，再缩短标题 |
| 旧数据字段不足 | 有事实才展示，保留详情回退，不迁移历史、不伪造环境 |
| 共享组件影响 transcript/分页/流式 | 复用表面纳入验收；不修改 key、事件排序、分页合并或生命周期 |
| 与其他脏改动重叠 | 执行前保存涉及片段基线；回退仅撤销本任务 hunks，不 checkout 整文件 |

A 与 B 可分别回退。无数据迁移、部署、提交或推送动作。出现产品行为回归先恢复该切片的局部改动，保留已通过且独立的前一切片。

## 进度与交付

- [x] 2026-09-16：设计与 demo 对齐，源码和现有契约复核，写成待审阅计划。
- [x] 用户审阅并授权开始实施。
- [x] A：统一排版与间距，真实组件 fixture 与行为回归通过。
- [x] B：摘要分层、详情保留、实时/历史回读回归通过。
- [x] 主题、构建与文档检查；浏览器已覆盖项目和未覆盖边界见执行摘要。
- [x] Electron 验收记录；未验证项目明确写明原因与操作步骤。
- [x] 更新设计状态、history、执行摘要与索引。

执行开始创建 `docs/exec-runs/20260916-tool-stream-typography/execution-process.md` 与 `execution-summary.md`，套用仓库模板。实施完成移入 completed，人工门禁如仍未通过，明确记录，不能标成全面验收通过。检查学习沉淀条件，达到至少两项才单独编写学习文档。

## 决策记录

- 2026-09-16：采用已获正面反馈的 demo 基线，产品实施须先获得用户授权。
- 2026-09-16：不增加分组或卡片；修字体、间距与摘要三个局部责任。
- 2026-09-16：Thinking expanded 箭头为拟替代旧例外的新规则；实际实施时同步文档。
- 2026-09-16：保留真实环境/未执行和 pending 的可见提示；未知元数据不推测。

## 实施结果

见[执行摘要](../../exec-runs/20260916-tool-stream-typography/execution-summary.md)。产品代码已完成；浏览器样例和自动检查不能替代真实 Electron 会话恢复、按需加载与 system 双主题人工验收。实施前仅记录了浅色组件尺寸，没有深色修改前截图，不将 demo 当作该证据。
