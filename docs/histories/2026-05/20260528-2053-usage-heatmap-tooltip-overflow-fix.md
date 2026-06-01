## [2026-05-28 20:53] | Task: 修复热力图 tooltip 被 overflow-x-auto 父容器裁切

### 🤖 Execution Context

- **Agent ID**: `claude-opus-4-7`
- **Base Model**: `claude-opus-4.7`
- **Runtime**: Cursor IDE

### 📥 User Query

> 被遮住啦，看看吧是为什么，弹窗层级问题吗？（附截图：热力图 tooltip 上半部分 + 右半部分被遮挡 / 裁断）

### 🛠 Changes Overview

**Scope:** `packages/desktop`、`docs/design-docs/front-usage-statistics.md`、`docs/learnings`

**Key Actions:**

- **诊断**：tooltip 被遮非 z-index 问题，根因是 cell 父容器 `overflow-x-auto` 触发 CSS "implicit auto"——一个轴非 visible 时另一轴的 visible 会被升级为 auto，`absolute` 子元素一起被裁切。
- **重构 tooltip 定位策略**：从 `position: absolute`（相对 cell `relative` 父级）改成 `position: fixed`（相对 viewport），用 `getBoundingClientRect()` 在 hover/focus 瞬间拍 cell 坐标快照存进 hover state；fixed 元素在没有 `transform`/`filter`/`perspective` 祖先时不受 overflow 父级 clip。
- **拓扑调整**：tooltip 不再渲染在每个 cell `<div>` 内，而是在 HeatmapGrid 的 `relative` 父级一次性渲染。减少重复 DOM，且让 tooltip 节点彻底脱离 overflow 容器。
- **类型补强**：`HeatmapHover` 新增 `anchorRect: DOMRect` 字段，并附详细注释解释"为什么必须存 rect 快照而不是 ref"。
- **文档同步**：设计规范"热力图 tooltip"段加上"tooltip 定位实现"小节，说明 fixed + viewport 锚定的决策与代价；新增 learning 文档归纳"overflow 父级会吃掉子代 absolute"的反直觉行为。

### 🧠 Design Intent (Why)

- **裁切的根因不是层级**：截图里 tooltip 被截的边缘正好贴 overflow-x-auto 容器边界，而不是被某个 z-index 更高的兄弟覆盖；如果只调 z-index 永远修不掉。
- **为什么选 fixed 而不是 React Portal**：portal 需要额外 dependency 与 SSR/单测兼容性处理，而 fixed + viewport 坐标在本场景同样能逃出 clip——只要审过祖先链无 `transform/filter/perspective`（已审 panel 链路无）。
- **为什么用 rect 快照而不是 element ref**：tooltip 是无状态展示组件，传入纯数据比传 DOM 引用更可测；唯一代价是用户滚动时已弹的 tooltip 不会跟随，但 hover 必然伴随 mouseleave，下次 enter 会重新拍照，实际体感无感知。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `docs/design-docs/front-usage-statistics.md`
- `docs/learnings/2026-05/overflow-auto-clips-absolute-children.md`（新建）

---

## [2026-05-28 21:05] | 续记：左栏"工具调用"底部与右栏"每日细目"底部对齐

### 📥 User Query

> 把这里对齐一下，工具调用的底部和左边的每日细目底部对齐，看看是每一个 div 高度调整，还是工具调用高度调整

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **诊断布局**：两栏 section 已通过 `self-stretch` + grid row 自动等高，但**只有右栏的"每日细目"加了 `flex-1`** 撑满 section 剩余空间；左栏 3 张卡片纯自然高度，section 内底部留白被吃掉，所以视觉上左栏比右栏短。
- **方案选择**：拉伸"工具调用"（A）而不是压缩"每日细目"（B）。每日细目是核心数据密度区，压它会牺牲可见行数；工具调用本来就是分布概览，行距拉宽反而呼吸感更好，且零留白由 flex 容器自动消化。
- **落地**：工具调用 article 改成 `flex flex-1 min-h-0 flex-col`，内嵌"本月工具调用分布"子卡片同样 `flex-1 min-h-0 flex-col`，4 行工具列表加 `flex-1 justify-between` 把多出来的空间均匀分摊到行距，**无须新增 spacer 元素**。

### 🧠 Design Intent (Why)

- **对齐的本质是 flex 链路**：grid row 等高 → section stretch → section flex column → **最后一张 article 拿 `flex-1` 吃掉剩余高度**。两栏都贯彻同一规律时底部自然齐平。原来左栏断在最后一步，所以补上去就行。
- **避开"压每日细目"的反向方案**：用户提出的两个候选里，压表格会让"看得到的数据"变少——这是一个把次要 UI 整洁 凌驾于 主要信息密度 之上的错误优先级。
- **不引入 spacer 元素**：用嵌套 flex + `justify-between` 让现有内容承载留白比"硬塞一个空 div"更可维护，未来工具种类增加（5/6/7 行）时布局自动适配。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`

---

## [2026-05-28 21:15] | 续记：撤销工具调用拉伸 + 去冗余 detail + 右栏 padding 补偿

### 📥 User Query

> 光拉伸工具调用，这个拉伸太多啦，很难看，工具调用刚刚那种高度就很好看，还有去掉 TOOL CALLS 这个文本描述，直接就是工具调用就可以啦。还有，这个灰色的，也就是缓存效率那边的每一个 div 最下面的字去掉，意思重复：缓存命中、缓存未命中、推理 Token、会话数。这样右边的整体高度就小一点……可以考虑右边每一次卡片高度都加一点。

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **撤销前一节的工具调用 `flex-1`**：恢复 `${panelClass} grid gap-4 p-5`，4 行 ToolRow 回到 `gap-2` 紧凑布局，视觉密度回到用户认可的"原本好看"。
- **删除 TOOL CALLS 英文上标**：标题行从"上标 + 中文主标题"双行简化为单行 `<div className="text-base font-bold text-text-main">工具调用</div>`，与同列"热力图""数据概览"等卡片视觉权重一致。
- **`BreakdownCard.detail` 改为可选**：`detail?: string`，组件内用 `detail ? <em>...</em> : null` 条件渲染。
- **缓存效率区 4 张 BreakdownCard 去掉 `detail` 参数**：因为它们的 detail 与 label 字面完全相同（"缓存命中"="缓存命中"等），是字面重复信息；主统计区 4 张卡的 detail 是中英对照（"输入"→"direct prompt"），保留。
- **右栏 3 个 panel padding 微增**：主统计 `px-6 pb-5 pt-[18px]` → `px-6 pb-6 pt-6`；缓存效率 `p-5` → `p-6`；每日细目 `px-5 pb-2.5 pt-[18px]` → `px-6 pb-4 pt-6`。每张卡呼吸感更舒展，同时补偿缓存效率因为去 detail 减少的 ~40px 中的一部分。

### 🧠 Design Intent (Why)

- **重新评估"对齐"优先级**：上一轮硬把工具调用拉到与每日细目齐底，用户反馈"拉得很丑"——说明对齐不能凌驾于单卡片自身的视觉重量。**真正的对齐应该来自两栏自然高度本来就接近**，而不是强行 flex-1。
- **重复信息要在源头消灭**：`label === detail` 的卡片就是 noise，重复字符占了视觉宽度但传达 0 额外信息。删除后整张缓存效率卡的"墨水/信息比"提升，自然就显得"清爽且没那么高"。
- **padding 既是补偿也是改善**：去 detail 净减 ~40px，padding +8~12px 让左右栏自然高度差缩小约 30px，剩下的差距由每日细目的 `flex-1` 吃掉——不再需要工具调用配合拉伸，左栏底部少量留白也是接受的（用户已确认）。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`

---

## [2026-05-28 21:22] | 续记：工具调用 article 撑高对齐，但留白集中到 panel 底部（不分散到行间）

### 📥 User Query

> 增加工具调用的宽度，但是工具列表的间隔不变化，这样工具调用只是留白啦一下，整体是对齐的

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **工具调用 article 重新加 `flex-1`**：`grid gap-4 p-5` → `flex flex-1 min-h-0 flex-col gap-4 p-5`，吃掉左栏 section 的剩余空间，底部与右栏每日细目齐平。
- **关键：内部子项**全部维持自然高度**：子卡片不加 `flex-1`、4 行 ToolRow 维持 `flex flex-col gap-2`、不用 `justify-between`。flex column 默认 `justify-content: flex-start` 会把所有 children 顶到上方，多余高度自动收到 panel 底部，形成一整块"留白带"。
- 加注释说明这版与上上版（`justify-between` 拉宽行距）的关键差异，避免日后误改。

### 🧠 Design Intent (Why)

- **空间分配策略：分散 vs 集中**：同样是"撑高 article 让两栏对齐"，可以选两条路——
  1. 把空间均匀分散到内部子项之间（`justify-between` / 嵌套 `flex-1`）→ 行距被强行拉宽，视觉上像"被拉伸"，密度感丢失。
  2. 把空间一次性丢到 panel 底部（默认 `flex-start`）→ 内容紧凑顶部对齐，留白集中可控，视觉感觉是"卡片自然高一些"而不是"内容被扯长"。
  用户两轮反馈后明确选 2，本节落实。
- **`min-h-0` 不可省**：flex column 子项默认 `min-height: auto`（取内容自然高），如果子卡片内容比 article 高更大时（极端情况），会撑破 flex-1 的 shrink 行为。加 `min-h-0` 让 article 能正常 shrink 到 section 分配的高度，是 flex 容器的标准防御写法。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
