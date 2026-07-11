package protocol

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"unsafe"
)

const (
	ProtocolVersion = "0.2.0"
	Phase           = "socket-server"

	// Core methods (existing)
	MethodPing          = "agent_browser_bridge.ping"
	MethodInfo          = "agent_browser_bridge.info"
	MethodNativeConnect = "agent_browser_bridge.native.connect"
	MethodTabs          = "agent_browser_bridge.tabs"
	MethodUserTabs      = "agent_browser_bridge.user_tabs"
	MethodHistory       = "agent_browser_bridge.history"
	MethodOpenTab       = "agent_browser_bridge.open_tab"
	MethodClaimTab      = "agent_browser_bridge.claim_tab"
	MethodNavigate      = "agent_browser_bridge.navigate"
	MethodNavigateBack  = "agent_browser_bridge.navigate_back"
	MethodWaitLoad      = "agent_browser_bridge.wait_load"
	MethodPageInfo      = "agent_browser_bridge.page_info"
	MethodFinalizeTabs  = "agent_browser_bridge.finalize_tabs"
	MethodCDP           = "agent_browser_bridge.cdp"
	MethodScreenshot    = "agent_browser_bridge.screenshot"

	// Session lifecycle
	MethodSessionStart = "agent_browser_bridge.session.start"
	MethodSessionEnd   = "agent_browser_bridge.session.end"

	// DOM reading
	MethodDomSnapshot = "agent_browser_bridge.dom_snapshot"
	MethodCloseTab    = "agent_browser_bridge.close_tab"
	MethodNameSession = "agent_browser_bridge.name_session"

	// Interaction commands
	MethodClick        = "agent_browser_bridge.click"
	MethodFill         = "agent_browser_bridge.fill"
	MethodPressKey     = "agent_browser_bridge.press_key"
	MethodSelectOption = "agent_browser_bridge.select_option"
	MethodScroll       = "agent_browser_bridge.scroll"

	// DOM CUA
	MethodGetVisibleDom  = "agent_browser_bridge.get_visible_dom"
	MethodDomClick       = "agent_browser_bridge.dom_click"
	MethodDomDoubleClick = "agent_browser_bridge.dom_double_click"
	MethodDomScroll      = "agent_browser_bridge.dom_scroll"

	// CUA coordinate
	MethodCuaScreenshot = "agent_browser_bridge.cua_screenshot"
	MethodCuaClick      = "agent_browser_bridge.cua_click"
	MethodCuaScroll     = "agent_browser_bridge.cua_scroll"
	MethodCuaType       = "agent_browser_bridge.cua_type"
	MethodCuaKeypress   = "agent_browser_bridge.cua_keypress"

	// Canonical Browser Use command engine
	MethodCommandList      = "agent_browser_bridge.command.list"
	MethodCommandDescribe  = "agent_browser_bridge.command.describe"
	MethodCommandPreflight = "agent_browser_bridge.command.preflight"
	MethodCommandExecute   = "agent_browser_bridge.command.execute"
	MethodCommandRun       = "agent_browser_bridge.command.run"

	// Extension primitive backend
	MethodBackendAttach          = "agent_browser_bridge.backend.attach"
	MethodBackendDetach          = "agent_browser_bridge.backend.detach"
	MethodBackendExecuteCDP      = "agent_browser_bridge.backend.execute_cdp"
	MethodBackendTabsCreate      = "agent_browser_bridge.backend.tabs.create"
	MethodBackendTabsClose       = "agent_browser_bridge.backend.tabs.close"
	MethodBackendTabsList        = "agent_browser_bridge.backend.tabs.list"
	MethodBackendUserTabsList    = "agent_browser_bridge.backend.user_tabs.list"
	MethodBackendUserTabsClaim   = "agent_browser_bridge.backend.user_tabs.claim"
	MethodBackendHistorySearch   = "agent_browser_bridge.backend.history.search"
	MethodBackendSessionName     = "agent_browser_bridge.backend.session.name"
	MethodBackendSessionFinalize = "agent_browser_bridge.backend.session.finalize"
	MethodBackendCursorMove      = "agent_browser_bridge.backend.cursor.move"

	// Extension notifications
	MethodEventCDP            = "agent_browser_bridge.event.cdp"
	MethodEventDebuggerDetach = "agent_browser_bridge.event.debugger_detach"
	MethodEventDownload       = "agent_browser_bridge.event.download"
	MethodEventTabClosed      = "agent_browser_bridge.event.tab_closed"

	// Errors
	ErrorInvalidMessage        = "invalid_message"
	ErrorInvalidParams         = "invalid_params"
	ErrorUnsupportedMessage    = "unsupported_message"
	ErrorUnsupportedMethod     = "unsupported_method"
	ErrorNativeHostUnavailable = "native_host_unavailable"
	ErrorExtensionUnavailable  = "extension_unavailable"
	ErrorSocketUnavailable     = "socket_unavailable"
	ErrorRequestTimeout        = "request_timeout"
	ErrorBrowserAPIFailed      = "browser_api_failed"
	ErrorCDPFailed             = "cdp_failed"
	ErrorSessionNotFound       = "session_not_found"
	ErrorTabNotFound           = "tab_not_found"
	ErrorTabNotInSession       = "tab_not_in_session"
	ErrorDebuggerAttachFailed  = "debugger_attach_failed"
	ErrorCapabilityUnavailable = "capability_unavailable"
	ErrorSelectorNotFound      = "selector_not_found"
	ErrorSelectorAmbiguous     = "selector_ambiguous"
	ErrorElementNotVisible     = "element_not_visible"
	ErrorElementDisabled       = "element_disabled"
	ErrorElementNotEditable    = "element_not_editable"
	ErrorLocatorTimeout        = "locator_timeout"
	ErrorNavigationBlocked     = "navigation_blocked"
	ErrorNavigationTimeout     = "navigation_timeout"
	ErrorFileChooserNotFound   = "file_chooser_not_found"
	ErrorDownloadFailed        = "download_failed"
	ErrorPlaywrightTimeout     = "playwright_timeout"
	ErrorInvalidAction         = "invalid_action"
	ErrorNotImplemented        = "not_implemented"
	ErrorApprovalRequired      = "approval_required"
)

const (
	HeaderBytes     = 4
	DefaultMaxFrame = 64 * 1024 * 1024
)

var ErrFrameTooLarge = errors.New("frame too large")

var CoreMethods = []string{
	MethodPing,
	MethodInfo,
	MethodNativeConnect,
	MethodTabs,
	MethodUserTabs,
	MethodHistory,
	MethodOpenTab,
	MethodClaimTab,
	MethodNavigate,
	MethodWaitLoad,
	MethodPageInfo,
	MethodFinalizeTabs,
	MethodCDP,
	MethodScreenshot,
}

var CommandMethods = []string{
	MethodCommandList,
	MethodCommandDescribe,
	MethodCommandPreflight,
	MethodCommandExecute,
	MethodCommandRun,
}

var BackendPrimitiveMethods = []string{
	MethodBackendAttach,
	MethodBackendDetach,
	MethodBackendExecuteCDP,
	MethodBackendTabsCreate,
	MethodBackendTabsClose,
	MethodBackendTabsList,
	MethodBackendUserTabsList,
	MethodBackendUserTabsClaim,
	MethodBackendHistorySearch,
	MethodBackendSessionName,
	MethodBackendSessionFinalize,
	MethodBackendCursorMove,
}

var EventMethods = []string{
	MethodEventCDP,
	MethodEventDebuggerDetach,
	MethodEventDownload,
	MethodEventTabClosed,
}

type TabInfo struct {
	ID      int    `json:"id"`
	Window  int    `json:"window"`
	Title   string `json:"title,omitempty"`
	URL     string `json:"url,omitempty"`
	Active  bool   `json:"active"`
	Status  string `json:"status,omitempty"`
	Claimed bool   `json:"claimed,omitempty"`
	Owned   bool   `json:"owned,omitempty"`
}

type HistoryQueryParams struct {
	Query string `json:"query,omitempty"`
	Limit int    `json:"limit,omitempty"`
	From  string `json:"from,omitempty"`
	To    string `json:"to,omitempty"`
}

type HistoryEntry struct {
	ID            string `json:"id,omitempty"`
	URL           string `json:"url"`
	Title         string `json:"title,omitempty"`
	LastVisitTime int64  `json:"lastVisitTime,omitempty"`
	VisitCount    int    `json:"visitCount,omitempty"`
	TypedCount    int    `json:"typedCount,omitempty"`
}

type OpenTabParams struct {
	URL    string `json:"url"`
	Active bool   `json:"active,omitempty"`
}

type TabTargetParams struct {
	TabID int `json:"tabId"`
}

type NavigateParams struct {
	TabID int    `json:"tabId"`
	URL   string `json:"url"`
}

type WaitLoadParams struct {
	TabID     int    `json:"tabId"`
	State     string `json:"state,omitempty"`
	TimeoutMS int    `json:"timeoutMs,omitempty"`
}

type PageInfo struct {
	TabID   int    `json:"tabId"`
	Window  int    `json:"window,omitempty"`
	Title   string `json:"title,omitempty"`
	URL     string `json:"url,omitempty"`
	Status  string `json:"status,omitempty"`
	Active  bool   `json:"active"`
	Summary string `json:"summary,omitempty"`
}

type FinalizeTabsParams struct {
	Keep []FinalizeTabKeep `json:"keep"`
}

type FinalizeTabKeep struct {
	TabID  int    `json:"tabId"`
	Status string `json:"status,omitempty"`
}

type FinalizeTabsResult struct {
	Closed []int `json:"closed,omitempty"`
	Kept   []int `json:"kept,omitempty"`
}

type CDPParams struct {
	TabID         int            `json:"tabId"`
	Method        string         `json:"method"`
	CommandParams map[string]any `json:"commandParams,omitempty"`
}

type ScreenshotParams struct {
	TabID  int    `json:"tabId"`
	Output string `json:"output,omitempty"`
}

type ScreenshotResult struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data,omitempty"`
	Output   string `json:"output,omitempty"`
	Bytes    int    `json:"bytes,omitempty"`
}

// Session lifecycle
type SessionStartParams struct {
	SessionID string `json:"sessionId"`
	TurnID    string `json:"turnId"`
}

type SessionEndParams struct {
	SessionID string `json:"sessionId"`
	TurnID    string `json:"turnId"`
}

// DOM reading
type DomSnapshotParams struct {
	TabID int `json:"tabId"`
}

type DomSnapshotResult struct {
	Text string `json:"text"`
}

type CloseTabParams struct {
	TabID int `json:"tabId"`
}

type NameSessionParams struct {
	Name string `json:"name"`
}

// Interaction commands
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
	TabID      int             `json:"tabId"`
	Selector   string          `json:"selector"`
	Selections []SelectionItem `json:"selections"`
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

// DOM CUA
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

// CUA coordinate commands
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

type CommandDescribeParams struct {
	Category string `json:"category"`
	Action   string `json:"action"`
}

type CommandAction struct {
	Category string         `json:"category"`
	Action   string         `json:"action"`
	Params   map[string]any `json:"params,omitempty"`
}

type CommandExecuteParams struct {
	Category string         `json:"category"`
	Action   string         `json:"action"`
	Params   map[string]any `json:"params,omitempty"`
}

type CommandPreflightParams struct {
	Actions   []CommandAction `json:"actions"`
	SessionID string          `json:"sessionId,omitempty"`
	TurnID    string          `json:"turnId,omitempty"`
}

type CommandRunParams struct {
	Actions     []CommandAction `json:"actions"`
	StopOnError bool            `json:"stopOnError"`
	Approval    string          `json:"approval,omitempty"`
	SessionID   string          `json:"sessionId,omitempty"`
	TurnID      string          `json:"turnId,omitempty"`
}

type NativeHostManifest struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Path           string   `json:"path"`
	Type           string   `json:"type"`
	AllowedOrigins []string `json:"allowed_origins"`
}

type RequestEnvelope struct {
	ProtocolVersion string `json:"protocolVersion"`
	ID              string `json:"id,omitempty"`
	Method          string `json:"method"`
	Params          any    `json:"params,omitempty"`
}

type ResponseEnvelope struct {
	ProtocolVersion string      `json:"protocolVersion"`
	ID              string      `json:"id,omitempty"`
	OK              bool        `json:"ok"`
	Result          any         `json:"result,omitempty"`
	Error           *ErrorShape `json:"error,omitempty"`
}

type ErrorShape struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func NativeEndian() binary.ByteOrder {
	var value uint16 = 0x1
	bytes := (*[2]byte)(unsafe.Pointer(&value))
	if bytes[0] == 0x1 {
		return binary.LittleEndian
	}
	return binary.BigEndian
}

func WriteFrame(w io.Writer, payload []byte) error {
	if len(payload) > math.MaxUint32 {
		return ErrFrameTooLarge
	}
	header := make([]byte, HeaderBytes)
	NativeEndian().PutUint32(header, uint32(len(payload)))
	if _, err := w.Write(header); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func ReadFrame(r io.Reader, maxBytes uint32) ([]byte, error) {
	header := make([]byte, HeaderBytes)
	if _, err := io.ReadFull(r, header); err != nil {
		return nil, err
	}
	length := NativeEndian().Uint32(header)
	if maxBytes > 0 && length > maxBytes {
		return nil, fmt.Errorf("%w: %d > %d", ErrFrameTooLarge, length, maxBytes)
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func WriteJSONFrame(w io.Writer, value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return WriteFrame(w, payload)
}

func ReadRequestFrame(r io.Reader) (RequestEnvelope, error) {
	var request RequestEnvelope
	payload, err := ReadFrame(r, DefaultMaxFrame)
	if err != nil {
		return request, err
	}
	err = json.Unmarshal(payload, &request)
	return request, err
}

func ReadResponseFrame(r io.Reader) (ResponseEnvelope, error) {
	var response ResponseEnvelope
	payload, err := ReadFrame(r, DefaultMaxFrame)
	if err != nil {
		return response, err
	}
	err = json.Unmarshal(payload, &response)
	return response, err
}

func ReadJSONFrame(r io.Reader, value any) error {
	payload, err := ReadFrame(r, DefaultMaxFrame)
	if err != nil {
		return err
	}
	return json.Unmarshal(payload, value)
}

func DecodeParams(params any, target any) error {
	if params == nil {
		return nil
	}
	payload, err := json.Marshal(params)
	if err != nil {
		return err
	}
	return json.Unmarshal(payload, target)
}
