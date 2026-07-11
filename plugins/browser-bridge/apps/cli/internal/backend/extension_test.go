package backend

import (
	"context"
	"testing"

	"agent-browser-bridge/packages/protocol"
)

func TestExtensionBackendUsesPrimitiveMethods(t *testing.T) {
	var methods []string
	backend := &ExtensionBackend{
		Request: func(_ context.Context, method string, _ any) (any, error) {
			methods = append(methods, method)
			switch method {
			case protocol.MethodBackendTabsList:
				return []protocol.TabInfo{{ID: 7}}, nil
			case protocol.MethodBackendExecuteCDP:
				return map[string]any{"ok": true}, nil
			default:
				return map[string]any{}, nil
			}
		},
	}

	if err := backend.Attach(context.Background(), 7); err != nil {
		t.Fatal(err)
	}
	tabs, err := backend.ListTabs(context.Background(), SessionRef{})
	if err != nil || len(tabs) != 1 || tabs[0].ID != 7 {
		t.Fatalf("unexpected tabs: %+v err=%v", tabs, err)
	}
	if _, err := backend.ExecuteCDP(context.Background(), 7, "Runtime.evaluate", map[string]any{}); err != nil {
		t.Fatal(err)
	}
	want := []string{protocol.MethodBackendAttach, protocol.MethodBackendTabsList, protocol.MethodBackendExecuteCDP}
	for index := range want {
		if methods[index] != want[index] {
			t.Fatalf("method %d = %q, want %q", index, methods[index], want[index])
		}
	}
}
