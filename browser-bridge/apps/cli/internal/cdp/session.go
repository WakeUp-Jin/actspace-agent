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
	FrameID string
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
	if session.FrameID != "" {
		frameBackend, ok := session.Backend.(backend.FrameCDPExecutor)
		if !ok {
			return nil, fmt.Errorf("browser backend does not support frame-scoped CDP")
		}
		return frameBackend.ExecuteCDPInFrame(ctx, session.TabID, session.FrameID, method, params)
	}
	return session.Backend.ExecuteCDP(ctx, session.TabID, method, params)
}

func (session Session) ForFrame(frameID string) Session {
	return Session{Backend: session.Backend, TabID: session.TabID, FrameID: frameID}
}

func (session Session) Evaluate(ctx context.Context, expression string) (any, error) {
	return session.EvaluateInContext(ctx, expression, 0)
}

func (session Session) EvaluateInContext(ctx context.Context, expression string, executionContextID int) (any, error) {
	params := map[string]any{
		"expression":    expression,
		"returnByValue": true,
		"awaitPromise":  true,
		"userGesture":   true,
	}
	if executionContextID > 0 {
		params["contextId"] = executionContextID
	}
	result, err := session.Execute(ctx, "Runtime.evaluate", params)
	if err != nil {
		return nil, err
	}
	if exception, exists := result["exceptionDetails"]; exists && exception != nil {
		return nil, fmt.Errorf("Runtime.evaluate failed: %v", exception)
	}
	nested, _ := result["result"].(map[string]any)
	return nested["value"], nil
}

func (session Session) EvaluateHandleInContext(ctx context.Context, expression string, executionContextID int) (string, error) {
	params := map[string]any{
		"expression":    expression,
		"returnByValue": false,
		"awaitPromise":  true,
		"userGesture":   true,
	}
	if executionContextID > 0 {
		params["contextId"] = executionContextID
	}
	result, err := session.Execute(ctx, "Runtime.evaluate", params)
	if err != nil {
		return "", err
	}
	if exception, exists := result["exceptionDetails"]; exists && exception != nil {
		return "", fmt.Errorf("Runtime.evaluate failed: %v", exception)
	}
	nested, _ := result["result"].(map[string]any)
	objectID, _ := nested["objectId"].(string)
	if objectID == "" {
		return "", fmt.Errorf("Runtime.evaluate did not return an object handle")
	}
	return objectID, nil
}

func (session Session) MainFrameID(ctx context.Context) (string, error) {
	result, err := session.Execute(ctx, "Page.getFrameTree", map[string]any{})
	if err != nil {
		return "", err
	}
	frameTree, _ := result["frameTree"].(map[string]any)
	frame, _ := frameTree["frame"].(map[string]any)
	frameID, _ := frame["id"].(string)
	if frameID == "" {
		return "", fmt.Errorf("Page.getFrameTree did not return a main frame id")
	}
	return frameID, nil
}

func (session Session) CreateIsolatedWorld(ctx context.Context, frameID, worldName string) (int, error) {
	result, err := session.Execute(ctx, "Page.createIsolatedWorld", map[string]any{
		"frameId":             frameID,
		"worldName":           worldName,
		"grantUniveralAccess": false,
	})
	if err != nil {
		return 0, err
	}
	contextID, ok := numberAsInt(result["executionContextId"])
	if !ok || contextID < 1 {
		return 0, fmt.Errorf("Page.createIsolatedWorld did not return an execution context id")
	}
	return contextID, nil
}

func (session Session) FrameIDForObject(ctx context.Context, objectID string) (string, error) {
	result, err := session.Execute(ctx, "DOM.describeNode", map[string]any{"objectId": objectID})
	if err != nil {
		return "", err
	}
	node, _ := result["node"].(map[string]any)
	frameID, _ := node["frameId"].(string)
	if frameID == "" {
		return "", fmt.Errorf("DOM.describeNode did not return a frame id for iframe element")
	}
	return frameID, nil
}

func (session Session) ReleaseObject(ctx context.Context, objectID string) {
	_, _ = session.Execute(ctx, "Runtime.releaseObject", map[string]any{"objectId": objectID})
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

func numberAsInt(value any) (int, bool) {
	switch number := value.(type) {
	case int:
		return number, true
	case float64:
		return int(number), number == float64(int(number))
	default:
		return 0, false
	}
}
