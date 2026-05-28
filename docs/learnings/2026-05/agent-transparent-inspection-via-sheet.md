# 用一次性 Snapshot 让 Agent 可观测：按需拉取 + Sheet 临时展示模式

> 关联 history：`docs/histories/2026-05/20260528-1645-kairos-context-sheet.md`

Kairos 监控页加了"上下文"按钮，点开是一个右侧 Sheet，展示当前 tick LLM 真实看到的 system prompt / 短期记忆 / 工具列表。落地过程中沉淀了三件值得记的事：

1. 一个**自治 agent 透明化**的可迁移模式（按需 snapshot + Sheet 临时展示 + 关闭即丢弃）。
2. 一个**自研轻量 Sheet 组件**在不引 Radix / shadcn 时该如何取舍。
3. **jsdom + userEvent** 在 focus trap 和 clipboard 测试里的两个非显而易见的坑。

第一条是这次最大的收益，后两条是写的时候踩坑学到的细节。

---

## 1. Agent 透明化模式：按需 snapshot + 临时视图

### 痛点

Agent 在后台跑，开发者从外面看到的是：

- 事件流（user message → assistant message → tool calls → tool results）。
- 输出（最终回复 / 副作用文件 / 状态指标）。

但出问题时关键问题往往是 **"LLM 到底看到了什么？"**：

- 改了 `rule.md` 但没生效？是没读到，还是 prompt 没拼上？
- 上一轮 tick 失败是因为短期记忆里残留了脏数据？
- 工具列表里有没有它"应该看到但没看到"的工具？

事件流回答不了这些。你需要的是 **"如果现在 tick，模型会看到什么"** 的一份冻结快照。

### 解法

把这件事建模成一个**按需拉取的 snapshot**，而不是一条订阅流：

```
                       ┌────────────────────────────────┐
                       │           Controller            │
                       │  ┌───────────────────────────┐  │
        ipc:get-context│  │ getContextSnapshot()      │  │
   <───────────────────┼──┤  - observeRefresh()       │  │
                       │  │  - shortTerm.load()       │  │
                       │  │  - activeBriefsCount()    │  │
                       │  │  - assembleSystemPrompt() │  │
                       │  └───────────────────────────┘  │
                       └────────────────────────────────┘
                                    ▲
                                    │ 复用 runner 同款依赖
                                    │（保证 snapshot === 下次 tick 看到的）
                                    ▼
                       ┌────────────────────────────────┐
                       │            Runner               │
                       │  每次 tick 调 LLM 之前的拼装    │
                       └────────────────────────────────┘
```

关键设计点：

| 选择 | 取舍 |
| --- | --- |
| **按需拉取（pull）** vs 推送订阅（push） | snapshot 是低频用户行为（点按钮才看），不需要 push 占用 IPC 通道；renderer 关掉 Sheet 即丢弃，零状态污染。|
| **复用 runner 依赖**，不拷贝逻辑 | 把 runner 构造时的 `observeRefresh` / `activeBriefsCount` 闭包**外提**为顶层 fn，让两条路径用同一份；这是 "single source of truth" 的最务实写法——保证用户看到的 ≡ LLM 看到的。|
| **不真正调 LLM** | snapshot 只是组装 prompt + 收集 tools，不消耗 token；副作用为零，可以随便看。|
| **不持久化** | snapshot 不入 ring buffer、不写盘；它是**实时视图**，不是事件。和 SessionEvent 严格区分职责。|

### 抽出来的模式

> **Transparent Inspection via Ephemeral Snapshot**
>
> 任何"想让用户看 Agent 内部状态"的需求，先问三个问题：
>
> 1. 我能否把它建模成"如果现在执行一步，会看到什么"的纯函数？
> 2. 我能否复用真正执行路径上的依赖，而不是复制一份？
> 3. 我能否让它**没有持久化副作用**——用户关掉视图就消失？
>
> 三个 Yes，就走 snapshot + 临时视图，不要建第二条事件流。

适用场景远不止 Kairos：

- 主 Agent 的 "Show me the current context window"。
- 调度器的 "下次会取的下一个任务是谁"。
- 任何带阈值 / 状态机的系统的 "现在是哪个 phase / 为什么"。

### 反模式

什么时候**不**该用这个模式？

- 需要追溯历史（"上次 tick 时看到了什么"）→ 走事件流 + 重放，而不是 snapshot。
- 需要在外部系统订阅变化 → 走 push 通道，snapshot 是单点查询。
- snapshot 计算昂贵到一次点击会卡 UI（比如要访问几十个文件）→ 先把昂贵部分异步预算/缓存到 controller 里。

---

## 2. 不引 Radix 时的自研 Sheet：取舍清单

仓库当前没有 shadcn / Radix。为一个组件拉 `@radix-ui/react-dialog`（依赖 5+ 个包），不划算。所以自己写。

但是抽屉/Modal 这种组件**有很多容易遗漏的细节**，列在这里以后照抄：

### 必须实现

1. **Portal 到 `document.body`**：避开父容器的 `overflow: hidden` / `transform` / `z-index` 副作用。
2. **Overlay 点击关闭** + **Esc 关闭** + **关闭按钮**：三种主流退出路径，少一个都会让用户感觉"卡住"。
3. **Focus trap**：Tab 不能逃出抽屉边界；Shift+Tab 回到第一个会跳到最后一个。
4. **焦点归还**：关闭后焦点回到打开抽屉的那个触发器（用户键盘流不会断）。
5. **滚动锁定**：抽屉打开时 `body.style.overflow = "hidden"`，关闭后**恢复原值**（不是写死 `"auto"`，可能用户原本就 `"hidden"`）。
6. **滚动锁引用计数**：多个 Sheet 嵌套打开时，只有最外层那个修改 body 样式，最后一个关闭再恢复。
7. **`role="dialog"` + `aria-modal="true"` + `aria-labelledby`**：屏幕阅读器才认。
8. **`prefers-reduced-motion` 支持**：用 Tailwind `motion-reduce:transition-none` 一行搞定。

### 不必须

- **Inert background**：浏览器原生 `inert` 属性还不够普及；focus trap 已经覆盖键盘场景，鼠标点 overlay 我们直接关闭抽屉，不会进背景。
- **多抽屉栈**：当前没场景；真要支持就在 ref 里维护一个 Sheet stack，Esc 只关栈顶。

### 代码骨架

```tsx
export function Sheet({ open, onOpenChange, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    acquireScrollLock();
    return () => {
      releaseScrollLock();
      previouslyFocused.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") return onOpenChange(false);
      if (ev.key !== "Tab" || !panelRef.current) return;
      // ...focus trap...
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      <div onClick={() => onOpenChange(false)} className="absolute inset-0 bg-black/35" />
      <div ref={panelRef} role="dialog" aria-modal="true" className="absolute top-0 right-0 ...">
        {/* header + body */}
      </div>
    </div>,
    document.body,
  );
}
```

完整版见 `packages/desktop/src/renderer/components/ui/Sheet.tsx`，大约 150 行。

---

## 3. 测试 jsdom + userEvent 的两个坑

写 Sheet 单测时撞到两个非显而易见的问题：

### 坑 A：jsdom 没有 layout，`offsetParent` 永远是 `null`

最初的 focus trap 实现是：

```ts
const focusables = Array.from(
  panel.querySelectorAll<HTMLElement>(focusableSelector),
).filter((el) => el.offsetParent !== null);  // ← 想过滤 hidden 元素
```

意图是合理的：不该把 `display: none` / `visibility: hidden` 的元素算作 Tab 目标。

但 **jsdom 不计算布局**：所有元素的 `offsetParent` 都是 `null`，因此**所有可聚焦元素都被错误过滤掉**，focus trap 落到 fallback 路径（焦点直接给 panel），单测报错"`activeElement` 是 dialog 而不是预期的 close 按钮"。

**解法**：去掉这个过滤。真实浏览器中 hidden 元素调 `.focus()` 是 no-op，浏览器会自动跳到下一个；我们不需要在 JS 层提前剔除。**`offsetParent` 在测试环境下不可信，要么用 `getComputedStyle(el).display !== 'none'` + visibility 检查，要么直接交给浏览器。**

类似坑：`el.offsetWidth` / `el.offsetHeight` / `getBoundingClientRect()` 在 jsdom 里全是 0；任何依赖几何尺寸的逻辑都要警惕。

### 坑 B：`userEvent.setup()` 注入自己的 clipboard mock，会覆盖你先注入的

这种测试代码看起来合理：

```ts
it("copies the system prompt", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  const user = userEvent.setup();   // ← 在 defineProperty 之后
  // ...click 复制按钮...
  expect(writeText).toHaveBeenCalled();   // 失败：spy 没被调
});
```

`userEvent.setup()` 在 v14+ 会**主动注入**一个自己的 `navigator.clipboard` mock（用来支撑 `user.copy()` / `user.paste()` API）。当你的 defineProperty 先于 setup 调用，setup 会把你的 spy **盖掉**——真正被组件调用的是 user-event 的 mock，不是你的。

**解法**：把 `userEvent.setup()` 放在 defineProperty **之前**：

```ts
const user = userEvent.setup();   // 让它先注入它的 mock
const writeText = vi.fn();
Object.defineProperty(navigator, "clipboard", {
  value: { writeText },
  configurable: true,                // 必须 configurable，否则后续无法恢复
});
// ...
```

记住 finally 里恢复 `originalClipboard`，否则会污染后续测试。

---

## 4. 自检问题

1. 你要新加一个"看 Agent 内部状态"的功能。怎么判断它适合 snapshot 模式而不是事件流？
2. 自研 Sheet 时，滚动锁定为什么必须用引用计数？写一个反例：什么场景下不用引用计数会出 bug？
3. focus trap 在 jsdom 下不能用 `offsetParent` 判断可见性。换到 happy-dom 会一样吗？没有 layout 引擎的测试 DOM 还有哪些常见地雷？

---

## 5. 取舍速查

| 场景 | 走 snapshot | 走事件流 | 走 push 订阅 |
| --- | --- | --- | --- |
| 看"现在"的瞬时状态 | ✅ | ❌ | ⚠️ 过度设计 |
| 看"过去发生过什么" | ❌ | ✅ | ⚠️ |
| 在外部系统响应变化 | ❌ | ⚠️ | ✅ |
| 调试 / inspect | ✅（首选） | ⚠️ 也行 | ❌ |
| 大型 / 昂贵的数据 | ⚠️ 看能否分页 | ✅ 流式 | ⚠️ |
