package domcua

import (
	"context"

	"agent-browser-bridge/apps/cli/internal/backend"
	"agent-browser-bridge/apps/cli/internal/cdp"
	"agent-browser-bridge/apps/cli/internal/cua"
	"agent-browser-bridge/apps/cli/internal/locator"
)

type Engine struct {
	Backend backend.BrowserBackend
}

func (engine Engine) Snapshot(ctx context.Context, tabID int, limit int) (any, error) {
	return locator.Engine{Backend: engine.Backend}.Invoke(ctx, tabID, "visible_dom", map[string]any{"limit": limit})
}

func (engine Engine) Click(ctx context.Context, tabID int, nodeID string, clickCount int) error {
	value, err := locator.Engine{Backend: engine.Backend}.Invoke(ctx, tabID, "node_point", map[string]any{"nodeId": nodeID})
	if err != nil {
		return err
	}
	point, err := cdp.Decode[cua.Point](value)
	if err != nil {
		return err
	}
	return (cua.Engine{Backend: engine.Backend}).Click(ctx, tabID, point, "left", clickCount, nil)
}

func (engine Engine) Scroll(ctx context.Context, tabID int, nodeID string, scrollX float64, scrollY float64) error {
	if nodeID != "" {
		_, err := locator.Engine{Backend: engine.Backend}.Invoke(ctx, tabID, "node_scroll", map[string]any{"nodeId": nodeID, "scrollX": scrollX, "scrollY": scrollY})
		return err
	}
	point, err := (cua.Engine{Backend: engine.Backend}).ViewportCenter(ctx, tabID)
	if err != nil {
		return err
	}
	return (cua.Engine{Backend: engine.Backend}).Scroll(ctx, tabID, point, scrollX, scrollY, nil)
}

func (engine Engine) Type(ctx context.Context, tabID int, text string) error {
	return (cua.Engine{Backend: engine.Backend}).Type(ctx, tabID, text)
}

func (engine Engine) Keypress(ctx context.Context, tabID int, keys []string) error {
	return (cua.Engine{Backend: engine.Backend}).Keypress(ctx, tabID, keys)
}
