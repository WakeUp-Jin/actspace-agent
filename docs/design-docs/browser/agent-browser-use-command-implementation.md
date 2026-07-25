# Browser Use 命令实现设计

## 当前状态

本文档从 CDP 原语出发，定义 actspace-agent 全部 62 条浏览器命令的核心实现逻辑。Plan 5 已完成 62/62 Go canonical handlers、轻量 Locator runtime、事件状态、Agent 分类工具与真实 Chrome profile 验收。当前架构入口见 `docs/design-docs/browser/agent-browser-use-index.md`。

`abb tabs`、`abb user-tabs`、`abb open-tab` 等既有公共 CLI 仍保持稳定，但它们只是 Go 层 compatibility adapter：CLI 参数转换成 canonical category/action 后进入同一 command engine，再调用 Extension primitive。`ABB_LEGACY_BROWSER_FORWARDING` 只服务显式迁移诊断，不是这些 CLI 命令的运行前提，也不得用于恢复 Extension 高层业务逻辑。

重要：本文大量“Extension 实现”代码块和逐条「Plan 5 前盘点」来自首版逆向与原型阶段，仅保留为 CDP/Chrome API 调用链参考，不表示当前高层逻辑归 Extension，也不再是实现状态事实来源。当前状态以 Go registry 为准：Go command handler 编排后调用 Extension primitive RPC；页面 DOM 语义由 Go 管理的 ActSpace 自研 TypeScript Locator Runtime 提供。

与其他浏览器文档的关系：

- `docs/design-docs/browser/agent-browser-use-command-surface.md`：定义命令的**参数契约和行为语义**（是什么）。
- `docs/design-docs/browser/agent-browser-use-integration-design.md`：定义**架构分层和工具暴露**（怎么集成）。
- `docs/design-docs/browser/agent-browser-bridge-design.md`：定义**三层职责边界和 backend 分工**（架构边界）。
- 本文档：定义**每条命令的 CDP 调用链和实现编排**（怎么实现）。

## 设计思路

### 从 CDP 原语出发

Chrome DevTools Protocol 是所有浏览器操作的最底层。全部 62 条命令最终都归结为以下 CDP 原语：

| 人类行为 | CDP 原语 | 说明 |
|----------|----------|------|
| 看 | `Page.captureScreenshot` | 截取页面像素 |
| 看 | `Page.getLayoutMetrics` | 获取视口尺寸和 DPR |
| 点击 | `Input.dispatchMouseEvent` | mousePressed / mouseReleased / mouseMoved |
| 滚动 | `Input.synthesizeScrollGesture` | 模拟滚轮 |
| 打字 | `Input.insertText` | 插入文本到焦点元素 |
| 按键 | `Input.dispatchKeyEvent` | keyDown / keyUp |
| DOM 读写 | `Runtime.evaluate` | 执行 JS 代码 |
| DOM 查询 | `DOM.getDocument` / `DOM.querySelector` | DOM 结构查询 |
| 文件 | `DOM.setFileInputFiles` | 设置文件上传 |
| 导航 | `Page.navigate` | URL 跳转 |
| 导航 | `Page.reload` | 刷新 |
| 导航 | `Page.getNavigationHistory` / `Page.navigateToHistoryEntry` | 前进/后退 |
| 事件 | `Runtime.consoleAPICalled` | console 日志 |
| 事件 | `Runtime.exceptionThrown` | JS 异常 |
| 事件 | `Page.loadEventFired` / `Page.domContentEventFired` | 加载完成 |

### 三层封装原则

```
层级 3  Locator subset：声明式 + 自动等待 + 基础框架感知
        ↓ 定位元素后转换为坐标或 DOM 操作
层级 2  DOM CUA node_id：结构化快照 + 按 ID 操作
        ↓ 通过 scrollIntoView + getBoundingClientRect 转为坐标
层级 1  CUA 坐标：光标动画 + 导航感知 + 修饰键管理
        ↓ 直接发 CDP Input 事件
层级 0  CDP 原语
```

每层不是独立实现，而是在下一层基础上增加封装。实现时应尽量复用下层逻辑。

### 职责分层（在 actspace 架构中谁做什么）

| 职责 | 执行方 | 说明 |
|------|--------|------|
| CDP attach/detach | Extension | 通过 `chrome.debugger.attach/detach` |
| CDP 命令发送 | Extension | 通过 `chrome.debugger.sendCommand` |
| Locator runtime 管理 | Go Command Engine | `go:embed` 静态 runtime，通过 CDP 注入、版本校验和导航后重注入 |
| 光标动画注入 | Extension | 将 `cursor-overlay.js` 注入页面 |
| CUA / DOM CUA / Locator 编排 | Go Command Engine | 高层 command handler、重试、状态验证和错误包装 |
| 导航等待编排 | Go Command Engine | 消费 Extension 转发的 CDP 事件并协调 timeout |
| Chrome API 调用 | Extension | `chrome.tabs` / `chrome.history` / `chrome.tabGroups` |
| Tab Group 管理 | Extension | 创建/命名/移动 tab group |
| 请求路由与 registry | Go Command Engine | 接收 socket 请求，校验和 dispatch 62 条命令，只把 primitive 调用发给 Extension |
| Session 生命周期 | Go Command Engine | 管理 session 创建/销毁、attach 状态、native host 连接和事件订阅 |
| 工具定义 | agent-core | `definition.ts` 中的参数 schema |
| 工具 executor | agent-core | 调用 BridgeClient 发送请求 |
| 结构化浏览器错误 | Go Command Engine | 统一 code、phase、retryable 和脱敏 details |
| 错误呈现 | agent-core | 将 bridge 错误裁剪为模型和用户可读信息 |

---

## 一、基本操作：截图与视觉

截图是 CUA 模式的基础——模型需要「看」才能操作。

### CDP 基础

```
Page.getLayoutMetrics → { cssVisualViewport: { clientWidth, clientHeight } }
Page.captureScreenshot → { data: "base64..." }
window.devicePixelRatio → DPR 缩放比
```

### 1. cua_get_visible_screenshot

截取当前视口，返回带坐标映射信息的截图。

```
Extension 实现：
  1. chrome.debugger.attach(target, "1.3")
  2. Page.getLayoutMetrics → 获取 cssVisualViewport { clientWidth, clientHeight }
  3. Runtime.evaluate("window.devicePixelRatio") → DPR
  4. Page.captureScreenshot({
       format: "jpeg",        // JPEG 更小，模型消费更快
       quality: 80,
       clip: {
         x: 0, y: 0,
         width: clientWidth,
         height: clientHeight,
         scale: 1 / DPR       // 关键：消除 Retina 缩放，确保截图像素 = CSS 坐标
       }
     })
  5. chrome.debugger.detach(target)
  6. 返回 { data, mimeType: "image/jpeg", width: clientWidth, height: clientHeight }

关键点：
  - scale: 1/DPR 保证截图的像素坐标和 CSS 坐标一一对应
  - 返回 width/height 让模型知道坐标空间
  - JPEG 比 PNG 小 3-5 倍，节省 token

Plan 5 前盘点：⚠️ 协议已定义，Extension 未接入
当前差距：我们的 browser_screenshot 不处理 DPR，不返回 viewport 尺寸，用 PNG
```

### 2. playwright_screenshot（带裁剪区域）

截取整页或指定区域。

```
Extension 实现：
  1. attach
  2. 如果有 cropX/cropY/cropWidth/cropHeight：
     Page.captureScreenshot({
       format: "jpeg", quality: 80,
       clip: { x: cropX, y: cropY, width: cropWidth, height: cropHeight, scale: 1/DPR }
     })
  3. 否则：同 cua_get_visible_screenshot
  4. detach

Plan 5 前盘点：⚠️ browser_screenshot 不支持裁剪参数
```

### 3. playwright_element_screenshot

截取坐标处元素的精确截图。

```
Extension 实现：
  1. attach
  2. Runtime.evaluate("document.elementFromPoint(x, y)") → 获取元素
  3. Runtime.evaluate → getBoundingClientRect() → { x, y, width, height }
  4. Page.captureScreenshot({
       clip: { x, y, width, height, scale: 1/DPR }
     })
  5. detach

Plan 5 前盘点：❌ 未实现
```

---

## 二、基本操作：鼠标

鼠标是 CUA 交互的核心。所有鼠标操作最终都通过 `Input.dispatchMouseEvent`。

### CDP 基础

```
Input.dispatchMouseEvent({
  type: "mousePressed" | "mouseReleased" | "mouseMoved",
  x: number,           // CSS 坐标
  y: number,
  button: "left" | "middle" | "right" | "none",
  buttons: number,     // 位掩码：1=left, 2=right, 4=middle
  clickCount: number,  // 1=单击, 2=双击
  modifiers: number,   // 位掩码：1=Alt, 2=Ctrl, 4=Meta, 8=Shift
})
```

### 内部共享函数

以下函数描述首版 Extension 原型。正式实现应迁移为 Go CUA handler；Extension 只保留 cursor 和 CDP primitive：

```javascript
// 光标动画：从当前位置滑动到目标
async function moveCursorTo(target, x, y) {
  await ensureCursorOverlayInjected(target);
  await Runtime.evaluate(`window.__actspaceCursor.moveTo(${x}, ${y})`);
}

// 光标点击动画：在目标位置显示点击涟漪
async function showClickAt(target, x, y) {
  await Runtime.evaluate(`window.__actspaceCursor.click(${x}, ${y})`);
}

// 修饰键 → CDP modifiers 位掩码
function keysToModifiers(keys) {
  let m = 0;
  for (const k of keys) {
    if (k === "Alt") m |= 1;
    if (k === "Ctrl" || k === "Control") m |= 2;
    if (k === "Meta" || k === "Cmd") m |= 4;
    if (k === "Shift") m |= 8;
    if (k === "ControlOrMeta") m |= (isMac ? 4 : 2);
  }
  return m;
}

// 导航感知点击：检测点击是否触发了跳转
async function clickWithNavigationWait(target, x, y, opts) {
  // 1. 开始监听导航事件
  let navigated = false;
  const onNavigated = () => { navigated = true; };
  subscribePageEvents(target, onNavigated);

  // 2. 执行实际点击
  const button = opts.button ?? "left";
  const modifiers = keysToModifiers(opts.keys ?? []);
  await dispatchMouseEvent(target, "mousePressed", x, y, button, opts.clickCount ?? 1, modifiers);
  await dispatchMouseEvent(target, "mouseReleased", x, y, button, 0, modifiers);

  // 3. 如果检测到导航 → 等待加载完成
  if (navigated) {
    await waitForLoadState(target, "load", 15000);
  }
  unsubscribePageEvents(target, onNavigated);
}
```

### 4. cua_click — 坐标单击

```
Extension 实现：
  1. attach
  2. moveCursorTo(target, x, y)                    ← 光标滑动动画
  3. showClickAt(target, x, y)                     ← 点击涟漪
  4. clickWithNavigationWait(target, x, y, {       ← 点击 + 导航等待
       button, keys, clickCount: 1
     })
  5. detach

参数：tab_id, x, y, button?, keys?
Plan 5 前盘点：⚠️ 协议已定义，Extension 未接入
当前差距：我们的 click 无导航等待、无修饰键、光标不滑动
```

### 5. cua_double_click — 坐标双击

```
Extension 实现：
  同 cua_click，但 clickCount=2
  实际发 4 个事件：pressed(1) → released(1) → pressed(2) → released(2)

参数：tab_id, x, y, keys?
Plan 5 前盘点：❌ 未实现
```

### 6. cua_move — 鼠标移动（不点击）

```
Extension 实现：
  1. attach
  2. moveCursorTo(target, x, y)
  3. Input.dispatchMouseEvent({
       type: "mouseMoved", x, y,
       button: "none", buttons: 0
     })
  4. detach

参数：tab_id, x, y, keys?
用途：触发 hover 效果
Plan 5 前盘点：❌ 未实现
```

### 7. dom_cua_click — DOM 节点点击

```
Extension 实现：
  1. attach
  2. ensurePlaywrightInjected(target)
  3. Runtime.evaluate(`
       const nodes = window.__actspacePlaywright._lastNodes;
       const node = nodes?.find(n => n.nodeId === "${nodeId}");
       if (!node?._el) throw new Error("node_not_found");
       node._el.scrollIntoView({ block: "center", inline: "nearest" });
       const rect = node._el.getBoundingClientRect();
       JSON.stringify({ x: rect.left + rect.width/2, y: rect.top + rect.height/2 });
     `)
  4. 解析得到 (x, y)
  5. moveCursorTo(target, x, y)
  6. showClickAt(target, x, y)
  7. clickWithNavigationWait(target, x, y, { clickCount: 1 })
  8. detach

前置条件：必须先调过 dom_cua_get_visible_dom，_lastNodes 才有数据
参数：tab_id, node_id
Plan 5 前盘点：⚠️ 协议已定义，Extension 未接入
```

### 8. dom_cua_double_click — DOM 节点双击

```
同 dom_cua_click，但 clickCount=2
Plan 5 前盘点：⚠️ 协议已定义，Extension 未接入
```

### 9. playwright_locator_click — 选择器点击

```
Extension 实现：
  1. attach
  2. ensurePlaywrightInjected(target)
  3. 等待 + 定位：
     Runtime.evaluate(`
       const el = window.__actspacePlaywright.locateStrict("${selector}");
       // locateStrict 内部：
       //   querySelectorAll → 过滤 visible → 要求 unique
       //   如果 0 个 → selector_not_found
       //   如果 visible 0 个 → element_not_visible
       //   如果 visible > 1 → selector_ambiguous
       JSON.stringify(window.__actspacePlaywright.getClickPoint(el));
       // getClickPoint 内部：
       //   scrollIntoView({ block: "center" })
       //   getBoundingClientRect → 中心点
     `)
  4. 解析得到 (x, y)
  5. 如果需要，检查 enabled 状态
  6. moveCursorTo(target, x, y)
  7. showClickAt(target, x, y)
  8. clickWithNavigationWait(target, x, y, { button, keys, clickCount: 1 })
  9. detach

与 CUA click 的差异：
  - 自动等待元素出现（可选 timeout 重试）
  - 检查 visible + enabled
  - 自动 scrollIntoView
  - strict 模式保证唯一性

Plan 5 前盘点：✅ 已实现（但缺导航等待和修饰键）
```

### 10. playwright_locator_dblclick — 选择器双击

```
同 playwright_locator_click，但 clickCount=2
Plan 5 前盘点：❌ 未实现
```

---

## 三、基本操作：滚动

### CDP 基础

```
Input.synthesizeScrollGesture({
  x: number,      // 滚动发生的位置（决定哪个容器接收事件）
  y: number,
  xDistance: number,  // 水平滚动距离（正=右, 负=左）
  yDistance: number,  // 垂直滚动距离（正=上, 负=下）
  // 注意：yDistance 和滚动方向相反！正值=向上滚动
  repeatCount: 1,
})
```

### 11. cua_scroll — 坐标滚动

```
Extension 实现：
  1. attach
  2. moveCursorTo(target, x, y)       ← 先把鼠标移到目标位置
  3. 处理修饰键（Ctrl+滚轮=缩放）
  4. Input.synthesizeScrollGesture({
       x, y,
       xDistance: -scrollX,            // 注意符号：API 的 distance 方向与滚动相反
       yDistance: -scrollY,
     })
  5. detach

参数：tab_id, x, y, scroll_x, scroll_y, keys?
Plan 5 前盘点：⚠️ 协议已定义，Extension 未接入
当前差距：我们的 scroll 默认视口中心，不支持精确坐标和修饰键
```

### 12. dom_cua_scroll — DOM 节点内滚动

```
Extension 实现：
  两种模式：
  A. 有 node_id → 在元素内滚动
    1. attach
    2. ensurePlaywrightInjected
    3. Runtime.evaluate(`
         const node = window.__actspacePlaywright.getNodeById("${nodeId}");
         node.scrollBy(${scrollX}, ${scrollY});
       `)
    4. detach

  B. 无 node_id → 在视口中心执行 CUA scroll
    同 cua_scroll，坐标取 viewport 中心

参数：tab_id, node_id?, scroll_x, scroll_y
优势：模式 A 通过 element.scrollBy 直接操作容器，不需要猜坐标
Plan 5 前盘点：⚠️ 协议已定义，Extension 未接入
```

### 13. playwright_scroll（通过选择器）

```
Extension 实现：
  A. 有 selector → 定位元素后在其中心执行 CUA scroll
    1. attach + ensurePlaywrightInjected
    2. locateStrict(selector) → getClickPoint → (x, y)
    3. Input.synthesizeScrollGesture({ x, y, xDistance, yDistance })

  B. 无 selector → 在视口中心滚动

Plan 5 前盘点：✅ 已实现（browser_scroll 支持 direction/amount/selector）
当前差距：接口简化为 direction enum，不支持精确像素控制
```

---

## 四、基本操作：文本输入

### CDP 基础

```
Input.insertText({ text: "hello" })   // 直接插入，不模拟逐键
```

但 `insertText` 只能插入到当前焦点元素，且不触发前端框架的事件。所以 Playwright 层需要更复杂的实现。

### 14. cua_type — 纯文本输入

```
Extension 实现：
  1. attach
  2. Input.insertText({ text })
  3. detach

参数：tab_id, text
特点：输入到当前焦点元素，不需要定位
Plan 5 前盘点：⚠️ 协议已定义，Extension 未接入
```

### 15. dom_cua_type — DOM CUA 文本输入

```
实现同 cua_type（共享逻辑）
DOM CUA 层没有额外封装，因为 type 不需要定位
Plan 5 前盘点：❌ 未实现
```

### 16. playwright_locator_fill — 选择器填充（框架感知）

```
Extension 实现：
  1. attach
  2. ensurePlaywrightInjected
  3. Runtime.evaluate(`
       (function() {
         const el = window.__actspacePlaywright.locateStrict("${selector}");
         // 关键：不能只设 value，必须触发事件让 React/Vue 感知
         el.focus();
         el.value = "${value}";
         el.dispatchEvent(new Event("input", { bubbles: true }));
         el.dispatchEvent(new Event("change", { bubbles: true }));
       })()
     `)
  4. detach

与 cua_type 的本质差异：
  - cua_type 用 CDP insertText → 不触发 input/change 事件
  - fill 通过 JS 设 value + 手动 dispatch 事件 → React/Vue/Angular 能正确更新状态

为什么 CDP 做不到：
  Input.insertText 只插入文本到 contenteditable 或 <textarea>
  对于 React 的受控组件（controlled input），value 是由 state 驱动的
  只有正确触发 input 事件，React 的 onChange handler 才会被调用

参数：tab_id, selector, value, replace?
Plan 5 前盘点：✅ 已实现
```

---

## 五、基本操作：键盘

### CDP 基础

```
Input.dispatchKeyEvent({
  type: "keyDown" | "keyUp" | "rawKeyDown" | "char",
  key: "Enter",         // 键名
  code: "Enter",        // 物理键码
  text: "",             // 字符（单字符键）
  modifiers: 0,         // 修饰键位掩码
  windowsVirtualKeyCode: 13,  // Windows 虚拟键码
})
```

### 组合键发送的标准流程

```
发送 Ctrl+A 的完整序列：
  1. keyDown(key="Control", modifiers=2)    ← 按下 Ctrl
  2. keyDown(key="a", modifiers=2)          ← 按下 a（带 Ctrl 修饰）
  3. keyUp(key="a", modifiers=2)            ← 释放 a
  4. keyUp(key="Control", modifiers=0)      ← 释放 Ctrl

跨平台处理：
  - "ControlOrMeta" → Mac 上替换为 "Meta"(Cmd)，其他为 "Control"
  - 需要维护一张 key → code → virtualKeyCode 的映射表
```

### 17. cua_keypress — 坐标级按键

```
Extension 实现：
  1. attach
  2. 分离 keys 数组为 modifiers + 主键
     例如 ["Ctrl", "a"] → modifiers=["Ctrl"], mainKey="a"
  3. 按下所有 modifier keys（keyDown）
  4. 按下主键（keyDown）
  5. 释放主键（keyUp）
  6. 释放所有 modifier keys（keyUp）
  7. detach

参数：tab_id, keys
Plan 5 前盘点：⚠️ 协议已定义，Extension 未接入
当前差距：我们的 press_key 实现简化，没有完整的修饰键管理
```

### 18. dom_cua_keypress — DOM CUA 按键

```
实现同 cua_keypress
Plan 5 前盘点：❌ 未实现
```

### 19. playwright_locator_press — 选择器按键

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. 如果有 selector：
     Runtime.evaluate(`
       window.__actspacePlaywright.locateStrict("${selector}").focus()
     `)
  3. 执行 cua_keypress 逻辑
  4. detach

与 cua_keypress 的差异：可以先把焦点切到指定元素

参数：tab_id, selector?, value (键名)
Plan 5 前盘点：✅ 已实现（但修饰键处理不完整）
```

---

## 六、基本操作：拖拽

### CDP 基础

拖拽 = mousePressed(起点) → mouseMoved(中间点) × N → mouseReleased(终点)

### 20. cua_drag — 路径拖拽

```
Extension 实现：
  1. attach
  2. 移动光标到起点 path[0]
  3. moveCursorTo(target, path[0].x, path[0].y)
  4. Input.dispatchMouseEvent({
       type: "mousePressed",
       x: path[0].x, y: path[0].y,
       button: "left", buttons: 1, clickCount: 1
     })
  5. 依次移动到每个中间点：
     for i = 1 to path.length - 1:
       moveCursorTo(target, path[i].x, path[i].y)
       Input.dispatchMouseEvent({
         type: "mouseMoved",
         x: path[i].x, y: path[i].y,
         button: "left", buttons: 1
       })
       await sleep(16)  // 模拟 60fps 的移动速率
  6. 在终点释放：
     Input.dispatchMouseEvent({
       type: "mouseReleased",
       x: path[last].x, y: path[last].y,
       button: "left", buttons: 0
     })
  7. detach

参数：tab_id, path: [{x, y}...], keys?
Plan 5 前盘点：❌ 未实现
```

---

## 七、基本操作：媒体下载

### CDP 基础

没有直接的 CDP 下载命令。实现方式是通过 JS 创建 `<a download>` 元素触发浏览器下载。

### 21. cua_download_media — 坐标处媒体下载

```
Extension 实现：
  1. attach
  2. Runtime.evaluate(`
       (function() {
         const el = document.elementFromPoint(${x}, ${y});
         // 沿 DOM 树向上找最近的媒体元素
         let target = el;
         while (target) {
           if (target.tagName === 'IMG' && target.src) return target.src;
           if (target.tagName === 'VIDEO') return target.src || target.querySelector('source')?.src;
           if (target.tagName === 'AUDIO') return target.src || target.querySelector('source')?.src;
           if (target.tagName === 'A' && target.href) return target.href;
           target = target.parentElement;
         }
         return null;
       })()
     `)
  3. 如果找到 URL → 创建隐藏 <a download> 触发下载：
     Runtime.evaluate(`
       const a = document.createElement('a');
       a.href = "${mediaUrl}";
       a.download = "";
       a.style.display = "none";
       document.body.appendChild(a);
       a.click();
       a.remove();
     `)
  4. detach

参数：tab_id, x, y
Plan 5 前盘点：❌ 未实现
```

### 22. dom_cua_download_media — DOM 节点媒体下载

```
同上，但通过 node_id 定位元素而非坐标。
Plan 5 前盘点：❌ 未实现
```

### 23. playwright_locator_download_media — 选择器媒体下载

```
同上，但通过 CSS 选择器定位元素。
Plan 5 前盘点：❌ 未实现
```

---

## 八、DOM 快照获取

这是 DOM CUA 层的入口命令——替代截图的信息获取方式。

### 24. dom_cua_get_visible_dom — 获取可见 DOM 节点列表

```
Extension 实现：
  1. attach
  2. ensurePlaywrightInjected(target)
  3. Runtime.evaluate(`
       (function() {
         const nodes = window.__actspacePlaywright.getVisibleDom(250);
         window.__actspacePlaywright._lastNodes = nodes;  // 缓存供后续命令使用
         return JSON.stringify(nodes.map(n => ({
           nodeId: n.nodeId,
           tagName: n.tagName,
           role: n.role,
           text: n.text,
           ariaName: n.ariaName,
           type: n.type,
           boundingBox: n.boundingBox
         })));
       })()
     `)
  4. detach
  5. 返回 { nodes: [...] }

playwright-injected.js 中的 getVisibleDom() 实现：
  扫描范围：a, button, input, textarea, select, summary, details, label,
           img, video, audio, [role], [onclick], [contenteditable=true], [tabindex]
  过滤：isVisible() — display/visibility/opacity/rect
  上限：250 个节点
  每个节点保留 _el 引用供后续 getNodeById() 使用

参数：tab_id
Plan 5 前盘点：⚠️ 协议已定义，playwright-injected.js 有实现，Extension 未接入消息路由
实现量：Extension 只需加一个 case 即可接通
```

当前实现（2026-07-12）：命令已收敛到 Go + injected Locator runtime。`visibleDom` 默认最多返回 500 个节点、硬上限 1000，并返回 `generation / total / returned / truncated`；节点补充 href 与单节点文本截断元数据。Agent Core 使用紧凑逐节点格式，在 50,000 字符内跳过通用 flash 摘要，超限只在完整节点边界停止。

---

## 九、Locator Runtime 独有能力

以下命令需要 injected Locator runtime 提供页面内 DOM/ARIA 语义，但不依赖 Playwright 包。Runtime v5 支持结构化 css/role/text/label/placeholder/test-id、accessible name、open Shadow DOM、同源 Frame path 和页面内自动等待/actionability；旧 selector 仍作为 CSS 兼容输入。

### A. 语义表单操作

### 25. playwright_locator_select_option — 选择下拉框

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       (function() {
         const el = window.__actspacePlaywright.locateStrict("${selector}");
         window.__actspacePlaywright.selectOptions(el, ${JSON.stringify(selections)});
       })()
     `)
  3. detach

selectOptions() 内部：
  遍历 <option> 元素
  按 value / label / valueOrLabel 匹配
  设 selected = true
  触发 input + change 事件

参数：tab_id, selector, selections: [{ value?, label?, valueOrLabel? }]
Plan 5 前盘点：✅ 已实现
```

### 26. playwright_locator_set_checked — 勾选/取消复选框

```
Extension 实现（需要新增到 playwright-injected.js）：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       (function() {
         const el = window.__actspacePlaywright.locateStrict("${selector}");
         const isRadio = el.type === 'radio';
         const currentChecked = el.checked;

         // 幂等：已经是目标状态就不操作
         if (currentChecked === ${checked}) return "already_correct";

         // radio 不允许 uncheck
         if (isRadio && !${checked}) throw new Error("cannot_uncheck_radio");

         // 通过 click 切换状态（而非直接设 checked）
         el.scrollIntoView({ block: "center" });
         const rect = el.getBoundingClientRect();
         return JSON.stringify({
           x: rect.left + rect.width / 2,
           y: rect.top + rect.height / 2
         });
       })()
     `)
  3. 如果返回坐标 → 执行 CUA click
  4. 验证：Runtime.evaluate → el.checked === ${checked}
  5. detach

为什么不直接设 el.checked：
  和 fill 的原因一样——直接修改属性不会触发 change 事件
  必须通过 click 来切换，让浏览器原生行为驱动状态变化

参数：tab_id, selector, checked: boolean
Plan 5 前盘点：❌ 未实现（需要扩展 playwright-injected.js）
```

### B. 元素状态查询

### 27. playwright_locator_inner_text — 读取可见文本

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       window.__actspacePlaywright.locateStrict("${selector}").innerText
     `)
  3. detach

参数：tab_id, selector
返回：{ value: string }
Plan 5 前盘点：❌ 未实现
实现量：很小，只需在 Extension 加 case + Runtime.evaluate 一行
```

### 28. playwright_locator_text_content — 读取全部文本

```
同上，但用 .textContent 替代 .innerText
差异：textContent 返回所有文本（含 display:none 隐藏的）
Plan 5 前盘点：❌ 未实现
```

### 29. playwright_locator_all_text_contents — 批量读取文本

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       JSON.stringify(
         Array.from(document.querySelectorAll("${selector}"))
           .map(el => el.textContent ?? "")
       )
     `)
  3. detach

注意：这个命令不走 locateStrict（因为需要多个元素）

参数：tab_id, selector
返回：{ values: string[] }
Plan 5 前盘点：❌ 未实现
```

### 30. playwright_locator_read_all — 批量读取属性和文本

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       JSON.stringify(
         Array.from(document.querySelectorAll("${selector}")).map(el => ({
           attributes: Object.fromEntries(
             Array.from(el.attributes).map(a => [a.name, a.value])
           ),
           inner_text: el.innerText ?? "",
           text_content: el.textContent ?? ""
         }))
       )
     `)
  3. detach

参数：tab_id, selector
返回：{ values: [{ attributes, inner_text, text_content }] }
Plan 5 前盘点：❌ 未实现
```

当前实现（2026-07-12）：`all_text_contents` 与 `read_all` 均已支持 `offset` / `limit` 分页，默认 `offset=0`、`limit=200`、硬上限 1000；返回 `values / total / offset / returned / has_more`，Agent Core 按完整 item 格式化并跳过通用 flash 摘要。

### 31. playwright_locator_get_attribute — 读取属性

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       window.__actspacePlaywright.locateStrict("${selector}").getAttribute("${name}")
     `)
  3. detach

参数：tab_id, selector, name
返回：{ value: string | null }
Plan 5 前盘点：❌ 未实现
```

### 32. playwright_locator_is_visible — 检查可见性

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       (function() {
         const all = document.querySelectorAll("${selector}");
         if (all.length === 0) return false;
         return Array.from(all).some(el => window.__actspacePlaywright.isVisible(el));
       })()
     `)
  3. detach

注意：这里不走 locateStrict（0 个匹配也是合法结果，返回 false）

参数：tab_id, selector
返回：{ value: boolean }
Plan 5 前盘点：❌ 未实现（isVisible 函数已存在于注入脚本中）
```

### 33. playwright_locator_is_enabled — 检查可用性

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       (function() {
         const el = window.__actspacePlaywright.locateStrict("${selector}");
         return window.__actspacePlaywright.isEnabled(el);
       })()
     `)
  3. detach

参数：tab_id, selector
返回：{ value: boolean }
Plan 5 前盘点：❌ 未实现（isEnabled 函数已存在于注入脚本中）
```

### 34. playwright_locator_count — 匹配计数

```
Extension 实现：
  1. attach
  2. Runtime.evaluate(`document.querySelectorAll("${selector}").length`)
  3. detach

参数：tab_id, selector
返回：{ count: number }
Plan 5 前盘点：❌ 未实现
实现量：最小——纯 CSS 查询，甚至不需要 Playwright 注入
```

### C. 跨层桥梁

### 35. playwright_element_info — 坐标 → 元素信息 + 选择器推荐

```
Extension 实现（需要新增到 playwright-injected.js）：
  1. attach + ensurePlaywrightInjected
  2. Runtime.evaluate(`
       (function() {
         const elements = document.elementsFromPoint(${x}, ${y});
         const results = [];
         for (const el of elements.slice(0, 10)) {
           if (!window.__actspacePlaywright.isVisible(el)) continue;
           const rect = el.getBoundingClientRect();
           const text = (el.innerText || el.value || el.alt || el.title || "").slice(0, 200);

           // 推荐选择器生成
           const selectors = [];
           if (el.id) selectors.push("#" + el.id);
           if (el.getAttribute("data-testid")) selectors.push('[data-testid="' + el.getAttribute("data-testid") + '"]');
           if (el.className) {
             const cls = el.tagName.toLowerCase() + "." + el.className.trim().split(/\\s+/).join(".");
             selectors.push(cls);
           }
           const tagSel = el.tagName.toLowerCase();
           if (selectors.length === 0) selectors.push(tagSel);

           results.push({
             tagName: el.tagName.toLowerCase(),
             role: el.getAttribute("role"),
             visibleText: text,
             ariaName: el.getAttribute("aria-label"),
             testId: el.getAttribute("data-testid"),
             boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
             preview: el.outerHTML.slice(0, 200),
             selector: { primary: selectors[0], candidates: selectors }
           });
         }
         return JSON.stringify(results);
       })()
     `)
  3. detach

参数：tab_id, x, y, include_non_interactable?
返回：[{ tagName, role, visibleText, selector: { primary, candidates } }]
Plan 5 前盘点：❌ 未实现
价值：打通 CUA 视觉层 → Playwright 选择器层的桥梁
```

### D. 纯文本快照

### 36. playwright_dom_snapshot — 页面纯文本

```
Extension 实现：
  1. attach
  2. Runtime.evaluate("document.body?.innerText ?? ''")
  3. detach

参数：tab_id
返回：{ text: string }
Plan 5 前盘点：✅ 已实现（browser_dom_snapshot）
```

---

## 十、导航命令

### 37. navigate_tab_url — 导航到 URL

```
Extension 实现：
  1. attach
  2. 注册导航事件监听
  3. chrome.tabs.update(tabId, { url }) 或 Page.navigate({ url })
  4. 等待 Page.loadEventFired（超时 15s）
  5. 如果收到 Page.navigationBlocked → 抛安全错误
  6. detach

参数：tab_id, url, timeout_ms?
Plan 5 前盘点：✅ 已实现（但缺 loadEventFired 等待）
```

### 38. navigate_tab_back — 后退

```
Extension 实现：
  1. attach
  2. Page.getNavigationHistory → { currentIndex, entries }
  3. if currentIndex > 0:
       Page.navigateToHistoryEntry({ entryId: entries[currentIndex - 1].id })
  4. 等待加载完成
  5. detach

参数：tab_id
Plan 5 前盘点：✅ 已实现
```

### 39. navigate_tab_forward — 前进

```
Extension 实现：
  1. attach
  2. Page.getNavigationHistory → { currentIndex, entries }
  3. if currentIndex < entries.length - 1:
       Page.navigateToHistoryEntry({ entryId: entries[currentIndex + 1].id })
  4. 等待加载完成
  5. detach

参数：tab_id
Plan 5 前盘点：❌ 未实现
实现量：和 back 几乎对称，最小改动
```

### 40. navigate_tab_reload — 刷新

```
Extension 实现：
  1. attach
  2. Page.reload()
  3. 等待 Page.loadEventFired
  4. detach

参数：tab_id, timeout_ms?
Plan 5 前盘点：❌ 未实现
实现量：极小
```

---

## 十一、Tab 管理命令

### 41. create_tab — 创建新标签页

```
Extension 实现（纯 Chrome API，无需 CDP）：
  1. chrome.tabs.create({ url, active: false })
  2. 将 tab.id 加入 ownedTabIds
  3. addTabToGroup(tab.id, tab.windowId) → 加入 session tab group

参数：url?, active?
返回：{ id, title, url }
Plan 5 前盘点：✅ 已实现（browser_open_tab）
```

### 42. close_tab — 关闭标签页

```
Extension 实现：
  1. chrome.tabs.remove(tabId)
  2. 从 ownedTabIds 移除
  3. 如果是 claimedTabId → 清空

参数：tab_id
Plan 5 前盘点：✅ 已实现
```

### 43. list_tabs — 列出 session 标签页

```
Extension 实现：
  1. chrome.tabs.query({})
  2. 过滤 ownedTabIds 中的 tab
  3. normalizeTab() 格式化

参数：无
返回：{ tabs: [{ id, title, url, active }] }
Plan 5 前盘点：✅ 已实现
```

### 44. selected_tab — 获取活跃标签页

```
Extension 实现：
  1. chrome.tabs.query({ active: true, currentWindow: true })
  2. 返回第一个

参数：无
返回：{ id }
Plan 5 前盘点：❌ 未实现
实现量：极小
```

### 45. name_session — 命名 session

```
Extension 实现：
  1. state.sessionName = name
  2. 如果 tabGroupId 存在：
     chrome.tabGroups.update(tabGroupId, { title: name })

参数：name
Plan 5 前盘点：⚠️ 协议+Extension 已实现，Agent Tool 未暴露
```

### 46. finalize_tabs — 清理 session

```
Extension 实现：
  1. 解析 keep 数组
  2. 遍历 ownedTabIds：
     - 在 keep 中 → kept 列表
     - 不在 keep 中 → chrome.tabs.remove → closed 列表
  3. 清理 ownedTabIds 和 claimedTabId

参数：keep: [{ tab_id, status }]
返回：{ closed: [], kept: [] }
Plan 5 前盘点：✅ 已实现
```

---

## 十二、用户浏览器表面命令

### 47. browser_user_open_tabs — 列出用户所有标签页

```
Extension 实现：
  1. chrome.tabs.query({}) → 返回所有 tab（不只是 session 的）
  2. normalizeTab() 格式化

参数：无
Plan 5 前盘点：✅ 已实现
```

### 48. browser_user_claim_tab — 接管用户标签页

```
Extension 实现：
  1. chrome.tabs.get(tabId) → 确认 tab 存在
  2. state.claimedTabId = tabId
  3. 可选：addTabToGroup(tabId) → 移入 session tab group

参数：tab_id
Plan 5 前盘点：✅ 已实现
```

### 49. browser_user_history — 搜索浏览历史

```
Extension 实现（需要 chrome.history 权限）：
  1. chrome.history.search({ text: query, maxResults: limit })
  2. 格式化结果

参数：query?, limit?
返回：[{ url, title, lastVisitTime, visitCount }]
Plan 5 前盘点：⚠️ 协议+Extension 已实现，Agent Tool 未暴露
```

---

## 十三、等待/同步命令

这是 Playwright 层最重要的能力之一。CDP 没有声明式等待，全靠上层编排。

### 50. playwright_wait_for_load_state — 等待页面加载

```
Extension 实现：
  方式 A（轮询 tab.status，已有类似实现）：
    while (Date.now() - start < timeoutMs) {
      const tab = chrome.tabs.get(tabId);
      if (matchesLoadState(tab.status, state)) return;
      await sleep(250);
    }
    throw timeout_error;

  方式 B（监听 CDP 事件，更精确）：
    1. attach
    2. 根据 state 选择等待的事件：
       "domcontentloaded" → 等 Page.domContentEventFired
       "load" → 等 Page.loadEventFired
    3. 设超时 timer
    4. 收到目标事件或超时后返回
    5. detach

  推荐方式 A（当前已有基础），后续可升级为方式 B

参数：tab_id, state: "load"|"domcontentloaded", timeout_ms?
Plan 5 前盘点：⚠️ 协议+Extension 有类似实现（waitLoad），但 Agent Tool 未暴露
```

### 51. playwright_wait_for_url — 等待 URL 变化

```
Extension 实现：
  while (Date.now() - start < timeoutMs) {
    const tab = chrome.tabs.get(tabId);
    if (tab.url.includes(urlPattern) || tab.url === urlPattern) return;
    await sleep(250);
  }
  throw timeout_error;

参数：tab_id, url (字符串匹配或正则), timeout_ms?
Plan 5 前盘点：❌ 未实现
```

### 52. playwright_wait_for_timeout — 等待指定时间

```
Extension 实现：
  await new Promise(resolve => setTimeout(resolve, timeoutMs));

参数：tab_id, timeout_ms
Plan 5 前盘点：❌ 未实现
实现量：极小（一行代码）
```

### 53. playwright_wait_for_file_chooser — 等待文件选择器

```
Extension 实现：
  1. attach
  2. 注册 Page.fileChooserOpened 事件监听
  3. 等待事件触发或超时
  4. 返回 { file_chooser_id, is_multiple }

使用流程：
  Agent 调用 wait_for_file_chooser → 开始监听
  Agent 调用 click 点击上传按钮 → 触发文件选择器
  Agent 调用 file_chooser_set_files 设置文件

参数：tab_id, timeout_ms?
返回：{ file_chooser_id, is_multiple }
Plan 5 前盘点：❌ 未实现
复杂度：中等——需要实现事件监听和跨请求状态传递
```

### 54. playwright_wait_for_download — 等待下载

```
Extension 实现：
  1. 注册 chrome.downloads.onChanged 监听
  2. 等待 downloads.search 出现新的匹配项
  3. 返回 { download_id }

参数：tab_id, timeout_ms?
返回：{ download_id }
Plan 5 前盘点：❌ 未实现
```

---

## 十四、文件/下载/剪贴板命令

### 55. playwright_file_chooser_set_files — 设置上传文件

```
Extension 实现：
  1. attach
  2. 使用之前 wait_for_file_chooser 保存的 file input 元素引用
  3. DOM.setFileInputFiles({ files: [path1, path2], objectId: ... })
     或 Runtime.evaluate 直接操作 FileList
  4. detach

参数：tab_id, file_chooser_id, files: string[]
Plan 5 前盘点：❌ 未实现
复杂度：高——需要跨请求状态和本地文件访问
```

### 56. playwright_download_path — 获取下载路径

```
Extension 实现：
  1. 通过 download_id 查询 chrome.downloads.search
  2. 轮询等待 state === "complete"
  3. 返回 filename（本地路径）

参数：tab_id, download_id, timeout_ms?
返回：{ path: string | null }
Plan 5 前盘点：❌ 未实现
```

### 57. tab_clipboard_read_text — 读取剪贴板文本

```
Extension 实现：
  1. attach
  2. Runtime.evaluate(`
       navigator.clipboard.readText()
     `)
  3. detach

注意：clipboard API 需要页面在前台且有用户手势授权
可能需要通过 Browser.grantPermissions 先授权

参数：tab_id
返回：{ text: string }
Plan 5 前盘点：❌ 未实现
```

### 58. tab_clipboard_write_text — 写入剪贴板文本

```
Extension 实现：
  1. attach
  2. Runtime.evaluate(`navigator.clipboard.writeText(${JSON.stringify(text)})`)
  3. detach

参数：tab_id, text
Plan 5 前盘点：❌ 未实现
```

### 59. tab_clipboard_read — 读取剪贴板（富媒体）

```
Extension 实现：
  1. attach
  2. Runtime.evaluate(`
       (async function() {
         const items = await navigator.clipboard.read();
         const result = [];
         for (const item of items) {
           const entries = [];
           for (const type of item.types) {
             const blob = await item.getType(type);
             if (type.startsWith("text/")) {
               entries.push({ mime_type: type, text: await blob.text() });
             } else {
               const buffer = await blob.arrayBuffer();
               const bytes = new Uint8Array(buffer);
               let binary = "";
               for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
               entries.push({ mime_type: type, base64: btoa(binary) });
             }
           }
           result.push({ entries, presentation_style: item.presentationStyle ?? "unspecified" });
         }
         return JSON.stringify(result);
       })()
     `)
  3. detach

参数：tab_id
返回：{ items: [{ entries: [{ mime_type, text?, base64? }] }] }
Plan 5 前盘点：❌ 未实现
复杂度：中等——异步 + 二进制处理
```

### 60. tab_clipboard_write — 写入剪贴板（富媒体）

```
Extension 实现：
  1. attach
  2. 构建 ClipboardItem 并写入
  3. detach

参数：tab_id, items: [{ entries: [{ mime_type, text?, base64? }] }]
Plan 5 前盘点：❌ 未实现
```

---

## 十五、开发调试命令

### 61. tab_dev_logs — 获取 console 日志

```
Extension 实现：
  这个命令需要持续收集，不是一次性调用。

  收集阶段（在 attach 时启动）：
    1. Runtime.enable() → 启用运行时事件
    2. 监听 Runtime.consoleAPICalled：
       { type, args, timestamp } → 解析 args 为文本 → 存入缓冲
    3. 监听 Runtime.exceptionThrown：
       { exceptionDetails } → 格式化 → 存入缓冲
    4. 每个 tab 最多保留 500 条

  查询阶段（tab_dev_logs 命令）：
    1. 读取缓冲中的日志
    2. 按 filter/levels 过滤
    3. 按 limit 截断
    4. 返回

  架构考虑：
    日志收集需要 CDP 保持 attach 状态（不能每次都 attach/detach）
    建议：对于活跃操作的 tab，保持 attach 状态直到 turn 结束
    这需要调整当前的「每次命令都 attach/detach」模式

参数：tab_id, filter?, levels?, limit?
返回：{ logs: [{ level, message, timestamp }] }
Plan 5 前盘点：❌ 未实现
复杂度：高——需要持续 attach 和事件缓冲
```

---

## 十六、Playwright 等待命令

### 62. playwright_locator_wait_for — 等待元素状态

```
Extension 实现：
  1. attach + ensurePlaywrightInjected
  2. 轮询检查元素状态：
     while (Date.now() - start < timeoutMs) {
       const result = Runtime.evaluate(`
         (function() {
           const all = document.querySelectorAll("${selector}");
           switch ("${state}") {
             case "attached": return all.length > 0;
             case "detached": return all.length === 0;
             case "visible": return Array.from(all).some(el => window.__actspacePlaywright.isVisible(el));
             case "hidden": return all.length === 0 || Array.from(all).every(el => !window.__actspacePlaywright.isVisible(el));
           }
         })()
       `);
       if (result) return {};
       await sleep(250);
     }
     throw timeout_error;
  3. detach

参数：tab_id, selector, state: "attached"|"detached"|"visible"|"hidden", timeout_ms?
Plan 5 前盘点：❌ 未实现
```

---

## Plan 5 前实现状态基线（历史）

下表用于解释 Plan 5 为什么需要收敛，不能再作为当前完成度依据。

| # | 命令 | 类别 | CDP 原语 | 当前状态 | 实现量 |
|---|------|------|----------|----------|--------|
| 1 | cua_get_visible_screenshot | CUA | Page.captureScreenshot + getLayoutMetrics | ⚠️ 有替代 | 中 |
| 2 | playwright_screenshot | Playwright | Page.captureScreenshot | ⚠️ 缺 crop | 小 |
| 3 | playwright_element_screenshot | Playwright | captureScreenshot + clip | ❌ | 中 |
| 4 | cua_click | CUA | dispatchMouseEvent | ⚠️ 有替代 | 中 |
| 5 | cua_double_click | CUA | dispatchMouseEvent(clickCount=2) | ❌ | 小 |
| 6 | cua_move | CUA | dispatchMouseEvent(moved) | ❌ | 小 |
| 7 | dom_cua_click | DOM | evaluate + dispatchMouseEvent | ⚠️ 协议有 | 中 |
| 8 | dom_cua_double_click | DOM | 同上 | ⚠️ 协议有 | 小 |
| 9 | playwright_locator_click | Playwright | locateStrict + dispatchMouseEvent | ✅ 缺导航等待 | 小(补) |
| 10 | playwright_locator_dblclick | Playwright | 同上(clickCount=2) | ❌ | 小 |
| 11 | cua_scroll | CUA | synthesizeScrollGesture | ⚠️ 有替代 | 小 |
| 12 | dom_cua_scroll | DOM | element.scrollBy | ⚠️ 协议有 | 小 |
| 13 | playwright_scroll | Playwright | synthesizeScrollGesture | ✅ | - |
| 14 | cua_type | CUA | Input.insertText | ⚠️ 协议有 | 极小 |
| 15 | dom_cua_type | DOM | 同上 | ❌ | 极小 |
| 16 | playwright_locator_fill | Playwright | evaluate(value + events) | ✅ | - |
| 17 | cua_keypress | CUA | dispatchKeyEvent | ⚠️ 协议有 | 小 |
| 18 | dom_cua_keypress | DOM | 同上 | ❌ | 极小 |
| 19 | playwright_locator_press | Playwright | focus + dispatchKeyEvent | ✅ 修饰键不完整 | 小(补) |
| 20 | cua_drag | CUA | pressed + moved×N + released | ❌ | 中 |
| 21 | cua_download_media | CUA | evaluate(elementFromPoint + a.download) | ❌ | 中 |
| 22 | dom_cua_download_media | DOM | 同上(按 node_id) | ❌ | 小 |
| 23 | playwright_locator_download_media | Playwright | 同上(按 selector) | ❌ | 小 |
| 24 | dom_cua_get_visible_dom | DOM | evaluate(getVisibleDom) | ⚠️ JS 已实现 | 极小 |
| 25 | playwright_locator_select_option | Playwright | evaluate(selectOptions) | ✅ | - |
| 26 | playwright_locator_set_checked | Playwright | evaluate + click | ❌ | 中 |
| 27 | playwright_locator_inner_text | Playwright | evaluate(.innerText) | ❌ | 极小 |
| 28 | playwright_locator_text_content | Playwright | evaluate(.textContent) | ❌ | 极小 |
| 29 | playwright_locator_all_text_contents | Playwright | evaluate(querySelectorAll) | ❌ | 极小 |
| 30 | playwright_locator_read_all | Playwright | evaluate(attributes + text) | ❌ | 小 |
| 31 | playwright_locator_get_attribute | Playwright | evaluate(.getAttribute) | ❌ | 极小 |
| 32 | playwright_locator_is_visible | Playwright | evaluate(isVisible) | ❌ | 极小 |
| 33 | playwright_locator_is_enabled | Playwright | evaluate(isEnabled) | ❌ | 极小 |
| 34 | playwright_locator_count | Playwright | evaluate(querySelectorAll.length) | ❌ | 极小 |
| 35 | playwright_element_info | Playwright | evaluate(elementsFromPoint) | ❌ | 中 |
| 36 | playwright_dom_snapshot | Playwright | evaluate(body.innerText) | ✅ | - |
| 37 | navigate_tab_url | 导航 | Page.navigate / tabs.update | ✅ 缺加载等待 | 小(补) |
| 38 | navigate_tab_back | 导航 | getNavigationHistory | ✅ | - |
| 39 | navigate_tab_forward | 导航 | navigateToHistoryEntry | ❌ | 极小 |
| 40 | navigate_tab_reload | 导航 | Page.reload | ❌ | 极小 |
| 41 | create_tab | Tab | chrome.tabs.create | ✅ | - |
| 42 | close_tab | Tab | chrome.tabs.remove | ✅ | - |
| 43 | list_tabs | Tab | chrome.tabs.query | ✅ | - |
| 44 | selected_tab | Tab | chrome.tabs.query(active) | ❌ | 极小 |
| 45 | name_session | Tab | chrome.tabGroups.update | ⚠️ Tool 未暴露 | 极小 |
| 46 | finalize_tabs | Tab | chrome.tabs.remove/group | ✅ | - |
| 47 | browser_user_open_tabs | 用户 | chrome.tabs.query | ✅ | - |
| 48 | browser_user_claim_tab | 用户 | chrome.tabs.get | ✅ | - |
| 49 | browser_user_history | 用户 | chrome.history.search | ⚠️ Tool 未暴露 | 极小 |
| 50 | wait_for_load_state | 等待 | Page.loadEventFired / 轮询 | ⚠️ 内部有 | 极小 |
| 51 | wait_for_url | 等待 | 轮询 tab.url | ❌ | 小 |
| 52 | wait_for_timeout | 等待 | setTimeout | ❌ | 极小 |
| 53 | wait_for_file_chooser | 等待 | Page.fileChooserOpened | ❌ | 中 |
| 54 | wait_for_download | 等待 | chrome.downloads | ❌ | 中 |
| 55 | file_chooser_set_files | 文件 | DOM.setFileInputFiles | ❌ | 中 |
| 56 | download_path | 文件 | chrome.downloads.search | ❌ | 小 |
| 57 | clipboard_read_text | 剪贴板 | evaluate(navigator.clipboard) | ❌ | 小 |
| 58 | clipboard_write_text | 剪贴板 | evaluate(navigator.clipboard) | ❌ | 小 |
| 59 | clipboard_read | 剪贴板 | evaluate(clipboard.read) | ❌ | 中 |
| 60 | clipboard_write | 剪贴板 | evaluate(clipboard.write) | ❌ | 中 |
| 61 | tab_dev_logs | 调试 | Runtime.consoleAPICalled | ❌ | 高 |
| 62 | wait_for(element) | Playwright | evaluate + 轮询 | ❌ | 小 |

### Plan 5 前实现量分布

| 实现量 | 数量 | 说明 |
|--------|------|------|
| ✅ 已完成 | 15 | 无需额外工作 |
| 极小（< 20 行） | 16 | 纯 evaluate + 简单 Chrome API |
| 小（20-50 行） | 14 | 需要少量编排逻辑 |
| 中（50-150 行） | 13 | 需要新的 JS 注入或事件处理 |
| 高（> 150 行） | 4 | 需要架构调整（持续 attach、跨请求状态） |

### Plan 5 前实现优先级建议

**P0 — 补齐现有命令的质量差距**：

1. 截图 DPR 处理（cua_screenshot 升级）
2. 点击导航等待（click + navigate 后自动 waitLoad）
3. 修饰键完整支持（keypress 升级）

**P1 — 极小实现量的高价值命令**：

4. `navigate_tab_forward` / `navigate_tab_reload`
5. `selected_tab`
6. `name_session` / `browser_user_history` 暴露为 Agent Tool
7. `wait_for_load_state` / `wait_for_timeout` 暴露为 Agent Tool
8. `dom_cua_get_visible_dom` 接入 Extension 路由
9. `inner_text` / `text_content` / `get_attribute` / `count` / `is_visible` / `is_enabled`

**P2 — 小实现量的扩展命令**：

10. `cua_double_click` / `cua_move` / `dblclick`
11. `all_text_contents` / `read_all`
12. `wait_for_url` / `wait_for(element)`
13. `dom_cua_click` / `dom_cua_scroll` 接入
14. `clipboard_read_text` / `clipboard_write_text`
15. `playwright_element_info`
16. 截图裁剪（crop 参数）

**P3 — 中等实现量的特定场景**：

17. `cua_drag`
18. `download_media` 系列
19. `set_checked`
20. `download_path` / `wait_for_download`
21. `element_screenshot`
22. `clipboard_read` / `clipboard_write`（富媒体）

**P4 — 高复杂度命令**：

23. `tab_dev_logs`（需要持续 attach 架构调整）
24. `wait_for_file_chooser` + `file_chooser_set_files`（跨请求状态）

## 当前实现矩阵

| 分类 | 数量 | Registry | Handler 所属 |
| --- | ---: | --- | --- |
| CUA | 9 | 9/9 implemented | Go CUA + CDP primitive |
| DOM CUA | 7 | 7/7 implemented | Go DOM CUA + Locator runtime |
| Locator | 21 | 21/21 implemented | Go Locator engine + self-authored injected Runtime v5 |
| Navigation | 4 | 4/4 implemented | Go navigation/wait |
| Tabs | 6 | 6/6 implemented | Go orchestration + Extension Tabs primitive |
| User | 3 | 3/3 implemented | Go orchestration + Extension Tabs/History primitive |
| Wait | 5 | 5/5 implemented | Go polling/event token state |
| I/O | 6 | 6/6 implemented | Go validation/event coordination + CDP/Downloads primitive |
| Debug | 1 | 1/1 implemented | Go 500-entry ring buffer + CDP event forwarding |

自动化验证已经覆盖 registry parity、Go dispatch/CDP 序列、injected runtime、结构化 target、frame-scoped isolated world、OOPIF child-session primitive、batch approval token、11 工具注册和旧 preview 兼容。Runtime v5 的真实 Chrome profile smoke 记录在 `20260717-browser-locator-runtime-rewrite.md`，并要求 reload 当前 unpacked extension 后执行。

## 维护规则

- 新增或调整命令时，先更新 Go canonical registry，再运行生成与 parity 检查；本文中的逐条历史盘点不再逐项维护。
- CDP 原语表如有新增使用，同步更新顶部的原语参考表。
- 实现优先级根据实际需求动态调整，但 P0（质量补齐）始终最优先。
- 每条命令的实现描述应逐步收敛为「Go command handler + Extension primitive」视角，不替代实际代码注释。
