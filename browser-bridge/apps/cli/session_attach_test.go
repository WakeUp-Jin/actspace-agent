package main

import (
	"sort"
	"testing"

	"agent-browser-bridge/packages/protocol"
)

func TestAttachedTabReferenceCountsPreservePersistentAttach(t *testing.T) {
	attached := map[int]int{}
	addAttachedTab(attached, 7) // persistent debug/file chooser attach
	addAttachedTab(attached, 7) // temporary CUA/Locator attach
	removeAttachedTab(attached, 7)
	if attached[7] != 1 {
		t.Fatalf("temporary detach removed persistent attach: %+v", attached)
	}
	addAttachedTab(attached, 8)
	addAttachedTab(attached, 8)
	drained := expandedAttachedTabs(attached)
	sort.Ints(drained)
	want := []int{7, 8, 8}
	if len(drained) != len(want) {
		t.Fatalf("expanded attach refs = %+v, want %+v", drained, want)
	}
	for index := range want {
		if drained[index] != want[index] {
			t.Fatalf("expanded attach refs = %+v, want %+v", drained, want)
		}
	}
}

func TestWithBackendSessionInjectsSessionAndPreservesParams(t *testing.T) {
	request := withBackendSession(protocol.RequestEnvelope{
		Method: protocol.MethodBackendExecuteCDP,
		Params: protocol.CDPParams{TabID: 7, Method: "Runtime.evaluate", CommandParams: map[string]any{
			"expression": "1",
		}},
	}, "session-a", "turn-a")
	params, ok := request.Params.(map[string]any)
	if !ok {
		t.Fatalf("params type = %T, want map", request.Params)
	}
	if params["sessionId"] != "session-a" || params["turnId"] != "turn-a" {
		t.Fatalf("session metadata missing: %+v", params)
	}
	if params["tabId"] != float64(7) || params["method"] != "Runtime.evaluate" {
		t.Fatalf("original params changed: %+v", params)
	}
}

func TestWithBackendSessionLeavesNonPrimitiveRequestUnchanged(t *testing.T) {
	original := protocol.RequestEnvelope{Method: protocol.MethodInfo, Params: map[string]any{"value": 1}}
	request := withBackendSession(original, "session-a", "turn-a")
	params := request.Params.(map[string]any)
	if _, exists := params["sessionId"]; exists {
		t.Fatalf("non-primitive request received session metadata: %+v", params)
	}
}
