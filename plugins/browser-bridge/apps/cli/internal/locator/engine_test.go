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
			case strings.Contains(expression, "const VERSION"):
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
