package locator

import (
	"context"
	"strings"
	"testing"

	"agent-browser-bridge/apps/cli/internal/backend"
	"agent-browser-bridge/packages/protocol"
)

func TestEngineInjectsOnceAndReinjectsAfterNavigationReset(t *testing.T) {
	runtimePresent := false
	injections := 0
	request := func(_ context.Context, method string, params any) (any, error) {
		switch method {
		case protocol.MethodBackendAttach, protocol.MethodBackendDetach:
			return map[string]any{}, nil
		case protocol.MethodBackendExecuteCDP:
			cdpParams := params.(protocol.CDPParams)
			expression, _ := cdpParams.CommandParams["expression"].(string)
			switch {
			case strings.Contains(expression, "window.__actspaceLocator = createRuntime"):
				injections++
				runtimePresent = true
				return map[string]any{"result": map[string]any{}}, nil
			case strings.Contains(expression, "?.version"):
				return map[string]any{"result": map[string]any{"value": runtimePresent}}, nil
			case strings.Contains(expression, "invoke(\"count\""):
				return map[string]any{"result": map[string]any{"value": map[string]any{"count": 1}}}, nil
			default:
				return map[string]any{"result": map[string]any{}}, nil
			}
		default:
			return map[string]any{}, nil
		}
	}
	engine := Engine{Backend: &backend.ExtensionBackend{Request: request}}

	if _, err := engine.Invoke(context.Background(), 7, "count", map[string]any{"selector": "button"}); err != nil {
		t.Fatal(err)
	}
	if _, err := engine.Invoke(context.Background(), 7, "count", map[string]any{"selector": "button"}); err != nil {
		t.Fatal(err)
	}
	if injections != 1 {
		t.Fatalf("injections = %d, want 1 before navigation", injections)
	}

	runtimePresent = false
	if _, err := engine.Invoke(context.Background(), 7, "count", map[string]any{"selector": "button"}); err != nil {
		t.Fatal(err)
	}
	if injections != 2 {
		t.Fatalf("injections = %d, want 2 after navigation reset", injections)
	}
}

func TestEngineRoutesFramePathThroughCDPExecutionContextAndOffsetsPoint(t *testing.T) {
	runtimePresent := map[int]bool{}
	injections := map[int]int{}
	frameScopedCalls := 0
	request := func(_ context.Context, method string, params any) (any, error) {
		switch method {
		case protocol.MethodBackendAttach, protocol.MethodBackendDetach:
			return map[string]any{}, nil
		case protocol.MethodBackendExecuteCDP:
			cdpParams := params.(protocol.CDPParams)
			if cdpParams.FrameID == "child-frame" {
				frameScopedCalls++
			}
			contextID, _ := cdpParams.CommandParams["contextId"].(int)
			switch cdpParams.Method {
			case "Runtime.evaluate":
				expression, _ := cdpParams.CommandParams["expression"].(string)
				switch {
				case strings.Contains(expression, "window.__actspaceLocator = createRuntime"):
					injections[contextID]++
					runtimePresent[contextID] = true
					return map[string]any{"result": map[string]any{}}, nil
				case strings.Contains(expression, "?.version"):
					return map[string]any{"result": map[string]any{"value": runtimePresent[contextID]}}, nil
				case strings.Contains(expression, `invoke("frame_offset"`):
					return map[string]any{"result": map[string]any{"value": map[string]any{"x": 10.0, "y": 20.0}}}, nil
				case strings.Contains(expression, `invoke("frame_element"`):
					return map[string]any{"result": map[string]any{"objectId": "frame-object"}}, nil
				case strings.Contains(expression, `invoke("point"`):
					if contextID != 22 || strings.Contains(expression, "framePath") || !strings.Contains(expression, `"localCoordinates":true`) {
						t.Fatalf("unexpected frame point expression/context: context=%d expression=%s", contextID, expression)
					}
					return map[string]any{"result": map[string]any{"value": map[string]any{
						"x": 5.0, "y": 6.0,
						"box": map[string]any{"x": 1.0, "y": 2.0, "width": 30.0, "height": 40.0},
					}}}, nil
				}
			case "DOM.describeNode":
				return map[string]any{"node": map[string]any{"frameId": "child-frame"}}, nil
			case "Runtime.releaseObject":
				return map[string]any{}, nil
			case "Page.createIsolatedWorld":
				return map[string]any{"executionContextId": 22.0}, nil
			}
		}
		return map[string]any{}, nil
	}
	engine := Engine{Backend: &backend.ExtensionBackend{Request: request}}

	result, err := engine.Invoke(context.Background(), 7, "point", map[string]any{
		"target": map[string]any{
			"kind":      "role",
			"role":      "button",
			"name":      "保存",
			"framePath": []any{map[string]any{"kind": "css", "value": "#profile-frame"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	point := result.(map[string]any)
	if point["x"] != 15.0 || point["y"] != 26.0 {
		t.Fatalf("adjusted point = %+v, want x=15 y=26", point)
	}
	box := point["box"].(map[string]any)
	if box["x"] != 11.0 || box["y"] != 22.0 {
		t.Fatalf("adjusted box = %+v, want x=11 y=22", box)
	}
	if injections[0] != 1 || injections[22] != 1 {
		t.Fatalf("runtime injections = %+v, want root and child context once", injections)
	}
	if frameScopedCalls == 0 {
		t.Fatal("frame route did not use frame-scoped CDP")
	}
}
