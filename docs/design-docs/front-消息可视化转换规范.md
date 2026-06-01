# 消息可视化转换规范（Markdown → HTML）

## 定位

在一条助手回复上提供"一键可视化"：把这条回复的 **Markdown 内容，用主模型转换成 HTML**，然后在右侧面板的一个 Tab 里渲染。动机是 **HTML 的可视化表达比纯 Markdown 更直观**（卡片、布局、配色、图示）。

它把三条已有主线串起来：消息操作条入口（`ConversationView` 的 `TurnActions`）→ 主模型转换（agent-core LLM）→ 右侧 HTML 渲染（`HTML渲染与沙箱安全规范.md`）。

> 关键约束（用户强调）：**转换是一次真实模型调用，成本高，绝不能每次点击都重算。** 第一次点击才生成并持久化缓存，之后一律读缓存渲染。

## 入口与图标

- 在 `TurnActions` 的「⋯」按钮**左侧**新增一个按钮（与 ⋯ 同一操作锚 `TURN_ACTION_ANCHOR_CLASS` 行内）。
- 图标（2026-05-30 定稿）：`idle`/`error` 用 `Wand2`（魔法棒=AI 生成可视化），`generating` 用 `Loader2` 旋转，`ready` 用 `Eye`（查看已生成）；按钮带原生 `title` 悬浮文本提示，颜色随主题。
- 当前操作条挂在每个 turn 的最新助手回复上；若后续引入"每条消息独立操作条"，本按钮随其走。

## 按钮状态机

| 状态 | 条件 | 行为 / 视觉 |
| --- | --- | --- |
| `idle` | 无缓存 | 点击 → 进入 `generating` |
| `generating` | 转换进行中 | 按钮 loading（禁重复点击） |
| `ready` | 有缓存且 hash 命中 | 点击 → 直接在右侧打开/聚焦该 HTML Tab，**不调模型** |
| `error` | 上次转换失败 | 显示错误，可重试 |

- 已生成的回复，按钮呈"已可视化"态（如图标高亮）；提供"重新生成"入口（显式触发才重算）。

## 缓存设计（核心）

- **缓存单元**：按"被转换的内容"缓存，键 = `turnId`（或 messageId）+ `sourceHash`（回复 Markdown 的内容哈希）。
- **存储位置**：持久化进 **session 记录（jsonl）**，跨重载不丢、永不重复调用模型。建议在对应消息/turn 上挂一个工件字段，或独立 artifacts 存储：
  ```ts
  type MessageHtmlVisualization = {
    html: string;        // 生成的自包含 HTML
    sourceHash: string;  // 来源 Markdown 的 hash，用于失效判断
    model: string;       // 生成所用主模型
    generatedAt: string;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number; cost?: unknown };
  };
  ```
- **读路径**：点击 → 查缓存 → `sourceHash` 命中则直接渲染缓存 HTML（零模型调用）。
- **失效**：仅当 `sourceHash` 变化（消息被编辑/重答）或用户显式"重新生成"时才重算；否则永远命中缓存。
- **成本计入**：转换是真实模型调用，其 `usage` 计入使用统计（与普通 turn 同口径，见 `token-usage-and-context-state.md`）。

## 转换流程与数据流

1. renderer 点击按钮 → 调用新 IPC（例 `convertReplyToHtml({ turnId, content })`）。renderer **不直接调模型、不读写文件系统**。
2. main → agent-core LLM 服务用**主模型**做一次转换调用。
3. main 把结果（HTML + sourceHash + usage + 派生 title）写入会话 sidecar（`visualizations.json`）缓存，再返回给 renderer。
4. renderer 在右侧面板打开/聚焦该回复的 HTML Tab，渲染返回的 HTML。

**会话级列表（2026-05-30）**：另有 `visualize:list({ sessionId })` IPC，读同一 sidecar 返回当前会话的全部产物（按 createdAt 倒序，含派生 `title`），供右侧「Reply HTML」文件浏览器消费（见 `右侧面板与文件渲染规范.md`）。

## 转换提示词约束

- 让主模型输出**单个自包含 HTML 文档**：内联 CSS，尽量不外联（配合沙箱 CSP）；结构清晰、适合可视化阅读；不要内联会"窃取/外传"的脚本。
- 解析：若模型把 HTML 包在 ```html 围栏里，提取围栏内内容；只取一个文档。
- 失败兜底：解析不出有效 HTML 时回 `error`，不污染缓存。

## 安全

- 模型产出的 HTML 属**半可信**，**一律走 `HTML渲染与沙箱安全规范.md` 的渲染路径**：`<iframe srcDoc sandbox="allow-scripts">`、不加 `allow-same-origin`、CSP 注入。
- CSP 档位：默认 `relaxed`（允 https 静态资源，禁 `connect-src` 外传）；因为我们已提示自包含，必要时也可用 `strict`。
- 不因为"是自己模型生成的"就放宽沙箱。

## 右侧渲染

- 复用右侧面板 HTML Tab（`右侧面板与文件渲染规范.md` + `HTML渲染与沙箱安全规范.md`）。
- Tab 标题示例：`可视化 · <回复摘要前若干字>`；可与源回复关联，便于来回对照。
- 同样支持 Preview / 源码 切换（源码即生成的 HTML）。

## V1：简单 + 安全（依赖 Tab 底座 + HTML 渲染 V1）

- `TurnActions` ⋯ 左侧加可视化按钮 + 状态机。
- 新 IPC：主模型转换 MD→HTML。
- 缓存持久化到 session（键 = turnId + sourceHash），命中即读、不重算；提供"重新生成"。
- 右侧 HTML Tab 渲染（沙箱）+ usage 计入。

### V1 明确边界（不做）

- 不做流式渲染转换过程（先一次性返回）。
- 不做多风格/多版本生成、不做导出。
- 不把可视化结果做成消息流内联块（只在右侧面板）。

## V2：完整版（计划先写，**等用户指令再实现**）

> V2 默认不动工，需用户显式指令。

- 转换流式渲染（边生成边显示）。
- 风格预设 / 多版本对比 / 重新生成保留历史版本。
- 可视化结果导出（HTML / 图片，依赖 HTML V2 的导出能力）。
- 消息流内联"可视化"折叠块入口（不止右侧面板）。
- 针对超长回复的分段转换与拼接。

## 验收

- 首次点击：触发一次主模型调用，右侧出现渲染好的 HTML，usage 有记录。
- 再次点击同一回复：**不触发模型调用**，直接渲染缓存（可在 dev 日志/usage 确认无新增调用）。
- 重载应用后再点：仍读缓存、不重算（持久化生效）。
- 内容被改/重答后点击：`sourceHash` 不命中 → 重新生成。
- 渲染走沙箱：iframe 拿不到宿主特权；浅/深主题下按钮与 Tab 观感正确。

## 关联

- `HTML渲染与沙箱安全规范.md`：转换产物的渲染与安全闸。
- `右侧面板与文件渲染规范.md`：右侧 HTML Tab 外壳。
- `docs/design-docs/agent-token-usage-and-context-state.md`：转换调用的 usage 计入口径。
- `Markdown渲染规范.md`：源回复的 Markdown 呈现（与"转 HTML"是两种查看方式）。
- 执行计划：`docs/exec-plans/active/20260527-right-panel-views.md`。
