# 2026-07-30 Composer Slash Command 菜单执行计划

## 状态

- 用户已批准，V1 代码实现、自动化检查和浏览器 Renderer 验证已完成。
- Electron 真实 Skill IPC、Context / Review 面板与命令链验收待用户手动执行，因此计划暂留 `active/`。
- 设计事实来源：`docs/design-docs/frontend/front-composer-slash-command.md`。
- 设计规范与本计划冲突时，以设计规范为准；实施中如需改变命令清单或执行语义，先更新规范并重新取得批准。

## 目标

在现有 Composer 中增加一个由 `/` 触发的紧凑快捷菜单，以 `Functions` 与 `Skills` 两组展示真实可用能力。完成后，用户可以通过键盘切换 Chat / Plan / Agent、调用 Compact / Context / Review、补全 Eval 命令并绑定 workspace Skills，同时保持现有 `+` 菜单、模型选择、附件、运行模式和 Agent Runtime 契约不变。

## Required Reading

新会话执行本计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/PLANS_GUIDE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
- `docs/design-docs/frontend/front-composer-slash-command.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/design-docs/frontend/front-基础组件封装规范.md`
- `docs/design-docs/tool-system/agent-skill-loading.md`
- `docs/design-docs/evaluation/agent-evaluation.md`
- `.agents/skills/frontend-design/SKILL.md`

## 范围

包含：

- 新增 Composer Slash 查询解析、Function catalog、Skills 结果合并与过滤逻辑。
- 新增 `/` 弹层、Functions / Skills 分组、loading / empty / error / retry 状态。
- 新增键盘 active item、ArrowUp / ArrowDown / Enter / Escape 与 IME 防护。
- 复用现有 Chat / Plan / Agent mode 回调、`/compact` / `/eval` 路由、Context / Review 回调和 Skill registry。
- 保持 Slash 菜单与 `+`、model menu、model options、Context popup 互斥。
- 补齐纯函数、Composer 交互和现有 App command route 的回归测试。
- 同步 history；完成后按学习沉淀标准判断是否需要新增 learnings 文档。

不包含：

- 不新增或修改 main、preload、shared IPC、Agent Core Skill loader、`/compact` 或 `/eval` 后端协议。
- 不做 Model、Reasoning、Image、New chat、MCP、Plugin、Automation、SubAgent、Pet 或 Side chat 命令。
- 不做自定义命令、最近使用、排序、收藏、遥测或命令持久化。
- 不做 Skill 安装、卸载、启停、推荐市场或远程搜索。
- 不重构整个 Composer，也不把所有产品功能抽象为跨进程 Command Registry。
- 不调用付费模型，不把浏览器 renderer 验证描述为真实 Electron / provider 验收。

## 已确认的设计决策

- 只有 `Functions` 与 `Skills` 两个一级分组。
- Functions 固定为 `/chat`、`/plan`、`/agent`、`/compact`、`/eval`、`/status`、`/review`。
- `/compact` 从菜单选择后立即复用现有 onSend 路由，但不消费已有附件和 Skill 绑定。
- `/eval` 选择后补全为 `/eval `，等待用户填写说明并正常发送。
- `/status` 打开 Context；`/review` 打开 Review；模式命令调用现有 `onModeChange`。
- Slash 与 `+` 复用行为处理器和 Skill registry，但菜单内容不完全相同。
- Textarea 保持焦点，使用 active descendant 模式完成键盘导航；不拦截 Tab，不破坏现有 Shift+Tab Plan 快捷键。
- 样式只消费现有主题 token，不新增颜色字面量。

## 相关代码路径

- `packages/desktop/src/renderer/components/composer-slash-commands.ts`：新增纯 Function catalog、Slash query parser、过滤和排序逻辑。
- `packages/desktop/src/renderer/components/Composer.tsx`：Slash 菜单状态、渲染、键盘导航、Skill 加载复用和行为分发。
- `packages/desktop/src/renderer/test/composer-slash-commands.test.ts`：新增 parser / filter / ordering 单测。
- `packages/desktop/src/renderer/test/composer.test.tsx`：新增菜单、键盘、IME、行为、Skill 与浮层互斥测试。
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`：确认 `/compact`、`/eval` 现有执行链和非普通消息行为不回归。
- `docs/design-docs/frontend/front-composer-slash-command.md`：设计事实来源，仅在实施发现设计事实需要修订时同步更新。
- `docs/design-docs/frontend/front-聊天输入框规范.md`：母规范摘要保持一致。
- `docs/histories/2026-07/`：新增本次功能 history。

## 风险与缓解

### Enter 与 IME 冲突

- 风险：中文候选词上屏时误选命令或发送消息。
- 缓解：Slash active item 与普通发送共用现有 `nativeEvent.isComposing` / `keyCode === 229` 防护，并新增覆盖菜单打开状态的 IME 测试。

### 浮层状态互相打架

- 风险：Slash、`+`、Skills 二级菜单、model options 或 Context 同时打开，产生遮挡和焦点漂移。
- 缓解：把 Slash 纳入现有 `closeFloatingPanels()` 和 pointer-down 互斥链；每个打开入口先关闭其他浮层，并增加双向互斥测试。

### `/compact` 清空普通附件

- 风险：直接复用 `sendCurrentMessage()` 会清空图片或文件附件。
- 缓解：为即时 Slash action 使用独立的小型 dispatch helper，只发送命令文本与模型运行选项；成功触发后只清除 Slash 查询，不修改 attachments 和 selectedSkills。

### Skills 加载拖慢 Functions

- 风险：Electron IPC 慢或失败时整个菜单不可用。
- 缓解：Functions 同步渲染；Skills 独立 loading / error / retry，并复用现有 workspace 缓存和筛选规则。

### Composer 继续膨胀

- 风险：把解析、catalog、过滤和 UI 全写进 `Composer.tsx`，降低后续可维护性。
- 缓解：纯数据和纯函数固定放入 `composer-slash-commands.ts`；组件只保留状态、行为回调与渲染，不抽象跨进程通用命令框架。

### 键盘可访问性回归

- 风险：输入焦点移入菜单后无法继续搜索，或 active item 只靠颜色表达。
- 缓解：textarea 保持焦点并暴露 `aria-controls` / `aria-activedescendant`；结果使用稳定 id、role 和 aria-selected，active / selected 同时使用中性底色与勾选/图标。

## 实施任务

### Task 1：Slash catalog、query parser 与过滤测试

修改文件：

- 新增 `packages/desktop/src/renderer/components/composer-slash-commands.ts`
- 新增 `packages/desktop/src/renderer/test/composer-slash-commands.test.ts`

实现：

- 定义 `ComposerSlashFunctionId`、Function item metadata 与固定产品顺序。
- 实现完整草稿匹配 `^/[^/\s]*$` 的 query parser；返回未触发或规范化 query。
- 实现 Function 的 command / label / description 匹配和精确 command 前缀优先。
- 实现 Skills 的 name / description 匹配，并保持项目级优先、scope 内 name 升序。
- 为动态结果生成稳定 item id，供 active descendant 使用。

验证：

- 未以 `/` 开头、包含空格、包含换行、URL 和包含后续 `/` 的路径不触发。
- `/`、`/pla`、`/compact`、大小写查询得到确定结果。
- Functions 与 Skills 分组独立隐藏，空结果可确定判定。
- 重名或相似 Skill 的顺序稳定。

### Task 2：Composer Slash 菜单基础交互

修改文件：

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`

实现：

- 增加 Slash open、active index、dismissed query 和菜单 ref 状态。
- message 改变时根据 parser 打开、过滤或关闭菜单；streaming 时强制关闭。
- 首次打开 Slash 菜单时复用 `handleOpenSkills()` 的真实 registry 加载与 workspace cache。
- 渲染 Functions / Skills 两组，以及 Skills loading / empty / error / retry 和总空态。
- 菜单加入现有浮层互斥、pointer outside、Escape 和 reduced-motion 机制。
- textarea 增加 `aria-expanded`、`aria-controls`、`aria-activedescendant`；结果行提供稳定 role / id / selected 状态。

验证：

- 输入 `/` 打开，继续输入实时过滤；删除 `/` 或加入空格关闭。
- Functions 在 Skills loading / error 时仍可用。
- 点击外部或 Escape 关闭但不删除查询。
- 打开 `+`、model 或 Context 时 Slash 关闭；打开 Slash 时其他浮层关闭。
- initial / follow-up 与 inline / stacked 使用同一个 textarea，不发生 remount。

### Task 3：键盘导航与 Function 行为

修改文件：

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`

实现：

- ArrowUp / ArrowDown 循环 active item；鼠标 hover 同步 active item。
- Enter 在菜单打开时选择 active item，IME composing 时不选择、不发送。
- Chat / Plan / Agent 调用现有 mode callback，清除 Slash 查询并恢复焦点。
- Compact 使用独立 command dispatch 调用 `onSend("/compact", options)`；不传 attachments，不清空 attachments 或 selectedSkills。
- Eval 写回 `/eval `，关闭菜单并把光标放到末尾。
- Context / Review 调用现有回调，清除 Slash 查询并恢复焦点。
- Tab 不被拦截；Shift+Tab 的 Plan 行为保持。

验证：

- 每个 Function 都有独立行为断言。
- `/compact` 不创建普通 user message 的 App 回归测试继续通过。
- Compact 前已有图片或文件附件时，触发后附件仍可见。
- Eval 只补全不立即执行，继续输入原因后沿用现有 `/eval` route。
- IME、Shift+Enter、Tab 和普通 Enter 的边界不回归。

### Task 4：Slash Skills 绑定与 workspace 刷新

修改文件：

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`

实现：

- 把现有可用 Skill 列表映射为 Slash result，不复制 registry 过滤规则。
- 点击或 Enter 切换 Skill name，调用现有 `onSelectedSkillsChange`。
- 选择后清除 Slash 查询、关闭菜单、恢复输入焦点；现有 Skill pill 立即反映上层状态。
- workspace 改变时使 Slash 与 `+` 共用的旧 Skill cache 失效并重新加载。
- Retry 只重试 Skills，不重置 Functions 或输入 query。

验证：

- disabled、shadowed、warning Skill 不出现。
- name / description 可过滤，项目级结果排在用户级前。
- 已绑定 Skill 显示 selected 状态，再次选择可移除。
- workspace 切换后调用新的 `listSkills({ workspaceRoot })`。

### Task 5：工程验证、视觉验收与文档收尾

修改文件：

- `docs/histories/2026-07/<timestamp>-composer-slash-command-menu.md`
- 仅在实现事实变化时同步 `docs/design-docs/frontend/front-composer-slash-command.md` 与母规范。
- 若本次变更至少命中两条学习沉淀标准，按 `docs/learnings/WRITING_GUIDE.md` 新增对应学习文档。

运行：

```sh
pnpm --filter @actspace/desktop exec vitest run src/renderer/test/composer-slash-commands.test.ts src/renderer/test/composer.test.tsx src/renderer/test/app-streaming-user-message.test.tsx
pnpm typecheck
pnpm build
pnpm check:frontend-theme
git diff --check
```

浏览器 Renderer 验收：

- [x] initial surface 的常规宽度与 480px 窄窗口；菜单保持在视口内并内部滚动。
- [x] 键盘 active descendant、ArrowDown + Enter 选择 Plan、输入焦点保持。
- [x] Functions 与 Skills error / Retry 状态在无 Electron bridge 的浏览器环境中可见。
- [ ] Dark、follow-up、inline / stacked、附件和 selected Skill 的真实视觉状态；自动化已覆盖结构与行为，留给 Electron 手动验收。

Electron 真实验收：

- 真实 Skill IPC 加载、Retry 和 workspace 切换刷新。
- `/compact` 与 `/eval` 真实 main / preload 路由。
- Context / Review 打开正确面板。
- 本轮不进行付费模型调用；真实 provider 行为如需验证，由用户按现有手工验收边界统一执行。

## 最小回退策略

- 所有改动限定在新增 pure helper、Composer、测试和文档；如菜单导致输入回归，可以整体移除 Slash helper 与 Composer 入口，不影响现有 `+`、模式、附件、Skill pill、`/compact` 和 `/eval` 文本命令。
- 不修改 IPC 与持久化格式，因此回退不需要数据迁移或设置清理。
- 若视觉验收未通过，保留纯 parser / 测试也没有产品价值，应与 UI 入口一起回退，避免留下不可发现的半成品。

## 进度记录

- [x] 完成设计规范与执行计划草案。
- [x] 用户批准命令清单、选择语义和 V1 排除项。
- [x] 完成 Task 1：catalog、parser 与纯函数测试。
- [x] 完成 Task 2：菜单基础交互。
- [x] 完成 Task 3：键盘与 Function 行为。
- [x] 完成 Task 4：Skills 绑定与 workspace 刷新。
- [x] 完成 Task 5 的自动化、浏览器 Renderer、history 与学习沉淀检查。
- [ ] 用户完成 Electron 真实验收后，将本计划移入 `completed/`。

## 决策记录

- 2026-07-30：采用独立 Slash 设计文档，不继续把所有细节堆进 Composer 母规范；母规范只保留摘要与导航。
- 2026-07-30：V1 只保留 Functions / Skills 两组，不建设通用 Command Registry 或 Skill marketplace。
- 2026-07-30：`+` 与 `/` 共享能力处理器和 Skill registry，但分别优化鼠标与键盘场景，不要求内容镜像。
- 2026-07-30：排除 Model、Reasoning、Image、New chat；它们已有稳定入口或存在额外草稿安全语义。
- 2026-07-30：浏览器 Renderer 验收发现 initial surface 固定向上展开会越出视口；改为 initial 向下、follow-up 向上，并分别限制可见高度。
- 2026-07-30：workspace Skill 加载加入 request identity，旧工作区请求即使晚返回也不能覆盖新工作区结果。
