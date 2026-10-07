# 多智能体协作（Space）前端演示

> 状态：2026-10-07 立项；同日 T0 完成（设计文档 D18–D31），**进入实施**。
> 分支：`feat/multi-agent-collab-fe`（工作树 `../actspace-agent-multi-agent`，从 main `d5f1bf3e` 分出）。

## 目标

把 [space-demo.html](../../design-docs/多智能体协作/space-demo.html) 落进 Desktop renderer：左栏出现「新建 Space」「Actor 名册」入口和 Space 分区，进入后是 Space 工作台（标签栏、协调 Agent / Actor 对话、现有样式的右栏加 Actor / 库 / 记忆标签、胶囊与审批托盘、现有 Composer）、名册页和一对一对话。界面样式以真实桌面端组件和 token 为准。另附一个独立小任务：普通会话右栏启动页改成列表样式（T7a）。数据全部 mock，界面上明确标出「开发中演示，不能真实使用」。

## 范围

- 包含：设计文档 §4、§5 的全部界面与交互；mock 数据与脚本化模拟（交事、审批到达、有结果滑到空闲、留下 Actor）；头像素材；主题 token；单测与组件测试；浅色、深色、窄窗验收。
- 不包含：任何后端、IPC、`window.actspace` 契约、`packages/` 改动；持久化；真实执行审批；编辑指令、库文件增删与预览、Space 设置与删除（只给提示）。Space 里右栏的文件、终端、Review、上下文、子 Agent、可视化回复都显示 mock 内容，不读真实磁盘、不开真实终端。

## 背景

- 必读：`AGENTS.md`、[Space 工作台设计](../../design-docs/多智能体协作/front-space-工作台设计.md)、[space-demo.html](../../design-docs/多智能体协作/space-demo.html)（交互以 demo 的脚本为准）、[前端新功能开发清单](../../design-docs/frontend/front-新功能开发清单.md)、[主题与配色规范](../../design-docs/frontend/front-主题与配色规范.md)、[基础组件封装规范](../../design-docs/frontend/front-基础组件封装规范.md)、[会话状态与数据流规范](../../design-docs/frontend/front-会话状态与数据流规范.md) §1。
- 相关代码（`R/` = `apps/desktop/src/renderer/`）：
  - 视图切换：`R/components/WorkbenchLayout.tsx`（`view` 状态、`mainContent` 分支、右栏显示条件 `view === "chat"`）；`R/components/Sidebar.tsx`（`SidebarView` 类型、主操作按钮、`nav-section`）；`R/components/sidebar/styles.ts`。
  - 布局宽度：`R/components/workbench/use-panel-layout.ts`、`R/components/WindowChromeBar.tsx`。
  - 右栏：`R/components/RightPanel.tsx`（标签栏 `RightPanelTabs`、启动页 `RightPanelLauncher`，763 行，已超 500 行）、`R/components/right-panel/RightPanelObjectMenu.tsx`（「+」菜单）、`RightPanelContext.tsx`（全局一份标签状态，依赖真实会话和 IPC）。
  - 输入框：`R/components/Composer.tsx`（`ComposerProps` 里 `onSend`、`statusNotice`、`permissionControl`、`contextSnapshot` 等都由调用方传入）。
  - 原语：`R/components/ui/{Button,IconButton,Menu,Dialog,Tooltip}.tsx`；审批卡视觉参考 `R/components/messages/ApprovalParts.tsx` 的 `ApprovalCard`。
  - 头像：`R/assets/subagents/companion-1..9.webp`，导入方式见 `R/components/messages/AgentIdentity.tsx`。
  - 样式：`R/styles/tokens.css`、`R/styles/tailwind.css`、`R/styles/index.css`、`R/styles/base.css`（现有 keyframes）。
- 已知约束：
  - 不引入状态库；store 是带 `subscribe` 的小对象，React 侧 `useSyncExternalStore`。
  - 颜色、字号、圆角、阴影、层级、动效时长只用 token；`pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 必须通过。
  - 弹层只用 `R/components/ui/` 原语；单文件超过 500 行要拆。
  - 不新增 IPC，`pnpm check:renderer-bridge`、`pnpm check:ipc-channels` 不受影响。

## 文件布局

全部新代码放在 `R/components/space/`，按职责分子目录（区域目录约定，不建 `features/`）：

```
R/components/space/
  SpaceWorkbench.tsx        中栏入口：标签栏 + 提示条 + 内容 + 输入区，只做装配
  SpaceRightPanel.tsx       右栏入口：复用现有右栏的标签栏和启动页，按上下文决定可开的标签
  SpaceSidebarSection.tsx   左栏：新建 Space、Actor 名册入口、Space 分区、一对一对话行
  SpaceDemoNotice.tsx       「开发中演示」提示条 + 重置
  model/
    types.ts                Actor、Space、SpaceMember、CoordinatorMessage、ActorBlock、MemoryItem、LibraryFile、MemberStatus、PanelContext
    fixtures.ts             demo 的两个 Space、十个 Actor、右栏 mock 文件树 / 代码 / 终端 / diff（逐字搬 demo）
    selectors.ts            纯函数：分组、胶囊计数、托盘列表、行说明、等你决定数、引用解析、右栏默认标签
    space-demo-store.ts     store + 全部动作 + 脚本化模拟（时钟可注入）
    use-space-demo.ts       useSyncExternalStore 封装
  avatar/                   ActorAvatar（含工作中光环）、SpaceAvatar、头像映射
  tabs/                     SpaceTabBar、TabOverflowMenu、use-tab-overflow.ts
  thread/                   CoordinatorThread、ActorThread、ActorHeader、ActorRef、KeepActorCard、SpaceBlank、StreamingText
  dock/                     SpaceDock（托盘、胶囊，下面接现有 Composer）
  panel/                    ActorGroups、use-flip-rows.ts、LibraryList、MemoryList、SpaceObjectMenu
  panel/mock-views/         Space 里文件、终端、Review、上下文、子 Agent、可视化回复的 mock 视图
  roster/                   ActorRoster、ActorSoloChat
  dialogs/                  NewSpaceDialog、SpaceDemoHelpDialog
R/components/right-panel/
  RightPanelLauncherList.tsx  启动页列表（T7a 拆出，普通会话和 Space 共用）
  RightPanelTabStrip.tsx      标签栏展示部分（T7 拆出，不依赖 useRightPanel，普通会话和 Space 共用）
R/assets/space/             space-*.png ×6、ball-*.png ×5、README.md
R/styles/space.css          星空、光环、星尘等只能写成全局 CSS 的动画
```

## 任务

### T0 确认接入决策（已完成）

- 2026-10-07 用户确认 Q1–Q8 与右栏改版 demo，结论写入设计文档 §2 的 D18–D31，§10 清空。下面的任务已按结论改写。

### T1 头像素材

- 把 `docs/design-docs/多智能体协作/assets/demo/` 的 11 张 256px PNG 用 `sips -Z 128` 缩到 128px，输出到 `R/assets/space/`，文件名不变。
- `R/assets/space/README.md` 写来源、尺寸、「数组顺序决定映射，不要重排」。
- `avatar/avatar-assets.ts` 显式 import 全部 11 张 + 复用 9 张 companion；`hashId` 与 demo 相同（`h * 31 + charCode`，初值 7），保证同一 id 在 demo 与桌面端拿到同一颜色。
- 验证：`avatar-assets.test.ts` 断言 `ballFor("load")`、`ballFor("env")` 与 demo 一致，Space 颜色按创建序号轮换。

### T2 数据类型、fixtures、选择器

- `model/types.ts`：实体按设计文档 §9 拆成 `RosterActor`（名册属性）、`Space`、`SpaceMember`（状态、任务、待办、目录、工作树、对话），对话块用可辨识联合（`task | done | brief | line | sync | text | approval`），协调 Agent 消息同理（`divider | user | coord | mem | keep`）。
- `model/fixtures.ts`：逐字搬 demo `seed()` 的数据与文案。
- `model/selectors.ts`：`panelDefaults(context)`（D28：协调 Agent → Actor、库、记忆；Actor 有改动 → Review + 终端，否则文件 + 终端；一对一 → 文件）、`groupMembers`（按 wait → fail → run → result → idle，空组去掉）、`pillCounts(space, currentTab)`（等你决定不算当前标签）、`trayList`、`describeMember`（与 demo `describe()` 同规则）、`waitCount`、`parseActorRefs`（`[[id]]` → 片段数组，未知 id 原样保留）。
- 验证：`R/test/space-selectors.test.ts` 覆盖每个函数，含「当前看的 Actor 不进托盘和胶囊」「空分组不出现」「未知引用原样保留」「三种上下文的默认标签」。

### T3 store 与模拟脚本

- `space-demo-store.ts` 导出 `createSpaceDemoStore({ clock })`，`clock` 默认 `setTimeout` / `clearTimeout`，测试注入假时钟。状态与 demo 的 `S` 对应：`view: "space" | "roster" | "chat"`、`spaceId`、各 Space 的 `openTabs` 与 `active`、`panels`（按上下文 key 记右栏标签：`<spaceId>:coord`、`<spaceId>:<actorId>`、`chat:<actorId>`，值是 `{ tabs, active }`，第一次读取时用 `panelDefaults` 生成）、`panelOpen`、`collapsed`、`trayOpen`、`trayIdx`、`chatWith`、`chats`、`soloChats`、`rosterQuery`、`litRows`、`freshCard`、流式中的消息。
- 动作（与 demo 函数一一对应）：`send`、`sendSolo`、`approve`（runAgent）、`deny`（denyAgent）、`openActorTab`（含有结果 1.4s 后滑到空闲）、`selectTab`、`closeTab`、`closeOtherTabs`、`switchSpace`、`goRoster`、`openSoloChat`、`keepActor`、`declineActor`、`undoMemory`、`forgetMemory`、`createSpace`、`toggleGroup`、`openPanelTab`、`selectPanelTab`、`closePanelTab`、`togglePanel`、`toggleTray`、`trayPrev/Next`、`reset`。
- 时序常量放在一处：回复前 760ms、每 26ms 出 3 个字、审批在交事 3.6s 后到达、有结果看过 1.4s 后滑走、长成动画 950ms。
- 切换 Space、离开视图、`reset` 时清掉所有挂起的定时器；定时回调先检查 Space 未变（demo 的 `sid` 判断）。
- 只在内存里，刷新即回到 fixtures。
- 验证：`R/test/space-demo-store.test.ts` 用假时钟走完：发送 → 流式结束 → 成员进入工作中并点亮 → 3.6s 后一个成员进入等你决定 → 批准回到工作中；拒绝进入空闲并写说明；关当前标签跳左边；切 Space 恢复各自标签；留下 Actor 后 `nascent` 变 false 并换角色图；各上下文的右栏标签互不影响；撤销记忆同时删 Space 记忆；切换 Space 时挂起的定时器不再改原 Space。

### T4 视图与左栏接入

- `Sidebar.tsx`：`SidebarView` 增加 `"space"`。按 D20 排：主操作组「新建会话 → 新建 Space → 扩展 → Actor 名册」（新建 Space、名册的行样式和现有主操作按钮完全一样，名册右侧数量）；主操作组下面是 Space 分区（标题旁「演示」小标签，悬停出现 `+`，`IconButton size="xs"` 带 Tooltip），再下面是现有的已置顶、工作区。全部只在 `import.meta.env.DEV` 时渲染。
- 一对一对话（D30）：DEV 下挂在工作区列表第一个工作区的会话最前面，行首是 Actor 头像；没有工作区时放在工作区标题下面。
- 点新建 Space、名册入口、Space 行、一对一行 → `onSelectView("space")` 并调用 store 的 `openNewSpace` / `goRoster` / `switchSpace` / `openSoloChat`；点普通会话照旧回到 `"chat"`。
- `WorkbenchLayout.tsx`：`view === "space"` 时中栏渲染 `SpaceWorkbench`，右栏插槽渲染 `SpaceRightPanel`（名册页不渲染）；顶栏右侧的「+」换成 `SpaceObjectMenu`，右栏开关接 store 的 `togglePanel`。右栏宽度、拖拽、窄窗盖住中栏的行为沿用 `use-panel-layout.ts`，逐处检查 `view === "chat"` 的引用。
- 验证：`R/test/space-entry.test.tsx`：DEV 下左栏顺序正确、出现两个 Space；点击后中栏出现 Space 标签栏、右栏出现 Actor 标签；`import.meta.env.DEV` 为 false 时不出现（`vi.stubEnv`）；从 Space 点普通会话回到对话视图。

### T5 中栏：标签栏与对话

- `tabs/`：协调 Agent 标签固定；Actor 标签横向滚动（滚轮转横向、无滚动条、被挡一侧用 `mask-image` 渐隐）、`ResizeObserver` 判断溢出；「全部标签」用 `ui/Menu`，不自己监听外部点击和 Esc。
- `thread/`：按设计文档 §4.3 渲染。`ActorRef` 是内联按钮（16px 头像 + 名字）。`StreamingText` 只负责显示 store 给的已出字数与光标。审批卡视觉对齐 `ApprovalCard`，按钮用 `ui/Button`。`KeepActorCard` 的星尘与长成动画用 `R/styles/space.css` 的 keyframes。`SpaceBlank` 的星空在 `space.css` 里，星点颜色、点阵颜色走 T10 的 token。
- 自动贴底：用户在底部附近时，新内容滚到底；流式输出时也滚到底。
- 验证：`R/test/space-workbench.test.tsx`：点引用胶囊打开标签；关闭按钮只关该标签；「全部标签」菜单「关闭其他标签」；Actor 头部在新起的 Actor 上显示「归属 Space」；空 Space 显示成员并可点开。

### T6 输入区

- 直接用现有 `Composer`（D21），不新做输入框。`onSend` 接 store 的 `send` / `sendSolo`；占位符按 §4.3；状态行（D31）通过 `ComposerProps` 传入：Actor 和一对一写分支、本机、权限，协调 Agent 写相关目录和「只读，交事给 Actor」；上下文圆环用 mock 用量。草稿 key 按上下文区分。
- 如果 `Composer` 有绕不开的真实会话依赖（模型列表、附件、斜杠命令、远端目标），用最小的 props 关掉，不改它的默认行为；需要改 `Composer` 本身时先记到决策记录。
- `dock/SpaceDock.tsx` 只做 Composer 上方的两样：托盘（`aria-live="polite"`，‹ › 分页，「查看」「拒绝」「运行」）和胶囊（只显示大于 0 的，琥珀胶囊 `aria-pressed`，新审批跳两下）。宽度跟 Composer 一致。
- 验证：`R/test/space-dock.test.tsx`：当前看的 Actor 不进托盘；处理完最后一个托盘自动收起；从 Composer 发送后协调 Agent 开始回复。

### T7a 普通会话右栏启动页改成列表（独立小任务，D29）

- 不依赖 Space，可以单独合入。普通会话不受 DEV 限制，打包版也生效。
- 把 `RightPanel.tsx` 里的 `RightPanelLauncher` / `LauncherButton` 拆到 `right-panel/RightPanelLauncherList.tsx`：纯展示组件，入参是一句说明和 `{ id, label, description, icon, onClick, disabled, onPointerEnter?, onFocus? }[]`。
- 样式照 demo：白底（`bg-surface`，不再换底色、不用磁贴网格），顶部一句 `text-act-xs text-text-faint` 说明，每行 36px「16px 图标 + 名字 + 一句说明」，悬停 `bg-hover-overlay`，说明单行省略。说明文案用设计文档 §4.4 的表。
- 现有的开发构建开关、禁用条件、终端预加载保持不变。
- 验证：更新受影响的测试（`right-panel*`、`subagents-panel` 等里找启动页按钮的用例）；`pnpm check:frontend-tokens`；浅色、深色截图。

### T7 右栏

- 外壳复用现有右栏（D25）：把 `RightPanelTabs` 的展示部分拆成不依赖 `useRightPanel` 的 `right-panel/RightPanelTabStrip.tsx`（标签、关闭、溢出菜单），现有右栏改用它，行为不变；顺带让 `RightPanel.tsx` 降到 500 行以内。
- `SpaceRightPanel.tsx`：读 store 的 `panels[当前上下文]`，用 `RightPanelTabStrip` 画标签栏，没有标签时用 `RightPanelLauncherList` 画启动页（说明和可开的标签按 §4.4 的表）。
- `panel/SpaceObjectMenu.tsx`：和 `RightPanelObjectMenu` 同样的 `Menu` 与 `chrome-button`，只列当前上下文能开的标签；已开的切过去。
- `panel/ActorGroups`：分组折叠（`grid-template-rows` 过渡）、等你决定琥珀分组条、行布局与 §4.4 一致；`use-flip-rows.ts` 在分组变化前后记录行位置做 FLIP，`litRows` 触发点亮、新行淡入。
- `panel/LibraryList`、`panel/MemoryList`：按 §4.4；「忘记」用 `IconButton`。
- `panel/mock-views/`：文件（树 + 代码预览 + 过滤框）、终端、Review、上下文、子 Agent、可视化回复，内容来自 fixtures，样式对齐现有对应视图；能直接复用的纯展示组件（如 `CodeRenderView`）直接用，依赖 IPC 的不碰。
- 验证：`R/test/space-panel.test.tsx`：协调 Agent 默认三个标签、Actor 按有无改动开 Review 或文件、切上下文各自恢复、关掉最后一个标签出现启动页、「+」菜单只列可开的标签；分组顺序、折叠、行说明文案、忘记记忆；`use-flip-rows` 的位移计算拆成纯函数单测。

### T8 名册与一对一对话

- `roster/ActorRoster`：搜索（名字 + 场景 + 能力）、卡片网格、`freshCard` 描边动画；没有结果显示「没有找到「…」」。
- `roster/ActorSoloChat`：自我介绍 + 对话；发消息后 Actor 流式回复；出现在左栏工作区会话列表里（D30）；右栏按 D27 和普通会话一样。
- 验证：`R/test/space-roster.test.tsx`：搜索过滤、点卡片进入对话并出现在左栏。

### T9 弹窗、提示与演示说明

- `dialogs/NewSpaceDialog`（`ui/Dialog`）：名字、要解决的问题、成员多选（默认前两个）、相关目录；创建后进入空 Space。
- `dialogs/SpaceDemoHelpDialog`：搬 demo 的「这是什么」与 7 步说明和重置说明，标签栏右侧「?」打开。
- `SpaceDemoNotice.tsx`：Space 视图标签栏下方一条常驻提示「开发中演示 · 数据是模拟的，操作不会真正执行」+「重置演示」（`info-soft` 底）。
- 轻提示（demo 的 toast）：做成 Space 视图内、输入区上方的 `role="status"` 文本，2.2s 后消失，不新增全局 toast 原语。
- 验证：弹窗 Esc 关闭后焦点回到 `+`；重置后回到 fixtures。

### T10 主题 token 与全局样式

- `tokens.css` 浅色、深色两段各加：`--act-space-star`（深色星点，浅色透明）、`--act-space-grid-dot`、`--act-space-spark`、`--act-space-sky-stars-opacity`、`--act-space-sky-grid-opacity`；值取 demo `:root` 里对应变量。
- `R/styles/space.css` 由 `index.css` 以合适的 layer 引入，只放：星空两层与点阵、头像工作中光环（`@property` + `conic-gradient` + mask）、星尘聚拢、头像弹出、成员浮动、行点亮与淡入、胶囊跳动；全部套 `prefers-reduced-motion`。星点 `radial-gradient` 的颜色引用 `--act-space-star`，不写 `rgba()` 字面量。
- 动效时长用 `--motion-*` token；没有对应档位的（光环 2.4s、星空 200s/300s、浮动 5s）作为 `--act-space-*` 时长 token 加在 `tokens.css`。
- 验证：`pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 通过。

### T11 文档与收尾

- 设计文档状态改为「已实施（演示），Electron 验收待做」。
- `docs/FRONTEND_VERIFICATION.md` 验收矩阵加 Space 演示的入口和走查步骤。
- history：`docs/histories/2026-10/<时间>-multi-agent-collab-frontend-demo.md`。
- 判断是否需要学习文档（FLIP + `useSyncExternalStore` + 可注入时钟的模拟脚本可能命中）。
- 执行过程与摘要：`docs/exec-runs/20261007-multi-agent-collab-frontend-demo/`。

## 并行边界

T1、T2、T7a 可并行；T3 依赖 T2；T7 依赖 T7a（共用 `RightPanelLauncherList`）和 T3；T4–T9 依赖 T3，彼此只通过 store 接口和 `model/types.ts` 交互，可并行，但 `Sidebar.tsx`、`WorkbenchLayout.tsx` 只由 T4 改，`RightPanel.tsx` 只由 T7a、T7 先后改，`Composer.tsx` 只由 T6 改（尽量不改）；T10 可与 T5–T7 并行，`tokens.css`、`index.css`、`space.css` 只由 T10 改。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 演示被误认为能用 | Q1 提示条常驻；Q2 只在开发构建出现 |
| demo 的全局 CSS 和 `rgba()` 字面量过不了主题检查 | 先做 T10 的 token；星空改用变量 |
| `WorkbenchLayout` 里 `view === "chat"` 的假设很多，加新视图漏改 | T4 逐处检查 `view ===` 的引用并在测试里覆盖开关右栏、窄窗 |
| 定时器在切换 Space 或卸载后继续改状态 | 全部挂在 store 里统一清理，T3 有用例 |
| 拆 `RightPanelTabs` / 启动页时改坏普通会话右栏 | T7a、T7 先跑现有右栏测试再改；普通会话浅色、深色截图对照 |
| `Composer` 依赖真实会话，挂到 mock 上报错 | T6 先在组件测试里挂一次，缺什么补最小 props |
| 以后接后端时 UI 和 mock 绑死 | 组件只读 store 的选择器结果和动作；数据形状按设计文档 §9 的实体拆分 |

## 验证方式

- 命令（仓库根）：`pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop test`、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm check:renderer-bridge`、`pnpm check:current-docs`。
- 浏览器：`pnpm --filter @actspace/desktop dev:renderer` 打开 mock，按 demo 的 7 步说明走一遍；浅色、深色、480px 窄窗各截图，和 demo 同状态截图对照。
- Electron：`pnpm dev:log` 启动，走同样 7 步；确认打包版（D19）不出现入口；普通会话右栏启动页是新列表样式。
- 键盘：Tab 能走到标签、右栏行、托盘按钮；Esc 只关最上层并把焦点还给触发器。

## 进度记录

- [x] 2026-10-07 建工作树与分支；设计文档按 demo 定稿并移入 `docs/design-docs/多智能体协作/`；写本计划。
- [x] 2026-10-07 T0：用户确认 Q1–Q8 与右栏改版 demo（D18–D31）；demo 同步改版（左栏新顺序、现有 Composer、现有右栏 + Space 标签、启动页列表样式）。
- [x] 2026-10-07 T7a 普通会话右栏启动页列表化（`RightPanelLauncherList`；desktop 测试全过，浅色、深色、窄窗已截图）。
- [x] 2026-10-07 T1–T3、T10：素材、类型与 fixtures、store 与模拟脚本、`space.css` 与 `--act-space-*` token。
- [x] 2026-10-07 T4–T9：左栏入口、WorkbenchLayout 接入、标签栏与对话、输入区（现有 Composer）、右栏、名册与一对一、弹窗与提示。`RightPanel.tsx` 拆出 `RightPanelTabStrip`、`WorkspaceOperationBar`，降到 445 行。desktop 测试 203 个文件 1668 个用例通过；typecheck、`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge` 通过；浏览器 mock 截图核对了协调 Agent、Actor 标签（深色）、名册、一对一、留下 Actor + 托盘、760px 窄窗。
- [x] 2026-10-07 T11：设计文档状态、FRONTEND_VERIFICATION 走查步骤、history、执行过程与摘要。
- [ ] Electron 验收（`pnpm dev:log` 走 7 步；打包版不出现入口；键盘走查）。

## 决策记录

- 2026-10-07：只做前端，数据全 mock，不新增 IPC；Space 相关设计文档、demo、素材集中到 `docs/design-docs/多智能体协作/`。
- 2026-10-07：右栏复用现有外壳但不复用 `RightPanelContext`——它是全局一份、依赖真实会话和 IPC；Space 的右栏状态按上下文记在 store 里，只共用展示组件（标签栏、启动页）。
- 2026-10-07：普通会话启动页列表化单独立为 T7a，可以先于 Space 合入。
- 2026-10-07：`Composer` 加两个可选 prop：`placeholder`（覆盖默认占位文字）、`statusRow`（替换默认状态行）。Space 的协调 Agent 没有分支和权限（D31），不加这两个口子就只能改 DOM、用 CSS 藏状态行。不传时行为不变。
- 2026-10-07：Space 的右栏开关记在 Space store 里，`usePanelLayout` 按当前视图接普通会话或 Space 的开关；窄窗里进入 Space 时先收起右栏浮层。
- 2026-10-07：左栏选中态用 `aria-[current=page]:` 变体。行样式里的 `bg-transparent` 在样式表里排在选中背景之后，直接拼类会被盖掉（现有「扩展」按钮也有这个问题，未改）。

## 执行模式

- **交互模式**：T0 已拍板。T7a、T4、T7 改到现有界面，完成后给用户看截图；其余任务边界清楚。

## 执行文档

执行开始时在 `docs/exec-runs/20261007-multi-agent-collab-frontend-demo/` 从模板创建 `execution-process.md` 和 `execution-summary.md`。
