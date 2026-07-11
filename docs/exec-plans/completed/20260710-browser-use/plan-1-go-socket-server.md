# Plan 1: Go Bridge Socket Server 模式

状态：已完成

依赖：Plan 0-pre（仓库合并）、Plan 0（协议契约）
产物消费方：Plan 2（agent-core BridgeClient 连接此 socket）

## 目标

为 Go bridge (`abb`) 新增 socket server 运行模式。启动后监听 Unix socket，接受来自 agent-core 的长连接，处理 JSON-RPC 请求并转发给 Chrome Extension。现有 CLI 子命令模式保持不变（向后兼容）。

## 允许修改的文件

- `plugins/browser-bridge/apps/cli/main.go`（新增 `serve` 子命令入口）
- `plugins/browser-bridge/apps/cli/server.go`（新建 — socket server 核心）
- `plugins/browser-bridge/apps/cli/session.go`（新建 — session 生命周期管理）
- `plugins/browser-bridge/apps/cli/events.go`（新建 — 事件路由和广播）
- `plugins/browser-bridge/apps/cli/main_test.go`（扩展）
- `plugins/browser-bridge/apps/cli/server_test.go`（新建）

## 任务清单

### 任务 1.1：新增 `serve` 子命令入口

在 `main.go` 的命令路由中新增 `serve` 子命令：

```go
case "serve":
    return cmdServe(args[1:])
```

`cmdServe` 签名：
```go
func cmdServe(args []string) int {
    // 解析参数：--socket <path>（必填）
    // 启动 socket server
    // 阻塞直到信号（SIGINT/SIGTERM）
    // 清理 socket 文件
}
```

使用方式：
```bash
abb serve --socket /tmp/actspace-browser-bridge/sess_abc.sock
```

参数说明：
- `--socket`：Unix socket 监听路径（必填）
- `--timeout`：空闲超时秒数，超时无连接自动退出（可选，默认 300s）

验证：
```bash
cd plugins/browser-bridge && go build ./apps/cli && ./apps/cli/abb serve --help
```

### 任务 1.2：实现 socket server 核心（server.go）

```go
// server.go

type Server struct {
    socketPath string
    listener   net.Listener
    sessions   map[string]*Session
    mu         sync.RWMutex
    done       chan struct{}
}

func NewServer(socketPath string) (*Server, error)
func (s *Server) Start() error          // 监听并 accept 循环
func (s *Server) Stop() error           // 优雅关闭
func (s *Server) handleConn(conn net.Conn)  // 单连接处理循环
```

连接处理循环的逻辑：
1. 从连接读取帧（`protocol.ReadFrame`）
2. 解析为 `RequestEnvelope`
3. 根据 `Method` 路由：
   - `session.start` → 创建/恢复 Session
   - `session.end` → 清理 Session
   - 其他 method → 转发到 Session 的 dispatch
4. 写入 `ResponseEnvelope` 帧

错误处理：
- 连接断开 → 日志记录，清理该连接的事件订阅
- 请求超时 → 返回 `ErrorRequestTimeout`
- 未知 method → 返回 `ErrorUnsupportedMethod`

### 任务 1.3：实现 Session 管理（session.go）

```go
// session.go

type Session struct {
    ID         string
    TurnID     string
    CreatedAt  time.Time
    conn       net.Conn        // 当前活跃连接
    nativeConn *NativeConn     // 与 Chrome Extension 的 native messaging 连接
    mu         sync.Mutex
}

func NewSession(id, turnId string, conn net.Conn) *Session
func (sess *Session) Dispatch(req protocol.RequestEnvelope) protocol.ResponseEnvelope
func (sess *Session) Close()
```

Dispatch 路由表（首阶段）：

| Method | Handler |
|--------|---------|
| `agent_browser_bridge.ping` | 直接返回 pong |
| `agent_browser_bridge.info` | 返回版本、capabilities |
| `agent_browser_bridge.tabs` | 转发到 extension |
| `agent_browser_bridge.user_tabs` | 转发到 extension |
| `agent_browser_bridge.open_tab` | 转发到 extension |
| `agent_browser_bridge.navigate` | 转发到 extension |
| `agent_browser_bridge.wait_load` | 转发到 extension |
| `agent_browser_bridge.screenshot` | 转发到 extension |
| `agent_browser_bridge.dom_snapshot` | 转发到 extension |
| `agent_browser_bridge.close_tab` | 转发到 extension |
| `agent_browser_bridge.claim_tab` | 转发到 extension |
| `agent_browser_bridge.finalize_tabs` | 转发到 extension |
| `agent_browser_bridge.cdp` | 转发到 extension |

"转发到 extension" 的具体逻辑：
1. 检查 `nativeConn` 是否建立
2. 如果未建立 → 尝试连接 native host（`connectNative()`）
3. 将请求转为 extension 可识别的格式
4. 通过 native messaging 发送
5. 等待响应（带超时）
6. 返回给客户端

### 任务 1.4：Native Messaging 连接管理

复用现有 `main.go` 中的 native messaging 连接逻辑，但做以下调整：

- 现有模式：每次 CLI 命令建立一次连接、发送一次请求、断开
- 新模式：Session 内保持长连接，多次请求复用同一 native port

```go
type NativeConn struct {
    cmd    *exec.Cmd
    stdin  io.WriteCloser
    stdout io.ReadCloser
    mu     sync.Mutex
}

func connectNative() (*NativeConn, error)
func (nc *NativeConn) Send(req protocol.RequestEnvelope) (protocol.ResponseEnvelope, error)
func (nc *NativeConn) Close() error
```

复用现有的 `findNativeHostManifest()` 和 `startNativeHost()` 逻辑。

### 任务 1.5：事件广播（events.go）

```go
// events.go

type EventBus struct {
    subscribers map[string]chan protocol.RequestEnvelope  // connID → channel
    mu          sync.RWMutex
}

func NewEventBus() *EventBus
func (eb *EventBus) Subscribe(connID string) <-chan protocol.RequestEnvelope
func (eb *EventBus) Unsubscribe(connID string)
func (eb *EventBus) Publish(event protocol.RequestEnvelope)
```

首阶段事件来源：
- Extension 通过 native messaging 主动推送的 notification（无 id 字段的 JSON-RPC）
- 这些 notification 从 native stdout 读取时，不匹配 pending request → 推入 EventBus

Server 的连接处理循环需要同时：
1. 从 client conn 读取请求（blocking read）
2. 从 EventBus 读取事件并写入 client conn

使用 goroutine 分离读写：
```go
func (s *Server) handleConn(conn net.Conn) {
    connID := uuid.New().String()
    events := s.eventBus.Subscribe(connID)
    defer s.eventBus.Unsubscribe(connID)

    // writer goroutine: 发事件
    go func() {
        for event := range events {
            protocol.WriteJSONFrame(conn, event)
        }
    }()

    // reader loop: 读请求
    for {
        req, err := protocol.ReadRequestFrame(conn)
        if err != nil {
            break
        }
        resp := s.dispatch(req)
        protocol.WriteJSONFrame(conn, resp)
    }
}
```

### 任务 1.6：信号处理和优雅退出

```go
func cmdServe(args []string) int {
    // ...
    srv, _ := NewServer(socketPath)
    srv.Start()

    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
    <-sigCh

    srv.Stop()
    os.Remove(socketPath)
    return 0
}
```

### 任务 1.7：空闲超时自动退出

如果超过 `--timeout` 秒没有活跃连接，自动退出。避免泄漏进程。

```go
func (s *Server) idleWatcher(timeout time.Duration) {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            s.mu.RLock()
            idle := len(s.sessions) == 0 && time.Since(s.lastActivity) > timeout
            s.mu.RUnlock()
            if idle {
                s.Stop()
                return
            }
        case <-s.done:
            return
        }
    }
}
```

### 任务 1.8：编写测试（server_test.go）

测试场景：

1. **启动和连接**：启动 server → 通过 socket 建立连接 → 发送 ping → 收到 pong
2. **多请求复用**：同一连接发送多次请求，验证都能正确响应
3. **session 生命周期**：session.start → 发请求 → session.end → 验证 session 清理
4. **连接断开**：客户端关闭连接 → server 不崩溃、清理资源
5. **空闲超时**：启动 server（timeout=2s）→ 不连接 → 验证 2s 后 server 退出
6. **并发连接**：多个 goroutine 同时连接和发请求 → 不 panic

由于 extension 在测试中不可用，使用 mock native conn：

```go
type mockNativeConn struct {
    responses map[string]protocol.ResponseEnvelope
}

func (m *mockNativeConn) Send(req protocol.RequestEnvelope) (protocol.ResponseEnvelope, error) {
    if resp, ok := m.responses[req.Method]; ok {
        return resp, nil
    }
    return protocol.ResponseEnvelope{OK: false, Error: &protocol.ErrorShape{Code: "mock_not_found"}}, nil
}
```

验证命令：
```bash
cd plugins/browser-bridge && go test ./apps/cli/ -v -run TestServer
```

## 验证方式

- `cd plugins/browser-bridge && go build ./apps/cli` 编译通过
- `abb serve --socket /tmp/test.sock` 能启动并监听
- 用 `nc -U /tmp/test.sock` 或简单 Go 客户端发送 ping 请求能收到响应
- `go test ./apps/cli/ -v` 全部 PASS
- 现有 CLI 命令（`abb tabs`、`abb navigate` 等）行为不变

## 回退策略

新增文件为主（server.go、session.go、events.go）。main.go 改动仅增加一个 case 分支。
回退 = 删除新增文件 + revert main.go 的一行 case。
