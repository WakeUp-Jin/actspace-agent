# Tailwind 样式架构规范

## 状态

- 状态：Completed / 持续防回流。
- 适用范围：`packages/desktop/src/renderer` 的 React / Vite / Electron 前端。
- 关联计划：`docs/exec-plans/completed/actspace-tailwind-style-architecture.md`。

## 背景

当前桌面端前端已经从单个 `styles.css` 过渡到 `styles/index.css` 统一入口。入口按 cascade layer 导入 token、Tailwind、base、Electron chrome、Markdown 和 diff 内容边界；旧根部 `styles.css` 与 `legacy-*` 分区已经下线，不再承载真实样式。Tailwind 页面切片迁移已完成收口，后续普通 UI 样式应继续落在组件局部 Tailwind utility / class 常量中，而不是恢复 legacy 分区。

项目仍处在开发阶段，不需要保留旧样式兼容层。Tailwind 接入的目标不是在旧 CSS 外再叠一层工具类，而是把样式所有权重新切清楚：

- 全局样式负责设计 token、浏览器基础重置、Electron 窗口基础、滚动条、focus、selection、明确内容边界和少量 keyframes。
- 组件样式、布局、间距、状态和响应式优先由 Tailwind utility class 表达。
- 复杂业务界面通过 React 组件拆分保持可读性，而不是通过大量语义 class 复刻一套 CSS 框架。

Tailwind 官方 Vite 安装路径建议安装 `tailwindcss` 和 `@tailwindcss/vite`，并在 CSS 中通过 `@import "tailwindcss";` 引入。Tailwind v4 也转向 CSS-first 配置模型，适合把项目设计 token 映射到 CSS 主题变量中。

参考：

- Tailwind CSS Vite 安装文档：https://tailwindcss.com/docs/installation/using-vite
- Tailwind CSS v4 发布说明：https://tailwindcss.com/blog/tailwindcss-v4

## 目标

1. 用 Tailwind v4 作为 renderer 的主样式系统。
2. 使用 Preflight，让基础元素回到明确、可控的默认状态。
3. 保留必要全局样式，但限制在 token、base、window primitives 和复杂原生渲染边界。
4. 将 Usage Statistics 页面作为第一块完整迁移样板，后续再推广到 Sidebar、Workbench、Message、Composer、Right Panel。
5. 让设计 token 可被 Tailwind class 使用，同时仍保留 CSS 变量作为全局主题来源。
6. `packages/desktop/src/renderer` 中新增或重构 UI 默认使用 Tailwind utility 和 React UI primitive 表达样式；只有 base、第三方 DOM、Markdown、代码高亮、Electron window primitives、复杂 keyframes 等明确边界才继续写全局 CSS。

## 非目标

- 不在本阶段引入 shadcn/ui 或 Radix 组件体系。
- 不在本阶段做深色模式、主题编辑器或多主题切换。
- 不借 Tailwind 接入重做所有产品交互。
- 不保留长期未分区 `legacy.css` 或宽泛兼容旧 class 的过渡层；迁移期 legacy 文件必须有明确区域边界和删除条件。
- 不把所有重复样式都塞进 `@apply`，避免重新制造一个手写 CSS 框架。

## 文件结构

建议将 renderer 样式入口拆成明确层次：

```text
packages/desktop/src/renderer/styles/
  index.css
  tokens.css
  tailwind.css
  base.css
  electron.css
  markdown.css
  diff.css
```

职责：

- `index.css`：唯一样式入口，声明 `theme, base, chrome, components, utilities` layer 顺序，并按边界导入各样式文件。
- `tokens.css`：定义 `--act-*` 设计 token，是项目样式语义的来源。
- `tailwind.css`：导入 Tailwind，并通过 `@theme inline` 把 `--act-*` 映射为 Tailwind token。
- `base.css`：保留 document、body、root、scrollbar、focus、selection 等基础样式，导入时必须使用 `layer(base)`，避免基础 reset 覆盖组件 utility。
- `electron.css`：保留 Electron chrome 和 native-window hit-test 相关样式。
- `markdown.css`、`diff.css`：作为模型输出和代码内容的明确渲染边界。

当前入口结构：

```css
@layer theme, base, chrome, components, utilities;

@import "./tokens.css";
@import "./tailwind.css";
@import "./base.css" layer(base);
@import "./electron.css" layer(chrome);
@import "./markdown.css" layer(components);
@import "./diff.css" layer(components);
```

`packages/desktop/src/renderer/main.tsx` 最终只导入：

```ts
import "./styles/index.css";
```

旧的 `packages/desktop/src/renderer/styles.css` 已删除。后续如果需要新增全局 CSS，必须先判断它属于 base、Electron chrome、Markdown、diff 还是第三方内容边界；普通页面和组件样式默认写在对应 React 组件的 Tailwind class 中。

## Token 命名

全局 CSS 变量统一使用 `--act-*` 前缀，避免和第三方库或 Tailwind 内部变量混淆。

以下为 `Ink & Emerald` 目标语义示例，不表示当前代码已完成 token 迁移：

```css
:root {
  --act-color-app-bg: #f7f7f5;
  --act-color-surface: #ffffff;
  --act-color-surface-subtle: #f1f1ef;
  --act-color-sidebar: #efefed;
  --act-color-selected: #e4e4e1;

  --act-color-border: #deded9;
  --act-color-text-main: #20201e;
  --act-color-text-muted: #676762;
  --act-color-text-faint: #92928c;

  --act-color-action-bg: #20201e;
  --act-color-action-fg: #ffffff;
  --act-color-operational: #087a4b;
  --act-color-operational-soft: #e5f2ea;
  --act-color-info: #3978b8;
  --act-color-warning: #a87218;
  --act-color-danger: #c74747;

  --act-radius-xs: 4px;
  --act-radius-sm: 6px;
  --act-radius-md: 8px;
  --act-radius-lg: 12px;
}
```

Tailwind 主题映射示例：

```css
@import "tailwindcss";

@theme inline {
  --color-app-bg: var(--act-color-app-bg);
  --color-surface: var(--act-color-surface);
  --color-surface-subtle: var(--act-color-surface-subtle);
  --color-sidebar: var(--act-color-sidebar);
  --color-selected: var(--act-color-selected);

  --color-line: var(--act-color-border);
  --color-text-main: var(--act-color-text-main);
  --color-text-muted: var(--act-color-text-muted);
  --color-text-faint: var(--act-color-text-faint);

  --color-action-bg: var(--act-color-action-bg);
  --color-action-fg: var(--act-color-action-fg);
  --color-operational: var(--act-color-operational);
  --color-operational-soft: var(--act-color-operational-soft);
  --color-info: var(--act-color-info);
  --color-warning: var(--act-color-warning);
  --color-danger: var(--act-color-danger);

  --radius-act-xs: var(--act-radius-xs);
  --radius-act-sm: var(--act-radius-sm);
  --radius-act-md: var(--act-radius-md);
  --radius-act-lg: var(--act-radius-lg);

}
```

组件中优先使用这些语义 utility：

```tsx
<section className="rounded-act-md border border-line bg-surface">
  <h2 className="text-text-main">Usage</h2>
  <p className="text-text-muted">latest rows</p>
</section>
```

## Preflight 策略

启用 Tailwind Preflight。

原因：

- 项目仍在开发阶段，不需要为了旧组件保留浏览器默认样式。
- Preflight 能让按钮、表单、标题、列表等元素的基线更一致，后续组件全部显式声明视觉状态。
- 一次性迁移比长期混用旧全局 CSS 和工具类更清晰。

影响：

- 旧组件依赖浏览器默认 margin、button 样式或 heading 样式时会发生变化。
- 接入时需要按页面切片迁移，并在每个切片完成后做浏览器检查。
- Markdown、代码块、第三方渲染区域需要单独定义内容样式，不能假设全局默认能满足阅读效果。

## 样式所有权

### Tailwind utility 负责

- 页面和组件布局。
- spacing、sizing、grid、flex。
- 字号、字重、行高、颜色。
- hover、active、focus、disabled。
- 响应式断点。
- 卡片、按钮、表格、弹窗等常规 UI 表达。

### 全局 CSS 负责

- `html`、`body`、`#root` 高度和基础字体。
- Electron 窗口拖拽区域和 no-drag 区域。
- selection、scrollbar、focus-visible 的全局体验。
- 复杂动画 keyframes。
- 第三方 DOM、Markdown、代码高亮、Monaco 或 canvas/chart 这类 Tailwind 不直接掌控的区域。

### React 组件负责

- 重复出现的 UI primitive，例如 `IconButton`、`SegmentedControl`、`MetricCard`、`Panel`。
- 复杂 className 的组合和 variant。
- 业务含义和可访问性属性。

### `@apply` 使用边界

默认不使用 `@apply`。只有当一个重复 primitive 无法自然抽成 React 组件，或者需要覆盖第三方 DOM 结构时，才允许在 `@layer components` 里少量使用。

禁止用 `@apply` 把旧的 `.usage-*`、`.sidebar-*`、`.message-*` 全部翻译一遍。那样只是把旧 CSS 换了语法，不能改善可读性。

## 响应式布局原则

Tailwind 接入后，复杂页面优先使用 12 栅格表达比例关系。

Usage Statistics 页面作为样板：

```tsx
<main className="grid grid-cols-1 gap-4 xl:grid-cols-12">
  <aside className="xl:col-span-4">...</aside>
  <section className="xl:col-span-8">...</section>
</main>
```

原则：

- 左右比例用栅格表达，不用固定宽度锁死。
- 在较窄宽度下自动变成单列或紧凑两列。
- Token 总数大卡内部包含顶部 toolbar、中间数字、分布条和底部指标卡，避免相关组件散落在外部。
- 组件内部用 `grid-cols-*`、`minmax`、`auto-fit` 等方式处理卡片换行。
- 关键数字使用 `clamp()` 或 Tailwind arbitrary value 控制上下限，防止超宽或窄屏溢出。

## Usage Statistics 迁移要求

Usage Statistics 是第一块完整迁移样板，需满足：

1. 页面点击左侧 `Usage` 时显示统计页面。
2. 左侧栏保留概览、热力图、工具调用、使用趋势。
3. 右侧保留 Token 总数大卡、缓存效率卡、每日细目卡。
4. Token 总数大卡内部包含：
   - 顶部：日 / 周 / 月 / 总计 / 自定义 + 分享 / 刷新。
   - 中间：TOKEN 总数 + 可点击金额。
   - 下方：token 分布条。
   - 底部：输入 / 输出 / 缓存 / 推理。
5. 金额点击后打开成本估算弹窗。
6. 工具调用卡保持原型中的紧凑样式，`查看详情` 打开弹窗，而不是在页面中展开。
7. 缓存效率卡以中性大数字为主；命中、健康等运行语义可使用 operational green，图表使用低饱和数据系列色。
8. 页面整体保持 `http://127.0.0.1:5500/docs/design-docs/frontend/usage-statistics-prototype.html` 的视觉基线。

## 迁移顺序

1. 接入 Tailwind 基础设施和样式入口。
2. 迁移 Usage Statistics 页面，并删除对应旧 CSS。
3. 迁移 Workbench shell 和 Sidebar。
4. 迁移 Conversation messages、Tool previews 和 Composer。
5. 迁移 Right Panel、Settings 和剩余页面。
6. 删除未使用 class，并保持旧 `styles.css` / `legacy-*` 不回流。
7. 补充 coding standards 中的 Tailwind 书写约定。

当前状态：以上迁移顺序已完成并通过收口验收；后续任务是维持这些边界，而不是继续保留迁移期 legacy 层。

## 验证要求

每个迁移切片至少做：

- `pnpm typecheck`
- `pnpm --filter @actspace/desktop build`
- 相关测试，例如 `pnpm --filter @actspace/desktop test`
- 浏览器 mock 验证 `http://127.0.0.1:5173/`
- Electron 真实窗口验证，优先用 `pnpm dev:log` 启动并查看 `logs/latest-dev.log`

视觉验收重点：

- Usage 页面和原型一致，不出现卡片比例失真。
- Token 大卡内部 toolbar 和底部指标归属正确。
- 左右列在不同窗口宽度下按栅格响应。
- 文本不溢出按钮、卡片或表格单元。
- 弹窗可打开、可关闭，背景遮罩和焦点状态清晰。
- 滚动条、横向 overflow、表格高度符合桌面端密度。

## 风险与处理

- 风险：Preflight 导致旧组件样式变化。
  - 处理：按页面切片迁移，每个切片完成后马上做浏览器验证。
- 风险：JSX 内 className 过长。
  - 处理：把重复结构提成 React primitive 或局部常量，而不是回到大 CSS 文件。
- 风险：token 在 CSS 变量和 Tailwind theme 中重复。
  - 处理：`--act-*` 是来源，Tailwind `@theme inline` 只是映射层。
- 风险：第三方渲染区域被 Preflight 影响。
  - 处理：Markdown、code、diff、Monaco 相关区域保留专门的 base 或 component layer。
- 风险：Tailwind arbitrary value 滥用。
  - 处理：只有 hero 数字、特殊 grid、Electron 窗口尺寸等确实需要时才使用。

## 决策记录

- 2026-05-27：采用 Tailwind v4 + `@tailwindcss/vite`。理由是项目基于 Vite，官方文档推荐 Vite 插件，v4 的 CSS-first 模型也更适合把现有视觉 token 映射进 Tailwind。
- 2026-05-27：启用 Preflight，不保留长期 legacy CSS。理由是项目仍处开发阶段，用户明确希望使用“全局样式 + Tailwind”的清晰架构，不需要为旧样式承担迁移包袱。
- 2026-05-27：Usage Statistics 作为第一个完整样板。理由是该页面已有高保真原型和明确反馈，最适合验证 12 栅格、卡片、弹窗、表格和响应式策略。
