# 色彩作为身份徽章，而非容器底色

这次 Lab 实验台从"四列彩色看板"重构为"白底列 + 列头温和色块"，暴露了一个可迁移的 UI 模式：在看板 / 矩阵类界面里，**色彩应该作为阶段身份徽章存在，而不是承担容器底色**。

## 为什么

凭直觉看，"用色彩区分阶段"很容易写成：

```css
.column--hypothesis { background: #f3f7ff; }
.column--verification { background: #fff7ef; }
.column--forge { background: #eefbfc; }
.column--promotion { background: #fffaf0; }
```

每列染一种淡色，每张卡片再加一个彩色胶囊标签，"一眼就能看出阶段身份"。然而出来的效果是页面变成幼儿园彩色看板：

- **色彩饱和度污染感知密度**：白底卡片在彩色列容器里像"漂浮"，眼睛不知道该聚焦在容器还是卡片，长时间阅读疲劳。
- **同一信息层级在不同列里看起来不一样**：浅蓝列上的灰边框看起来偏冷，浅橙列上的同一灰边框看起来偏暖，整页跨列扫读不稳定。
- **卡片标签胶囊也用了高饱和度颜色**（主假说蓝 / 草稿灰 / 阻塞红 / 候选蓝 / 验证中黄 / 通过绿 / CLI 青 / 待评审金），叠在彩色容器上视觉碎裂。

问题不在"用了色彩"，而在"色彩同时承担了**容器底色**和**徽章识别**两件事"。

## 这次采用的方案

把色彩职责切分：**容器保持白色，色彩只在列头作为身份徽章存在**。

```css
.column {
  background: #fff;           /* 容器：白纸 */
  border: 1px solid #dfe4ea;
}

.column__head {
  /* 列头：极淡阶段色块 + 左侧 3px 阶段色线 */
  border-bottom: 1px solid #dfe4ea;
}
.column--hypothesis .column__head { background: rgba(47, 111, 255, 0.045); }
.column--verification .column__head { background: rgba(217, 154, 32, 0.05); }
.column--forge .column__head { background: rgba(40, 119, 131, 0.045); }
.column--promotion .column__head { background: rgba(148, 100, 0, 0.05); }

.column__accent {
  width: 3px;
  height: 12px;
  border-radius: 999px;
  background: var(--stage-color);
}
```

效果：

- 列体白色，所有卡片"长在同一张白纸上"，跨列扫读稳定。
- 列头一个极淡色块 + 3px 色线，足够传达阶段身份，但不污染容器。
- 卡片标签胶囊也降饱和度（`color-mix(in srgb, $color 13%, #fff)`），不再和列头身份徽章打架。

## 关键取舍

### 4-5% alpha 是临界点

列头色块要够淡才不会和容器边框 / 相邻列形成"对比饱和感"，又要够强才能识别。在冷调背景（`#fbfcff`）下：

| alpha | 效果 |
| --- | --- |
| 8%+ | 已经能感觉到"彩色列头" |
| **4.5%** | **临界点：识别得出阶段色，但不"染色"** |
| 2% | 几乎看不出，列头与列体没分别 |

不同阶段色（蓝 / 暖黄 / 青 / 金）的饱和度差异较大，需要分别微调（暖色系如金可以略低，冷色系如蓝略高），让四个列头视觉权重一致。

### 标签胶囊用 `color-mix` 而非手写 lightened hex

```css
/* 推荐 */
background: color-mix(in srgb, var(--tag-color) 13%, #fff);
color: var(--tag-color);

/* 不推荐：手写浅色 hex */
background: #dee9ff;
color: #1f5fe8;
```

`color-mix` 的好处：同一份 13% 配方让所有标签色保持视觉权重一致，避免暖色系（金 / 暖黄）和冷色系（蓝 / 青）混白后视觉饱和度差异过大。

## 常见陷阱

- **"想让卡片有阶段身份就给整列染色"** —— 反例。让列头承担身份，列体专心承载卡片。
- **"每张卡片都用高饱和度标签 + 整列染色"** —— 双重彩色，必崩。色彩职责只能由其中一个层级承担。
- **"为了工业感加虚线 placeholder 撑满列高"** —— 空列自然结束，比虚框更冷静。虚线 placeholder 只在"有明确占位语义"时才用（比如拖拽 hover 区域），看板的空列不应该被虚框填满。
- **"在冷调背景上用独立中性灰做次级文字"** —— 灰色色相会和冷蓝背景对立，看起来"飘"。应该用 `rgba(主前景, α)` 让弱化文字色"吸收"背景调（这条已在 `docs/design-docs/front-全局视觉语言规范.md` 详细论述）。

## 副作用陷阱：列体去饱和后，1px 浅边框会被 Retina 吃掉

把列底从饱和纸张色（`#f3f7ff` 等）改成白色后，立刻会遇到下一个陷阱：**白底卡片在白底列体上只靠 1px `#dfe4ea` 边框区分，在 macOS HiDPI / Retina 屏上几乎不可见**。

物理原因：
- `#dfe4ea` 与白底对比度仅约 1.05:1，**远低于** WCAG 推荐 UI 非文字元素 3:1 的最低对比度。
- Retina 屏把 1 CSS px 渲染到 2 物理 px，但浏览器的次像素 anti-alias 会进一步把浅色边框模糊化。结果就是肉眼几乎看不出卡片轮廓，整列糊成一片。
- 浏览器里的截图（用 macOS 截图工具或 Chrome DevTools 设备模式）**会放大显示**，反而让边框假装"清楚"，骗过设计评审。**必须在真实 Electron / Retina 屏上验证**。

修复方案（按强度从弱到强）：

1. **边框升级到 `border-strong` 一档**（`#dfe4ea` → `#c8d1dc`）。对比度从 1.05:1 提到 1.4:1，肉眼可识别。**这是最克制的方案**，不破坏"边框为主"的设计原则。
2. **加极轻凸出阴影** `0 1px 2px rgba(15,23,42,0.05)`。在边框基础上让卡片有"轻微浮起"的实物感。
3. **selected 态用饱和度更高的视觉信号**：bg 从 `brand-soft/40` 直接提到满饱和度 `brand-soft`；阴影换成品牌色调 `rgba(47,111,255,0.14)`；左侧 brand 线从 2px 升到 3px 与列头 accent 对齐。

为什么不能在 HTML 原型里就提前发现：原型放在 5500 端口的本地 server 上用浏览器开发者工具看，CSS px 与浏览器 viewport 缩放、截图工具放大，三层加起来会把 1px 浅边框"假装清楚"。**Retina 屏上必须用真实 Electron 应用做最终验收，不能依赖原型截图**。

## 另一个副作用：Tailwind hover state 在 selected 态会"反向覆盖"

普通卡片有 `hover:border-line-strong`（hover 时灰边深一点），selected 卡片有 `border-brand`（蓝边）。把这两个 utility class 拼接到同一个元素上时，Tailwind 编译的 CSS 中两条 hover 规则优先级**完全相同**（都是 `(0,1,0)`），最终生效的是 CSS source order 中更晚出现的那条——通常是 `hover:border-line-strong`，结果：

> selected 卡片在 hover 时，brand 蓝边被 line-strong 灰边覆盖。

这不是个错误，是 Tailwind utility-first 模式的**结构性限制**。HTML/CSS 里写 `.card.is-selected { border-color: blue; }` 优先级是 `(0,2,0)`，自然覆盖 `.card:hover` 的 `(0,1,1)`；但 Tailwind class 都是单类名，没法靠选择器嵌套提优先级。

工程解法：**把 hover 状态拆到独立 class，在 JSX 里条件拼接**。普通卡片应用 `cardHoverClass`，selected 卡片不应用，selected 自己声明 hover 行为：

```tsx
const cardClass = "...base styles without hover...";
const cardHoverClass = "hover:border-line-strong hover:shadow-...";
const selectedCardClass = "border-brand bg-brand-soft shadow-... before:...";

<button
  className={`${cardClass} ${isSelected ? selectedCardClass : cardHoverClass}`}
>
```

这样 selected 卡片的 className 里**根本就没有** `hover:border-line-strong`，自然不会被覆盖。比用 `!` important 更干净，也比写 `data-state` 属性 + CSS 选择器更接近 Tailwind 习惯。

## 自检问题

1. 我的看板 / 矩阵界面里，**色彩同时承担了容器底色和身份徽章**吗？如果是，能否把容器收回白色，让色彩只出现在列头？
2. 我的列头色块如果调到 4-5% alpha，**还能不能识别阶段**？识别不出说明色相对比度不够，需要换更饱和的基色而不是提高 alpha。
3. 我的卡片标签胶囊和列头身份徽章**是否在抢同一份注意力**？如果是，胶囊应该降饱和度（13% 混白配方）让出层级。
4. 我的卡片在**真实 Retina 屏**上（不是放大的截图，不是 1x 浏览器）能看清边框轮廓吗？如果只能在原型截图里看清，说明边框对比度不够。
5. 我的 selected 态在不点击、不 hover 的情况下，能否**一眼**看出是哪张卡片？太淡的 `bg-color/40` 在 Retina 屏会几乎消失。

## 相关 history

- 本次重构：`docs/histories/2026-05/20260528-1632-lab-page-visual-refresh.md`
- 设计文档反例约束：`docs/design-docs/lab-frontend-page-design.md` "视觉约束" 一节
- 全局视觉语言规范：`docs/design-docs/front-全局视觉语言规范.md`
- 可独立预览的原型：`docs/design-docs/public/lab/prototype-refresh.html`
