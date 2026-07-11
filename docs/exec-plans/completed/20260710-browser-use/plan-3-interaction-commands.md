# Plan 3: 交互命令 + Playwright 注入

状态：已完成

依赖：Plan 2（BridgeClient 和基础工具可用）
产物消费方：Plan 4（Tab Group 依赖 session 已建立）

## 目标

实现浏览器交互工具（click、fill、press_key、select、scroll、back）和底层 Playwright 选择器引擎注入。这是让 Agent 能"操作"页面（而不只是"看"页面）的关键阶段。

## 允许修改的文件

- `packages/agent-core/src/tools/tools/browser/definition.ts`（追加新工具定义）
- `packages/agent-core/src/tools/tools/browser/executor.ts`（追加新 executor）
- `packages/agent-core/src/tools/index.ts`（追加导出）
- `plugins/browser-bridge/apps/cli/commands.go`（新建 — 高层命令实现）
- `plugins/browser-bridge/apps/cli/playwright.go`（新建 — Playwright 注入编排）
- `plugins/browser-bridge/apps/chrome-extension/src/background.js`（扩展命令处理）
- `plugins/browser-bridge/apps/chrome-extension/src/playwright-injected.js`（新建 — 注入脚本）
- 对应测试文件

## 任务清单

### 任务 3.1：Playwright 选择器引擎注入脚本

新建 `plugins/browser-bridge/apps/chrome-extension/src/playwright-injected.js`。

这是注入到目标页面的脚本，提供选择器引擎能力：

```javascript
// playwright-injected.js
// 注入到目标页面 (via Runtime.evaluate / Page.addScriptToEvaluateOnNewDocument)

(function() {
  if (window.__actspacePlaywright) return;

  const engine = {
    /** 核心查询：返回匹配的元素数组 */
    querySelectorAll(selector, root = document) {
      return Array.from(root.querySelectorAll(selector));
    },

    /** 严格模式定位：必须恰好匹配一个可见元素 */
    locateStrict(selector) {
      const all = this.querySelectorAll(selector);
      if (all.length === 0) {
        throw new Error(`selector_not_found: "${selector}" 未匹配到任何元素`);
      }
      const visible = all.filter(el => this.isVisible(el));
      if (visible.length === 0) {
        throw new Error(`element_not_visible: "${selector}" 匹配到 ${all.length} 个元素但全部不可见`);
      }
      if (visible.length > 1) {
        throw new Error(`selector_ambiguous: "${selector}" 匹配到 ${visible.length} 个可见元素`);
      }
      return visible[0];
    },

    /** 判断元素是否可见 */
    isVisible(element) {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none") return false;
      if (style.visibility === "hidden") return false;
      if (style.opacity === "0") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },

    /** 判断元素是否可用 */
    isEnabled(element) {
      if (element.disabled) return false;
      if (element.getAttribute("aria-disabled") === "true") return false;
      return true;
    },

    /** 获取元素中心坐标 */
    getClickPoint(element) {
      element.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    },

    /** 填充输入框 */
    fill(element, value, replace = true) {
      element.focus();
      if (replace) {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      // replace=false 时由外部通过 Input.insertText 处理
    },

    /** 选择下拉选项 */
    selectOptions(element, selections) {
      const options = Array.from(element.options);
      for (const sel of selections) {
        const match = options.find(opt =>
          (sel.value && opt.value === sel.value) ||
          (sel.label && opt.textContent.trim() === sel.label) ||
          (sel.valueOrLabel && (opt.value === sel.valueOrLabel || opt.textContent.trim() === sel.valueOrLabel))
        );
        if (match) match.selected = true;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    },

    /** 设置 checkbox 状态 */
    setChecked(element, checked) {
      if (element.checked === checked) return false;
      return true; // 需要点击
    },
  };

  window.__actspacePlaywright = engine;
})();
```

### 任务 3.2：Go bridge 高层命令实现（commands.go）

新建 `plugins/browser-bridge/apps/cli/commands.go`：

```go
// commands.go — 高层交互命令的编排逻辑

package main

import (
    "fmt"
    "time"
    "agent-browser-bridge/packages/protocol"
)

// handleClick 处理 click 命令
// 决策逻辑：有 selector → Playwright 流程；有 x,y → CUA 流程
func (sess *Session) handleClick(params protocol.ClickParams) protocol.ResponseEnvelope {
    if params.Selector != "" {
        return sess.playwrightClick(params)
    }
    if params.X != 0 || params.Y != 0 {
        return sess.cuaClick(params)
    }
    return errorResponse("invalid_params", "click 需要 selector 或 x,y 坐标")
}

// playwrightClick 使用选择器点击
func (sess *Session) playwrightClick(params protocol.ClickParams) protocol.ResponseEnvelope {
    // 1. 注入 Playwright 引擎（如果尚未注入）
    // 2. Runtime.evaluate: __actspacePlaywright.locateStrict(selector)
    // 3. Runtime.evaluate: __actspacePlaywright.getClickPoint(element)
    // 4. 得到坐标 → Input.dispatchMouseEvent (mousePressed + mouseReleased)
    // 5. 等待可能的导航事件（非阻塞，有 200ms 窗口）
    // 6. 返回成功
}

// cuaClick 使用坐标点击
func (sess *Session) cuaClick(params protocol.ClickParams) protocol.ResponseEnvelope {
    // 1. Input.dispatchMouseEvent(mouseMoved, x, y)
    // 2. Input.dispatchMouseEvent(mousePressed, x, y, button, clickCount=1)
    // 3. Input.dispatchMouseEvent(mouseReleased, x, y, button)
    // 4. 等待可能的导航事件
}

// handleFill 处理 fill 命令
func (sess *Session) handleFill(params protocol.FillParams) protocol.ResponseEnvelope {
    // 1. 注入 Playwright 引擎
    // 2. Runtime.evaluate: __actspacePlaywright.locateStrict(selector)
    // 3. Runtime.evaluate: __actspacePlaywright.getClickPoint(element) → 点击获得焦点
    // 4. 如果 replace=true:
    //    Runtime.evaluate: __actspacePlaywright.fill(element, value, true)
    // 5. 如果 replace=false:
    //    Input.dispatchKeyEvent(Ctrl+A) → Input.insertText(value)
}

// handlePressKey 处理按键命令
func (sess *Session) handlePressKey(params protocol.PressKeyParams) protocol.ResponseEnvelope {
    // 1. 如果有 selector → 先 locate 并 focus 元素
    // 2. 解析 keys 数组为 CDP keyDown/keyUp 序列
    // 3. 修饰键（Ctrl/Alt/Shift/Meta）先按下
    // 4. 主键 keyDown → keyUp
    // 5. 修饰键释放
    // 6. 处理跨平台：ControlOrMeta → darwin 用 Meta，其他用 Control
}

// handleSelectOption 处理下拉选择
func (sess *Session) handleSelectOption(params protocol.SelectOptionParams) protocol.ResponseEnvelope {
    // 1. 注入 Playwright 引擎
    // 2. locate select 元素
    // 3. Runtime.evaluate: __actspacePlaywright.selectOptions(element, selections)
}

// handleScroll 处理滚动
func (sess *Session) handleScroll(params protocol.ScrollParams) protocol.ResponseEnvelope {
    // 有 NodeID → dom_cua 模式，Runtime.evaluate element.scrollBy
    // 有 x,y → Input.synthesizeScrollGesture
    // 都没有 → 视口中心滚动
}
```

### 任务 3.3：Playwright 注入管理（playwright.go）

```go
// playwright.go — 管理 Playwright 引擎的注入状态

package main

import (
    _ "embed"
    "fmt"
)

//go:embed ../../apps/chrome-extension/src/playwright-injected.js
var playwrightScript string

type PlaywrightManager struct {
    injectedTabs map[int]bool // tabId → 是否已注入
}

func NewPlaywrightManager() *PlaywrightManager {
    return &PlaywrightManager{injectedTabs: make(map[int]bool)}
}

// EnsureInjected 确保目标 tab 已注入 Playwright 引擎
func (pm *PlaywrightManager) EnsureInjected(sess *Session, tabId int) error {
    if pm.injectedTabs[tabId] {
        // 验证仍然存活（页面可能已导航）
        alive := sess.cdpEval(tabId, "typeof window.__actspacePlaywright !== 'undefined'")
        if alive == "true" {
            return nil
        }
    }
    // 注入
    err := sess.cdpEval(tabId, playwrightScript)
    if err != nil {
        return fmt.Errorf("playwright inject failed: %w", err)
    }
    pm.injectedTabs[tabId] = true
    return nil
}

// OnNavigated 标记 tab 需要重新注入
func (pm *PlaywrightManager) OnNavigated(tabId int) {
    delete(pm.injectedTabs, tabId)
}
```

注意：`//go:embed` 路径需要确认相对路径是否正确。如果不方便使用 embed，可以将脚本内容作为常量字符串。

### 任务 3.4：CDP 执行封装

在 session.go 或新建 `cdp.go` 中封装 CDP 命令的发送和等待：

```go
// cdp.go

// cdpExec 发送 CDP 命令到 extension 并等待结果
func (sess *Session) cdpExec(tabId int, method string, params map[string]any) (map[string]any, error) {
    resp, err := sess.nativeConn.Send(protocol.RequestEnvelope{
        ProtocolVersion: protocol.ProtocolVersion,
        ID:              sess.nextID(),
        Method:          protocol.MethodCDP,
        Params: protocol.CDPParams{
            TabID:         tabId,
            Method:        method,
            CommandParams: params,
        },
    })
    if err != nil {
        return nil, err
    }
    if !resp.OK {
        return nil, fmt.Errorf("cdp %s failed: %s", method, resp.Error.Message)
    }
    result, _ := resp.Result.(map[string]any)
    return result, nil
}

// cdpEval 在目标 tab 中执行 JavaScript
func (sess *Session) cdpEval(tabId int, expression string) (string, error) {
    result, err := sess.cdpExec(tabId, "Runtime.evaluate", map[string]any{
        "expression":    expression,
        "returnByValue": true,
    })
    if err != nil {
        return "", err
    }
    // 解析 result.result.value
    if r, ok := result["result"].(map[string]any); ok {
        if v, ok := r["value"]; ok {
            return fmt.Sprintf("%v", v), nil
        }
    }
    return "", nil
}
```

### 任务 3.5：扩展 Chrome Extension 支持新命令

在 `plugins/browser-bridge/apps/chrome-extension/src/background.js` 的命令路由中：

当前 extension 已支持 `screenshot`、`tabs`、`navigate` 等。需要扩展：

1. **扩展 SUPPORTED_CDP_METHODS 白名单**：
```javascript
const SUPPORTED_CDP_METHODS = new Set([
  "Runtime.evaluate",
  "Runtime.callFunctionOn",
  "Page.navigate",
  "Page.captureScreenshot",
  "Page.getLayoutMetrics",
  "Page.getNavigationHistory",
  "Page.navigateToHistoryEntry",
  "Input.dispatchMouseEvent",
  "Input.dispatchKeyEvent",
  "Input.insertText",
  "Input.synthesizeScrollGesture",
  "DOM.getDocument",
  "DOM.querySelector",
]);
```

2. **新增 `dom_snapshot` handler**：
```javascript
case "agent_browser_bridge.dom_snapshot": {
  const { tabId } = params;
  const [tab] = await chrome.tabs.query({ active: true });
  const target = tabId ?? tab?.id;
  await ensureAttached(target);
  const result = await sendCDP(target, "Runtime.evaluate", {
    expression: "document.body?.innerText ?? ''",
    returnByValue: true,
  });
  return ok(id, { text: result?.result?.value ?? "" });
}
```

3. **新增 `close_tab` handler**：
```javascript
case "agent_browser_bridge.close_tab": {
  const { tabId } = params;
  await detachIfNeeded(tabId);
  await chrome.tabs.remove(tabId);
  state.ownedTabIds.delete(tabId);
  return ok(id, {});
}
```

### 任务 3.6：agent-core 新增交互工具定义

在 `definition.ts` 追加：

```typescript
export const browserClickDefinition: ToolDefinitionSpec = {
  name: "browser_click",
  description: "点击页面元素。优先使用 CSS 选择器定位，也支持坐标点击。选择器示例：'button[type=submit]'、'#login-btn'、'a.nav-link'。",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "目标标签页 ID" },
      selector: { type: "string", description: "CSS 选择器（优先使用，自动等待和滚动到可见）" },
      x: { type: "number", description: "点击 x 坐标（无选择器时使用，需配合截图）" },
      y: { type: "number", description: "点击 y 坐标" },
    },
    required: ["tab_id"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_click",
};

export const browserFillDefinition: ToolDefinitionSpec = {
  name: "browser_fill",
  description: "在输入框中填写内容。通过 CSS 选择器定位目标 input/textarea 元素，清空现有内容后填入新值。",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "目标标签页 ID" },
      selector: { type: "string", description: "目标输入框的 CSS 选择器" },
      value: { type: "string", description: "要填入的文本内容" },
    },
    required: ["tab_id", "selector", "value"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_fill",
};

export const browserPressKeyDefinition: ToolDefinitionSpec = {
  name: "browser_press_key",
  description: "在页面上按键或组合键。如 Enter 提交表单、Tab 切换焦点、Escape 关闭弹窗等。",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "目标标签页 ID" },
      selector: { type: "string", description: "可选，先聚焦此元素再按键" },
      keys: {
        type: "array",
        items: { type: "string" },
        description: "按键序列，如 ['Enter']、['Control', 'a']、['Tab']",
      },
    },
    required: ["tab_id", "keys"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_press_key",
};

export const browserSelectDefinition: ToolDefinitionSpec = {
  name: "browser_select",
  description: "选择下拉框（<select>）中的选项。通过 value 或 label 文本匹配。",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "目标标签页 ID" },
      selector: { type: "string", description: "目标 select 元素的 CSS 选择器" },
      value: { type: "string", description: "选项的 value 属性值（优先）" },
      label: { type: "string", description: "选项的显示文本（value 未提供时使用）" },
    },
    required: ["tab_id", "selector"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_select",
};

export const browserScrollDefinition: ToolDefinitionSpec = {
  name: "browser_scroll",
  description: "在页面或指定元素内滚动。正数向下/右滚动，负数向上/左滚动。",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "目标标签页 ID" },
      direction: {
        type: "string",
        enum: ["up", "down", "left", "right"],
        description: "滚动方向",
      },
      amount: { type: "number", description: "滚动像素数，默认 500" },
      selector: { type: "string", description: "可选，在此元素内滚动" },
    },
    required: ["tab_id", "direction"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_scroll",
};

export const browserBackDefinition: ToolDefinitionSpec = {
  name: "browser_back",
  description: "浏览器后退到上一页。",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "目标标签页 ID" },
    },
    required: ["tab_id"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_back",
};
```

### 任务 3.7：agent-core 新增交互工具 executor

在 `executor.ts` 追加：

```typescript
export const browserClickExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const params: Record<string, unknown> = { tabId: args.tab_id };
  if (args.selector) params.selector = args.selector;
  if (args.x !== undefined) params.x = args.x;
  if (args.y !== undefined) params.y = args.y;
  await client.send("agent_browser_bridge.click", params);
  const target = args.selector ? `selector="${args.selector}"` : `(${args.x}, ${args.y})`;
  return { output: `点击完成: ${target}` };
};

export const browserFillExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  await client.send("agent_browser_bridge.fill", {
    tabId: args.tab_id,
    selector: args.selector,
    value: args.value,
    replace: true,
  });
  return { output: `填写完成: "${args.selector}" → "${String(args.value).slice(0, 50)}"` };
};

export const browserPressKeyExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  await client.send("agent_browser_bridge.press_key", {
    tabId: args.tab_id,
    selector: args.selector,
    keys: args.keys,
  });
  return { output: `按键完成: ${(args.keys as string[]).join("+")}` };
};

export const browserSelectExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const selections = [{ value: args.value, label: args.label }];
  await client.send("agent_browser_bridge.select_option", {
    tabId: args.tab_id,
    selector: args.selector,
    selections,
  });
  return { output: `选择完成: "${args.selector}" → ${args.value || args.label}` };
};

export const browserScrollExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const amount = (args.amount as number) ?? 500;
  let scrollX = 0, scrollY = 0;
  switch (args.direction) {
    case "down": scrollY = amount; break;
    case "up": scrollY = -amount; break;
    case "right": scrollX = amount; break;
    case "left": scrollX = -amount; break;
  }
  await client.send("agent_browser_bridge.scroll", {
    tabId: args.tab_id,
    scrollX,
    scrollY,
  });
  return { output: `滚动完成: ${args.direction} ${amount}px` };
};

export const browserBackExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  // 使用 CDP Page.getNavigationHistory + navigateToHistoryEntry
  await client.send("agent_browser_bridge.navigate_back", { tabId: args.tab_id });
  return { output: "后退完成" };
};
```

### 任务 3.8：导航等待逻辑（Go bridge 内部）

click 和 navigate 命令执行后需要等待页面稳定。在 Go bridge 中实现：

```go
// wait.go

const defaultNavigationTimeout = 10 * time.Second
const postClickWaitWindow = 300 * time.Millisecond

// waitForNavigation 等待导航事件完成
// 在 click/navigate 之前注册监听，执行后等待
func (sess *Session) waitForNavigation(tabId int, timeout time.Duration) error {
    // 1. 监听 extension 推送的 Page.loadEventFired 事件
    // 2. 如果在 timeout 内收到 → 返回 nil
    // 3. 如果超时 → 不报错（有些 click 不触发导航）
    // 4. 如果收到 Page.navigationBlocked → 返回 ErrorNavigationBlocked
}

// waitForPostClick click 后的短暂等待窗口
// 如果 200ms 内有导航开始，则继续等到导航完成
func (sess *Session) waitForPostClick(tabId int) {
    // 非阻塞等待：检查是否有 Page.frameStartedLoading
    // 如果有 → waitForNavigation(tabId, defaultNavigationTimeout)
    // 如果没有 → 直接返回
}
```

### 任务 3.9：测试

测试文件：
- `plugins/browser-bridge/apps/cli/commands_test.go`
- `packages/agent-core/src/tools/tools/browser/test/interaction.test.ts`

Go 侧测试：
- mock CDP 响应，验证 click/fill/scroll 的 CDP 命令序列正确
- 验证 selector 模式和坐标模式的分支路由
- 验证导航等待逻辑

TS 侧测试：
- mock socket server，验证 executor 正确构造请求
- 验证参数校验（缺少 tab_id 报错等）
- 验证输出格式

验证命令：
```bash
cd plugins/browser-bridge && go test ./apps/cli/ -v -run TestCommand
cd packages/agent-core && pnpm vitest run src/tools/tools/browser/test/interaction.test.ts
```

## 验证方式

- Go 侧编译通过 + 测试 PASS
- TS 侧 `pnpm build` 通过 + 测试 PASS
- 端到端验证：启动 Go bridge serve 模式 → TS 侧调用 click/fill → 通过 mock extension 验证 CDP 命令正确生成

## 回退策略

- Go 侧：删除 commands.go、playwright.go、cdp.go、wait.go
- TS 侧：从 definition.ts 和 executor.ts 移除新增代码
- Extension：revert SUPPORTED_CDP_METHODS 和新 handler
