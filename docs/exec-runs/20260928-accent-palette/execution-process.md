# 外观强调色：执行过程

交互模式，按 `docs/exec-plans/completed/20260928-accent-palette.md` 的 T1–T7 在第一版原型（10 色、带 Codex / Maka 分组）上改造。

## T1 偏好与注册表

- `AccentPaletteId` 收敛为 `default | blue | purple | pink | orange`，`accents.ts` 只保留 ID 与中文名。
- `appearance.test.ts` 改为新 ID，新增原型旧 ID（`actspace` / `codex-blue` / `maka-dusk`）回落 `default` 的用例。8 个用例通过。

## T2 token

- 原型已完成：`:root[data-accent]` 源值块、`--act-color-accent / on-accent / toggle-on / link` 语义 token、焦点与选区回落、4 个色样 token。
- 本轮新增 `--act-color-accent-hover`：非默认调色板用 `color-mix`（浅色混 12% 黑、深色混 15% 白），默认回落 `action-hover`；`tailwind.css` 映射 `accent-hover`。
- 对比度（白字 / `#181916` 在填充上，填充作文字在最低一档背景上）全部 ≥ 4.5，最小是橙色浅色在 `surface-subtle` 上 4.52。粉色终值 `#ad4178`，设计文档里的 `#af4279` 已改掉。

## T3 消费点

- `IconButton` 新增 `variant="accent"`；Composer 发送按钮在非流式时用 `accent`，停止态仍是 `primary`。删除 Composer 里描述旧发送样式的过期注释。
- `SettingsPrimitives.Toggle` 与 Composer `TOGGLE_TRACK_ON_CLASS` 改为 `bg-toggle-on`。
- Markdown 链接、`ContextRenderView` 链接式按钮原型已改为 `link`；`::selection` 与 SplitView 分割线本来就消费 `selection` / `focus-ring`，无需改。
- grep `bg-operational`：剩余均为状态点、进度条、更新步骤，属于状态用途。
- 同步更新依赖旧类名的测试：`composer.test.tsx`（发送按钮、Thinking 开关）、`settings-color-semantics.test.tsx`（Toggle）。

## T4 外观页

- 「强调色」改为一行 5 个药丸选项，去掉分组标题与 `shortLabel`，说明文字改为「用于发送按钮、开关、焦点和链接；导航选中和状态颜色保持不变。」
- `settings-page.test.tsx` 断言 5 个选项顺序、默认选中、单一 Tab 停靠点、点击写 `data-accent` 与 localStorage、`setNativeTheme` 只收到主题三态、方向键 / End / 循环。

## T5 检查脚本

- `REQUIRED_THEME_TOKENS` 增加 `--act-color-accent-hover`（`on-accent`、`toggle-on` 原型已加）。
- 反向验证：把 `orange` 块改名后报「缺块 + 未注册块」；把橙色浅色值改成 `#d0702f` 后报 4 条对比度不足；恢复后通过。

## T6 对比 fixture 与截图

- `accent-palette-preview` 每格包含链接、选中文字、focus 输入框、真实 `IconButton accent` 发送按钮、开 / 关 `Toggle`、运行中绿点、审批琥珀条。
- 截图：`accent-grid.png`（5 调色板 × 浅深）、`appearance-light.png`、`appearance-dark.png`（外观页，选中橙）。
- 结论：
  - 默认行与改动前一致（墨色发送、翡翠绿开关、info 蓝链接、中性焦点）。
  - 橙（浅 `#b4501f` 偏红、深 `#f2995f`）与审批琥珀（土黄）在两种主题下都能分开，保留橙。
  - 蓝色链接与默认 info 蓝相近，但两者都表示链接，不构成语义冲突。
  - 非默认调色板下开关与运行中绿点颜色不同，「运行中」语义没有被开关稀释。

## T7 文档

- `front-主题与配色规范.md` 新增「Accent（外观强调色）」一节；Focus、Composer send、Settings Toggle 规则改为「默认调色板下回落」。
- `front-accent-palette.md` 更新状态、粉色终值、实测对比度表、hover 规则、滑块对比度与色样说明。
- 设计索引、`frontend/README.md`、计划索引同步；计划移入 `completed/`。

## 验证命令

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/appearance.test.ts src/renderer/test/settings-page.test.tsx`：36 通过。
- `composer.test.tsx` + `settings-color-semantics.test.tsx`：54 通过。
- `pnpm check:frontend-theme`、`pnpm check:frontend-tokens`、`tsc --noEmit -p tsconfig.json`：通过。
- desktop 全量 vitest：并发运行时出现若干 5s 超时（review / trajectory / provider / approval 等），单独重跑全部通过；`workspace-git-context-service` 的「non-repository」用例在 main 上同样失败，与本次无关。
