# 03 配置驱动 + 可点击分段的 Context 弹窗

> 状态：交互/显示方案已与用户对齐（2026-05-30），可进入实现。

## 目标

把 Composer 的 Context 只读弹窗改造成两件事：

1. 配置驱动：bucket 的 key / 中文标签 / 配色 / 顺序集中在一份配置注册表里。未来新增一种上下文类型，只改这份配置（和一个主题色 token），前端组件不用改代码就能自动显示，未知 key 也能优雅兜底。
2. 可点击分段交叉定位高亮：点击水平进度条的某一段，高亮下方对应的 bucket 行；反向点击 bucket 行也高亮其 meter 段。做 meter 与列表之间的双向交叉定位，不额外加汇总条（bucket 行旁已显示 token 数）。v1 为 bucket 级，不展示逐条 entries 内容。

并移除底部 footer（Total used / Compressed）。

> 配色前提（按用户明确要求修订）：`ContextPopup` 是**主题感知**浮层——浅色主题浅色弹层、深色主题深色弹层。外壳走 `bg-surface-raised` / `text-text-*` / `border-line` 等语义 token；bucket 配色属「数据可视化色」，抽成 `--act-context-*`（浅/深各一套），消除组件里写死的 `colorByBucket` hex 映射。已同步更新 `主题与配色规范.md`，把原先「ContextPopup 恒定深色」豁免删除。

## 范围

包含：

- 新增 `packages/shared/src/context-buckets.ts`：单一 bucket 配置注册表 + 展示查询 helper + 由注册表派生的 `ContextUsageBucketName`。
- `packages/shared/src/session.ts`：`ContextUsageBucketName` 改为从注册表派生（保持向后兼容的 7 个 key），`ContextUsageBucket` 字段不变。
- `packages/agent-core/src/context/token-estimator.ts`：`createEmptyBuckets()` 改为遍历注册表生成（仍只填 systemPrompt/tools/conversation 的 token，其它为 0），label/colorToken 取自注册表。
- `packages/desktop/src/renderer/components/ContextPopup.tsx`：删除写死的 `colorByBucket` hex 映射，改为按 key 走 `getContextBucketDisplay()` 取 `--act-context-*` CSS 变量；外壳写死深色 hex 改为主题语义 token（`bg-surface-raised` / `text-text-*` / `border-line` 等）；新增 meter 段 ↔ bucket 行双向点击交叉高亮；移除底部 footer（Total used / Compressed）。
- `packages/desktop/src/renderer/styles/tokens.css`：新增每个 bucket 的 `--act-context-*` 数据可视化 token（浅 / 深各一套）+ 兜底色。
- 测试：`packages/desktop/src/renderer/test/`（ContextPopup 相关）。

不包含：

- 不生成 `ContextState.entries`，不展示逐条上下文内容预览（v1 bucket 级）。
- 不实现 Context 条目增删改 / pin / remove。
- 不改后端 token 估算口径（仍是 char-ratio v1）。
- 不接右侧完整 Context 视图（由 `../20260527-right-panel-views.md` 负责）。

## 背景

### 当前现状

- `ContextPopup.tsx` 只接收 `ContextUsageSnapshot`，用写死的 `colorByBucket`（深色 hex）渲染 meter + bucket 列表 + footer，无任何点击交互，且配色不随主题翻转（违反 `主题与配色规范`）。
- bucket key 来源：`token-estimator.ts#createEmptyBuckets()` 硬编码 7 个 bucket；`ContextUsageBucket` 已带 `label` 与 `colorToken` 字段，但前端没用，而是另写了一套 hex。
- 数据流：前端只消费 `contextSnapshot`（`App.tsx` 614 行），`contextState.entries` 后端未生成，故 v1 不依赖 entries。
- 现有计划 `20260527-frontend-interaction-polish/03-context-readonly-popover.md` 设想消费 `contextState` entries 并分组展示；本计划在「展示结构 / 配色 / 交互」上取代它的 Step 2，并把「逐条 entries」推迟到后端补齐后再做。

### 设计参考

- `docs/design-docs/frontend/front-主题与配色规范.md`（改任何带颜色样式前必读，硬约束：禁止 `#hex` / `text-black` / `bg-white`，颜色必须随主题翻转、浅深双验）。
- 用户提供的 Cursor Context 面板浅/深双截图（参考视觉：System prompt / Tool definitions / Rules / Skills / MCP / Subagent definitions / Summarized conversation / Conversation 多段 + 占用数值）。

## 配置驱动设计（核心）

新增 `packages/shared/src/context-buckets.ts`：

```ts
/** 单一事实来源：新增一种上下文类型只改这里 + 一个主题色 token。 */
export const CONTEXT_BUCKET_REGISTRY = [
  { key: "systemPrompt",  label: "System prompt", order: 10, colorVar: "--act-context-system" },
  { key: "tools",         label: "Tools",         order: 20, colorVar: "--act-context-tools" },
  { key: "rules",         label: "Rules",         order: 30, colorVar: "--act-context-rules" },
  { key: "skills",        label: "Skills",        order: 40, colorVar: "--act-context-skills" },
  { key: "mcp",           label: "MCP",           order: 50, colorVar: "--act-context-mcp" },
  { key: "subagents",     label: "Subagents",     order: 60, colorVar: "--act-context-subagents" },
  { key: "conversation",  label: "Conversation",  order: 70, colorVar: "--act-context-conversation" },
] as const;

export type ContextBucketConfig = (typeof CONTEXT_BUCKET_REGISTRY)[number];
export type ContextUsageBucketName = ContextBucketConfig["key"];

const FALLBACK = { label: undefined, colorVar: "--act-context-fallback", order: 999 } as const;

/** 已知 key 返回配置；未知 key 返回兜底（label 用 key 本身，配色用 fallback token）。 */
export function getContextBucketDisplay(key: string): {
  label: string; colorVar: string; order: number;
} {
  const found = CONTEXT_BUCKET_REGISTRY.find((b) => b.key === key);
  return found
    ? { label: found.label, colorVar: found.colorVar, order: found.order }
    : { label: key, colorVar: FALLBACK.colorVar, order: FALLBACK.order };
}
```

- `session.ts` 的 `ContextUsageBucketName` 改为 `re-export` 自 `context-buckets.ts`（保持同名同义，消费方零改动）。
- 后端 `createEmptyBuckets()` 遍历 `CONTEXT_BUCKET_REGISTRY` 生成 buckets，`label` 取注册表、`colorToken` 取 `colorVar`。
- 前端渲染时对每个 bucket 调 `getContextBucketDisplay(key)` 拿 label/colorVar；未知 key 自动走兜底。这样后端若未来多发一个 bucket（例如 `summarizedConversation`），只要在注册表加一行 + 在 tokens.css 加一个 token，前端立即正确显示。

## 交互与显示（已对齐 2026-05-30）

确认后的弹窗结构与点击交互：

```text
┌─ Context ───────────────────────────── x ─┐
│ 63% Full              ~188.0K / 300K Tokens │
│ ▓▓▓░░░░░░░░ ← 可点击 meter，每段=一个 bucket  │
│                                             │
│ ● System prompt   ·············  5.1K       │
│ ● Tools           ███ 高亮       26.2K      │ ← 点段高亮对应行；点行高亮对应段
│ ● Rules           ·············  1.3K       │
│ ● Conversation    ·············  129.0K     │
└─────────────────────────────────────────────┘
```

交互细节（确认稿）：

1. meter 的每一段、列表里的每个 bucket 行都是按钮，互为映射；点击任一处选中同一个 bucket。
2. 选中后：对应 meter 段加描边/提亮，对应 bucket 行加背景高亮；其余轻微淡化（交叉定位）。
3. 不加任何「选中详情条 / 汇总卡」——bucket 行旁已显示 token 数，汇总信息冗余。
4. 默认不选中；点击选中，再次点击同一项取消选中。
5. 移除原有 footer（`Total used … / Compressed … times`）。
6. 键盘可达：行/段 `role=button`、`tabIndex=0`、Enter/Space 选中，Esc 关闭弹窗（沿用现有关闭逻辑）。
7. v1 只做 bucket 级交叉高亮；后续后端补 `ContextState.entries` 后，可在选中的 bucket 行下平滑展开「逐条 title + token + preview」。

## 实施任务

### Step 1: 共享 bucket 注册表

- 新增 `packages/shared/src/context-buckets.ts`（见上）。
- `packages/shared/src/session.ts` 的 `ContextUsageBucketName` 改为从注册表派生/re-export，保持 7 个 key 不变。
- `packages/shared/src/index` 出口导出新模块（按现有 barrel 约定）。

验收：`pnpm --filter @actspace/shared typecheck` 通过；`ContextUsageBucketName` 仍是原 7 个字面量联合。

### Step 2: 后端 buckets 由注册表生成

- `token-estimator.ts#createEmptyBuckets()` 遍历 `CONTEXT_BUCKET_REGISTRY` 生成，label/colorToken 取注册表；`createContextUsageSnapshot` 逻辑不变（仍只填 systemPrompt/tools/conversation）。

验收：现有 `agent-core` context 测试不回归；snapshot bucket 顺序 = 注册表 order。

### Step 3: bucket 数据可视化色 token（浅 / 深各一套）

- `tokens.css` 新增 `--act-context-system/tools/rules/skills/mcp/subagents/conversation/fallback`，在 `:root`（浅）、`:root[data-theme="dark"]` 与 system 媒体查询（深）各定义一套；色相沿用现 `colorByBucket` 视觉（grey/purple/green/yellow/pink/blue/orange + 兜底灰），浅色稍加深以在白底可见，深色用现有亮值。

验收：注册表 `colorVar` 与 tokens.css 定义一一对应，浅/深各一套，无遗漏。

### Step 4: ContextPopup 配置化 + 主题化 + 移除 footer

- 删除写死的 `colorByBucket`；改用 `getContextBucketDisplay(key).colorVar` → `var(--act-context-*)`。
- 外壳写死深色 hex 改为主题语义 token：`bg-surface-raised` / `text-text-main|muted|faint` / `border-line` / `hover:bg-[var(--act-color-hover-overlay)]` 等；meter 轨道底色用 `bg-surface-subtle`。
- bucket 列表与 meter 都用 `bucket.tokens / totalTokens` 算宽度/占比，label 走注册表，未知 key 走兜底。
- 移除底部 footer（`Total used … / Compressed … times` 整个 `<footer>` 块）。

验收：未知 bucket key 也能渲染（兜底色 + key 作 label）；弹窗不再出现 footer；浅 / 深双主题下弹层背景、文字、边框、bucket 配色都正确翻转。

### Step 5: 点击交叉高亮交互

- 组件内 `useState` 存 `selectedKey`（默认 `null`）；meter 段与 bucket 行点击切换选中（再次点同项取消，置回 `null`）。
- 选中时：对应 meter 段加描边/提亮，对应 bucket 行加背景高亮，其余项轻微淡化；不渲染任何汇总条。
- 补 `role=button`/`tabIndex=0`/`aria-pressed` 与键盘 Enter/Space 选中。

验收：点击分段高亮对应行、点击行高亮对应段（双向一致）；再次点击取消；默认无选中；Esc / 点击外部仍关闭弹窗（沿用现有逻辑）。

### Step 6: 测试

- `packages/desktop/src/renderer/test/` 加 ContextPopup 用例：
  - 渲染出注册表全部 bucket（或对应空态），且不再渲染 footer。
  - 点击某段后对应 bucket 行进入选中/高亮态；再次点击取消。
  - 传入一个不在注册表的 bucket key，断言用 key 作 label 且不抛错（配置驱动兜底）。

## 风险

- 风险：把 `ContextUsageBucketName` 改为从注册表派生可能影响既有类型消费方。
  - 缓解：保证派生出的联合类型与现有 7 个字面量完全一致，先 `typecheck` 全量回归。
- 风险：弹窗主题化触碰一批写死的深色 hex（外壳 + meter 轨道 + 关闭按钮）。
  - 缓解：严格按 `主题与配色规范`，外壳全部换成语义 token，bucket 配色用浅/深两套 `--act-context-*`；浅/深双主题都用浏览器 mock 验过再交付。同步更新规范文档去掉过期豁免。

## 验证方式

- 命令：`pnpm --filter @actspace/shared typecheck`、`pnpm --filter @actspace/desktop test -- ContextPopup`、`pnpm --filter @actspace/desktop typecheck`、`pnpm build`。
- 浏览器 mock：按 `docs/FRONTEND_VERIFICATION.md` 验证弹窗浅/深双主题、点击分段高亮、未知 key 兜底。

## 进度记录

- [x] 与用户对齐交互/显示方案（2026-05-30）。
- [x] Step 1 共享 bucket 注册表（`packages/shared/src/context-buckets.ts`，`ContextUsageBucketName` 由注册表派生，`session.ts` 改为引用）。
- [x] Step 2 后端 buckets 由注册表生成（`token-estimator.createEmptyBuckets` + 兼容层 `context.ts` 都走注册表）。
- [x] Step 3 主题色 token（`--act-context-*` 浅 / 深各一套 + 兜底）。
- [x] Step 4 ContextPopup 配置化 + 主题化 + 移除 footer（外壳改 `bg-surface-raised`/`text-text-*`/`border-line`，删除 footer）。
- [x] Step 5 点击交叉高亮交互（`selectedKey` 状态，meter 段 ↔ bucket 行双向 `aria-pressed`，再次点击取消，默认无选中）。
- [x] Step 6 测试（shared `context-buckets.test.ts` 4 例 + desktop `context-popup.test.tsx` 3 例）。
- 验证：shared 20 passed、desktop 148 passed、三包 typecheck、`pnpm --filter @actspace/desktop build` 通过；浏览器 mock 浅/深双主题 + 点击交叉高亮 + 取消选中均已截图确认（用户要求弹窗随主题翻转，已落实并同步规范文档去掉旧豁免）。

## 决策记录

- 2026-05-30：bucket 展示改为单一注册表驱动 + 未知 key 兜底，实现「改配置不改代码」。
- 2026-05-30：v1 只做 bucket 级 meter↔行双向交叉高亮，不加汇总详情条（行旁已有 token 数，冗余），并移除 footer（Total used / Compressed）；默认不选中。逐条 entries 待后端补 `ContextState.entries` 后再做。
- 2026-05-30：本计划取代 `20260527-frontend-interaction-polish/03-context-readonly-popover.md` 的展示结构/配色/交互步骤。
