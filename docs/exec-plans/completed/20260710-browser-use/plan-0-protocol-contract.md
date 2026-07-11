# Plan 0: 协议与契约地基

状态：已完成

依赖：无
产物消费方：Plan 1, Plan 2, Plan 3, Plan 4

## 目标

在 `plugins/browser-bridge/packages/protocol/` 中扩展协议定义，为后续四个 plan 建立稳定的类型和 method 契约。本 plan 不修改任何运行时代码。

前置依赖：Plan 0-pre（仓库合并）已完成，代码已在 `plugins/browser-bridge/` 路径。

## 允许修改的文件

- `plugins/browser-bridge/packages/protocol/protocol.go`（扩展）
- `plugins/browser-bridge/packages/protocol/protocol_test.go`（新建或扩展）
- `plugins/browser-bridge/packages/protocol/events.go`（新建）

## 任务清单

### 任务 0.1：新增 Phase 1 method 常量

在 `protocol.go` 中新增以下 method 常量（保持现有命名空间 `agent_browser_bridge.*`）：

```go
// Session lifecycle
MethodSessionStart = "agent_browser_bridge.session.start"
MethodSessionEnd   = "agent_browser_bridge.session.end"

// Phase 1: 基础导航
MethodDomSnapshot  = "agent_browser_bridge.dom_snapshot"
MethodCloseTab     = "agent_browser_bridge.close_tab"

// Phase 2: 交互
MethodClick        = "agent_browser_bridge.click"
MethodFill         = "agent_browser_bridge.fill"
MethodPressKey     = "agent_browser_bridge.press_key"
MethodSelectOption = "agent_browser_bridge.select_option"
MethodScroll       = "agent_browser_bridge.scroll"

// Phase 3: DOM CUA
MethodGetVisibleDom    = "agent_browser_bridge.get_visible_dom"
MethodDomClick         = "agent_browser_bridge.dom_click"
MethodDomDoubleClick   = "agent_browser_bridge.dom_double_click"
MethodDomScroll        = "agent_browser_bridge.dom_scroll"

// Phase 4: CUA 坐标
MethodCuaScreenshot = "agent_browser_bridge.cua_screenshot"
MethodCuaClick      = "agent_browser_bridge.cua_click"
MethodCuaScroll     = "agent_browser_bridge.cua_scroll"
MethodCuaType       = "agent_browser_bridge.cua_type"
MethodCuaKeypress   = "agent_browser_bridge.cua_keypress"

// Tab Group
MethodNameSession   = "agent_browser_bridge.name_session"
```

### 任务 0.2：新增参数和结果类型

```go
type SessionStartParams struct {
    SessionID string `json:"sessionId"`
    TurnID    string `json:"turnId"`
}

type SessionEndParams struct {
    SessionID string `json:"sessionId"`
    TurnID    string `json:"turnId"`
}

type DomSnapshotParams struct {
    TabID int `json:"tabId"`
}

type DomSnapshotResult struct {
    Text string `json:"text"`
}

type CloseTabParams struct {
    TabID int `json:"tabId"`
}

type ClickParams struct {
    TabID    int     `json:"tabId"`
    Selector string  `json:"selector,omitempty"`
    X        float64 `json:"x,omitempty"`
    Y        float64 `json:"y,omitempty"`
    Button   string  `json:"button,omitempty"`
}

type FillParams struct {
    TabID    int    `json:"tabId"`
    Selector string `json:"selector"`
    Value    string `json:"value"`
    Replace  bool   `json:"replace,omitempty"`
}

type PressKeyParams struct {
    TabID    int      `json:"tabId"`
    Selector string   `json:"selector,omitempty"`
    Keys     []string `json:"keys"`
}

type SelectOptionParams struct {
    TabID      int              `json:"tabId"`
    Selector   string           `json:"selector"`
    Selections []SelectionItem  `json:"selections"`
}

type SelectionItem struct {
    Value        string `json:"value,omitempty"`
    Label        string `json:"label,omitempty"`
    ValueOrLabel string `json:"valueOrLabel,omitempty"`
}

type ScrollParams struct {
    TabID   int     `json:"tabId"`
    X       float64 `json:"x,omitempty"`
    Y       float64 `json:"y,omitempty"`
    ScrollX float64 `json:"scrollX"`
    ScrollY float64 `json:"scrollY"`
    NodeID  string  `json:"nodeId,omitempty"`
}

type GetVisibleDomParams struct {
    TabID int `json:"tabId"`
}

type DomNode struct {
    NodeID      string   `json:"nodeId"`
    TagName     string   `json:"tagName"`
    Role        string   `json:"role,omitempty"`
    Text        string   `json:"text"`
    AriaName    string   `json:"ariaName,omitempty"`
    Type        string   `json:"type,omitempty"`
    BoundingBox *DomRect `json:"boundingBox,omitempty"`
}

type DomRect struct {
    X      float64 `json:"x"`
    Y      float64 `json:"y"`
    Width  float64 `json:"width"`
    Height float64 `json:"height"`
}

type GetVisibleDomResult struct {
    Nodes []DomNode `json:"nodes"`
}

type DomClickParams struct {
    TabID  int    `json:"tabId"`
    NodeID string `json:"nodeId"`
}

type DomScrollParams struct {
    TabID   int     `json:"tabId"`
    NodeID  string  `json:"nodeId,omitempty"`
    ScrollX float64 `json:"scrollX"`
    ScrollY float64 `json:"scrollY"`
}

type CuaScreenshotParams struct {
    TabID int `json:"tabId"`
}

type CuaScreenshotResult struct {
    MimeType string `json:"mimeType"`
    Data     string `json:"data"`
    Width    int    `json:"width,omitempty"`
    Height   int    `json:"height,omitempty"`
}

type CuaClickParams struct {
    TabID  int      `json:"tabId"`
    X      float64  `json:"x"`
    Y      float64  `json:"y"`
    Button string   `json:"button,omitempty"`
    Keys   []string `json:"keys,omitempty"`
}

type CuaScrollParams struct {
    TabID   int      `json:"tabId"`
    X       float64  `json:"x"`
    Y       float64  `json:"y"`
    ScrollX float64  `json:"scrollX"`
    ScrollY float64  `json:"scrollY"`
    Keys    []string `json:"keys,omitempty"`
}

type CuaTypeParams struct {
    TabID int    `json:"tabId"`
    Text  string `json:"text"`
}

type CuaKeypressParams struct {
    TabID int      `json:"tabId"`
    Keys  []string `json:"keys"`
}

type NameSessionParams struct {
    Name string `json:"name"`
}
```

### 任务 0.3：新增事件类型（events.go）

新建 `events.go`：

```go
package protocol

// 事件 method 常量（无 id，后端主动推送）
const (
    EventCDP            = "agent_browser_bridge.event.cdp"
    EventDownloadChange = "agent_browser_bridge.event.download_change"
    EventTabClosed      = "agent_browser_bridge.event.tab_closed"
    EventNavigated      = "agent_browser_bridge.event.navigated"
)

type CDPEventParams struct {
    TabID     int    `json:"tabId"`
    CDPMethod string `json:"cdpMethod"`
    CDPParams any    `json:"cdpParams,omitempty"`
}

type DownloadChangeParams struct {
    ID            string `json:"id"`
    Status        string `json:"status"` // started | in_progress | complete | failed | canceled
    Filename      string `json:"filename,omitempty"`
    BytesReceived int64  `json:"bytesReceived,omitempty"`
}

type TabClosedParams struct {
    TabID int `json:"tabId"`
}

type NavigatedParams struct {
    TabID int    `json:"tabId"`
    URL   string `json:"url"`
    Title string `json:"title,omitempty"`
}
```

### 任务 0.4：新增错误码

在 `protocol.go` 的 error 常量区新增：

```go
ErrorSessionNotFound    = "session_not_found"
ErrorTabNotInSession    = "tab_not_in_session"
ErrorSelectorNotFound   = "selector_not_found"
ErrorSelectorAmbiguous  = "selector_ambiguous"
ErrorElementNotVisible  = "element_not_visible"
ErrorElementDisabled    = "element_disabled"
ErrorNavigationBlocked  = "navigation_blocked"
ErrorPlaywrightTimeout  = "playwright_timeout"
```

### 任务 0.5：编写协议测试

新建/扩展 `protocol_test.go`：

- 测试所有新增类型的 JSON 序列化/反序列化：确认 omitempty 行为正确。
- 测试 `DecodeParams` 对新类型的解码。
- 测试 `WriteFrame` / `ReadFrame` 对新增 payload 的正确性。

验证命令：
```bash
cd plugins/browser-bridge && go test ./packages/protocol/ -v
```

预期：所有测试通过，无 lint 警告。

## 验证方式

- `cd plugins/browser-bridge && go build ./...` 编译通过。
- `cd plugins/browser-bridge && go test ./packages/protocol/ -v` 全部 PASS。
- `cd plugins/browser-bridge && go vet ./...` 无警告。

## 回退策略

本 plan 只新增代码不修改现有代码。如果需要回退，直接 revert commit 即可，不影响现有 CLI 功能。
