# Kairos 上下文 Sheet 规范

> 本文是 Kairos 监控页"上下文"按钮及其右侧 Sheet 的前端事实来源。Kairos 自治模式、prompt-assembler、短期记忆和工具系统的长期事实来源仍以 `docs/design-docs/agent-core/kairos-autonomous-mode.md` 为准；本文只约束 renderer 的入口按钮、Sheet 行为、信息架构、IPC 契约和验收点。

## 当前状态

- 状态：设计稿（2026-05-28）。代码尚未落地。
- 适用范围：`packages/desktop` 的 renderer + main IPC，`packages/agent-core/src/kairos/controller.ts` 暴露快照方法，`packages/shared/src/kairos-contracts.ts` 扩展契约。
- 关联文档：
  - `docs/design-docs/frontend-ui/Kairos监控页规范.md`（监控页母规范；按钮入口位置写在那里）。
  - `docs/design-docs/agent-core/kairos-autonomous-mode.md`（system prompt 组装、上下文 6 段构成、短期记忆与工具集来源）。

## 设计动机

Kairos 现在是黑盒：用户能看到运行轨迹、事件列表和最终回复，但**看不到 Kairos 自己在每次 tick 真正"看到"了什么**——具体的 system prompt 段落、注入的会话历史、当前可用工具。

让这份"模型视角的上下文"可被一键查看，可以：

- 排障：用户怀疑 Kairos 行为奇怪时，第一时间检查 prompt 是否被配置 / rule.md 污染。
- 调优：写 `rule.md` / `paths.json` / `briefs/tasks/*.md` 时，能立刻在 Sheet 里验证 prompt 段落是否符合预期。
- 教学：第一次接触 Kairos 的用户，可以快速理解"它是个怎样的 Agent"——它的 system prompt + 短期记忆 + 工具集合就是它的"人格"。

## 设计目标

- 一个按钮直达，零步骤理解 Kairos 当前上下文全貌。
- Sheet 默认折叠次要段落（历史 / 工具），打开就先看到系统提示词。
- 不引入新依赖（不安装 Radix / shadcn）；自研轻量 Sheet 组件，对齐 shadcn `Sheet` 视觉与行为。
- 数据按需拉取，不走推送。Sheet 关闭后不保留内存数据。
- 与"重置今日"等控制操作语义清晰区分：上下文是只读查看，永远不会改 Kairos 状态。

## 非目标（v1）

- 不做"编辑系统提示词"。用户想改 prompt 走改 `rule.md` / `paths.json` / `preferences.json` 的常规配置路径，Sheet 只展示组装结果。
- 不展示 thinking / usage 等运行时事件——这些在监控页主体 UI 已经覆盖。
- 不做"对话回放 / 复跑"按钮——Sheet 只解释当下状态，不承担控制操作。
- 不展示 `parameters.required` 校验细节、不展示工具实现源代码；只展示 JSON Schema 摘要。
- 不为非 Kairos 页面提供"主 Agent 上下文 Sheet"。主 Agent 已有右侧 Context popup（见 `聊天输入框规范.md`），二者不强行对齐。
- 不做 diff/历史对比（v1 不缓存上一次快照）。

## 入口按钮

### 位置

放在 `KairosHeader` 的右侧按钮组里。从左到右顺序固定为：

```
[开启 / 暂停]   [立即唤醒]   [上下文]   [重置今日]
```

把"上下文"放在"重置今日"**之前**，符合"先查看、后破坏"的从左到右心智：上下文是只读快照，重置今日是会清 ring buffer / 切 jsonl segment 的破坏性操作。

### 视觉

- 文案：`上下文`（与 `重置今日`、`立即唤醒` 平级）。
- icon：`FileText`（来自 `lucide-react`）。
- 样式：复用监控页现有 `kairosButtonClass`（次级按钮，灰边白底，hover 浅灰），不是 primary。
- 永远 enabled，**与 `state.enabled` 无关**——即使 Kairos 是 stopped，用户仍可查看"如果现在启动，会看到的上下文"。仅在 `bridgeAvailable === false`（mock / 非 Electron）时 disabled，并 tooltip 提示 `Kairos 桥未就绪`。

### a11y

- `aria-haspopup="dialog"`、`aria-expanded`（绑定 Sheet open 状态）、`aria-controls`（指向 Sheet 容器 id）。
- 键盘：`Enter` / `Space` 打开 Sheet；按钮聚焦态遵循全局 focus ring。
- 打开 Sheet 后，关闭时焦点必须回到此按钮。

## Sheet 组件规范

自研轻量级 Sheet 组件，落在 `packages/desktop/src/renderer/components/ui/Sheet.tsx`，对齐 shadcn `Sheet` 视觉。

### 结构（DOM）

```
<Portal target={document.body}>
  <SheetOverlay onClick={close} data-state={open|closed} />
  <SheetPanel role="dialog" aria-modal="true" aria-labelledby data-state>
    <SheetHeader>
      <SheetTitle id />
      <SheetDescription />
      <SheetActions>{slot 提供刷新等}<CloseButton /></SheetActions>
    </SheetHeader>
    <SheetBody>{children}</SheetBody>
  </SheetPanel>
</Portal>
```

### 尺寸与位置

- 永远从屏幕**右侧**滑入。本期不支持 `side="left|top|bottom"`（保留 prop 占位以便后续扩展）。
- Panel：`fixed top-0 right-0 h-screen w-[min(520px,92vw)]`，背景 `bg-surface`，左侧 `border-l border-[#e6e8ef]`，`shadow-[0_8px_30px_rgba(15,23,42,0.08)]`。
- Overlay：`fixed inset-0 bg-black/35 backdrop-blur-[1px]`。
- z-index 高于 `WindowChromeBar` 的 fixed strip，避免被 chrome 覆盖。

### 动效

- 打开：`translate-x-full → translate-x-0`，200ms `ease-out`；Overlay `opacity-0 → 100`，160ms。
- 关闭：反向，180ms。
- 用 Tailwind `data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full transition-transform`。
- `prefers-reduced-motion: reduce` 时改为瞬时切换。

### 关闭方式

- `Esc` 键关闭。
- 点击 Overlay 关闭。
- 顶部右上 `X` 关闭按钮（24×24，`lucide` 的 `X` 图标）。
- 程序化 `onOpenChange(false)`。

### 焦点管理

- 打开时：保存当前 activeElement，把焦点设到 Panel 第一个可聚焦元素（关闭按钮）。
- Tab / Shift+Tab：在 Panel 内循环（focus trap）。
- 关闭时：把焦点还给打开时保存的元素（即"上下文"按钮）。
- 实现：用一个 `useFocusTrap(panelRef, open)` 自定义 hook，列举 `'a[href], button, input, textarea, [tabindex]:not([tabindex="-1"])'` 作为可聚焦元素集合。

### 滚动锁定

- 打开时：`document.body.style.overflow = "hidden"`，记下原值，关闭时还原。
- 多个 Sheet 同时打开（非当前场景，但保留）：用 ref 计数避免错误恢复。

### 其它约束

- `role="dialog"` + `aria-modal="true"`；`aria-labelledby` 指向 SheetTitle id。
- Panel 容器 `data-testid="kairos-context-sheet"`，便于 vitest 定位。
- 不引入 Radix；不引入 `react-focus-lock`；不引入 `@react-aria` 子包。一切用原生 React + Tailwind 实现，控制依赖体积。

## KairosContextSheet 信息架构

Sheet 内部分为四段，由上至下：

```
┌──────────────────────────────────────────────┐
│ Header (固定高)                              │
│   标题：上下文                                │
│   描述：Kairos 当前 tick 会看到的提示词与历史 │
│   动作：[⟳ 刷新] [✕ 关闭]                    │
├──────────────────────────────────────────────┤
│ Body (单一纵向滚动容器)                       │
│                                              │
│  ① 概览（不可折叠，紧凑信息卡）              │
│     生成时间 · 模型 · 当前阶段 · token 估算   │
│                                              │
│  ② 系统提示词（可折叠，默认展开）            │
│     [复制] [展开全部 / 折叠预览]              │
│     <pre> 代码块展示组装后的完整 prompt      │
│                                              │
│  ③ 会话历史（可折叠，默认折叠）              │
│     ├─ 历史摘要（summarySegments）           │
│     └─ messages 列表（role + content 截断）  │
│                                              │
│  ④ 工具列表（可折叠，默认折叠）              │
│     扁平列表 · 单行可点击展开 parameters     │
│                                              │
└──────────────────────────────────────────────┘
```

### ① 概览段

紧凑信息条，单行展示 4 个键值对：

| 字段 | 来源 |
|---|---|
| `生成时间` | snapshot.generatedAt（ISO，UI 显示 `HH:mm:ss`） |
| `模型` | snapshot.modelId ?? "跟随主 Agent" |
| `当前阶段` | snapshot.phase（`work` / `quiet` / `weekend` / `off`） |
| `Prompt token` | snapshot.systemPromptTokens（基于 1 token ≈ 3 字符估算） |

样式：`grid grid-cols-2 sm:grid-cols-4`，每格 label 小灰字 + value 中粗体。

### ② 系统提示词段

- 标题：`系统提示词`，右侧次级动作：`[复制]`、`[展开全部 / 折叠预览]`。
- 默认预览：显示前 800 字符 + `…`，下方"展开全部"按钮可见。
- 全文：`<pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-[1.7]">` 容器，内层只展示纯文本（不再拆段渲染）。
- 复制：`navigator.clipboard.writeText(snapshot.systemPrompt)`，成功后按钮文案 2 秒切换为 `已复制`，再回退。
- 不在 v1 做 syntax highlight；不在 v1 拆 6 段渲染（[1]核心指令 / [2]时空 / [3]配置提示 / [4]rule.md / [5]观测 / [6]历史摘要）——保持"模型看到的就是用户看到的"的高保真。

### ③ 会话历史段（短期记忆）

历史源选定为 **`KairosShortTermMemoryContext.load()` 的 messages**，即"真正会被回放给 LLM 的内容"。**不**展示 ring buffer 的 SessionEvent（那个是监控页主体的领域）。

- 子段 1：**历史摘要**
  - 来源：`shortTermResult.summarySegments`（year/month/week summary 文件内容）。
  - UI：每个 segment 一个折叠卡，标题为 `segment.label`，正文 `whitespace-pre-wrap`。
  - 空状态：`暂无历史摘要——仍在收集近期 tick 数据中`（与 prompt 一致）。
- 子段 2：**最近 messages**
  - 来源：`shortTermResult.messages`（短期记忆原文，按 token 预算从新到旧加载，前端按时间从新到旧渲染）。
  - 每条渲染：
    - 顶部一行：`role badge`（user / assistant / tool）+ 可选 `source`（如 `kairos_tick`）+ 相对时间（`HH:mm:ss`，无 timestamp 时省略）。
    - 正文：`whitespace-pre-wrap` 截断到 600 字符，超出折叠为"展开本条"。
    - role badge 配色：user 蓝、assistant 绿、tool 灰、其他默认灰。
  - 默认只渲染最近 20 条；底部"加载更早 20 条"按钮自客户端切片，不再发 IPC。

### ④ 工具列表段

扁平列表，**不分组**，右侧角标区分来源（`Kairos` / `共享`）。

- 每行：
  ```
  <Icon> 工具名     <SourceBadge>
                    description 单行截断
  ```
- 点击行 → inline 展开 `parameters` schema：
  - 用 `<dl>` 展示一级属性：`属性名 (type, required?) — description`。
  - 嵌套 object：缩进一层展示子属性，不递归深层（避免渲染爆炸）；超过 2 级就显示 `…` 并提供"查看完整 schema"链接（弹一个内嵌折叠 JSON）。
  - JSON 输出用 `JSON.stringify(schema, null, 2)`，`<pre>` 块滚动展示。
- 角标视觉：
  - `Kairos`：紫色软底（`bg-[#efeaff] text-[#5a3ec9]`）。
  - `共享`：浅蓝软底（`bg-[#eaf2ff] text-[#1f57b3]`），与监控页其他次级 badge 一致。
- 排序：`Kairos` 来源优先排前（因为目前只有 `sleep`，体感"主角先出场"），其余按工具名字典序。

## 数据源与契约

### Snapshot 类型（`packages/shared/src/kairos-contracts.ts` 扩展）

```ts
export type KairosContextPhase = "work" | "quiet" | "weekend" | "off";
export type KairosContextMessageRole = "user" | "assistant" | "tool" | "system";

export interface KairosContextHistorySegment {
  label: string;
  text: string;
}

export interface KairosContextMessage {
  role: KairosContextMessageRole;
  source?: string;
  content: string;
  timestamp?: string;
}

export interface KairosContextTool {
  name: string;
  description: string;
  source: "kairos" | "shared";
  parametersSchema: unknown;
}

export interface KairosContextSnapshot {
  generatedAt: string;
  modelId: string | null;
  phase: KairosContextPhase;
  systemPrompt: string;
  systemPromptTokens: number;
  historySummary: KairosContextHistorySegment[];
  historyMessages: KairosContextMessage[];
  tools: KairosContextTool[];
}
```

`KairosBridgeApi` 追加方法：

```ts
interface KairosBridgeApi {
  // ... existing
  getContextSnapshot(): Promise<KairosContextSnapshot>;
}
```

### IPC 通道

| Channel | 方向 | Payload |
|---|---|---|
| `kairos:get-context-snapshot` | renderer ↔ main | `void` → `KairosContextSnapshot` |

- 不需要 state / event 推送通道——Sheet 是按需拉取，关闭即释放。
- 多次快速点击 `刷新`：renderer 端用 `loading` 标志位串行化，main 端不做并发抑制。

### Controller 暴露

`KairosController` 接口追加（`agent-core/src/kairos/controller.ts`）：

```ts
interface KairosController {
  // ... existing
  getContextSnapshot(): Promise<KairosContextSnapshot>;
}
```

实现策略：

- 复用 runner 的依赖三件套：`observeRefresh()`、`shortTerm.load()`、`activeBriefsCount()`。
- 调一次 `assembleSystemPrompt(...)` 得到完整 prompt 字符串。
- token 估算复用 `agent-core/context/token-estimator`（或简单 `Math.ceil(text.length / 3)` 兜底）。
- 工具列表：`toolManager.getAll()`，每条转成 `KairosContextTool`：
  - `source`：通过工具名是否在 `registerKairosTools` 注册的集合内来区分（v1 只有 `sleep` 是 kairos）。
  - `parametersSchema`：直接取 `tool.spec.parameters`（已是 JSON Schema）。
- **不真正跑 LLM**。整个调用纯 IO + 文本拼接，可在用户点按钮时同步执行。
- 错误：若 `observeRefresh` 或 `shortTerm.load` 抛错，整个方法 reject；IPC handler 把错误透传给 renderer，Sheet 渲染顶部红色 banner。

### Renderer state 接入

在 `packages/desktop/src/renderer/state/useKairos.ts` 追加：

```ts
interface UseKairosResult {
  // ... existing
  getContextSnapshot(): Promise<KairosContextSnapshot>;
}
```

不缓存到 hook state，Sheet 自己用本地 `useState<KairosContextSnapshot | null>(null)` 管理（关闭即 GC）。

## 状态与边界

| 状态 | UI 表现 |
|---|---|
| Sheet 未打开 | 不渲染 Portal；按钮 `aria-expanded=false` |
| 首次打开（拉取中） | 渲染 Sheet 框架 + 各 section 骨架占位 |
| 拉取成功 | 渲染完整内容 |
| 拉取失败 | 顶部红色 banner：`无法加载上下文：<msg>` + `重试` 按钮 |
| 桥不可用 | 入口按钮 disabled + tooltip；点击不弹 Sheet |
| Kairos stopped（未启用） | 正常拉取并展示 snapshot；history messages 可能为空 |
| reset_today 刚发生 | 下次打开拉取会自动反映清空后的状态 |

## 视觉细节

- 配色继承监控页：primary `#2f6fff`、surface `#ffffff`、灰边 `#e6e8ef`、深字 `#1a1d24`、二级字 `#6c7281`。
- Section 标题：`text-[13px] font-semibold uppercase tracking-[0.04em] text-[#6c7281]`。
- 折叠 chevron：`ChevronDown` lucide icon，展开旋转 180°，过渡 150ms。
- 代码块：`bg-[#f8fafc] border border-[#e6e8ef] rounded-act-md font-mono text-[12.5px] leading-[1.7] px-3 py-2.5`。
- 复制成功 toast：暂不引入全局 toast；按钮文案临时切换为 `已复制`，2 秒后恢复。

## 测试策略

### 单测（vitest + jsdom）

1. `components/ui/Sheet.test.tsx`：
   - 打开 / 关闭 transition；`data-state` 属性切换。
   - Esc 关闭；Overlay 点击关闭；关闭按钮关闭。
   - focus trap：Tab 在最后一个元素上回到第一个；Shift+Tab 反向。
   - 关闭时焦点归还。
2. `components/kairos/KairosContextSheet.test.tsx`：
   - mock `getContextSnapshot()` 返回完整 fixture，验证 ①②③④ 段渲染。
   - 折叠状态切换；展开全部按钮切换到全文。
   - 复制按钮调 `navigator.clipboard.writeText` 并切换 `已复制`。
   - 工具行点击展开 schema；嵌套 object 超过 2 级显示"查看完整 schema"。
   - 错误状态：reject 后渲染 banner + 重试。
3. `main/kairos-ipc-internals.test.ts`（已有文件追加）：
   - `kairos:get-context-snapshot` handler 调 controller 一次并返回；controller throw 时透传错误。
4. `agent-core/src/kairos/test/controller.test.ts`（已有文件追加）：
   - `getContextSnapshot()` 在已启动 / 未启动两种状态下都能稳定返回；prompt 中包含 rule.md 内容。
   - 工具来源标记正确：`sleep` 是 `kairos`，其它共享工具是 `shared`。

### 视觉验收

- 浏览器 mock 模式：注入 mock bridge 返回 fixture，截图比对四种 section 状态。
- Electron `pnpm dev:log`：在真实 Kairos 上启用 mock LLM，跑一次 tick 后打开 Sheet，验证：
  - prompt 中能看到 rule.md 全文 ([4] 段)。
  - history messages 末条是刚才那次 tick 的注入。
  - tools 段包含 sleep + read_file / list_directory / ... 至少 5 个工具。

## 维护规则

- 入口按钮位置 / Sheet 行为变更，必须更新本文档。
- `KairosContextSnapshot` 字段增减必须在 `packages/shared/src/kairos-contracts.ts` 同步，并在本文档"数据源与契约"小节增减条目。
- Sheet 组件本身（`components/ui/Sheet.tsx`）若后续被复用到其它页面（例如设置态、Lab 页），写一份独立的"基础组件封装规范"小节，把通用 props（`side`、`size`）补全后再迁出。
- 监控页母规范 `Kairos监控页规范.md` 只引用本文一句，不复述详情。
