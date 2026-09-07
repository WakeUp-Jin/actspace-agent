package protocol

import (
	"bytes"
	"testing"
)

func TestCoreMethodsIncludesFullBridgeSurface(t *testing.T) {
	for _, want := range []string{
		MethodTabs,
		MethodUserTabs,
		MethodHistory,
		MethodOpenTab,
		MethodClaimTab,
		MethodNavigate,
		MethodWaitLoad,
		MethodPageInfo,
		MethodFinalizeTabs,
		MethodCDP,
		MethodScreenshot,
	} {
		found := false
		for _, method := range CoreMethods {
			if method == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("CoreMethods missing %s", want)
		}
	}
}

func TestCommandPrimitiveAndEventMethodsAreUnique(t *testing.T) {
	seen := map[string]struct{}{}
	for _, methods := range [][]string{CommandMethods, BackendPrimitiveMethods, EventMethods} {
		for _, method := range methods {
			if _, exists := seen[method]; exists {
				t.Fatalf("duplicate method %q", method)
			}
			seen[method] = struct{}{}
		}
	}
	if len(CommandMethods) != 5 || len(BackendPrimitiveMethods) != 12 || len(EventMethods) != 4 {
		t.Fatalf("unexpected method counts: command=%d primitive=%d event=%d", len(CommandMethods), len(BackendPrimitiveMethods), len(EventMethods))
	}
}

func TestDecodeParams(t *testing.T) {
	var target NavigateParams
	err := DecodeParams(map[string]any{
		"tabId": float64(42),
		"url":   "https://example.com",
	}, &target)
	if err != nil {
		t.Fatal(err)
	}
	if target.TabID != 42 || target.URL != "https://example.com" {
		t.Fatalf("unexpected params: %+v", target)
	}
}

func TestReadResponseFrame(t *testing.T) {
	var buf bytes.Buffer
	response := ResponseEnvelope{
		ProtocolVersion: ProtocolVersion,
		ID:              "req",
		OK:              true,
		Result:          map[string]any{"pong": true},
	}
	if err := WriteJSONFrame(&buf, response); err != nil {
		t.Fatal(err)
	}
	got, err := ReadResponseFrame(&buf)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != response.ID || !got.OK {
		t.Fatalf("unexpected response: %+v", got)
	}
}
