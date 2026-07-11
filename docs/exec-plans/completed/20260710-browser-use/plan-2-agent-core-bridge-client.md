# Plan 2: agent-core BridgeClient + 基础工具注册

状态：已完成

依赖：Plan 1（Go socket server 可运行）
产物消费方：Plan 3（交互命令扩展此基础）

## 目标

在 `packages/agent-core` 中实现 BridgeClient（Unix socket 长连接客户端）和首批 5 个浏览器工具（screenshot、dom_snapshot、navigate、open_tab、list_tabs），让模型能通过标准工具调用操作浏览器。

## 允许修改的文件

- `packages/agent-core/src/tools/tools/browser/`（新建目录）
  - `definition.ts`
  - `executor.ts`
  - `bridge-client.ts`
  - `types.ts`
- `packages/agent-core/src/tools/index.ts`（追加导出）
- `packages/agent-core/src/tools/tools/browser/test/`（新建测试目录）
  - `bridge-client.test.ts`
  - `executor.test.ts`
- `packages/shared/src/model-config.ts`（如需在 tool catalog 中注册）
- `packages/desktop/src/renderer/components/settings/tool-catalog.ts`（追加工具条目）

## 任务清单

### 任务 2.1：定义 BridgeClient 类型（types.ts）

```typescript
// packages/agent-core/src/tools/tools/browser/types.ts

export interface BridgeRequest {
  protocolVersion: string;
  id: string;
  method: string;
  params?: unknown;
}

export interface BridgeResponse {
  protocolVersion: string;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface BridgeEvent {
  protocolVersion: string;
  method: string;
  params?: unknown;
}

export interface BridgeClientOptions {
  socketPath: string;
  sessionId: string;
  turnId: string;
  timeoutMs?: number;  // 单次请求超时，默认 30000
}

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  active: boolean;
}

export interface ScreenshotResult {
  mimeType: string;
  data: string;  // base64
  bytes?: number;
}

export interface DomSnapshotResult {
  text: string;
}
```

### 任务 2.2：实现 BridgeClient（bridge-client.ts）

```typescript
// packages/agent-core/src/tools/tools/browser/bridge-client.ts

import * as net from "net";

export class BridgeClient {
  private socket: net.Socket | null = null;
  private connected = false;
  private pendingRequests: Map<string, { resolve, reject, timer }>;
  private requestCounter = 0;
  private readBuffer = Buffer.alloc(0);
  private options: BridgeClientOptions;

  constructor(options: BridgeClientOptions) {}

  /** 惰性连接 — 第一次 send 时自动调用 */
  async connect(): Promise<void> {
    // 1. net.createConnection(this.options.socketPath)
    // 2. 等待 'connect' 事件
    // 3. 设置 data handler（调用 handleData）
    // 4. 发送 session.start 请求
  }

  /** 发送请求并等待响应 */
  async send(method: string, params?: unknown): Promise<unknown> {
    // 1. 如果未连接，先 connect()
    // 2. 生成 id（递增计数器）
    // 3. 构造 BridgeRequest
    // 4. 写入帧（4 byte length header + JSON payload）
    // 5. 返回 Promise，注册到 pendingRequests
    // 6. 设置超时 timer
  }

  /** 关闭连接 */
  async dispose(): Promise<void> {
    // 1. 发送 session.end
    // 2. 关闭 socket
    // 3. reject 所有 pending requests
  }

  /** 处理收到的数据，拼帧 */
  private handleData(chunk: Buffer): void {
    // 1. 追加到 readBuffer
    // 2. 循环：如果 buffer >= 4 bytes，读 length
    // 3. 如果 buffer >= 4 + length，提取 payload
    // 4. JSON.parse → 判断有 id → response / 无 id → event
    // 5. response → 从 pendingRequests 取出并 resolve
    // 6. event → 调用 onEvent callback（如有）
  }

  /** 写入一帧 */
  private writeFrame(payload: Buffer): void {
    // 4 bytes native endian uint32 + payload
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);
    this.socket!.write(header);
    this.socket!.write(payload);
  }
}
```

关键设计决策：
- 帧格式与 Go bridge 完全一致：4 byte LE uint32 + JSON payload
- 惰性连接：首次 `send()` 触发 `connect()`
- 超时默认 30s，可配置
- `dispose()` 在 turn 结束时由 executor 调用

### 任务 2.3：实现工具定义（definition.ts）

首阶段 5 个工具：

```typescript
// packages/agent-core/src/tools/tools/browser/definition.ts

import type { ToolDefinitionSpec } from "../../types";

export const browserScreenshotDefinition: ToolDefinitionSpec = {
  name: "browser_screenshot",
  description: "截取当前浏览器标签页的可视区域截图。返回 base64 编码的图片数据。",
  parameters: {
    type: "object",
    properties: {
      tab_id: {
        type: "number",
        description: "目标标签页 ID。使用 browser_list_tabs 获取可用 tab。",
      },
    },
    required: ["tab_id"],
  },
  isReadOnly: true,
  category: "browser",
  previewKind: "browser_screenshot",
};

export const browserDomSnapshotDefinition: ToolDefinitionSpec = {
  name: "browser_dom_snapshot",
  description: "获取当前标签页的纯文本内容（body innerText）。适合快速了解页面内容，无需截图。",
  parameters: {
    type: "object",
    properties: {
      tab_id: {
        type: "number",
        description: "目标标签页 ID",
      },
    },
    required: ["tab_id"],
  },
  isReadOnly: true,
  category: "browser",
  previewKind: "browser_dom_snapshot",
};

export const browserNavigateDefinition: ToolDefinitionSpec = {
  name: "browser_navigate",
  description: "将标签页导航到指定 URL。等待页面加载完成后返回。",
  parameters: {
    type: "object",
    properties: {
      tab_id: {
        type: "number",
        description: "目标标签页 ID",
      },
      url: {
        type: "string",
        description: "目标 URL（必须包含协议前缀 http:// 或 https://）",
      },
    },
    required: ["tab_id", "url"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_navigate",
};

export const browserOpenTabDefinition: ToolDefinitionSpec = {
  name: "browser_open_tab",
  description: "在浏览器中打开新标签页并导航到指定 URL。返回新标签页的 ID。",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "要打开的 URL",
      },
    },
    required: ["url"],
  },
  isReadOnly: false,
  category: "browser",
  previewKind: "browser_open_tab",
};

export const browserListTabsDefinition: ToolDefinitionSpec = {
  name: "browser_list_tabs",
  description: "列出当前浏览器 session 中的所有标签页，包含 ID、标题和 URL。",
  parameters: {
    type: "object",
    properties: {},
  },
  isReadOnly: true,
  category: "browser",
  previewKind: "browser_list_tabs",
};
```

注意：`previewKind` 需要在 `packages/shared` 中注册新的类型值。如果现有 `ToolPreviewKind` 是字面量联合类型，需要追加。

### 任务 2.4：实现工具执行器（executor.ts）

```typescript
// packages/agent-core/src/tools/tools/browser/executor.ts

import { BridgeClient } from "./bridge-client";
import type { ToolResult } from "../../../internal-tools";
import type { ToolExecutorFn } from "../../types";

let sharedClient: BridgeClient | null = null;

function getSocketPath(): string {
  // 约定路径规则：
  // 环境变量 ABB_SOCKET_PATH 优先
  // 否则 /tmp/actspace-browser-bridge/<pid>.sock
  return process.env.ABB_SOCKET_PATH
    ?? `/tmp/actspace-browser-bridge/${process.pid}.sock`;
}

function getClient(): BridgeClient {
  if (!sharedClient) {
    sharedClient = new BridgeClient({
      socketPath: getSocketPath(),
      sessionId: `sess_${Date.now()}`,
      turnId: `turn_${Date.now()}`,
    });
  }
  return sharedClient;
}

export const browserScreenshotExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const result = await client.send("agent_browser_bridge.screenshot", {
    tabId: args.tab_id,
  });
  // result: { mimeType, data, bytes }
  const r = result as { mimeType: string; data: string; bytes?: number };
  return {
    output: `[截图完成] ${r.bytes ?? 0} bytes, ${r.mimeType}`,
    metadata: { imageData: r.data, mimeType: r.mimeType },
  };
};

export const browserDomSnapshotExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const result = await client.send("agent_browser_bridge.dom_snapshot", {
    tabId: args.tab_id,
  });
  const r = result as { text: string };
  const truncated = r.text.length > 8000 ? r.text.slice(0, 8000) + "\n...[truncated]" : r.text;
  return { output: truncated };
};

export const browserNavigateExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  await client.send("agent_browser_bridge.navigate", {
    tabId: args.tab_id,
    url: args.url,
  });
  return { output: `导航完成: ${args.url}` };
};

export const browserOpenTabExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const result = await client.send("agent_browser_bridge.open_tab", {
    url: args.url,
    active: false,
  });
  const r = result as { id: number; title: string; url: string };
  return { output: `新标签页已创建: tab_id=${r.id}, url=${r.url}` };
};

export const browserListTabsExecutor: ToolExecutorFn = async (args) => {
  const client = getClient();
  const result = await client.send("agent_browser_bridge.tabs", {});
  const r = result as { tabs: Array<{ id: number; title: string; url: string; active: boolean }> };
  const lines = r.tabs.map(t =>
    `[${t.id}] ${t.active ? "* " : "  "}${t.title} — ${t.url}`
  );
  return { output: lines.join("\n") || "无打开的标签页" };
};

/** Turn 结束时调用，清理连接 */
export async function disposeBrowserClient(): Promise<void> {
  if (sharedClient) {
    await sharedClient.dispose();
    sharedClient = null;
  }
}
```

### 任务 2.5：注册工具到 index.ts

在 `packages/agent-core/src/tools/index.ts` 追加：

```typescript
// 工具定义
export {
  browserScreenshotDefinition,
  browserDomSnapshotDefinition,
  browserNavigateDefinition,
  browserOpenTabDefinition,
  browserListTabsDefinition,
} from "./tools/browser/definition";

// 工具执行器
export {
  browserScreenshotExecutor,
  browserDomSnapshotExecutor,
  browserNavigateExecutor,
  browserOpenTabExecutor,
  browserListTabsExecutor,
  disposeBrowserClient,
} from "./tools/browser/executor";
```

### 任务 2.6：在 ToolManager 中注册浏览器工具

参考现有工具注册方式，在 ToolManager 初始化时追加浏览器工具的定义和 executor 映射。

需要注意：
- 浏览器工具应受 `requiresKey` 或类似机制控制（bridge 不可用时不暴露给模型）
- 添加条件检查：`process.env.ABB_SOCKET_PATH` 存在 或 socket 文件存在时才注册

建议新增字段：
```typescript
// ToolDefinitionSpec 追加
requiresBridge?: "browser";  // 表示需要 browser bridge 可用
```

或更简单的方式：在 exposure.ts 中添加 browser 可用性检查。

### 任务 2.7：Turn 结束时清理连接

在 turn 结束的 cleanup 逻辑中调用 `disposeBrowserClient()`。

检查 `packages/agent-core/src/engine/loop.ts` 或 `bridge.ts` 中 turn 结束的位置，追加调用。

### 任务 2.8：编写 BridgeClient 单元测试

`packages/agent-core/src/tools/tools/browser/test/bridge-client.test.ts`

测试场景（使用本地 mock Unix socket server）：

1. **连接成功**：启动 mock server → 创建 BridgeClient → connect → 验证连接建立
2. **send 请求响应**：发送 ping → 收到 pong
3. **自动重连**：连接后 server 关闭 → 再次 send → 自动重连
4. **超时处理**：server 不回复 → send 超时 → reject with timeout error
5. **dispose 清理**：connect → dispose → socket 关闭

Mock server 实现：
```typescript
import * as net from "net";

function createMockServer(socketPath: string, handler: (req) => any): net.Server {
  const server = net.createServer((conn) => {
    let buffer = Buffer.alloc(0);
    conn.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const len = buffer.readUInt32LE(0);
        if (buffer.length < 4 + len) break;
        const payload = buffer.slice(4, 4 + len);
        buffer = buffer.slice(4 + len);
        const req = JSON.parse(payload.toString());
        const resp = handler(req);
        const respBuf = Buffer.from(JSON.stringify(resp));
        const header = Buffer.alloc(4);
        header.writeUInt32LE(respBuf.length);
        conn.write(header);
        conn.write(respBuf);
      }
    });
  });
  server.listen(socketPath);
  return server;
}
```

验证命令：
```bash
cd packages/agent-core && pnpm vitest run src/tools/tools/browser/test/bridge-client.test.ts
```

### 任务 2.9：编写 Executor 集成测试

`packages/agent-core/src/tools/tools/browser/test/executor.test.ts`

使用同样的 mock server，测试 executor 端到端流程：

1. 启动 mock server，配置环境变量 `ABB_SOCKET_PATH`
2. 调用 `browserListTabsExecutor` → 验证输出格式
3. 调用 `browserScreenshotExecutor` → 验证 metadata 中有 imageData
4. 调用 `browserNavigateExecutor` → 验证返回 "导航完成"
5. 调用 `disposeBrowserClient` → mock server 检测到连接关闭

验证命令：
```bash
cd packages/agent-core && pnpm vitest run src/tools/tools/browser/test/executor.test.ts
```

## 验证方式

- `pnpm build` 编译通过（agent-core 新代码无类型错误）
- `pnpm vitest run packages/agent-core/src/tools/tools/browser/` 全部 PASS
- 手动验证：启动 `abb serve --socket /tmp/test.sock` → 设置 `ABB_SOCKET_PATH=/tmp/test.sock` → 执行测试调用

## 回退策略

- 删除 `packages/agent-core/src/tools/tools/browser/` 目录
- 从 `index.ts` 移除导出
- 从 ToolManager 注册处移除浏览器工具
