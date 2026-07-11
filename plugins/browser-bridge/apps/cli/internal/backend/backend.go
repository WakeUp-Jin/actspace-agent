package backend

import (
	"context"

	"agent-browser-bridge/packages/protocol"
)

type SessionRef struct {
	SessionID string `json:"sessionId"`
	TurnID    string `json:"turnId"`
}

type BrowserEvent struct {
	Method string `json:"method"`
	Params any    `json:"params,omitempty"`
}

type BrowserBackend interface {
	Attach(ctx context.Context, tabID int) error
	Detach(ctx context.Context, tabID int) error
	ExecuteCDP(ctx context.Context, tabID int, method string, params map[string]any) (map[string]any, error)
	CreateTab(ctx context.Context, session SessionRef, input protocol.OpenTabParams) (protocol.TabInfo, error)
	CloseTab(ctx context.Context, session SessionRef, tabID int) error
	ListTabs(ctx context.Context, session SessionRef) ([]protocol.TabInfo, error)
	ListUserTabs(ctx context.Context) ([]protocol.TabInfo, error)
	ClaimTab(ctx context.Context, session SessionRef, tabID int) (protocol.TabInfo, error)
	SearchHistory(ctx context.Context, input protocol.HistoryQueryParams) ([]protocol.HistoryEntry, error)
	FinalizeTabs(ctx context.Context, session SessionRef, keep []protocol.FinalizeTabKeep) (protocol.FinalizeTabsResult, error)
	NameSession(ctx context.Context, session SessionRef, name string) error
	MoveCursor(ctx context.Context, tabID int, x float64, y float64, isClick bool) error
	SubscribeEvents(session SessionRef) (<-chan BrowserEvent, func(), error)
}
