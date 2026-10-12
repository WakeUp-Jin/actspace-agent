# 12 测试整理 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/12-测试整理执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-12-test-cleanup/execution-process.md`
- **执行模式**：交互，连续执行
- **执行结果**：完成（T0–T8 全部完成，另有一个处理只读复核发现的提交）。本计划只改测试、检查脚本和两个 `data-state` 属性，没有用户可感知的变化，验收只需回归冒烟

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| CSS 块规则（T1） | `scripts/check-frontend-design-tokens.mjs` 及测试 | `CSS_BLOCK_RULES` 按选择器精确截取块（行首选择器 + `{`，`@media` 里的同名块也算；变体、后代、前缀选择器、注释都不算），检查禁用值和必需声明；找不到选择器、块内有嵌套规则都报错 |
| 三条 CSS 规则（T1、T6、T7） | 同上 | `tool-log-running-no-operational`（基础块和 `::after` 都不许用 operational）；`tool-log-running-reduced-motion`（reduced motion 下隐藏扫光层）；`file-diff-content-bounded-scroll`（`max-height` 为具体值、`overflow-y: auto`、`overflow-x: auto`） |
| 两条 TSX 规则（T2） | 同上 | `palette-color-literal`（Tailwind 调色板色名，覆盖 text / bg / border 各边 / divide / outline / ring / ring-offset / fill / stroke / 渐变 / accent / caret / shadow / decoration / placeholder）；`focus-ring-legacy`（blue / green / sky / emerald 焦点环）。现有代码 0 处命中 |
| 状态点 `data-state`（T3） | `components/Sidebar.tsx`、`components/settings/SettingsPrimitives.tsx` | Sidebar 会话状态点取 `idle` / `running` / `waiting_approval` / `failed`；`StatusDot` 取 tone。类名不变 |
| 测试改写（T4–T7） | `renderer/test/` | 删除 `sidebar-color-semantics`、`settings-color-semantics`、`tool-log-shimmer-color-semantics` 和 `file-diff-block` 里读 CSS 的用例；新增 `sidebar-semantics`、`settings-semantics`，渲染真实组件断言 `aria-current`、`role="switch"` / `aria-checked`、`data-state`。`renderer/test` 下不再有 `readFileSync` / `?raw` |
| 文档（T8） | `docs/desktop-frontend-refactor/08-测试与验证整理.md` | 脚本名改正；写明放弃完整类名快照；§3.1、§3.2 标注已在 12 执行 |

## 偏差

- T1：`tool-log-running-no-operational` 同时作用于 `.tool-log-text-running::after`。扫光颜色写在 `::after` 里，只守基础块就比旧测试弱。
- T6：补了计划里没有的 `tool-log-running-reduced-motion`。旧测试检查过 `display: none`，全局 reduced-motion 兜底只缩短动画、不隐藏扫光层，这条行为没有别处守。
- T7：`file-diff-content-bounded-scroll` 补了 `overflow-x: auto`（旧测试有这条）。
- 复核后：`max-height` 要求具体值；调色板规则扩大前缀；嵌套规则 fail-closed。

## 人工验证指引

### 必须验证

1. **回归冒烟**
   - 验证方式：新建会话发一条消息，流式输出正常结束；切换会话；打开设置任意两页；打开终端；打开 Review。
   - 预期结果：都正常。侧栏会话状态点和设置页状态点的颜色与之前一致（只加了属性，没改类名）。

### 建议验证

- 无。

## Agent 已完成的验证

- shared / desktop typecheck 通过；desktop test 文件 138 通过 / 1 失败 / 1 跳过，用例 1041 / 1 / 2，唯一失败是基线中已知的 `workspace-git-context-service`。
- `check:frontend-tokens`、`frontend-design-tokens.test.mjs`（10/10）、`check:frontend-theme`、`check:ipc-channels`、`ipc-channels.test.mjs`、`check:current-docs` 通过。
- 每条新规则和新测试都做了变异验证：在内存中或临时改源码制造违规，确认会报错或失败，再恢复。
- Electron CDP：主界面状态点 `data-state`、`aria-current`；设置四页导航、`StatusDot`、开关。
- Sonnet 只读复核：没有 high 级发现；修 4 条，3 条说明后不改（见执行记录「复核处理」）。

## 已知风险和遗留事项

- 放弃了正向类名快照：选中行、开关、主按钮换成别的语义色不会被拦，只会被视觉验收发现。这是计划决策记录里有意接受的取舍。
- CSS 块规则不处理 `content` 字符串里的 `}`，也不认选择器列表 `.a, .b {`（会报「找不到选择器」，不会静默通过）。

## 后续建议

- 进入 13（Preload 与 MockBridge），§3.3 的 stub 迁移在那里执行。
