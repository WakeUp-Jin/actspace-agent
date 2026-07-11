package backend

import (
	"context"
	"encoding/json"
	"errors"

	"agent-browser-bridge/packages/protocol"
)

type RequestFunc func(ctx context.Context, method string, params any) (any, error)
type SubscribeFunc func(session SessionRef) (<-chan BrowserEvent, func(), error)

type ExtensionBackend struct {
	Request   RequestFunc
	Subscribe SubscribeFunc
}

func (backend *ExtensionBackend) Attach(ctx context.Context, tabID int) error {
	_, err := backend.request(ctx, protocol.MethodBackendAttach, protocol.TabTargetParams{TabID: tabID})
	return err
}

func (backend *ExtensionBackend) Detach(ctx context.Context, tabID int) error {
	_, err := backend.request(ctx, protocol.MethodBackendDetach, protocol.TabTargetParams{TabID: tabID})
	return err
}

func (backend *ExtensionBackend) ExecuteCDP(ctx context.Context, tabID int, method string, params map[string]any) (map[string]any, error) {
	result, err := backend.request(ctx, protocol.MethodBackendExecuteCDP, protocol.CDPParams{
		TabID:         tabID,
		Method:        method,
		CommandParams: params,
	})
	if err != nil {
		return nil, err
	}
	return decode[map[string]any](result)
}

func (backend *ExtensionBackend) CreateTab(ctx context.Context, _ SessionRef, input protocol.OpenTabParams) (protocol.TabInfo, error) {
	result, err := backend.request(ctx, protocol.MethodBackendTabsCreate, input)
	if err != nil {
		return protocol.TabInfo{}, err
	}
	return decode[protocol.TabInfo](result)
}

func (backend *ExtensionBackend) CloseTab(ctx context.Context, _ SessionRef, tabID int) error {
	_, err := backend.request(ctx, protocol.MethodBackendTabsClose, protocol.TabTargetParams{TabID: tabID})
	return err
}

func (backend *ExtensionBackend) ListTabs(ctx context.Context, _ SessionRef) ([]protocol.TabInfo, error) {
	result, err := backend.request(ctx, protocol.MethodBackendTabsList, map[string]any{})
	if err != nil {
		return nil, err
	}
	return decode[[]protocol.TabInfo](result)
}

func (backend *ExtensionBackend) ListUserTabs(ctx context.Context) ([]protocol.TabInfo, error) {
	result, err := backend.request(ctx, protocol.MethodBackendUserTabsList, map[string]any{})
	if err != nil {
		return nil, err
	}
	return decode[[]protocol.TabInfo](result)
}

func (backend *ExtensionBackend) ClaimTab(ctx context.Context, _ SessionRef, tabID int) (protocol.TabInfo, error) {
	result, err := backend.request(ctx, protocol.MethodBackendUserTabsClaim, protocol.TabTargetParams{TabID: tabID})
	if err != nil {
		return protocol.TabInfo{}, err
	}
	return decode[protocol.TabInfo](result)
}

func (backend *ExtensionBackend) SearchHistory(ctx context.Context, input protocol.HistoryQueryParams) ([]protocol.HistoryEntry, error) {
	result, err := backend.request(ctx, protocol.MethodBackendHistorySearch, input)
	if err != nil {
		return nil, err
	}
	return decode[[]protocol.HistoryEntry](result)
}

func (backend *ExtensionBackend) FinalizeTabs(ctx context.Context, _ SessionRef, keep []protocol.FinalizeTabKeep) (protocol.FinalizeTabsResult, error) {
	result, err := backend.request(ctx, protocol.MethodBackendSessionFinalize, protocol.FinalizeTabsParams{Keep: keep})
	if err != nil {
		return protocol.FinalizeTabsResult{}, err
	}
	return decode[protocol.FinalizeTabsResult](result)
}

func (backend *ExtensionBackend) NameSession(ctx context.Context, _ SessionRef, name string) error {
	_, err := backend.request(ctx, protocol.MethodBackendSessionName, protocol.NameSessionParams{Name: name})
	return err
}

func (backend *ExtensionBackend) MoveCursor(ctx context.Context, tabID int, x float64, y float64, isClick bool) error {
	_, err := backend.request(ctx, protocol.MethodBackendCursorMove, map[string]any{
		"tabId": tabID, "x": x, "y": y, "isClick": isClick,
	})
	return err
}

func (backend *ExtensionBackend) SubscribeEvents(session SessionRef) (<-chan BrowserEvent, func(), error) {
	if backend.Subscribe == nil {
		return nil, nil, errors.New("extension backend event subscription is not configured")
	}
	return backend.Subscribe(session)
}

func (backend *ExtensionBackend) request(ctx context.Context, method string, params any) (any, error) {
	if backend.Request == nil {
		return nil, errors.New("extension backend request function is not configured")
	}
	return backend.Request(ctx, method, params)
}

func decode[T any](value any) (T, error) {
	var target T
	payload, err := json.Marshal(value)
	if err != nil {
		return target, err
	}
	err = json.Unmarshal(payload, &target)
	return target, err
}
