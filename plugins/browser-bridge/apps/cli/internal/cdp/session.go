package cdp

import (
	"context"
	"encoding/json"
	"fmt"

	"agent-browser-bridge/apps/cli/internal/backend"
)

type Session struct {
	Backend backend.BrowserBackend
	TabID   int
}

func (session Session) Run(ctx context.Context, operation func(context.Context) (any, error)) (result any, err error) {
	if session.Backend == nil {
		return nil, fmt.Errorf("browser backend is required")
	}
	if session.TabID < 1 {
		return nil, fmt.Errorf("tab id must be positive")
	}
	if err := session.Backend.Attach(ctx, session.TabID); err != nil {
		return nil, err
	}
	defer func() {
		detachErr := session.Backend.Detach(ctx, session.TabID)
		if err == nil && detachErr != nil {
			err = detachErr
		}
	}()
	return operation(ctx)
}

func (session Session) Execute(ctx context.Context, method string, params map[string]any) (map[string]any, error) {
	return session.Backend.ExecuteCDP(ctx, session.TabID, method, params)
}

func (session Session) Evaluate(ctx context.Context, expression string) (any, error) {
	result, err := session.Execute(ctx, "Runtime.evaluate", map[string]any{
		"expression":    expression,
		"returnByValue": true,
		"awaitPromise":  true,
		"userGesture":   true,
	})
	if err != nil {
		return nil, err
	}
	if exception, exists := result["exceptionDetails"]; exists && exception != nil {
		return nil, fmt.Errorf("Runtime.evaluate failed: %v", exception)
	}
	nested, _ := result["result"].(map[string]any)
	return nested["value"], nil
}

func Decode[T any](value any) (T, error) {
	var target T
	payload, err := json.Marshal(value)
	if err != nil {
		return target, err
	}
	err = json.Unmarshal(payload, &target)
	return target, err
}
