# 基础组件封装规范

## 定位

这份文档定义 `actspace` 桌面端基础 UI 组件层的边界。

基础组件层的目标不是引入一套完整第三方设计系统，而是在项目内部沉淀一层稳定、可复用、可测试的 UI wrapper，让业务组件不再重复实现按钮、菜单、浮层、开关、输入框、focus 和 disabled 等基础交互细节。

推荐分层：

```txt
Radix primitives / 原生 HTML
  -> packages/desktop/src/renderer/components/ui/*
  -> actspace 业务组件
```

## 与 Radix 和 shadcn 的关系

`Radix UI` 是无样式交互 primitives，负责复杂交互的行为正确性，例如：

- 可访问性语义。
- 键盘操作。
- focus 管理。
- portal。
- 浮层定位。
- ESC 关闭。
- 外部点击关闭。
- `data-state`、`data-side` 等状态属性。

`shadcn/ui` 的主要价值是把 Radix primitives 复制到项目内，包一层默认样式、class 合并、组件导出和使用约定。

`actspace` 当前不直接采用完整 `shadcn/ui` 生成体系，但参考它的封装模式：

- 底层优先使用 Radix primitives 或原生 HTML。
- 项目内维护 `components/ui/*` wrapper。
- wrapper 只处理通用视觉和交互，不包含业务语义。
- 业务组件消费 wrapper，而不是直接重复写基础控件样式。

## 组件分层

### 基础 UI 组件

基础 UI 组件放在：

```txt
packages/desktop/src/renderer/components/ui/
```

这一层只表达通用控件，不知道 Agent、Session、Model、Context、Tool 或 Message。

适合进入基础层的组件：

- `Button`
- `IconButton`
- `Tooltip`
- `DropdownMenu`
- `Popover`
- `Switch`
- `Textarea`
- `Tabs`
- `Dialog`

这些组件可以接收 `variant`、`size`、`className`、`children`、`disabled` 等通用属性，但不应接收 `modelId`、`sessionId`、`messageId`、`toolName` 这类业务字段。

### 业务组合组件

业务组合组件继续放在具体 feature 或现有组件目录中。

示例：

- `ModelSelector`
- `ModeSelector`
- `ContextUsageButton`
- `MessageActionsMenu`
- `SessionRow`
- `ToolPreviewBlock`

这一层可以使用基础 UI 组件，并负责业务状态、数据字段、事件含义和文案。

## 组件选择原则

### 优先用 Radix 的场景

只要组件涉及复杂交互，就优先基于 Radix 封装：

- 浮层定位和碰撞避让。
- ESC 关闭和外点关闭。
- focus trap 或 focus restore。
- 菜单键盘导航。
- tooltip 延迟和 hover/focus 行为。
- tablist 语义和键盘切换。
- dialog、popover、dropdown 等 portal 组件。

首批适合引入 Radix wrapper 的组件：

- `Tooltip`
- `DropdownMenu`
- `Popover`
- `Switch`
- `Tabs`
- `Dialog`

### 可以先用原生封装的场景

交互简单、原生语义足够稳定的组件，可以先用原生 HTML 封装：

- `Button`
- `IconButton`
- `Textarea`

这类组件重点统一视觉 token、尺寸、状态和 aria 约定。

### 暂缓抽象的场景

以下组件先不放入基础 UI 层：

- `SplitView`：它是工作台布局底座，包含左右面板尺寸约束、键盘 resize、拖拽、折叠和恢复逻辑，应单独演进。
- 消息块组件：例如 `BashRunBlock`、`ToolLogLine`、`EditDiffBlock`，它们是 Agent 消息语法的一部分，不是通用 UI primitive。
- 业务列表项：例如 session row，如果只在一个业务场景出现，先保留在业务组件中。

## 样式规则

基础 UI 组件必须优先消费 [`全局视觉语言规范`](front-全局视觉语言规范.md) 中定义的语义 token。

默认规则：

- 不在组件内随手新增十六进制颜色。
- 不把任何彩色 accent 作为默认文本色。
- hover、focus、active、disabled 状态不改变布局尺寸。
- icon-only button 必须有 `aria-label` 或被 tooltip 清晰解释。
- focus-visible 必须可见。
- disabled 状态必须同时体现视觉和交互不可用。
- 动效使用全局 motion token，并尊重 `prefers-reduced-motion`。

如果一个基础组件需要新增颜色、字号、阴影或半径，先判断是否应该扩展全局视觉规范，而不是只在局部新增样式。

## 命名规则

基础组件文件名使用 PascalCase：

```txt
components/ui/Button.tsx
components/ui/IconButton.tsx
components/ui/Tooltip.tsx
components/ui/DropdownMenu.tsx
```

导出名称与文件名保持一致。组合式 Radix wrapper 可以导出多个命名组件，例如：

```tsx
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
};
```

如果某个组件需要 variant，优先使用清晰的字符串枚举，例如：

```tsx
variant?: "primary" | "secondary" | "ghost" | "soft";
size?: "sm" | "md" | "lg" | "icon";
```

不要为了早期便利暴露过多 one-off prop，例如 `isComposerModeButton`、`isModelEditButton`。

## 迁移顺序

基础组件层应按低风险、小切片推进。

推荐顺序：

1. `Button` 和 `IconButton`：统一按钮尺寸、圆角、focus、disabled、icon-only 约定。
2. `Tooltip`：为 icon-only 操作提供统一解释能力。
3. `DropdownMenu`：替换 Composer mode/model 菜单和消息操作菜单的手写浮层逻辑。
4. `Switch`：替换 model options 中的 Thinking toggle。
5. `Textarea`：统一 composer 输入框的基础状态和可访问性。
6. `Tabs`：替换右侧面板顶部 tab 的基础语义和状态。

`SplitView`、复杂消息块和设置页布局不参与第一批基础组件迁移。

## 验证要求

每次迁移基础 UI 组件后，至少验证：

- TypeScript 类型检查通过。
- 相关 renderer 测试通过。
- 键盘可以触达和操作新组件。
- icon-only button 有可理解名称。
- 菜单、popover、tooltip 的打开、关闭、ESC 和外部点击行为符合预期。
- 前端视觉变化符合对应设计文档和定稿图。

涉及桌面端 UI 的实质改动，还需要按 [`FRONTEND_VERIFICATION.md`](../../FRONTEND_VERIFICATION.md) 选择合适的浏览器或 Electron 验收路径。
