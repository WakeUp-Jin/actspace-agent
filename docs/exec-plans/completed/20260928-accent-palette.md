# 外观强调色

## 目标

按 `docs/design-docs/frontend/front-accent-palette.md` 落地强调色：默认 / 蓝 / 紫 / 粉 / 橙 5 个选项，强调色驱动发送按钮、开关开启态、焦点框、普通链接、文字选中和分割线拖动态；默认选项零视觉变化。

## 范围

- 包含：外观偏好字段、`data-accent` 机制与 token、上述 6 类消费点、外观页「强调色」分组、主题检查脚本、单测、对比 fixture、规范文档同步。
- 不包含：用户消息卡着色、普通主按钮、导航 / 列表选中、语义与数据色、Electron 原生 chrome、浅深分别选择、自定义颜色。

## 背景

- 必读：`AGENTS.md`、`docs/design-docs/frontend/front-accent-palette.md`、`docs/design-docs/frontend/front-主题与配色规范.md`、`docs/FRONTEND_VERIFICATION.md`。
- 相关代码：
  - `apps/desktop/src/renderer/appearance/{types,storage,apply,accents}.ts`
  - `apps/desktop/src/renderer/styles/{tokens,tailwind,markdown,base}.css`
  - `apps/desktop/src/renderer/components/ui/IconButton.tsx`、`components/Composer.tsx`（发送按钮、`TOGGLE_TRACK_ON_CLASS`）
  - `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`（`Toggle`）、`SettingsPage.tsx`（`AppearanceSection`）
  - `apps/desktop/src/renderer/components/right-panel/ContextRenderView.tsx`（链接式按钮）
  - `apps/desktop/src/renderer/test/{appearance.test.ts,settings-page.test.tsx}`、`test/fixtures/{settings-preview,accent-palette-preview}.*`
  - `scripts/check-frontend-theme-colors.mjs`
- 现状：worktree `feat/accent-palette` 已有第一版原型（10 色、只驱动焦点与链接，带 Codex / Maka 分组）。本计划在其上改造，原型中的 `data-accent` 机制、注册表 ↔ CSS 检查、方向键单选组、fixture 保留复用。

## 设计要点

- 调色板源值：非默认调色板在 `:root[data-accent="<id>"]` 定义 `--act-palette-light-accent` / `--act-palette-dark-accent`；默认不定义。
- 语义 token（`:root`、`[data-theme="dark"]`、system-dark 三处各一份，浅色取 light 源值、深色取 dark 源值，未定义时回落默认值）：

| token | 回落（默认调色板） | 有调色板时 |
|---|---|---|
| `--act-color-accent` | `--act-color-action` | 源值 |
| `--act-color-on-accent` | `--act-color-on-action` | 浅色 `#ffffff` / 深色 `#181916` |
| `--act-color-toggle-on` | `--act-color-operational` | 源值 |
| `--act-color-link` | `--act-color-info` | 源值 |
| `--act-color-focus-ring` | 浅 `#4d4d48` / 深 `#c8c8c0` | 源值 |
| `--act-color-selection` | 现有中性 rgba | 源值 25% 透明（`color-mix`） |

- 回落写法：`--act-color-link: var(--act-palette-light-accent, var(--act-color-info))`；`on-accent` 通过 `:root[data-accent]:not([data-accent="default"])` 统一覆盖一个 `--act-palette-*-on-accent` 源值实现。

## 任务

1. **T1 偏好与注册表**：`AccentPaletteId = "default" | "blue" | "purple" | "pink" | "orange"`；`accents.ts` 去掉分组与 `shortLabel`，名称为中文「默认 / 蓝 / 紫 / 粉 / 橙」；存储回落 `default`（原型里的 `actspace` 等旧 ID 一并回落）。
   - 验证：`appearance.test.ts` 覆盖缺字段、未知 ID、往返、`data-accent` 写入。
2. **T2 token**：按上表改 `tokens.css`；删除原型的 10 色块与 Codex / Maka 色样，新增 4 个色样 token 与默认双色色样；`tailwind.css` 映射 `accent`、`on-accent`、`toggle-on`、`link`。
   - 验证：对比度脚本输出每个调色板 4 项比值全部 ≥ 4.5；不达标就调源值，并回写设计文档色值表。
3. **T3 消费点**：
   - `IconButton` 新增 `variant="accent"`（`bg-accent text-on-accent hover:bg-accent-hover`；实施时改为新增 `accent-hover` token，默认回落 `action-hover`），Composer 发送按钮改用它；停止态保持现状。
   - `SettingsPrimitives.Toggle` 与 Composer `TOGGLE_TRACK_ON_CLASS` 改 `bg-toggle-on`。
   - `markdown.css` 链接、`ContextRenderView` 链接式按钮改 `link`（原型已完成）。
   - `base.css` `::selection` 已消费 `--act-color-selection`，只改 token。
   - 验证：`check:frontend-theme`、`check:frontend-tokens`；grep 确认 `bg-operational` 只剩状态类用途。
4. **T4 外观页**：「强调色」分组改为单行 5 个选项、无来源分组；保留 radiogroup 与方向键。
   - 验证：`settings-page.test.tsx` 断言 5 个 radio、点击写 `data-accent` 与 localStorage、方向键循环、`setNativeTheme` 不因强调色被调用。
5. **T5 检查脚本**：`REQUIRED_THEME_TOKENS` 加入 `--act-color-on-accent`、`--act-color-toggle-on`；注册表检查改为「非默认 ID 必须有块，默认 ID 不得有块」。
   - 验证：临时改错一个块名，检查报错；恢复后通过。
6. **T6 对比 fixture 与截图**：`accent-palette-preview` 每格加入发送按钮、开 / 关开关、选中文字、运行中绿点、审批琥珀条；截图浅 / 深全表与外观页浅 / 深。
   - 验证：人工看截图确认橙 vs 审批琥珀、蓝 vs info 可区分；截图结论写入执行过程文档。
7. **T7 文档与收尾**：更新 `front-主题与配色规范.md`（新增「强调色」一节；Composer send 与 Toggle on 规则改为「默认调色板下」）、`front-accent-palette.md` 最终色值、设计索引与 `frontend/README.md`、执行文档、history；计划移入 `completed/`。

## 验证方式

- 命令：`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/appearance.test.ts src/renderer/test/settings-page.test.tsx`；`pnpm check:frontend-theme`；`pnpm check:frontend-tokens`；`pnpm --dir apps/desktop exec tsc --noEmit -p tsconfig.json`。
- 手工：fixture 截图（T6）；Electron 中切换三态主题 × 5 个调色板，查看发送按钮、设置页开关、Tab 焦点、Markdown 链接、选中文字。

## 风险

- 默认外观回归：所有语义 token 在默认下回落到原 token；单测断言默认 `data-accent="default"`；截图对比默认行与 main 一致。
- 开关不再是绿色可能与「已启用」认知冲突：只在非默认调色板下发生；状态点仍为绿色。
- 橙与警告琥珀相邻：T6 专门验收，不通过则在收尾前与用户确认是否移除橙。
- 回退：删除 `data-accent` 写入即全部回落默认值。

## 进度记录

- [x] T1　- [x] T2　- [x] T3　- [x] T4　- [x] T5　- [x] T6　- [x] T7
- [ ] Electron 人工验收（三态主题 × 5 个调色板）：留给用户，见执行摘要。

## 决策记录

- 2026-09-28：采用方向 C 的 Codex 式范围（发送、开关、焦点、链接、选中）；普通主按钮与导航选中保持中性。
- 2026-09-28：候选收敛为默认 / 蓝 / 紫 / 粉 / 橙；与语义色冲突的绿、黄、Coral、Forest、Sand 及与紫重复的 Dusk 去掉。
- 2026-09-28：设置中不出现 Codex / Maka；用户消息卡不着色；浅深共用一个选择；只作用于 renderer。
- 2026-09-28：色值取 Codex 色相、按 ActSpace 对比度门槛重新校准，不照搬（Codex 白字在蓝 / 粉 / 黄上不达标）。
- 2026-09-28（实施）：粉色浅色终值 `#ad4178`（5.52 / 4.88）；新增 `--act-color-accent-hover`（`color-mix` 与 action 同向），而不是用 `brightness`；Composer 停止态保持 `primary`。
- 2026-09-28（实施）：T6 截图确认橙与审批琥珀、蓝与 info 可区分，保留橙。深色白滑块在强调色轨道上约 2.2–2.6:1，与默认翡翠绿相当，不另调。

## 执行模式

交互模式。

## 执行文档

`docs/exec-runs/20260928-accent-palette/`。
