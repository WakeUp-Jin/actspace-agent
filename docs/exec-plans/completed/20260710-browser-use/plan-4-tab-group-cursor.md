# Plan 4: Tab Group + 光标可视化 + Chrome Extension 升级

状态：已完成

依赖：Plan 3（交互命令可用，session 已建立）
产物消费方：无（本阶段为首版完整能力）

## 目标

实现三个增强用户体验的能力：
1. Tab Group 管理：Agent 创建的标签页自动分组，结束时清理
2. 光标可视化：在被操控页面上显示 Agent 虚拟光标
3. Chrome Extension 从最小功能升级到完整浏览器 session 管理

## 允许修改的文件

- `plugins/browser-bridge/apps/chrome-extension/manifest.json`（追加权限）
- `plugins/browser-bridge/apps/chrome-extension/src/background.js`（Tab Group 逻辑）
- `plugins/browser-bridge/apps/chrome-extension/src/content-cursor.js`（新建 — 光标渲染）
- `plugins/browser-bridge/apps/chrome-extension/src/content-cursor.css`（新建 — 光标样式）
- `plugins/browser-bridge/apps/cli/session.go`（追加 Tab Group 编排）
- `packages/agent-core/src/tools/tools/browser/definition.ts`（追加 finalize 等工具）
- `packages/agent-core/src/tools/tools/browser/executor.ts`（追加 executor）
- 对应测试文件

## 任务清单

### 任务 4.1：Chrome Extension 权限升级

更新 `manifest.json`：

```json
{
  "manifest_version": 3,
  "name": "ActSpace Browser Bridge",
  "version": "0.2.0",
  "permissions": [
    "tabs",
    "debugger",
    "nativeMessaging",
    "tabGroups",
    "history",
    "downloads",
    "clipboardRead",
    "clipboardWrite",
    "activeTab",
    "scripting"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content-cursor.js"],
      "css": ["src/content-cursor.css"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ]
}
```

新增权限说明：
- `tabGroups`：创建和管理标签组
- `history`：搜索用户浏览历史
- `downloads`：追踪下载状态
- `clipboardRead/Write`：剪贴板操作（Phase 4 预留）
- `scripting`：动态注入脚本
- `content_scripts`：光标渲染

### 任务 4.2：Tab Group 管理实现

在 `background.js` 中新增 Tab Group 管理模块：

```javascript
// Tab Group 管理
const tabGroupState = {
  sessionGroupId: null,       // 当前 session 的 group ID
  sessionGroupColor: null,
  deliverableGroupId: null,   // "✅" 固定 group
};

const GROUP_COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

async function ensureSessionGroup(sessionName) {
  if (tabGroupState.sessionGroupId !== null) {
    // 检查 group 是否仍然存在
    try {
      await chrome.tabGroups.get(tabGroupState.sessionGroupId);
      return tabGroupState.sessionGroupId;
    } catch {
      tabGroupState.sessionGroupId = null;
    }
  }

  // 创建新 group：需要至少一个 tab
  // 先不创建 group，等第一个 tab 创建时自动加入
  return null;
}

async function addTabToSessionGroup(tabId) {
  if (tabGroupState.sessionGroupId === null) {
    // 创建 group
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });
    const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
    await chrome.tabGroups.update(groupId, {
      title: "actspace",
      color,
      collapsed: false,
    });
    tabGroupState.sessionGroupId = groupId;
    tabGroupState.sessionGroupColor = color;
  } else {
    // 加入现有 group
    await chrome.tabs.group({ tabIds: [tabId], groupId: tabGroupState.sessionGroupId });
  }
}

async function handleNameSession(id, params) {
  const { name } = params;
  if (tabGroupState.sessionGroupId !== null) {
    await chrome.tabGroups.update(tabGroupState.sessionGroupId, { title: name });
  }
  return ok(id, {});
}

async function handleFinalizeTabs(id, params) {
  const { keep } = params;
  const keepIds = new Set(keep.map(k => k.tabId));
  const deliverableIds = keep.filter(k => k.status === "deliverable").map(k => k.tabId);

  // 找出 session 中所有 tab
  const sessionTabs = [...state.ownedTabIds];
  const toClose = sessionTabs.filter(tid => !keepIds.has(tid));

  // 关闭不需要的 tab
  for (const tid of toClose) {
    try {
      await detachIfNeeded(tid);
      await chrome.tabs.remove(tid);
    } catch { /* tab 可能已被用户关闭 */ }
    state.ownedTabIds.delete(tid);
  }

  // deliverable tab 移入 "✅" 分组
  if (deliverableIds.length > 0) {
    if (tabGroupState.deliverableGroupId === null) {
      const groupId = await chrome.tabs.group({ tabIds: deliverableIds });
      await chrome.tabGroups.update(groupId, {
        title: "✅ actspace",
        color: "blue",
        collapsed: false,
      });
      tabGroupState.deliverableGroupId = groupId;
    } else {
      await chrome.tabs.group({
        tabIds: deliverableIds,
        groupId: tabGroupState.deliverableGroupId,
      });
    }
  }

  // 清空 session group（如果为空）
  if (tabGroupState.sessionGroupId !== null) {
    try {
      const group = await chrome.tabGroups.get(tabGroupState.sessionGroupId);
      // chrome 没有 API 直接获取 group 内的 tab 数量
      // 通过查询实现
      const tabs = await chrome.tabs.query({ groupId: tabGroupState.sessionGroupId });
      if (tabs.length === 0) {
        // group 自动消失（Chrome 行为：空 group 会被删除）
        tabGroupState.sessionGroupId = null;
      }
    } catch {
      tabGroupState.sessionGroupId = null;
    }
  }

  return ok(id, { closed: toClose, kept: [...keepIds] });
}
```

同时修改 `open_tab` handler，创建 tab 后自动加入 group：

```javascript
case "agent_browser_bridge.open_tab": {
  const { url, active } = params;
  const tab = await chrome.tabs.create({ url, active: active ?? false });
  state.ownedTabIds.add(tab.id);
  await addTabToSessionGroup(tab.id);  // ← 新增
  return ok(id, normalizeTab(tab));
}
```

### 任务 4.3：光标可视化 Content Script

新建 `plugins/browser-bridge/apps/chrome-extension/src/content-cursor.js`：

```javascript
// content-cursor.js — Agent 光标渲染
(function() {
  let cursor = null;
  let animationFrame = null;
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let visible = false;

  function createCursor() {
    if (cursor) return;
    cursor = document.createElement("div");
    cursor.id = "__actspace-agent-cursor";
    cursor.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M5 3l14 8-6 2-2 6z" fill="#4F46E5" stroke="#fff" stroke-width="1.5"/>
      </svg>
    `;
    document.body.appendChild(cursor);
  }

  function updatePosition() {
    if (!cursor || !visible) return;

    // 平滑插值
    const dx = targetX - currentX;
    const dy = targetY - currentY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) {
      currentX = targetX;
      currentY = targetY;
    } else {
      const speed = Math.min(dist * 0.3, 50);
      currentX += (dx / dist) * speed;
      currentY += (dy / dist) * speed;
      animationFrame = requestAnimationFrame(updatePosition);
    }

    cursor.style.transform = `translate(${currentX}px, ${currentY}px)`;
  }

  function moveTo(x, y) {
    createCursor();
    targetX = x;
    targetY = y;
    visible = true;
    cursor.classList.add("visible");

    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(updatePosition);
  }

  function hide() {
    visible = false;
    if (cursor) cursor.classList.remove("visible");
  }

  function showClickRipple(x, y) {
    const ripple = document.createElement("div");
    ripple.className = "__actspace-click-ripple";
    ripple.style.left = x + "px";
    ripple.style.top = y + "px";
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  // 监听来自 background.js 的消息
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "AGENT_CURSOR_MOVE") {
      moveTo(msg.x, msg.y);
      sendResponse({ ok: true });
    } else if (msg.type === "AGENT_CURSOR_CLICK") {
      moveTo(msg.x, msg.y);
      setTimeout(() => showClickRipple(msg.x, msg.y), 150);
      sendResponse({ ok: true });
    } else if (msg.type === "AGENT_CURSOR_HIDE") {
      hide();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Tab 不再活跃时隐藏
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hide();
  });
})();
```

新建 `plugins/browser-bridge/apps/chrome-extension/src/content-cursor.css`：

```css
#__actspace-agent-cursor {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483647;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  will-change: transform;
}

#__actspace-agent-cursor.visible {
  opacity: 1;
}

.__actspace-click-ripple {
  position: fixed;
  width: 20px;
  height: 20px;
  margin-left: -10px;
  margin-top: -10px;
  border-radius: 50%;
  background: rgba(79, 70, 229, 0.3);
  pointer-events: none;
  z-index: 2147483646;
  animation: __actspace-ripple 0.6s ease-out forwards;
}

@keyframes __actspace-ripple {
  0% {
    transform: scale(0.5);
    opacity: 1;
  }
  100% {
    transform: scale(3);
    opacity: 0;
  }
}
```

### 任务 4.4：Background.js 集成光标消息

在 background.js 的 click 处理逻辑前，发送光标移动消息：

```javascript
async function moveCursor(tabId, x, y, click = false) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: click ? "AGENT_CURSOR_CLICK" : "AGENT_CURSOR_MOVE",
      x,
      y,
    });
  } catch {
    // Content script 可能未注入（chrome:// 页面等），忽略
  }
}

async function hideCursor(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "AGENT_CURSOR_HIDE" });
  } catch {}
}
```

在处理 CDP click 之前调用 `moveCursor`：

修改 CDP Input.dispatchMouseEvent 的前置逻辑，如果是 Go bridge 发来的请求（通过 session 标记判断），先发光标消息。

### 任务 4.5：Go Bridge Session 管理增强

在 `session.go` 中追加 session 名称和 finalize 支持：

```go
func (sess *Session) handleNameSession(params protocol.NameSessionParams) protocol.ResponseEnvelope {
    // 转发给 extension
    return sess.forwardToExtension("agent_browser_bridge.name_session", params)
}

func (sess *Session) handleFinalizeTabs(params protocol.FinalizeTabsParams) protocol.ResponseEnvelope {
    // 转发给 extension
    resp := sess.forwardToExtension("agent_browser_bridge.finalize_tabs", params)
    // finalize 后隐藏光标
    sess.forwardToExtension("agent_browser_bridge.hide_cursor", nil)
    return resp
}
```

### 任务 4.6：agent-core 新增 Tab 管理工具

在 `definition.ts` 追加：

```typescript
export const browserCloseTabDefinition: ToolDefinitionSpec = {
  name: "browser_close_tab",
  description: "关闭指定的浏览器标签页。",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "要关闭的标签页 ID" },
    },
    required: ["tab_id"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_close_tab",
};

export const browserUserTabsDefinition: ToolDefinitionSpec = {
  name: "browser_user_tabs",
  description: "列出用户浏览器中所有打开的标签页（不只是 Agent session 内的）。用于了解用户当前在做什么。",
  parameters: {
    type: "object",
    properties: {},
  },
  isReadOnly: true,
  category: "browser",
  previewKind: "browser_user_tabs",
};

export const browserClaimTabDefinition: ToolDefinitionSpec = {
  name: "browser_claim_tab",
  description: "将用户现有的标签页纳入 Agent session 控制。之后可以对该 tab 执行自动化操作。",
  parameters: {
    type: "object",
    properties: {
      tab_id: { type: "number", description: "要接管的标签页 ID（从 browser_user_tabs 获取）" },
    },
    required: ["tab_id"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_claim_tab",
};

export const browserFinalizeDefinition: ToolDefinitionSpec = {
  name: "browser_finalize",
  description: "清理浏览器 session。保留重要标签页作为交付物，关闭临时标签页。在浏览器任务结束时调用。",
  parameters: {
    type: "object",
    properties: {
      keep: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tab_id: { type: "number" },
            status: { type: "string", enum: ["deliverable", "handoff"] },
          },
          required: ["tab_id", "status"],
        },
        description: "要保留的标签页列表。deliverable=用户的成果，handoff=待继续处理。",
      },
    },
    required: ["keep"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_finalize",
};
```

### 任务 4.7：agent-core 新增 Tab 管理 executor

```typescript
export const browserCloseTabExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  await client.send("agent_browser_bridge.close_tab", { tabId: args.tab_id });
  return { output: `标签页 ${args.tab_id} 已关闭` };
};

export const browserUserTabsExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const result = await client.send("agent_browser_bridge.user_tabs", {});
  const r = result as { tabs: Array<{ id: number; title: string; url: string; active: boolean }> };
  const lines = r.tabs.map(t =>
    `[${t.id}] ${t.active ? "* " : "  "}${t.title} — ${t.url}`
  );
  return { output: lines.join("\n") || "无打开的标签页" };
};

export const browserClaimTabExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const result = await client.send("agent_browser_bridge.claim_tab", { tabId: args.tab_id });
  const r = result as { id: number; title: string; url: string };
  return { output: `已接管标签页: [${r.id}] ${r.title}` };
};

export const browserFinalizeExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const keep = (args.keep as Array<{ tab_id: number; status: string }>).map(k => ({
    tabId: k.tab_id,
    status: k.status,
  }));
  const result = await client.send("agent_browser_bridge.finalize_tabs", { keep });
  const r = result as { closed: number[]; kept: number[] };
  return {
    output: `Session 清理完成。保留 ${r.kept.length} 个标签页，关闭 ${r.closed.length} 个。`,
  };
};
```

### 任务 4.8：测试

**Chrome Extension 测试**（手动）：
1. 加载 unpacked extension
2. 验证 Tab Group 创建（打开新 tab → 看到分组）
3. 验证 name_session（调用后 group 标题变化）
4. 验证 finalize_tabs（标签页正确关闭/移组）
5. 验证光标显示和移动动画

**Go Bridge 测试**（自动化）：
```bash
cd plugins/browser-bridge && go test ./apps/cli/ -v -run TestTabGroup
cd plugins/browser-bridge && go test ./apps/cli/ -v -run TestFinalize
```

测试内容：
- session.handleNameSession 正确转发
- session.handleFinalizeTabs 在 extension 返回后正确返回
- 异常场景：extension 断开时的优雅降级

**agent-core 测试**（自动化）：
```bash
cd packages/agent-core && pnpm vitest run src/tools/tools/browser/test/tab-management.test.ts
```

测试内容：
- browserFinalizeExecutor 正确构造 keep 列表
- browserClaimTabExecutor 输出格式
- browserUserTabsExecutor 列表格式

## 验证方式

- `cd plugins/browser-bridge && go build ./... && go test ./...` 通过
- `pnpm build && pnpm vitest run packages/agent-core/src/tools/tools/browser/` 通过
- 手动验证 Chrome Extension：
  - 安装 extension → 启动 abb serve → 通过测试客户端发送 open_tab → 看到 Tab Group 出现
  - 发送光标移动命令 → 页面上看到紫色光标动画
  - 发送 finalize → 临时 tab 关闭，deliverable tab 移入 "✅" 分组

## 回退策略

- Extension 侧：revert manifest.json 权限 + 删除 content-cursor.* + 删除 Tab Group 代码
- Go 侧：从 session.go 移除 name_session/finalize 增强
- TS 侧：从 definition.ts/executor.ts 移除新增工具
