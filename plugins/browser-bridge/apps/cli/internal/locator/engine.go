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
		runtimeParams := cloneParams(params)
		executionSession, executionContextID, offsetX, offsetY, routed, err := resolveFrameRoute(ctx, session, runtimeParams)
		if err != nil {
			return nil, err
		}
		if !routed {
			if err := ensureRuntime(ctx, session, 0); err != nil {
				return nil, err
			}
		}
		expression, err := invokeExpression(action, runtimeParams)
		if err != nil {
			return nil, err
		}
		result, err := executionSession.EvaluateInContext(ctx, expression, executionContextID)
		if err != nil {
			return nil, err
		}
		if routed {
			adjustFrameCoordinates(action, result, offsetX, offsetY)
		}
		return result, nil
	})
}

func ensureRuntime(ctx context.Context, session cdp.Session, executionContextID int) error {
	value, err := session.EvaluateInContext(ctx, fmt.Sprintf("window.__actspaceLocator?.version === %q", RuntimeVersion), executionContextID)
	if err == nil && value == true {
		return nil
	}
	_, err = session.EvaluateInContext(ctx, runtimeSource+"\n//# sourceURL=actspace-locator-runtime.js", executionContextID)
	if err != nil {
		return err
	}
	value, err = session.EvaluateInContext(ctx, fmt.Sprintf("window.__actspaceLocator?.version === %q", RuntimeVersion), executionContextID)
	if err != nil || value != true {
		return fmt.Errorf("locator runtime injection failed")
	}
	return nil
}

func resolveFrameRoute(ctx context.Context, session cdp.Session, params map[string]any) (executionSession cdp.Session, executionContextID int, offsetX float64, offsetY float64, routed bool, err error) {
	target, ok := params["target"].(map[string]any)
	if !ok {
		return session, 0, 0, 0, false, nil
	}
	framePath, ok := target["framePath"].([]any)
	if !ok || len(framePath) == 0 {
		return session, 0, 0, 0, false, nil
	}

	currentSession := session
	currentContextID := 0
	if err := ensureRuntime(ctx, currentSession, currentContextID); err != nil {
		return session, 0, 0, 0, false, err
	}
	timeoutMS := params["timeoutMs"]
	for index, rawFrameTarget := range framePath {
		frameTarget, ok := rawFrameTarget.(map[string]any)
		if !ok {
			return session, 0, 0, 0, false, fmt.Errorf("frame_path[%d] must be an object", index)
		}
		frameParams := map[string]any{"target": frameTarget}
		if timeoutMS != nil {
			frameParams["timeoutMs"] = timeoutMS
		}

		offsetExpression, err := invokeExpression("frame_offset", frameParams)
		if err != nil {
			return session, 0, 0, 0, false, err
		}
		offsetValue, err := currentSession.EvaluateInContext(ctx, offsetExpression, currentContextID)
		if err != nil {
			return session, 0, 0, 0, false, fmt.Errorf("resolve frame_path[%d] offset: %w", index, err)
		}
		offset, err := cdp.Decode[struct {
			X float64 `json:"x"`
			Y float64 `json:"y"`
		}](offsetValue)
		if err != nil {
			return session, 0, 0, 0, false, fmt.Errorf("decode frame_path[%d] offset: %w", index, err)
		}
		offsetX += offset.X
		offsetY += offset.Y

		handleExpression, err := invokeExpression("frame_element", frameParams)
		if err != nil {
			return session, 0, 0, 0, false, err
		}
		objectID, err := currentSession.EvaluateHandleInContext(ctx, handleExpression, currentContextID)
		if err != nil {
			return session, 0, 0, 0, false, fmt.Errorf("resolve frame_path[%d] element: %w", index, err)
		}
		frameID, frameErr := currentSession.FrameIDForObject(ctx, objectID)
		currentSession.ReleaseObject(ctx, objectID)
		if frameErr != nil {
			return session, 0, 0, 0, false, fmt.Errorf("resolve frame_path[%d] frame id: %w", index, frameErr)
		}
		currentSession = session.ForFrame(frameID)
		currentContextID, err = currentSession.CreateIsolatedWorld(ctx, frameID, fmt.Sprintf("actspace-locator-v%s", RuntimeVersion))
		if err != nil {
			return session, 0, 0, 0, false, fmt.Errorf("create frame_path[%d] execution context: %w", index, err)
		}
		if err := ensureRuntime(ctx, currentSession, currentContextID); err != nil {
			return session, 0, 0, 0, false, fmt.Errorf("inject frame_path[%d] runtime: %w", index, err)
		}
	}

	delete(target, "framePath")
	params["localCoordinates"] = true
	return currentSession, currentContextID, offsetX, offsetY, true, nil
}

func invokeExpression(action string, params map[string]any) (string, error) {
	actionJSON, _ := json.Marshal(action)
	paramsJSON, err := json.Marshal(params)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("window.__actspaceLocator.invoke(%s,%s)", actionJSON, paramsJSON), nil
}

func cloneParams(params map[string]any) map[string]any {
	cloned := make(map[string]any, len(params))
	for key, value := range params {
		cloned[key] = value
	}
	if target, ok := params["target"].(map[string]any); ok {
		clonedTarget := make(map[string]any, len(target))
		for key, value := range target {
			clonedTarget[key] = value
		}
		cloned["target"] = clonedTarget
	}
	return cloned
}

func adjustFrameCoordinates(action string, result any, offsetX, offsetY float64) {
	root, ok := result.(map[string]any)
	if !ok {
		return
	}
	switch action {
	case "point":
		adjustPoint(root, offsetX, offsetY)
	case "set_checked":
		if point, ok := root["point"].(map[string]any); ok {
			adjustPoint(point, offsetX, offsetY)
		}
	}
}

func adjustPoint(point map[string]any, offsetX, offsetY float64) {
	if x, ok := point["x"].(float64); ok {
		point["x"] = x + offsetX
	}
	if y, ok := point["y"].(float64); ok {
		point["y"] = y + offsetY
	}
	if box, ok := point["box"].(map[string]any); ok {
		if x, ok := box["x"].(float64); ok {
			box["x"] = x + offsetX
		}
		if y, ok := box["y"].(float64); ok {
			box["y"] = y + offsetY
		}
	}
}
