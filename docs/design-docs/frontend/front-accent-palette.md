# 外观强调色

状态：已实施（2026-09-28），Electron 人工验收待做。执行计划见 `docs/exec-plans/completed/20260928-accent-palette.md`。

## 目标

在「设置 → 外观」提供强调色选择。强调色接管少数高频交互点，让用户选了颜色就能看出来；中性工作台、导航选中、普通主按钮和所有状态色保持不变。默认选项与改动前完全一致。

## 参考来源与取舍

- Codex 桌面应用：全局强调色为 Default / Blue / Green / Yellow / Pink / Orange / Purple / Black；红色只是项目标记色，不是全局强调色。强调色驱动发送按钮、开关、焦点框、链接、文字选中和少量淡色背景；普通主按钮与侧栏选中保持中性。
- Maka：每个调色板同时改背景与语义色，属于整套主题；只借鉴其派生思路（一个基础色派生填充、文字等层级），不移植整套主题。
- 设置界面不出现来源产品名，不按来源分组。

## 调色板

| ID | 名称 | 说明 |
|---|---|---|
| `default` | 默认 | Ink & Emerald，现有外观 |
| `blue` | 蓝 | Codex 蓝色相 |
| `purple` | 紫 | Codex 紫色相 |
| `pink` | 粉 | Codex 粉色相，偏洋红，与危险红区分 |
| `orange` | 橙 | Codex 橙色相；与警告琥珀相邻，需在审批条旁验收 |

排除：绿（与运行中 / 已启用的翡翠绿冲突）、黄（与警告琥珀冲突，且无法在白字下达到对比度）、Maka Coral（红）、Forest（翡翠绿）、Sand（琥珀）、Dusk（与紫重复）。

每个非默认调色板只定义两个源值：浅色主题一个、深色主题一个。同一个值兼作填充色和文字色：

| ID | 浅色 | 深色 |
|---|---|---|
| `blue` | `#2c67c5` | `#6aa3f8` |
| `purple` | `#7849d1` | `#b394f5` |
| `pink` | `#ad4178` | `#f28bbb` |
| `orange` | `#b4501f` | `#f2995f` |

对比度门槛：

- 浅色：白色图标 / 文字在强调色上 ≥ 4.5:1；强调色文字在 `surface`、`bg`、`surface-subtle` 上 ≥ 4.5:1。
- 深色：`#181916` 图标在强调色上 ≥ 4.5:1；强调色文字在 `surface`、`bg`、`surface-raised` 上 ≥ 4.5:1。

实测对比度（`pnpm check:frontend-theme` 同一算法）：

| ID | 浅色：白字在填充上 / 最低文字底（surface-subtle） | 深色：`#181916` 在填充上 / 最低文字底（surface-raised） |
|---|---|---|
| `blue` | 5.45 / 4.82 | 6.90 / 5.12 |
| `purple` | 5.72 / 5.06 | 7.12 / 5.28 |
| `pink` | 5.52 / 4.88 | 7.72 / 5.73 |
| `orange` | 5.11 / 4.52 | 7.98 / 5.93 |

橙色浅色文字在 `surface-subtle` 上余量最小（4.52）；后续若调暗 `surface-subtle`，需要同步压暗橙色。

强调色上的前景色：浅色主题白色，深色主题近黑 `#181916`，与 action 反色规律一致。hover 与 action 同向：浅色混入 12% 黑、深色混入 15% 白（`--act-color-accent-hover`），反色图标对比度只升不降。

开关白色滑块在深色强调色轨道上约 2.2–2.6:1，与默认翡翠绿轨道（2.18:1）相当；开启态主要靠滑块位置表达，不单独提高。

色样（`--act-preview-accent-*`）用 Codex 原色相的中间亮度展示，比浅色主题实际填充值更亮；它表示色相，不等于某个主题下的实际色值。

## 强调色覆盖范围

| 位置 | 默认调色板 | 其它调色板 |
|---|---|---|
| Composer 发送按钮 | action 墨色反色 | 强调色填充 + 反色图标 |
| 开关开启态（设置页 Toggle、Composer 内开关） | operational 翡翠绿 | 强调色 |
| 键盘焦点框、输入框 focus 边框与光晕 | 中性墨灰 | 强调色 |
| 普通链接（Markdown 链接、链接式按钮） | info 蓝 | 强调色 |
| 文字选中 | 中性灰 20% | 强调色约 25% 透明度 |
| 分割线拖动中 / 键盘聚焦 | 同焦点框 | 强调色 |

明确不变：

- 普通主按钮（`Button` / `IconButton` 的 `primary`）、导航与列表选中、Sidebar。
- 运行中、成功、警告、危险、信息等语义色；状态点、进度条、审批条。
- 图表、Context bucket、diff、Analysis 数据色。
- 用户消息卡不加淡色底：它与 Composer 对齐、靠 surface + hairline 区分，大面积彩色底会破坏阅读流里的克制感。
- Electron 原生 chrome（交通灯、系统菜单）。

开关改为强调色的理由：开关是控件状态，不是运行状态；设置页里开关密度最高，是强调色最容易被感知的位置。「已启用」的语义由开关位置和 `aria-checked` 表达，不依赖绿色。运行中、已连接等状态点仍用 operational。

## 机制

- `<html data-accent="<id>">`，与 `data-theme` 独立；`system` 主题照常走 `prefers-color-scheme`。
- `tokens.css`：`:root[data-accent="<id>"]` 只写 `--act-palette-light-accent` / `--act-palette-dark-accent`；`:root` 与两个深色块各自挑选成语义 token：
  - `--act-color-accent`（填充）、`--act-color-accent-hover` 与 `--act-color-on-accent`；
  - `--act-color-link`；
  - `--act-color-focus-ring`；
  - `--act-color-selection`；
  - `--act-color-toggle-on`。
- 默认调色板不定义这些源值，语义 token 回落到现有 action / operational / info / 中性值，保证零视觉变化。
- 设置页色样为固定预览色 `--act-preview-accent-*`，不随主题或当前选择翻转。
- 偏好存储：localStorage `actspace.appearance.v1` 新增 `accentPalette`，缺失或未知 ID 回落 `default`；只作用于 renderer，不走 IPC。
- 浅色与深色共用一个选择，不支持分别设置。

## 设置界面

- 「外观」页「主题」之后新增「强调色」分组：5 个带色样的圆角选项，一行排列，窄窗自动换行。
- 单选组语义：`role="radiogroup"`，方向键循环选中，Home / End 跳首尾，只有当前项进入 Tab 序列。
- 选中态沿用主题卡片：`ring-2 ring-text-main`；焦点态为强调色 outline。

## 验收

- `pnpm check:frontend-theme` 校验调色板注册表与 CSS 块一一对应、色样 token 齐全、新增语义 token 三个主题块都有定义。
- 并排对比 fixture：每个调色板 × 浅 / 深，包含发送按钮、开关、焦点框、链接、选中文字，以及相邻的运行中绿点和审批琥珀，用于确认橙色与警告色、蓝色与信息色的区分度。
- 浏览器 fixture 截图后，按 `docs/FRONTEND_VERIFICATION.md` 在 Electron 中人工验收。
