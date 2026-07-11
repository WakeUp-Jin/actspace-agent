package locator

import (
	"context"
	"encoding/json"
	"fmt"

	"agent-browser-bridge/apps/cli/internal/backend"
	"agent-browser-bridge/apps/cli/internal/cdp"
)

type Engine struct {
	Backend backend.BrowserBackend
}

func (engine Engine) Invoke(ctx context.Context, tabID int, action string, params map[string]any) (any, error) {
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	return session.Run(ctx, func(ctx context.Context) (any, error) {
		if err := ensureRuntime(ctx, session); err != nil {
			return nil, err
		}
		actionJSON, _ := json.Marshal(action)
		paramsJSON, err := json.Marshal(params)
		if err != nil {
			return nil, err
		}
		expression := fmt.Sprintf("window.__actspaceLocator.invoke(%s,%s)", actionJSON, paramsJSON)
		return session.Evaluate(ctx, expression)
	})
}

func ensureRuntime(ctx context.Context, session cdp.Session) error {
	value, err := session.Evaluate(ctx, fmt.Sprintf("window.__actspaceLocator?.version === %q", RuntimeVersion))
	if err == nil && value == true {
		return nil
	}
	_, err = session.Evaluate(ctx, runtimeSource+"\n//# sourceURL=actspace-locator-runtime.js")
	if err != nil {
		return err
	}
	value, err = session.Evaluate(ctx, fmt.Sprintf("window.__actspaceLocator?.version === %q", RuntimeVersion))
	if err != nil || value != true {
		return fmt.Errorf("locator runtime injection failed")
	}
	return nil
}
