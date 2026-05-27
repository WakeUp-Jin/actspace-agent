# Kairos 右侧紧凑视图规范

本文档约束 Kairos 在聊天态右侧对象浏览面板中的紧凑展示。完整 Kairos 页面仍以 `Kairos监控页规范.md` 为准；本视图只负责"边聊天边看 Kairos 当前状态"。

## 定位

Kairos 右侧紧凑视图是一个伴随式状态卡，不是完整监控台。

- 完整页面：适合专门观察 Kairos，包含运行轨迹、执行列表、统计、最终回复和工具结果详情。
- 右侧紧凑视图：适合聊天时常驻，快速知道 Kairos 是否运行、最近回复是什么、最近轨迹如何。

右侧视图不做工具调试，不展示原始 JSON，不提供执行列表点击详情。需要看工具输入/输出时，进入完整 Kairos 页面。

## 数据原则

后端只保留一条 Kairos 数据流：

```txt
KairosController eventSink
  -> short-term jsonl
  -> ring buffer
  -> kairos:event / kairos:state
  -> useKairos()
  -> aggregateKairosEvents(events)
```

完整页面和右侧紧凑视图都消费同一个 `useKairos()` 和同一个 `aggregateKairosEvents()` 结果。不要新增 Kairos compact 专属 IPC，也不要让右侧面板自己解析 short-term jsonl。

第一版可以让 `KairosPage` 和 `KairosRightPanelView` 分别调用 `useKairos()`。如果未来出现"主区打开 Kairos 页面，同时右侧也显示 Kairos compact"或订阅重复导致性能问题，再引入 `KairosProvider` 把订阅提升到工作台层。

## 组件边界

目标是共享派生逻辑和小型展示组件，不共享完整页面布局。

建议结构：

```txt
packages/desktop/src/renderer/state/useKairos.ts
packages/desktop/src/renderer/state/kairosSelectors.ts

packages/desktop/src/renderer/pages/KairosPage.tsx
packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx
```

`kairosSelectors.ts` 负责可复用的纯函数：

- `getLatestKairosReply(events, rows)`：返回最近最终回复正文和时间。
- `getKairosDisplayRows(rows, opts)`：排序、截断、过滤为展示 rows。
- `getKairosStatusLabel(state, now)`：把 runtime state 转成 `Sleeping · 4m36s` 这类文案。
- `getKairosCompactMetrics(state, rows)`：如需要，返回少量计数；右侧第一版可以不用。
- `formatKairosTime()` / `formatKairosDuration()` / `kindLabel()`：避免两个页面各自复制格式化规则。

`KairosPage.tsx` 继续承载完整监控页的大布局：header、运行轨迹、执行列表、统计、最终回复/工具结果详情。

`KairosRightPanelView.tsx` 只承载右侧窄布局：header、最终回复、轨迹列表。它不保存选中行状态，不维护工具详情 tab。

## 右侧面板接入

右侧面板的 tab 与 `README.md` / `Session diff` 同级：

```txt
[ README.md ] [ Session diff ] [ Kairos ]
```

入口可以来自右侧视图列表或工作台操作按钮。触发行为应是：

```txt
openRightPanel()
setRightPanelTab("kairos")
```

不要把主工作区切换到 `view === "kairos"`；那是完整页面入口。右侧 compact 的使用场景是聊天不中断。

## 布局

右侧面板宽度约 320-640px，默认约 390px。紧凑视图采用纵向三段：

```txt
+-------------------------------+
| Kairos   Sleeping · 4m36s      |
| [暂停] [唤醒] [重置]           |
+-------------------------------+
| 最终回复                       |
| 环境无变化。继续待命。          |
+-------------------------------+
| 轨迹列表                       |
| 02:03 睡眠 running 15m00s      |
| Sleep 900s (after_tick)        |
| 02:03 回复 success             |
| 环境无变化。继续待命。          |
| ...                            |
+-------------------------------+
```

### 顶部状态区

- 左侧显示 `Kairos`。
- 紧跟状态胶囊，例如 `Sleeping · 4m36s`、`Ticking`、`Stopped`、`Cooldown`。
- 操作按钮保留三个：`暂停/开启`、`立即唤醒`、`重置今日`。
- 按钮使用图标 + 短文案。宽度不足时可以只保留图标，tooltip 补充完整含义。
- 顶部不展示 workspace、session、统计卡片或运行轨迹 legend。

### 最终回复区

- 只展示最终回复，不展示工具结果 tab。
- 标题为 `最终回复`，右侧弱文本显示 `最近一次回复` 或具体时间。
- 正文展示最近 `assistant_message` / `assistant_reply` 内容。
- 空态：`暂无最终回复`。
- 正文允许多行，超长时区块内部滚动或做高度上限，不挤压轨迹列表到不可见。

### 轨迹列表区

右侧视图不复用完整页面五列表格，而是使用 compact row。

每行建议结构：

```txt
02:03:51  睡眠      running   15m00s
Sleep 900s (after_tick)
```

规则：

- 默认展示最近 12-20 条，由容器高度决定滚动。
- 行不可点击，不选中，不打开详情。
- 类型、状态、摘要、耗时都来自 `KairosEventRow`。
- `tool` 行只展示摘要，不展示输入/输出。
- `reply` 行可展示回复摘要，但完整正文只在最终回复区显示。
- `failed` / `error` 行用状态 badge 或左侧细线强调，不使用大面积红色背景。
- 不分页。右侧 compact 是实时状态视图，不是完整历史浏览器。

## 与完整 Kairos 页的差异

| 能力 | 完整 Kairos 页 | 右侧紧凑视图 |
|---|---|---|
| 数据源 | `useKairos()` | `useKairos()` |
| 派生 rows | `aggregateKairosEvents()` | `aggregateKairosEvents()` |
| Header 控制 | 有 | 有，紧凑化 |
| 运行轨迹 timeline | 有 | 无；改为轨迹列表 |
| 执行列表 | 有，宽表，可点击 | 有，compact row，不可点击 |
| 最终回复 | 有 | 有，核心区域 |
| 工具结果详情 | 有 | 无 |
| 统计区 | 有 | 第一版不做 |
| 配置 / Briefs / Notes | 不恢复 | 不做 |

## 状态与交互

- 未暴露 `window.kairos`：显示 `Kairos 桥未就绪` 的紧凑空态，不让整个右侧面板崩。
- 未启用 Kairos：Header 显示 `Stopped`，主按钮为 `开启`，最终回复和轨迹列表显示空态。
- 正在 sleep：状态胶囊显示倒计时，倒计时由 renderer 本地 interval 刷新，不要求后端每秒推 state。
- 正在 ticking：状态胶囊显示 `Ticking`，`立即唤醒` 禁用。
- 操作失败：在右侧视图顶部或按钮附近显示一行错误文本，复用 `useKairos().error`。

## 视觉要求

- 右侧视图遵循对象浏览面板气质：密度高、边界清楚、背景克制。
- 不使用卡片套卡片。三段可以是自然分区或薄边框 section。
- 字号比完整页更紧：标题用中等尺寸，列表行内容优先保证不换行爆版。
- 状态 badge 使用已有 Kairos 颜色语义：success 绿、running 蓝、failed/error 红、sleep 中性色或黄。
- 文本必须适配 320px 最小宽度。按钮拥挤时优先图标化，而不是让标题和状态折成多行。

## 验收要点

- 打开聊天右侧面板并切到 Kairos tab，不会切走主聊天区。
- 右侧 Kairos 使用同一 `useKairos` 数据流，代码中没有新增 compact 专属 IPC。
- 右侧只展示 Header、最终回复、轨迹列表三段。
- 轨迹列表不可点击，不维护 selected row，不展示工具结果详情。
- 320px 宽度下文本和按钮不重叠。
- 完整 Kairos 页仍保留工具结果详情和宽表，不被 compact 需求降级。
