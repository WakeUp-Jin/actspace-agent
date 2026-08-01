# 主题与配色规范

## 定位

这份文档定义 ActSpace 桌面端的三态主题机制、目标颜色职责和实现硬约束。任何修改颜色的工作都必须先读本文件。

核心原则：

> 组件只消费语义 token；颜色随主题翻转；action、operational、semantic 和 data visualization 必须分离。

`Ink & Emerald` 已在 renderer 落地。旧蓝色 `brand` 与旧 `warm` 消费已清零，后续新增颜色必须通过 `pnpm check:frontend-theme` 的 token 完整性与防回流检查。

## 三态主题机制

ActSpace 支持：

- `light`：显式浅色。
- `dark`：显式深色。
- `system`：跟随操作系统。

当前实现机制保持：

1. CSS 变量是颜色单一事实源，集中定义在 `styles/tokens.css`。
2. `styles/tailwind.css` 将语义 Tailwind 类映射到 `--act-color-*`。
3. `<html data-theme="light|dark|system">` 控制主题。
4. `system` 通过 `prefers-color-scheme` 翻转，不需要组件监听系统主题。
5. Electron `nativeTheme.themeSource` 同步交通灯、滚动条和系统菜单。

## 新的颜色职责

### Neutral

负责 App、Sidebar、Surface、Selected、Hover、Border 和文本层级。导航选中和普通 hover 不再消费彩色品牌 token。

### Action

负责发送、确认提交等最高优先级动作。目标形态是主题反色：浅色近黑底，深色近白底。

### Operational

负责 running、connected、enabled、healthy 和显式 success。目标 accent 为翡翠绿；diff additions 仍使用独立 diff token。

### Semantic

- Info：信息提示和有限蓝色编码。
- Warning：风险、等待审批和阈值预警。
- Danger：错误、删除、失败和 diff removals。
- Success：完成确认；通常与 operational 共享绿色家族，但语义名称仍应明确。

### Visualization

Chart、Context bucket、热力图等使用独立数据色，不映射到 action 或 operational。

## 已落地 token 拆分

当前实现按以下职责落地，禁止重新合并成单一强调色：

```css
/* neutral */
--act-color-bg;
--act-color-sidebar;
--act-color-surface;
--act-color-surface-subtle;
--act-color-selected;
--act-color-hover-overlay;
--act-color-border;
--act-color-border-strong;
--act-color-meter-track;
--act-color-text;
--act-color-text-muted;
--act-color-text-faint;

/* main action */
--act-color-action;
--act-color-action-hover;
--act-color-on-action;

/* operational */
--act-color-operational;
--act-color-operational-hover;
--act-color-operational-soft;
--act-color-on-operational;

/* semantic */
--act-color-info;
--act-color-info-soft;
--act-color-warning;
--act-color-warning-soft;
--act-color-danger;
--act-color-danger-soft;
--act-color-on-danger;
--act-color-on-danger-solid;
--act-color-success;
--act-color-success-soft;
--act-color-on-success;

/* specialized */
--act-chart-series-1;
--act-chart-series-2;
--act-context-system;
--act-context-tools;
--act-color-diff-add-bg;
--act-color-diff-add-text;
--act-color-diff-remove-bg;
--act-color-diff-remove-text;
--act-color-focus-ring;
--act-color-operational-focus-ring;
```

具体命名在代码迁移计划中可以结合现有 token 收敛，但职责不能重新合并。

## 目标浅深色基线

详细色板见根 `DESIGN.md` 和 `front-全局视觉语言规范.md`。关键方向：

- Light：暖中性灰背景、白色 surface、近黑文字、深翡翠绿 operational。
- Dark：暖黑灰背景、非纯黑 surface、柔和浅文字、明亮但不霓虹的翡翠绿 operational。
- Blue：仅保留 info / chart / Context 数据编码。
- Amber：只用于 warning。
- Red：只用于 danger / diff removal。

## 硬约束：禁止非主题感知字面量

主题相关的文字、背景、边框和状态色禁止直接写：

```tsx
text-black
text-white        // 作为普通正文时
bg-white
bg-black
text-[#20201e]
bg-[#f7f7f5]
border-[#deded9]
text-[rgba(...)]
```

必须使用语义类或 CSS 变量：

| 用途 | 正确方向 |
|---|---|
| 主文字 | `text-text-main` |
| 次级文字 | `text-text-muted` / `text-text-faint` |
| App / Surface | `bg-app-bg` / `bg-surface` / `bg-surface-subtle` |
| 选中 / Hover | `bg-selected` / hover overlay token |
| 边框 | `border-line` / `border-line-strong` |
| 主操作 | action token / 对应语义类 |
| 运行与开启 | operational token / 对应语义类 |
| 错误与风险 | danger / warning token |

需要新颜色时，先扩展浅色和深色两套 token，再映射 Tailwind 类。禁止先在组件中写 hex，之后再“考虑抽 token”。

## 合法例外

颜色字面量只在明确证明浅深主题都成立时允许：

1. 恒定反色 tooltip 或遮罩。
2. Toggle 白色 thumb 等跨主题恒定部件。
3. 低 alpha overlay、阴影和非语义装饰。
4. 外部品牌 logo 的官方颜色。
5. 数据可视化局部色，但优先仍应抽成 chart / context token。
6. 不随主题变化的媒体内容本身。

“品牌底 + 白字”不再是通用豁免。ActSpace 主操作需要随主题反色，operational green 也必须有浅深两套值。

## Focus

- 键盘 focus 必须清晰可见，不能只依赖背景轻微变化。
- 普通控件优先使用高对比中性 focus ring。
- operational 控件可以使用 operational ring，但不能把所有 focus 都染绿。
- focus、selected、running 是三个不同状态，不共享同一个彩色 token。

## 数据可视化

- 图表系列色保持低饱和，并在深色主题重新校准亮度。
- Context bucket 使用 `--act-context-*` 独立 token。
- Heatmap 必须验证空值、低值、高值和 hover/focus 对比度。
- 图表蓝色是合法数据色，但不能回流成按钮、导航或 focus 默认色。
- diff additions / removals 使用独立 diff token，不复用 Toggle 或 danger button 背景。

## 组件颜色规则

### Sidebar

- selected = 中性灰。
- busy / running dot = operational green。
- 普通 icon = currentColor 中性灰黑。

### Composer

- send = action token。
- running = operational 小型反馈。
- Context usage = 默认中性，阈值切 warning / danger。
- Context 容量条的未使用轨道必须消费低对比 `meter-track`，不能使用 `border-strong` 造成“灰色区域也像已使用”的误读。

### Message tools

- 默认和 completed = neutral。
- running 文字采用 `text-faint` 底字 + `text-main` 墨色扫光的 B 方案高明度差组合；浅深主题依靠 token 自动翻转，通过文字层级和动态表达进行中，不使用绿色整行文字。
- approval = warning，failed = danger。

### Settings

- nav selected = neutral。
- Toggle on = operational。
- 连接成功 = operational，连接错误 = danger。

### Kairos

- running / healthy = operational。
- sleep / waiting = neutral。
- warning = warning，failed = danger。
- selected row = neutral，不使用绿色或蓝色大面积底色。

## 维护纪律

- renderer 中不再允许旧强调色 alias 或 utility 回流。
- 新增语义 token 必须同时定义 light、dark、system-dark 三个分支。
- Tailwind 颜色映射只能引用 `tokens.css` 已定义的 token。
- 组件颜色字面量只允许精确用途 allowlist，不允许目录级豁免。
- 运行 `pnpm check:frontend-theme` 验证上述契约。

## 自检

```sh
pnpm check:frontend-theme
```

逐项检查：

1. 它属于 neutral、action、operational、semantic 还是 visualization？
2. 浅色和深色是否都有定义？
3. 是否错误地用绿色表达 selected 或普通按钮？
4. 状态是否还有文字、形状或图标冗余表达？
5. keyboard focus 是否清晰？

## 验收要求

- 浅色、深色、跟随系统三态都必须验证。
- 验证 Sidebar、Composer、Settings 三个代表样板后，才允许大范围迁移页面。
- 检查 hover、selected、pressed、disabled、focus、running、success、warning、danger。
- 目标色板迁移是有意视觉变化，不要求相对旧蓝色界面零视觉回归；要求相对确认后的新样板保持一致。
- Electron 原生 chrome 和滚动条必须与主题同步。
