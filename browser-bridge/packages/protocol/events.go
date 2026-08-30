package protocol

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
	Status        string `json:"status"`
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
