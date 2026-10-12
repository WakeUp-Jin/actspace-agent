# 12 测试整理 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/12-测试整理执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-12`，从 `refactor/desktop-frontend@99f9a7be`（11 的 squash 提交）拉出
- **开始时间**：2026-10-06 01:48
- **结束时间**：2026-10-06 02:05

## 执行时间线

### T0：启动与重新核对背景

- **基线**（11 结束时刚跑过，代码相同）：
  - shared / desktop typecheck 通过；
  - desktop test：文件 139 通过 / 1 失败 / 1 跳过，用例 1042 / 1 / 2，唯一失败是已知的 `workspace-git-context-service`；
  - `check:frontend-tokens`、`frontend-design-tokens.test.mjs`（5/5）、`check:current-docs` 通过（计划写时的 11 处断链已不存在）。
- **token 脚本**：结构与计划描述一致（`RULES`、`LITERAL_ALLOWLIST`、`checkSource`）。10 已删除 LabPage 的跳过项，现在只跳过 `test/` 目录。
- **4 个测试**：都还在，内容与计划描述一致。`readFileSync` / `?raw` 在 `renderer/test` 中只命中这 4 个文件。
- **状态点**：
  - Sidebar：`SessionStatusButton`（`Sidebar.tsx:328`）里的 `<span className={dotClass}>`（`:369`），状态枚举是 `SessionUiStatusKind` = `idle` / `running` / `waiting_approval` / `failed`，由 `resolveSessionStatus` 归一。
  - Settings：`StatusDot`（`SettingsPrimitives.tsx:351`），枚举是 `StatusTone` = `ok` / `off` / `warn` / `error` / `neutral`。
  - 两处都还没有 `data-state`。
- **CSS 块**：
  - `.file-diff-content` 在 `styles/diff.css:56` 和 `styles/tool-result.css:150` 都有定义；规则按文件限定在 `diff.css`。`diff.css:101` 有变体 `.file-diff-content.is-streaming-content`。
  - `.tool-log-text-running`（`base.css:122`）本身只有 `color: var(--act-color-text-faint)`；扫光颜色 `var(--act-color-text) 50%` 在 `.tool-log-text-running::after`（`:134`），`@media (prefers-reduced-motion)` 里还有一个 `::after`（`:163`）。旧测试截取的是从 `.tool-log-text-running {` 到 `@keyframes compact-progress` 的整段，覆盖了 `::after`。**偏差（T1）**：`tool-log-running-no-operational` 规则同时作用于 `.tool-log-text-running` 和 `.tool-log-text-running::after`，否则禁用项守不住扫光颜色，比旧测试弱。

### T1：CSS 块规则

- `scripts/check-frontend-design-tokens.mjs` 新增：
  - `CSS_BLOCK_RULES`：`{ id, file, selector, forbid, require, hint }`，`selector` 可以是字符串或数组。
  - `findCssBlocks(source, selector)`：先把注释替换成等长空白（保留行号），再用 `^[ \t]*<selector>\s*\{`（多行模式）定位块，块体截到下一个 `}`。所以 `@media` 里缩进的同名块也算命中；`.a.is-x`、`.parent .a`、`.a-label`、注释里的块都不算。
  - `checkCssBlocks(relative, source, rules)`：forbid 逐块检查；require 只要任一命中块里出现即可；找不到选择器本身就是一条违规。
  - `runCheck` 遍历 `styles/*.css` 跑块规则；规则指定的文件不存在也报错。
- 两条规则：
  - `tool-log-running-no-operational`：`styles/base.css` 的 `.tool-log-text-running` 和 `.tool-log-text-running::after`（T0 记录的偏差），禁止 `--act-color-operational`。
  - `file-diff-content-bounded-scroll`：`styles/diff.css` 的 `.file-diff-content`，要求 `max-height:` 和 `overflow-y: auto`。只截到 `:56` 这一个块，`:101` 的 `.is-streaming-content` 变体不算。
- 变异验证（只在内存中改源码再调 `checkCssBlocks`）：
  - 把 `::after` 渐变里的 `var(--act-color-text) 50%` 换成 `var(--act-color-operational) 50%` → 报 `base.css:134`；
  - 删掉 `max-height: 420px;` → 报 `diff.css:56 缺少 max-height`。
- `frontend-design-tokens.test.mjs` 新增 3 个用例：违规与 `@media` 覆盖块、变体/后代/注释/前缀选择器不误截、找不到选择器。8/8 通过；`pnpm check:frontend-tokens` 通过。
- 另：T0 写的开始时间 01:55 有误，实际是 01:48。history 文件用 `git mv` 改名为 `20261006-0148-desktop-fe-12-test-cleanup.md`，随本提交一起提交。

### T2：颜色字面量与旧焦点环规则

- 先按计划的两条正则扫 renderer（排除 `test/`，`.ts` / `.tsx`）：`palette-color-literal` 0 处，`focus-ring-legacy` 0 处；放宽成「任意 Tailwind 色名 + `-`」也是 0 处。没有需要修的命中，也不需要例外，计划里「超过 20 处先收窄到 settings / Sidebar」的分支不触发。
- `RULES` 新增两条，纯防回流。提示里写的替代类都是 `tailwind.css` 中真实存在的：`text-text-*`、`bg-surface-*`、`text-danger`、`bg-operational`、`ring-focus-ring`、`outline-focus-ring`。
- 与 `check-frontend-theme-colors.mjs` 的分工：那边管 token 定义、强调色对比度、黑白和任意值颜色（`text-[#…]` 等），不拦调色板色名，两者不重叠。脚本头注释同步写清分工。
- 测试新增 1 个用例：命中（含 `hover:`、`/60` 透明度、`focus:` 前缀）与不误报（语义类、`text-red-soft` 这类非数字后缀）。`focus:border-blue-400` 会同时命中两条规则，这是预期行为。9/9 通过；`pnpm check:frontend-tokens` 通过。

### T3：状态点加 `data-state`

- `Sidebar.tsx` `SessionStatusButton` 里的状态点：`data-state={resolvedStatus}`，取值 `idle` / `running` / `waiting_approval` / `failed`（`resolveSessionStatus` 把未知值归一为 `idle`）。
- `SettingsPrimitives.tsx` `StatusDot` 里的圆点：`data-state={tone}`，取值 `ok` / `off` / `warn` / `error` / `neutral`。
- 只加属性，类名不动。desktop typecheck 通过；`sidebar*`、`settings*` 共 6 个测试文件 78 个用例通过。

### T4：Sidebar 测试改为行为断言

- 删除 `test/sidebar-color-semantics.test.tsx`（读源码比对类名串）。
- 新增 `test/sidebar-semantics.test.tsx`，渲染真实 `Sidebar`：
  - 选中会话的行按钮有 `aria-current="page"`，且所有会话行里只有这一个；
  - 状态点 `data-state`：`sessionStatuses` 给的 `running` / `waiting_approval` / `failed`，`busySessionIds` 推出的 `running`，没有状态的 `idle`，未知值（`archived`）归一为 `idle`。
- 旧测试守的其余内容去向：颜色走 token 由 `check:frontend-tokens` 的禁用规则保证；brand / warm 由 `check-frontend-theme-colors.mjs` 全局拦截；改名输入框的焦点环：T2 的 `focus-ring-legacy` 只防止退回 blue / green / sky / emerald 焦点环（其他色名由 `palette-color-literal` 拦），`border-focus-ring` 这类正向写法不再锁定。
- 变异验证：临时去掉 `data-state` 并把 `aria-current` 写死为 `undefined`，两个用例都失败；随后 `git checkout` 恢复。新测试 2/2 通过。

### T5：Settings 测试改为行为断言

- 删除 `test/settings-color-semantics.test.tsx`（读 4 个源码文件比对类名串，禁止 brand / warm）。
- 新增 `test/settings-semantics.test.tsx`，3 个用例：
  - `SettingsNav`：当前分区按钮 `aria-current="page"`，导航里只有这一个；点击其他分区回调对应 id；
  - `Toggle`：`role="switch"`，受控点击后 `aria-checked` 在 false / true 之间切换；
  - `StatusDot`：五种 tone 的圆点 `data-state` 与 tone 一致。
- 旧测试的其余内容去向：Button primary 类名、`bg-toggle-on/off`、选中项类名、`ring-focus-ring/30` 这类正向类名快照按计划 §3.1 放弃；颜色退化由 T2 的两条规则拦截；brand / warm 由 `check-frontend-theme-colors.mjs` 拦截。
- `SettingsNav` 里的 `PerformancePanel` 在没有桥接时返回 null，测试不需要 mock `window.actspace`。
- 变异验证：临时去掉 `StatusDot` 的 `data-state`、把 `aria-checked` 写死为 false、把导航 `aria-current` 写死为 undefined，3 个用例全部失败；随后 `git checkout` 恢复。新测试 3/3 通过。

### T6：删除工具日志扫光的 CSS 测试

- 删除 `test/tool-log-shimmer-color-semantics.test.ts`。它有 4 条断言：
  - 不含 `var(--act-color-operational)`：由 T1 的 `tool-log-running-no-operational` 接管；
  - 含 `color: var(--act-color-text-faint);`、含 `var(--act-color-text) 50%`：正向写法快照，按计划 §3.1 放弃；
  - 含 `display: none;`（`@media (prefers-reduced-motion)` 里隐藏 `::after`）：**计划没有安排去向，这里补了一条块规则**。
- **偏差（小）**：新增 `tool-log-running-reduced-motion`，要求 `base.css` 的 `.tool-log-text-running::after` 块中有 `display: none`（`@media` 里的覆盖块满足即可）。原因：全局 reduced-motion 兜底只把动画缩到 0.01ms，扫光层仍然可见，停在动画结束位置，所以这条行为不能靠兜底。这是行为约束，不是写法快照，与 §3.1 一致。
- 变异验证：在内存中删掉 `@media` 块里的 `display: none;` → 报 `tool-log-running-reduced-motion 缺少 display\s*:\s*none`。`pnpm check:frontend-tokens` 通过，脚本测试 9/9。

### T7：file-diff-block 去掉读 CSS 的用例

- 删除 `test/file-diff-block.test.tsx` 中「keeps expanded diff content in a bounded scroll area」以及 `readFileSync` / `resolve` 导入。
- 旧用例有 3 条断言，计划只把前两条迁到 T1 规则。第三条 `overflow-x: auto`（长行横向滚动）也是行为，**补进** `file-diff-content-bounded-scroll` 的 require（小偏差）；`max-height` 的具体值 420px 按 §3.1 不再锁定。
- 变异验证：在内存中删掉 `overflow-x: auto;` → 报 `缺少 overflow-x\s*:\s*auto`。
- 现在 `renderer/test` 下已经没有 `readFileSync` / `?raw`。`file-diff-block.test.tsx` 17/17 通过，token 检查与脚本测试 9/9 通过。

### T8：更新 08 设计文档

- `08-测试与验证整理.md`：
  - §1 现状表：`check:frontend-tokens` 注明脚本文件是 `scripts/check-frontend-design-tokens.mjs`；
  - §3.1：脚本名改正；写明放弃完整类名快照，链接 12 的决策记录；追加「已在 12 执行」说明（新规则、新测试、brand / warm 去向）；
  - §3.2：追加「已在 12 执行」说明（含 `overflow-x: auto`）。
- 其他设计文档和执行计划里没有旧脚本名 `check-frontend-tokens.mjs`（12 计划本身描述改名的地方除外）。
- `pnpm check:current-docs` 通过。

### 复核处理

Sonnet 只读复核（`git diff 99f9a7be..HEAD`），没有 high 级发现。逐条处理：

| # | 发现 | 处理 |
| --- | --- | --- |
| 1 | 删除的测试有正向断言没有去处：扫光颜色（换成 danger 或 hex 也能过）、`max-height: 420px`（`max-height: none` 也能过）、Sidebar / Settings 的完整类名 | `max-height` **修**：require 改为 `max-height\s*:\s*\d`，`none` 不再算有界。其余按计划 §3.1 放弃正向快照，不改；扫光颜色换成彩色时，hex 会被 `check-frontend-theme-colors` 拦，换成其他语义色不拦，属于有意接受的范围 |
| 2 | `findCssBlocks` 截到第一个 `}`：`content: "}"` 或嵌套 CSS 会截错，嵌套还可能让 require 假通过；`.a, .b {` 选择器列表不命中（会报找不到，fail-closed） | **修**：块体里出现 `{` 就报「块内有嵌套规则，脚本无法准确截取」，fail-closed。`content` 字符串里的 `}`：现有 `styles/*.css` 没有，不处理。选择器列表本来就 fail-closed，不改 |
| 2b | `tool-log-running-reduced-motion` 如果有人把 `display: none` 写进基础块，`@media` 覆盖块被删也能过 | 不改。基础块写 `display: none` 会让扫光在所有情况下消失，肉眼可见，不是会悄悄发生的回归 |
| 3 | `palette-color-literal` 不拦 `border-b-*`、`divide-*`、`ring-offset-*`、`placeholder-*` 等前缀；`focus-ring-legacy` 只列 4 种颜色 | **修**前缀：扩成 `border(-[xytblrse])?`、`divide`、`outline`、`ring(-offset)?`、`accent`、`caret`、`shadow`、`decoration`、`placeholder`，扩完现有代码仍是 0 处。焦点环颜色不扩：其他色名已经由 `palette-color-literal` 拦，两条规则会重复报 |
| 4 | 新 vitest 测试确实测行为；`StatusDot` 的 `data-state === tone` 接近同义反复 | 不改。它守的是「状态点对外暴露 tone」这条契约，Sidebar 那边才有归一逻辑 |
| 5 | 执行记录 T4 说改名输入框焦点环由 `focus-ring-legacy`「保证」，说过头了 | **修**措辞：只防止退回 4 种彩色焦点环，正向写法不再锁定 |

- 脚本测试新增 1 个用例（`max-height: none`、嵌套规则），并在调色板用例中补 4 个新前缀。10/10 通过；`pnpm check:frontend-tokens` 通过。

### 收尾

- **完整验证**（复核处理之后）：
  - shared / desktop typecheck 通过；
  - desktop test：文件 138 通过 / 1 失败 / 1 跳过，用例 1041 / 1 / 2。唯一失败仍是已知的 `workspace-git-context-service`。与 11 结束时相比：删 3 个文件、加 2 个文件（139 → 138）；删 6 个用例、加 5 个用例（1042 → 1041）；
  - `check:frontend-tokens`、`frontend-design-tokens.test.mjs`（10/10）、`check:frontend-theme`、`check:ipc-channels`、`ipc-channels.test.mjs`、`check:current-docs` 通过。
- **Electron CDP**（完整 build，临时数据目录 `/tmp/actspace-cdp-data`）：
  - 主界面：3 个会话行，状态点 `data-state` 都是 `idle`，`aria-current="page"` 恰好 1 个（`screenshots/smoke-main.png`）；
  - 设置页：模型、搜索、工具、通用四页切换时导航 `aria-current` 跟随；通用页两个 `StatusDot` 为 `data-state="off"`（「未配置」）；搜索页 1 个、工具页 12 个 `role="switch"`，`aria-checked` 正常（`screenshots/smoke-settings-*.png`）；
  - 控制台只有 dev 下已知的 Electron CSP 警告。
- **学习沉淀**：检查后没有命中「可迁移且有陷阱」的新结论，不新增。
