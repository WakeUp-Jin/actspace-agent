# 前端样式所有权收口计划

> 状态：已完成。2026-05-29 完成样式所有权收口、旧全局 CSS 下线验收、Browser mock 和 Electron 真窗 smoke。

## 目标

把 renderer 样式架构收口到“全局 token/base + Tailwind 页面/组件样式 + 明确作用域的内容渲染边界”。本计划的直接目标是消除旧 `styles.css` 对 Tailwind 页面产生跨页面污染的可能，避免再次出现 `className` 正确但按钮背景、边框、文字色被旧全局 CSS 覆盖的问题。

完成后应达到：

- 新页面和已迁移页面的按钮、卡片、输入框、弹窗、菜单状态都由组件局部 Tailwind utility / class 常量负责。
- `styles/base.css` 只保留低风险基础规则，不承载视觉身份。
- 旧根部 `styles.css` 与 `legacy-*` 分区保持删除状态，不再作为普通 UI 样式入口。
- `styles/index.css` 不导入 `../styles.css` 或任何 `legacy-*` 分区；全局 CSS 仅保留 base、Electron chrome、Markdown、diff 等明确边界。
- 每个迁移切片都有命令验证、浏览器/Electron 视觉验收和 computed style 抽查。

## 范围

- 包含：
  - 审计当前 `packages/desktop/src/renderer/styles/*.css` 和组件局部 class 常量中的样式所有权。
  - 明确 `tokens.css`、`base.css`、`tailwind.css`、Electron chrome、内容边界 CSS、React 组件 class 常量之间的样式所有权。
  - 保持旧根部 `styles.css` 与 `legacy-*` 分区删除状态，避免普通 UI 样式回流到全局入口。
  - 将仍需全局管理的样式限制在明确边界文件，例如 markdown、diff、electron chrome。
  - 检查并补齐 `LabPage`、`KairosPage`、`UsageStatisticsPage` 这类 Tailwind 页面自身的按钮、卡片、弹窗样式。
  - 为样式覆盖问题建立可重复执行的排查命令和验收清单。
  - 更新相关文档、history 和 learning。
- 不包含：
  - 不重做产品视觉方向，不重新设计品牌色、字体或页面信息架构。
  - 不改变 Electron main、preload、IPC、agent-core 或 shared contracts。
  - 不改变 Usage、Kairos、Lab 的业务数据流。
  - 不强行把 Markdown prose、代码块、diff、第三方 DOM 全部 Tailwind 化；这些可以作为明确的全局内容渲染边界保留。
  - 不用 `@apply` 批量翻译旧 CSS。目标是重切样式所有权，不是换语法。
  - 不用 inline style 或 `!important` 作为系统性解决方案，除非该样式本身是数据驱动的一次性值。

## 背景

### 触发原因

Lab 页 `新实验` 按钮曾经写有 Tailwind class：

```tsx
bg-[#2563eb] text-white border-[#2157d6]
```

但浏览器 computed style 显示：

```txt
backgroundColor: transparent
borderColor: inherited dark color
color: inherited dark color
```

根因是 `styles/index.css` 当前导入顺序为：

```css
@import "./tokens.css";
@import "./tailwind.css";
@import "./base.css";
@import "../styles.css";
```

旧 `styles.css` 后加载，且其中的未分层 author CSS 可以覆盖 Tailwind layer utilities。原先裸 `button` reset 覆盖了新 Tailwind 页面按钮的背景、边框和文字色。

### 相关计划

- 父计划：`docs/exec-plans/completed/actspace-tailwind-style-architecture.md`
- 剩余 UI 迁移计划：`docs/exec-plans/completed/20260528-tailwind-remaining-ui-migration.md`
- 本计划关系：本计划不替代上面两份计划，而是把这次 bug 暴露出的“样式所有权和旧 CSS 下线”作为可执行收口计划。执行时应优先同步更新上面两份计划的状态，避免 active 里出现互相矛盾的事实。

### 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/PLANS_GUIDE.md`
- `docs/QUALITY_SCORE.md`
- `docs/coding-standards/team/frontend-style-scope-conventions.md`
- `docs/design-docs/front-tailwind-style-architecture.md`
- `docs/learnings/2026-05/tailwind-page-slice-migration.md`
- `docs/learnings/2026-05/global-css-reset-vs-tailwind.md`
- `docs/learnings/2026-05/color-as-identity-badge-not-container.md`

### 相关代码路径

- 样式入口：
  - `packages/desktop/src/renderer/styles/index.css`
  - `packages/desktop/src/renderer/styles/tokens.css`
  - `packages/desktop/src/renderer/styles/tailwind.css`
  - `packages/desktop/src/renderer/styles/base.css`
  - `packages/desktop/src/renderer/styles/electron.css`
  - `packages/desktop/src/renderer/styles/markdown.css`
  - `packages/desktop/src/renderer/styles/diff.css`
- 已迁移或新 Tailwind 页面：
  - `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
  - `packages/desktop/src/renderer/components/LabPage.tsx`
  - `packages/desktop/src/renderer/pages/KairosPage.tsx`
  - `packages/desktop/src/renderer/components/kairos/KairosContextSheet.tsx`
  - `packages/desktop/src/renderer/components/ui/Sheet.tsx`
- 旧 shell / 待迁移区域：
  - `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/SplitView.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/components/RightPanel.tsx`
  - `packages/desktop/src/renderer/components/right-panel/`
  - `packages/desktop/src/renderer/components/messages/`

## 样式所有权规则

### 全局 token/base

允许：

- `:root` / design tokens。
- `html`、`body`、`#root` 的尺寸、字体、背景。
- `box-sizing`、scrollbar、selection。
- 低风险基础规则：`font: inherit`、`cursor: pointer`、focus outline。

不允许：

- `button { background: none; color: inherit; border: 0; }`
- `input { border: ...; background: ... }`
- `a { color: ... }` 这类带视觉身份的全局规则。

### Tailwind 页面/组件

负责：

- 页面 layout、spacing、grid/flex、响应式。
- 按钮、icon button、卡片、弹窗、tabs、菜单、empty state。
- hover、active、selected、disabled。
- 局部重复 utility 组合。

约束：

- 同一文件内重复两次以上的长 utility 组合，可以抽局部 class 常量。
- 跨页面重复且语义稳定的结构，可以抽 React primitive。
- 测试不绑定 Tailwind class，使用语义、aria、text、data-testid。

### 明确全局内容边界

可以保留全局 CSS，但必须有明确容器：

- Markdown prose：`.markdown-prose ...`
- code block：`.markdown-code-block ...`
- diff 内容：`.file-diff-*` 或迁移后的明确 diff 容器。
- Electron chrome / drag hit-test：`.window-chrome-bar ...`
- 仍未迁移的普通 UI 区域：优先在对应 React 组件内使用 Tailwind utility / 局部 class 常量，不新增 legacy 全局分区。

## 风险

- 风险：后续为了快速修 UI 又新增宽泛全局 CSS，重新污染 Tailwind 页面。
  - 缓解方式：新增全局规则前先判断是否属于 base、Electron chrome、Markdown、diff 或第三方内容边界；普通 UI 默认写回组件。
- 风险：全局边界文件 import 顺序变化，导致视觉回归。
  - 缓解方式：保持 `styles/index.css` 的 layer 顺序稳定，跑对应 tests，并在浏览器/Electron 做视觉检查。
- 风险：Tailwind className 过长，降低组件可读性。
  - 缓解方式：重复结构抽局部 class 常量；稳定跨页面结构抽 primitive；不回退到全局 CSS。
- 风险：Markdown / diff / generated content 被误迁移。
  - 缓解方式：这些区域先作为内容渲染边界保留，不参与普通页面切片迁移。
- 风险：只靠截图无法发现 CSS cascade 问题。
  - 缓解方式：新增 computed style 抽查作为验收项，尤其检查主按钮、卡片、输入框。

## 里程碑

### M0. 当前状态审计

目标：得到一份可信的 selector 分组和迁移判断。

任务：

1. 扫描当前全局样式边界：

   ```sh
   rg -n "^\\.|^button|^input|^textarea|^select|^a|\\.split-view\\s+button|\\sbutton\\s*\\{" packages/desktop/src/renderer/styles/*.css
   ```

2. 按区域标记 selector：
   - `base-keep`
   - `content-boundary-keep`
   - `legacy-until-slice`
   - `migrate-now`
   - `delete-now`
3. 检查 JSX 里仍引用哪些旧 class：

   ```sh
   rg -n "className=.*(sidebar|message|composer|right-panel|window-chrome|split-view|placeholder|markdown|diff|turn-|bash-|context-|model-|dropdown|settings)" packages/desktop/src/renderer
   ```

4. 把审计摘要写回本计划的“进度记录”；如果审计阶段修改了仓库文件，则同时新增或更新对应 history。

验收：

- 本计划中列出每个样式区域的去向。
- 没有未决占位，所有区域都有明确去向。

### M1. 高风险污染源清零

目标：先消除会直接覆盖 Tailwind 页面 utility 的规则。

任务：

1. 确认当前全局 CSS 边界中不存在裸视觉 reset：
   - `button { ... }`
   - `input { ... }`
   - `textarea { ... }`
   - `select { ... }`
   - `a { ... }`
2. 确认不存在覆盖整个工作台的大容器后代规则：
   - `.split-view button`
   - `.split-view input`
   - `.app button`
   - `main button`
3. 对必须保留的旧 reset，收窄到真实旧区域容器：
   - `.sidebar button`
   - `.conversation-shell button`
   - `.right-panel button`
   - `.context-popover button`
4. 检查 `base.css` 中的元素规则，只保留无视觉身份的基础属性。

验收：

```sh
rg -n "^button\\s*\\{|^input\\s*\\{|^textarea\\s*\\{|^select\\s*\\{|^a\\s*\\{|\\.split-view\\s+button|\\.app\\s+button|main\\s+button" packages/desktop/src/renderer/styles/*.css
```

预期：没有命中，或仅命中文档中明确允许的低风险 base 规则。

### M2. 新 Tailwind 页面自给自足检查

目标：确认新页面不再依赖旧 CSS reset 才显示正确。

任务：

1. 检查 `LabPage.tsx`：
   - 顶部主按钮、次按钮。
   - 卡片、selected 卡片、hover 卡片。
   - dialog 按钮、menu 按钮。
2. 检查 `KairosPage.tsx`：
   - header 主按钮 `开启` / `停止`。
   - 上下文、重置按钮。
   - trace、card、pagination。
3. 检查 `UsageStatisticsPage.tsx`：
   - toolbar 按钮。
   - card、table row、modal。
4. 对每个页面抽查 computed style：

   ```js
   const el = [...document.querySelectorAll("button")].find((node) =>
     node.textContent?.includes("新实验")
   );
   const cs = getComputedStyle(el);
   ({
     className: el.className,
     backgroundColor: cs.backgroundColor,
     borderColor: cs.borderColor,
     color: cs.color,
     boxShadow: cs.boxShadow,
   });
   ```

验收：

- `新实验` 背景为 `rgb(37, 99, 235)` 或计划中的主色。
- Kairos `开启` 按钮文字可见，背景/边框来自组件 class。
- Usage 页面按钮和卡片没有透明背景/继承色异常。

### M3. Legacy CSS 拆分与下线

目标：把 `styles.css` 从“大而全兜底文件”拆成明确边界文件，并在普通 UI 切片迁回组件后下线旧根部和 legacy 分区。

已完成目标结构：

```txt
packages/desktop/src/renderer/styles/
  index.css
  tokens.css
  tailwind.css
  base.css
  electron.css
  markdown.css
  diff.css
```

任务：

1. 将 Electron chrome / drag / no-drag 相关规则移入 `electron.css`。
2. 将 markdown prose 和 code block 移入 `markdown.css`。
3. 将 file diff 内容样式移入 `diff.css`，或保留在待迁移切片中，但必须有明确容器。
4. 将普通 UI 样式迁回组件；不新增 legacy 文件作为中转。
5. 更新 `styles/index.css` import 顺序：

   ```css
   @layer theme, base, chrome, components, utilities;

   @import "./tokens.css";
   @import "./tailwind.css";
   @import "./base.css" layer(base);
   @import "./electron.css" layer(chrome);
   @import "./markdown.css" layer(components);
   @import "./diff.css" layer(components);
   ```

6. 删除根部 `styles.css`，并移除 `@import "../styles.css"`。

验收：

- `styles/index.css` 不再导入 `../styles.css` 或任何 `legacy-*` 分区。
- 旧根部 `styles.css` 不存在。
- 不存在无区域前缀的视觉规则。

### M4. 剩余 UI 切片迁移

目标：按已有 `20260528-tailwind-remaining-ui-migration.md` 继续迁移旧 UI，但加入本计划的样式所有权验收。

顺序：

1. RightPanel / Kairos compact。
2. Workbench shell / Sidebar。
3. Conversation / Tool Preview / Composer。
4. Settings / Placeholder / remaining pages。

每个切片必须做到：

- 改前记录涉及的旧 selector。
- 改后删除对应旧 selector。
- 不在新组件里增加新的全局 CSS。
- 抽查至少一个按钮和一个卡片/row 的 computed style。
- 更新本计划进度记录和对应 history。

### M5. 全局 CSS 下线验收

目标：最终确认旧全局样式不再污染 Tailwind 页面。

任务：

1. 确认旧根部和 legacy 分区没有回流：

   ```sh
   test ! -e packages/desktop/src/renderer/styles.css
   find packages/desktop/src/renderer/styles -name 'legacy-*.css' -print
   ```

   预期：第二条没有输出。

2. 搜索未使用 class：

   ```sh
   rg -n "className=.*[a-z0-9-]+" packages/desktop/src/renderer
   rg -n "^\\.[a-z0-9-]+" packages/desktop/src/renderer/styles
   ```

3. 样式风险扫描：

   ```sh
   rg -n "^button\\s*\\{|^input\\s*\\{|^textarea\\s*\\{|^select\\s*\\{|^a\\s*\\{|\\.split-view\\s+button|\\.app\\s+button|main\\s+button" packages/desktop/src/renderer
   ```

4. 全量验证：

   ```sh
   pnpm typecheck
   pnpm --filter @actspace/desktop build
   pnpm --filter @actspace/desktop test
   ```

5. 真实前端验证：
   - `pnpm dev:log`
   - Browser mock 打开 `http://127.0.0.1:5173/`
   - Electron 真实窗口 smoke。

验收：

- Lab、Kairos、Usage、Sidebar、Conversation、Composer、RightPanel 全部可用。
- DevTools console 无 renderer runtime error。
- `logs/latest-dev.log` 无 Vite/Electron 样式构建错误。
- 新 Tailwind 页面 computed style 不再被 legacy reset 覆盖。

## 验证矩阵

| 阶段 | 命令验证 | 手工验收 | computed style |
| --- | --- | --- | --- |
| M0 审计 | `rg` selector / className 扫描 | 无 | 无 |
| M1 污染源清零 | `rg` 禁止选择器扫描 | Lab/Kairos/Usage 快速打开 | `新实验` 主按钮 |
| M2 新页面自给自足 | `pnpm --filter @actspace/desktop typecheck` | Lab/Kairos/Usage 三页 | 主按钮 + 卡片/row |
| M3 Legacy 拆分 | `pnpm --filter @actspace/desktop build` | Sidebar/Conversation/Composer/RightPanel | 每个 legacy 区域抽一个 button |
| M4 切片迁移 | 对应 renderer test | 对应切片页面 | 每切片至少两个元素 |
| M5 收口 | `pnpm typecheck`; `pnpm --filter @actspace/desktop build`; `pnpm --filter @actspace/desktop test` | Browser mock + Electron smoke | Lab/Kairos/Usage 全抽查 |

## 回退策略

- 每个阶段只修改一个样式区域，避免混合迁移。
- 如果拆分 CSS 后出现大面积视觉回归，先恢复该阶段的 import 结构，再保留已完成的审计记录。
- 如果某个旧区域短期难以迁移，优先在组件内保留局部 class 常量；确实必须新增全局 CSS 时，要落到明确内容边界文件并写清删除条件。
- 不使用 `git reset --hard` 或 `git checkout --` 回退用户改动；回退通过小补丁局部恢复。

## 进度记录

- [x] 已确认 Lab `新实验` 按钮问题根因：旧未分层 `styles.css` 覆盖 Tailwind utility。
- [x] 已补充团队规范：`docs/coding-standards/team/frontend-style-scope-conventions.md`。
- [x] 已补充 learning：`docs/learnings/2026-05/global-css-reset-vs-tailwind.md`。
- [x] M0：完成首轮 `styles.css` selector 审计。当前 `styles.css` 共 2294 行，其中顶部约 180 行是旧 token/base 重复层；`split-view`、`sidebar`、`window-chrome-bar`、`conversation`、`composer`、`right-panel` 属于 `legacy-until-slice`；`markdown-prose`、`markdown-code-block`、`file-diff-*` 属于 `content-boundary-keep`；高风险裸元素 reset 已移出 `styles.css`。
- [x] M1：完成第一步污染源清零。`styles/index.css` 已显式声明 `theme, base, legacy, components, utilities` layer 顺序，并把 `../styles.css` 作为 `layer(legacy)` 导入，避免 legacy 未分层规则继续压过 Tailwind utilities。
- [x] M2：完成首轮 Lab / Kairos / legacy shell 验证。`pnpm --filter @actspace/desktop build:renderer` 通过，Electron 真窗检查确认 Lab 主按钮、Kairos `开启` 按钮、Sidebar/RightPanel 视觉未回退；当前环境缺少 Playwright，因此 computed style 抽查保留在后续 browser/DevTools 验收中继续执行。
- [x] M3：完成 legacy CSS 拆分并移除 `@import "../styles.css"`。该阶段入口改为 `electron.css`、`markdown.css`、`diff.css`、`legacy-shell.css`、`legacy-conversation.css`；后续 M4 已删除 `legacy-conversation.css`，旧 `styles.css` 仅保留废弃提示。
- [x] M4 继续推进：`BashRunBlock.tsx` 已接管 Bash execution / approval 样式，`legacy-conversation.css` 删除 `.bash-*` 视觉规则；浏览器 mock computed style 确认 Bash toggle 为 14px、approval/action/output 文本为 13px，按钮背景和卡片边框符合组件 class。
- [x] M4 发现并修正基础层覆盖：`styles/index.css` 将 `base.css` 显式导入为 `layer(base)`，避免 `button { font: inherit; }` 在文件加载顺序上覆盖 Tailwind `text-*` / `font-*` utility。
- [x] M4 完成 Conversation legacy 下线：`ToolLogLine.tsx` 接管 tooltip open / running / reduced-motion 样式，`FileDiffBlock.tsx` 复用组件侧工具行 running class，`ConversationView.tsx` 接管工具、思考和 diff 相邻消息压缩关系；`legacy-conversation.css` 已删除并从 `styles/index.css` 移除。
- [x] 完成旧根部和 legacy 分区下线：`styles.css` 与 `legacy-*` 文件已删除，`styles/index.css` 当前只导入 token、Tailwind、base、Electron chrome、Markdown 和 diff 边界，layer 顺序为 `theme, base, chrome, components, utilities`。
- [x] M4：完成剩余 UI 切片迁移。审计确认 `PlaceholderView.tsx` 已使用 Tailwind 局部 class 常量，Sidebar Settings 入口已由 `Sidebar.tsx` 接管；当前没有独立 Settings 页面组件，也没有 `.settings-*` / `.placeholder-*` / `legacy-*` 普通 UI selector 残留。
- [x] M5：完成全局 CSS 下线验收。`test ! -e packages/desktop/src/renderer/styles.css` 通过，`find packages/desktop/src/renderer/styles -name 'legacy-*.css' -print` 无输出；高风险 selector 扫描只剩 `base.css` 低风险元素 reset 和 `electron.css` chrome 作用域规则。`pnpm typecheck`、`pnpm --filter @actspace/desktop build`、`pnpm --filter @actspace/desktop test` 均通过；Browser mock 打开 Chat / Lab / Usage / Kairos 无 console error，Electron 真窗 smoke 可打开 Chat / Lab / Usage / Kairos。
- [x] 更新 `docs/exec-plans/completed/actspace-tailwind-style-architecture.md` 和 `docs/exec-plans/completed/20260528-tailwind-remaining-ui-migration.md` 的状态。
- [x] 更新 history，并在必要时继续补充 learning。

## 决策记录

- 2026-05-28：先把 `../styles.css` 作为 `legacy` layer 导入，而不是立刻大拆 2294 行旧 CSS。原因是当前主要风险来自“未分层 legacy CSS 压过 Tailwind utilities”；先修 cascade 所有权，可以在不破坏旧 shell 的前提下让新页面恢复稳定，再继续按区域拆 legacy 文件。
- 2026-05-28：将 legacy 顶部重复的 `:root` / scrollbar / body / `svg` / focus 基础层删回 `tokens.css` 和 `base.css`。原因是旧 `styles.css` 同时扮演“第二套 token/base”和“legacy UI 规则”会制造双重事实来源，先移除重复基础层可以明显缩小 legacy 责任面。
- 2026-05-28：本计划采用“先清污染源，再拆 legacy，再迁切片”的顺序。原因是当前真实 bug 来自 CSS cascade 污染，优先消除污染比直接大规模重写 UI 风险更低。
- 2026-05-28：不把 `.split-view button` 作为 reset 作用域。原因是 `.split-view` 覆盖整个工作台，Lab、Kairos、Usage 等新 Tailwind 页面也在其中。
- 2026-05-28：保留 Markdown / diff 作为明确内容渲染边界。原因是它们承载模型输出和代码内容，不适合和普通页面组件一起强制 Tailwind 化。
- 2026-05-28：computed style 抽查成为迁移验收项。原因是 className 只能证明 React 输出正确，不能证明 CSS cascade 最终正确。
- 2026-05-28：完成第二阶段 legacy 拆分。原因是 `styles.css` 已经不再需要继续承担真实样式职责，把 electron、shell、conversation、composer、right-panel 分区文件显式导入后，后续迁移可以按区域删除，不会再被单个大文件阻塞。
- 2026-05-29：`base.css` 必须作为 `layer(base)` 导入。原因是 base reset 虽然低风险，但如果未分层且在 Tailwind 后导入，仍会覆盖组件 typography utility；这类问题只有 computed style 才能稳定发现。
- 2026-05-29：`legacy-conversation.css` 不再作为 conversation 样式边界保留。原因是 tooltip、running、reduced-motion 属于 `ToolLogLine` / `FileDiffBlock` 自身视觉，工具/思考/diff 相邻压缩属于 `ConversationView` 渲染关系；把两者分开后可以删除 conversation legacy 文件。
- 2026-05-29：剩余 UI 切片以审计收尾，而不是继续改组件。原因是 Placeholder 和 Settings 入口已经在前置切片中迁回组件，当前 CSS 扫描只剩 base 低风险元素 reset、Electron chrome 作用域规则、Markdown / diff 内容边界。
