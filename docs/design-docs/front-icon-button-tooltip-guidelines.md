# 图标按钮 Tooltip 规范

## 定位

这份文档定义 `actspace` 桌面端 icon-only button 的文字说明、可访问性和迁移规则。

图标按钮适合节省空间，但不能只靠图标让用户猜。凡是没有可见文字的按钮，都必须有稳定的可访问名称；需要用户通过 hover / focus 理解用途的按钮，还应该使用统一的 `Tooltip`。

当前项目已在 renderer 基础组件层提供：

```txt
packages/desktop/src/renderer/components/ui/Tooltip.tsx
```

业务组件应优先消费这个 wrapper，不要继续新增手写 tooltip 或只依赖浏览器原生 `title`。

## 核心结论

- icon-only button 必须有 `aria-label`。
- icon-only button 默认应该有 `Tooltip`，除非它处在已有可见文字解释的组合控件中。
- `Tooltip` 是给视觉用户看的解释，`aria-label` 是给辅助技术和测试的控件名称，两者不能互相替代。
- 原生 `title` 只作为过渡手段；新增按钮不应只写 `title`。
- Tooltip 样式必须使用主题 token，不写死黑、白、hex 或非主题感知颜色。

## 适用范围

必须加 Tooltip 的情况：

- 按钮内容只有图标，例如 `+`、`...`、`X`、发送、刷新、折叠、Pin。
- 按钮含义会随状态变化，例如“发送 / 停止”“展开 / 收起”“开启 / 暂停”。
- 按钮处于禁用或忙碌态，但用户需要知道为什么不能点。
- 按钮在 hover 才显示，例如列表行里的 Pin、Archive、删除附件。
- 图标来自通用符号，但在本产品语境里含义不唯一，例如 `+` 可能是新建、添加附件、打开对象菜单。

可以不加 Tooltip 的情况：

- 按钮内已有清晰可见文字，例如“导出 .md”“复制全文”“重试”。
- 分段控件每个选项已有短文本，例如“预览 / 源码”。
- 普通列表行按钮本身显示对象标题，点击含义足够明确。
- 图标只是文字按钮的辅助装饰，并且 `aria-hidden="true"`。

## 标准写法

推荐结构：

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button type="button" aria-label="更多消息操作">
      <MoreHorizontal aria-hidden="true" />
    </button>
  </TooltipTrigger>
  <TooltipContent>更多操作</TooltipContent>
</Tooltip>
```

要求：

- `TooltipTrigger` 使用 `asChild`，让真实按钮仍然是交互元素。
- 图标设置 `aria-hidden="true"`，避免辅助技术重复读图标。
- `aria-label` 使用完整动作语义，tooltip 文案可以更短。
- 动态状态按钮的 `aria-label` 和 tooltip 文案必须同步变化。

## 文案规则

Tooltip 文案应该短、直给、像桌面应用命令，不写解释性长句。

推荐：

| 场景 | Tooltip 文案 |
| --- | --- |
| Composer `+` | 添加上下文、工具或附件 |
| 发送按钮 | 发送消息 |
| 停止按钮 | 停止 Agent |
| 消息三点 | 更多操作 |
| Bash 输出三点 | 更多 Bash 输出操作 |
| 关闭 tab | 关闭 `{tab.title}` |
| 刷新 | 刷新 |
| 正在刷新 | 正在刷新 |
| 禁用发送 | 输入消息后发送 |

避免：

- “点击这里...”这类冗余句式。
- 只重复图标名称，例如“加号”“三个点”。
- 用英文文案混在中文界面里，除非该区域整体就是英文命令语境。

## `title` 迁移规则

当前仓库里已有不少 icon-only button 使用原生 `title`。这些按钮可以工作，但体验不统一：

- 样式不可控。
- 延迟不可控。
- 不方便跟随主题。
- 键盘 focus 体验不稳定。
- 无法表达复杂禁用原因。

迁移规则：

1. 新增 icon-only button：直接使用 `Tooltip`，不要只写 `title`。
2. 改到某个已有 icon-only button：顺手把 `title` 迁到 `Tooltip`。
3. 批量迁移时：优先处理高频、含义不明显、hover 才出现、禁用态复杂的按钮。
4. 文本截断的标题、路径、文件名可以继续用 `title` 作为完整文本兜底，不属于 icon button tooltip 迁移范围。

## 禁用态与忙碌态

原生 `disabled` button 通常不会触发 pointer / focus 事件，因此 tooltip 也可能打不开。

如果忙碌或禁用状态仍然需要说明原因，优先使用：

```tsx
<button
  type="button"
  aria-disabled={busy}
  onClick={() => {
    if (busy) return;
    runAction();
  }}
>
  ...
</button>
```

适用场景：

- 生成中仍要展示“正在生成...”。
- 刷新中仍要展示“正在刷新...”。
- 发送按钮禁用时需要提示“输入消息后发送”。

不适用场景：

- 表单控件确实应该从 tab 顺序中移除。
- 原生 `disabled` 行为是业务安全边界的一部分。
- 用户不需要知道原因，且按钮旁边已有说明。

## 样式规则

Tooltip 视觉必须来自基础 wrapper，不在业务组件里重复写浮层外壳。

允许业务组件传入的通常只有：

- `side`
- `align`
- `sideOffset`
- 极少数布局相关 `className`

禁止：

- 在业务组件里手写新 tooltip 容器。
- 在 tooltip 上写 `bg-white`、`text-black`、`#fff`、`#000` 这类主题不感知颜色。
- 为单个业务场景复制一份 tooltip 样式。

如果基础 tooltip 的视觉不够用，先调整 `components/ui/Tooltip.tsx` 或新增基础层 variant，再让业务组件消费。

## 测试与验收

每次为 icon-only button 添加 Tooltip，至少验证：

- `aria-label` 能通过 `getByRole("button", { name })` 定位。
- hover 或 focus 后能出现 `role="tooltip"`。
- 浅色与深色主题下 tooltip 文字、背景、边框可读。
- 忙碌态 / 禁用态如果有说明，tooltip 仍然能触发。
- 图标不被辅助技术重复朗读。

前端改动收尾按 [`FRONTEND_VERIFICATION.md`](../FRONTEND_VERIFICATION.md) 选择浏览器 mock 或 Electron 真实验证。

## 当前迁移清单

### P0：高频且纯图标

- `packages/desktop/src/renderer/components/Composer.tsx`
  - Composer 左侧 `+`：添加上下文、工具或附件。
  - 发送 / 停止按钮：发送消息、停止 Agent、输入消息后发送。
  - 附件删除 `X`：移除 `{attachment.name}`。
- `packages/desktop/src/renderer/components/messages/BashRunBlock.tsx`
  - Bash 输出三点：更多 Bash 输出操作。
  - Bash 审批三点：更多审批操作。
- `packages/desktop/src/renderer/components/ContextPopup.tsx`
  - 关闭按钮：关闭上下文用量。
- `packages/desktop/src/renderer/components/kairos/KairosContextSheet.tsx`
  - 刷新上下文：刷新上下文 / 正在刷新上下文。

### P1：已有 `title`，应迁到统一 Tooltip

- `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
  - 左侧栏折叠 / 展开。
  - 搜索会话。
  - 右侧面板打开 / 关闭。
- `packages/desktop/src/renderer/components/Sidebar.tsx`
  - Pin / Unpin。
  - Archive session。
  - Sort workspaces。
  - Add workspace。
  - New chat in workspace。
- `packages/desktop/src/renderer/components/RightPanel.tsx`
  - 展开 / 收起文件树。
  - 关闭 `{tab.title}`。
  - 所有标签页。
- `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
  - 新建右侧对象。
- `packages/desktop/src/renderer/components/right-panel/ReplyHtmlRenderView.tsx`
  - 刷新文件列表。

### P2：低频或已有文字，但可视情况补充

- `packages/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
  - 数值控件重置、减小、增大。
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
  - 详情弹窗关闭按钮。
  - 成本详情关闭按钮。
- `packages/desktop/src/renderer/components/LabPage.tsx`
  - 弹窗关闭按钮。
  - 实验卡片更多操作按钮。
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
  - 分页上一页 / 下一页。
  - token / 成本折叠按钮。

## 后续建议

后续批量迁移时建议按组件分批：

1. Composer。
2. 消息区工具块。
3. Sidebar。
4. RightPanel。
5. Settings / Usage / Lab / Kairos 页面。

每批都补对应 renderer 测试，避免 tooltip 变成只能靠人工目测的细节。
