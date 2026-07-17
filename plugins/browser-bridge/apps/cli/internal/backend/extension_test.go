package backend

import (
	"context"
	"testing"

	"agent-browser-bridge/packages/protocol"
)

func TestExtensionBackendUsesPrimitiveMethods(t *testing.T) {
	var methods []string
	var cdpInputs []protocol.CDPParams
	backend := &ExtensionBackend{
		Request: func(_ context.Context, method string, params any) (any, error) {
			methods = append(methods, method)
			switch method {
			case protocol.MethodBackendTabsList:
				return []protocol.TabInfo{{ID: 7}}, nil
			case protocol.MethodBackendExecuteCDP:
				cdpInputs = append(cdpInputs, params.(protocol.CDPParams))
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
	if _, err := backend.ExecuteCDPInFrame(context.Background(), 7, "child-frame", "Page.createIsolatedWorld", map[string]any{"frameId": "child-frame"}); err != nil {
		t.Fatal(err)
	}
	want := []string{protocol.MethodBackendAttach, protocol.MethodBackendTabsList, protocol.MethodBackendExecuteCDP, protocol.MethodBackendExecuteCDP}
	for index := range want {
		if methods[index] != want[index] {
			t.Fatalf("method %d = %q, want %q", index, methods[index], want[index])
		}
	}
	if cdpInputs[0].FrameID != "" || cdpInputs[1].FrameID != "child-frame" {
		t.Fatalf("unexpected frame-scoped CDP inputs: %+v", cdpInputs)
	}
}
