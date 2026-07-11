package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
	"testing"
	"time"

	commandregistry "agent-browser-bridge/apps/cli/internal/commands"
	"agent-browser-bridge/packages/protocol"
)

func TestEveryRegistryHandlerHasDispatcherCase(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "command_router.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	handlers := map[string]bool{}
	for _, declaration := range file.Decls {
		function, ok := declaration.(*ast.FuncDecl)
		if !ok || function.Name.Name != "executeGoHandler" {
			continue
		}
		ast.Inspect(function.Body, func(node ast.Node) bool {
			clause, ok := node.(*ast.CaseClause)
			if !ok {
				return true
			}
			for _, expression := range clause.List {
				literal, ok := expression.(*ast.BasicLit)
				if !ok || literal.Kind != token.STRING {
					continue
				}
				value, err := strconv.Unquote(literal.Value)
				if err == nil && strings.HasPrefix(value, "go.") {
					handlers[value] = true
				}
			}
			return true
		})
	}
	for _, command := range commandregistry.All() {
		if !handlers[command.HandlerKey] {
			t.Errorf("registry handler %q for %s has no executeGoHandler case", command.HandlerKey, command.ID)
		}
	}
}

func TestDispatchCommandListIsLocal(t *testing.T) {
	response := dispatchBridgeRequest(protocol.RequestEnvelope{ID: "1", Method: protocol.MethodCommandList}, nil)
	if !response.OK {
		t.Fatalf("command list failed: %+v", response)
	}
	report, ok := response.Result.(commandregistry.RegistryReport)
	if !ok || report.Count != 62 {
		t.Fatalf("unexpected registry report: %#v", response.Result)
	}
}

func TestCommandPreflightAggregatesRiskAndHash(t *testing.T) {
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodCommandPreflight,
		Params: protocol.CommandPreflightParams{Actions: []protocol.CommandAction{
			{Category: "locator", Action: "inner_text", Params: map[string]any{"tab_id": 7, "selector": "h1"}},
			{Category: "io", Action: "clipboard_write_text", Params: map[string]any{"tab_id": 7, "text": "hello"}},
		}},
	}, nil)
	if !response.OK {
		t.Fatalf("preflight failed: %+v", response)
	}
	result := response.Result.(preflightResult)
	if result.HighestRisk != commandregistry.RiskHigh || result.ReadOnly || len(result.Actions) != 2 || len(result.ActionHash) != 64 {
		t.Fatalf("unexpected preflight: %+v", result)
	}
}

func TestCommandPreflightIncludesTargetAndOrigin(t *testing.T) {
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodCommandPreflight,
		Params: protocol.CommandPreflightParams{Actions: []protocol.CommandAction{{
			Category: "locator", Action: "click", Params: map[string]any{"tab_id": 7, "selector": "#submit"},
		}}},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		if request.Method != protocol.MethodBackendUserTabsList {
			t.Fatalf("unexpected preflight method: %s", request.Method)
		}
		return okResponse(request.ID, []protocol.TabInfo{{ID: 7, URL: "https://example.test/form"}})
	})
	if !response.OK {
		t.Fatalf("preflight failed: %+v", response)
	}
	action := response.Result.(preflightResult).Actions[0]
	if action.Target != "#submit" || action.Origin != "https://example.test" {
		t.Fatalf("unexpected enriched action: %+v", action)
	}
}

func TestCommandExecuteMapsToPrimitiveBackend(t *testing.T) {
	var forwarded protocol.RequestEnvelope
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodCommandExecute,
		Params: protocol.CommandExecuteParams{Category: "tabs", Action: "list", Params: map[string]any{}},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		forwarded = request
		return okResponse(request.ID, []protocol.TabInfo{{ID: 7}})
	})
	if !response.OK {
		t.Fatalf("execute failed: %+v", response)
	}
	if forwarded.Method != protocol.MethodBackendTabsList {
		t.Fatalf("forwarded method = %q, want %q", forwarded.Method, protocol.MethodBackendTabsList)
	}
	result := response.Result.(commandExecutionResult)
	if result.CommandID != "list_tabs" || result.Category != "tabs" || result.Action != "list" {
		t.Fatalf("unexpected execution result: %+v", result)
	}
}

func TestTabsFinalizeMapsCanonicalSnakeCaseKeepToBackendParams(t *testing.T) {
	var forwarded protocol.FinalizeTabsParams
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodCommandExecute,
		Params: protocol.CommandExecuteParams{
			Category: "tabs",
			Action:   "finalize",
			Params: map[string]any{
				"keep": []any{map[string]any{"tab_id": 7, "status": "handoff"}},
			},
		},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		if request.Method != protocol.MethodBackendSessionFinalize {
			t.Fatalf("forwarded method = %q, want %q", request.Method, protocol.MethodBackendSessionFinalize)
		}
		if err := protocol.DecodeParams(request.Params, &forwarded); err != nil {
			t.Fatal(err)
		}
		return okResponse(request.ID, protocol.FinalizeTabsResult{Kept: []int{7}})
	})
	if !response.OK {
		t.Fatalf("execute failed: %+v", response)
	}
	if len(forwarded.Keep) != 1 || forwarded.Keep[0].TabID != 7 || forwarded.Keep[0].Status != "handoff" {
		t.Fatalf("unexpected forwarded keep params: %+v", forwarded.Keep)
	}
}

func TestLegacyCLIUserTabsUsesCanonicalEngineWithoutExtensionHighLevelForwarding(t *testing.T) {
	var forwardedMethod string
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodUserTabs,
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		forwardedMethod = request.Method
		return okResponse(request.ID, []protocol.TabInfo{{ID: 7, URL: "https://example.test"}})
	})
	if !response.OK {
		t.Fatalf("legacy CLI compatibility failed: %+v", response)
	}
	if forwardedMethod != protocol.MethodBackendUserTabsList {
		t.Fatalf("forwarded method = %q, want primitive %q", forwardedMethod, protocol.MethodBackendUserTabsList)
	}
	tabs, ok := response.Result.([]protocol.TabInfo)
	if !ok || len(tabs) != 1 || tabs[0].ID != 7 {
		t.Fatalf("unexpected user tabs result: %#v", response.Result)
	}
}

func TestLegacyCLIFinalizeMapsThroughCanonicalEngine(t *testing.T) {
	var forwarded protocol.FinalizeTabsParams
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodFinalizeTabs,
		Params: protocol.FinalizeTabsParams{Keep: []protocol.FinalizeTabKeep{{TabID: 7, Status: "handoff"}}},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		if request.Method != protocol.MethodBackendSessionFinalize {
			t.Fatalf("forwarded method = %q, want primitive %q", request.Method, protocol.MethodBackendSessionFinalize)
		}
		if err := protocol.DecodeParams(request.Params, &forwarded); err != nil {
			t.Fatal(err)
		}
		return okResponse(request.ID, protocol.FinalizeTabsResult{Kept: []int{7}})
	})
	if !response.OK {
		t.Fatalf("legacy CLI compatibility failed: %+v", response)
	}
	if len(forwarded.Keep) != 1 || forwarded.Keep[0].TabID != 7 || forwarded.Keep[0].Status != "handoff" {
		t.Fatalf("unexpected forwarded finalize params: %+v", forwarded.Keep)
	}
}

func TestGoCuaClickUsesCursorAttachCDPAndDetachPrimitives(t *testing.T) {
	var methods []string
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodCommandExecute,
		Params: protocol.CommandExecuteParams{Category: "cua", Action: "click", Params: map[string]any{"tab_id": 7, "x": 10, "y": 20}},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		methods = append(methods, request.Method)
		return okResponse(request.ID, map[string]any{})
	})
	if !response.OK {
		t.Fatalf("execute failed: %+v", response)
	}
	want := []string{
		protocol.MethodBackendTabsList,
		protocol.MethodBackendCursorMove,
		protocol.MethodBackendAttach,
		protocol.MethodBackendExecuteCDP,
		protocol.MethodBackendExecuteCDP,
		protocol.MethodBackendDetach,
	}
	if len(methods) != len(want) {
		t.Fatalf("primitive count = %d, want %d: %+v", len(methods), len(want), methods)
	}
	for index := range want {
		if methods[index] != want[index] {
			t.Fatalf("primitive %d = %q, want %q", index, methods[index], want[index])
		}
	}
}

func TestGoLocatorClickResolvesPointThenUsesCuaPrimitives(t *testing.T) {
	var methods []string
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodCommandExecute,
		Params: protocol.CommandExecuteParams{Category: "locator", Action: "click", Params: map[string]any{"tab_id": 7, "selector": "#submit"}},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		methods = append(methods, request.Method)
		if request.Method == protocol.MethodBackendExecuteCDP {
			var params protocol.CDPParams
			if err := protocol.DecodeParams(request.Params, &params); err != nil {
				t.Fatal(err)
			}
			expression, _ := params.CommandParams["expression"].(string)
			switch {
			case strings.Contains(expression, "?.version"):
				return okResponse(request.ID, map[string]any{"result": map[string]any{"value": true}})
			case strings.Contains(expression, "invoke(\"point\""):
				return okResponse(request.ID, map[string]any{"result": map[string]any{"value": map[string]any{"x": 50, "y": 60}}})
			}
		}
		return okResponse(request.ID, map[string]any{})
	})
	if !response.OK {
		t.Fatalf("execute failed: %+v", response)
	}
	for _, method := range methods {
		if method == protocol.MethodClick {
			t.Fatalf("locator click used legacy high-level method: %+v", methods)
		}
	}
	want := []string{
		protocol.MethodBackendAttach,
		protocol.MethodBackendExecuteCDP,
		protocol.MethodBackendExecuteCDP,
		protocol.MethodBackendDetach,
		protocol.MethodBackendTabsList,
		protocol.MethodBackendCursorMove,
		protocol.MethodBackendAttach,
		protocol.MethodBackendExecuteCDP,
		protocol.MethodBackendExecuteCDP,
		protocol.MethodBackendDetach,
	}
	if len(methods) != len(want) {
		t.Fatalf("primitive count = %d, want %d: %+v", len(methods), len(want), methods)
	}
	for index := range want {
		if methods[index] != want[index] {
			t.Fatalf("primitive %d = %q, want %q", index, methods[index], want[index])
		}
	}
}

func TestGoCuaClickDetectsAndWaitsForNavigation(t *testing.T) {
	tabListCalls := 0
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodCommandExecute,
		Params: protocol.CommandExecuteParams{Category: "cua", Action: "click", Params: map[string]any{"tab_id": 7, "x": 10, "y": 20}},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		if request.Method == protocol.MethodBackendTabsList {
			tabListCalls++
			switch tabListCalls {
			case 1:
				return okResponse(request.ID, []protocol.TabInfo{{ID: 7, URL: "https://old.test", Status: "complete"}})
			case 2:
				return okResponse(request.ID, []protocol.TabInfo{{ID: 7, URL: "https://new.test", Status: "loading"}})
			default:
				return okResponse(request.ID, []protocol.TabInfo{{ID: 7, URL: "https://new.test", Status: "complete"}})
			}
		}
		return okResponse(request.ID, map[string]any{})
	})
	if !response.OK {
		t.Fatalf("execute failed: %+v", response)
	}
	if tabListCalls != 3 {
		t.Fatalf("tab list calls = %d, want 3", tabListCalls)
	}
}

func TestMatchURLNormalizesOnlyEmptyRootPath(t *testing.T) {
	tests := []struct {
		name     string
		actual   string
		expected string
		want     bool
	}{
		{name: "root without expected slash", actual: "https://example.org/", expected: "https://example.org", want: true},
		{name: "root without actual slash", actual: "https://example.org", expected: "https://example.org/", want: true},
		{name: "same query", actual: "https://example.org/?q=one", expected: "https://example.org?q=one", want: true},
		{name: "different query", actual: "https://example.org/?q=one", expected: "https://example.org?q=two", want: false},
		{name: "different path", actual: "https://example.org/path/", expected: "https://example.org/path", want: false},
		{name: "wildcard prefix unchanged", actual: "https://example.org/path/child", expected: "https://example.org/path*", want: true},
		{name: "wildcard still requires prefix", actual: "https://example.org/other", expected: "https://example.org/path*", want: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := matchURL(test.actual, test.expected); got != test.want {
				t.Fatalf("matchURL(%q, %q) = %v, want %v", test.actual, test.expected, got, test.want)
			}
		})
	}
}

func TestCommandExecuteRejectsInvalidParamsOrMissingBackend(t *testing.T) {
	tests := []struct {
		name   string
		params protocol.CommandExecuteParams
		code   string
	}{
		{name: "invalid params", params: protocol.CommandExecuteParams{Category: "locator", Action: "fill", Params: map[string]any{"tab_id": 7}}, code: protocol.ErrorInvalidParams},
		{name: "missing backend", params: protocol.CommandExecuteParams{Category: "wait", Action: "url", Params: map[string]any{"tab_id": 7, "url": "https://example.com"}}, code: protocol.ErrorExtensionUnavailable},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := dispatchBridgeRequest(protocol.RequestEnvelope{ID: "1", Method: protocol.MethodCommandExecute, Params: test.params}, nil)
			if response.OK || response.Error == nil || response.Error.Code != test.code {
				t.Fatalf("unexpected response: %+v", response)
			}
		})
	}
}

func TestCommandExecuteRejectsUnavailableBackendCapabilityBeforeHandler(t *testing.T) {
	state := newBrowserEventState()
	forwarded := []string{}
	response := dispatchBridgeRequestWithState(protocol.RequestEnvelope{
		ID: "1", Method: protocol.MethodCommandExecute,
		Params: protocol.CommandExecuteParams{Category: "wait", Action: "download", Params: map[string]any{"tab_id": 7}},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		forwarded = append(forwarded, request.Method)
		if request.Method == protocol.MethodInfo {
			return okResponse(request.ID, map[string]any{"capabilities": map[string]any{"downloads": false}})
		}
		t.Fatalf("handler forwarded despite missing capability: %+v", request)
		return protocol.ResponseEnvelope{}
	}, state)
	if response.OK || response.Error == nil || response.Error.Code != protocol.ErrorCapabilityUnavailable {
		t.Fatalf("unexpected capability response: %+v", response)
	}
	if len(forwarded) != 1 || forwarded[0] != protocol.MethodInfo {
		t.Fatalf("unexpected forwarded methods: %+v", forwarded)
	}
}

func TestCommandRunCannotBypassApproval(t *testing.T) {
	response := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "1",
		Method: protocol.MethodCommandRun,
		Params: protocol.CommandRunParams{Actions: []protocol.CommandAction{
			{Category: "tabs", Action: "list", Params: map[string]any{}},
		}},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		t.Fatalf("run must not forward before approval: %+v", request)
		return protocol.ResponseEnvelope{}
	})
	if response.OK || response.Error == nil || response.Error.Code != protocol.ErrorApprovalRequired {
		t.Fatalf("unexpected run response: %+v", response)
	}
	if response.Result == nil {
		t.Fatal("approval response must include preflight result")
	}
}

func TestCommandRunExecutesOnlyWithMatchingPreflightApproval(t *testing.T) {
	actions := []protocol.CommandAction{{Category: "tabs", Action: "list", Params: map[string]any{}}}
	preflight := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "preflight",
		Method: protocol.MethodCommandPreflight,
		Params: protocol.CommandPreflightParams{Actions: actions, SessionID: "session-1", TurnID: "turn-1"},
	}, nil)
	if !preflight.OK {
		t.Fatalf("preflight failed: %+v", preflight)
	}
	approval := preflight.Result.(preflightResult).Approval
	if approval == "" {
		t.Fatal("preflight did not issue approval token")
	}
	forwarded := 0
	run := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "run",
		Method: protocol.MethodCommandRun,
		Params: protocol.CommandRunParams{Actions: actions, StopOnError: true, Approval: approval, SessionID: "session-1", TurnID: "turn-1"},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		forwarded++
		return okResponse(request.ID, []protocol.TabInfo{})
	})
	if !run.OK || forwarded != 1 {
		t.Fatalf("approved run failed: response=%+v forwarded=%d", run, forwarded)
	}
	result := run.Result.(commandRunResult)
	if len(result.Results) != 1 || result.Results[0].CommandID != "list_tabs" {
		t.Fatalf("unexpected run result: %+v", result)
	}

	forwarded = 0
	tampered := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID:     "run-tampered",
		Method: protocol.MethodCommandRun,
		Params: protocol.CommandRunParams{Actions: actions, StopOnError: true, Approval: approval, SessionID: "session-1", TurnID: "turn-other"},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		forwarded++
		return okResponse(request.ID, map[string]any{})
	})
	if tampered.OK || tampered.Error == nil || tampered.Error.Code != protocol.ErrorApprovalRequired || forwarded != 0 {
		t.Fatalf("tampered run was not rejected: response=%+v forwarded=%d", tampered, forwarded)
	}

	changedActions := []protocol.CommandAction{{Category: "user", Action: "open_tabs", Params: map[string]any{}}}
	changed := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID: "run-changed", Method: protocol.MethodCommandRun,
		Params: protocol.CommandRunParams{Actions: changedActions, Approval: approval, SessionID: "session-1", TurnID: "turn-1"},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		forwarded++
		return okResponse(request.ID, map[string]any{})
	})
	if changed.OK || changed.Error == nil || changed.Error.Code != protocol.ErrorApprovalRequired || forwarded != 0 {
		t.Fatalf("changed action batch was not rejected: response=%+v forwarded=%d", changed, forwarded)
	}
}

func TestApprovalTokenExpires(t *testing.T) {
	payload, err := json.Marshal(approvalPayload{
		ActionHash: "hash", SessionID: "session", TurnID: "turn", ExpiresAt: time.Now().Add(-time.Second).UnixMilli(),
	})
	if err != nil {
		t.Fatal(err)
	}
	mac := hmac.New(sha256.New, approvalSecret)
	_, _ = mac.Write(payload)
	token := base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if err := verifyApproval(token, "hash", "session", "turn"); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expired token was accepted: %v", err)
	}
}

func TestReadOnlyCommandRunCanContinueAndReportsFailures(t *testing.T) {
	actions := []protocol.CommandAction{
		{Category: "tabs", Action: "list", Params: map[string]any{}},
		{Category: "user", Action: "open_tabs", Params: map[string]any{}},
	}
	preflight := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID: "preflight", Method: protocol.MethodCommandPreflight,
		Params: protocol.CommandPreflightParams{Actions: actions, SessionID: "session-1", TurnID: "turn-1"},
	}, nil)
	approval := preflight.Result.(preflightResult).Approval
	requests := 0
	run := dispatchBridgeRequest(protocol.RequestEnvelope{
		ID: "run", Method: protocol.MethodCommandRun,
		Params: protocol.CommandRunParams{Actions: actions, StopOnError: false, Approval: approval, SessionID: "session-1", TurnID: "turn-1"},
	}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		requests++
		if requests == 1 {
			return errorResp(request.ID, protocol.ErrorBrowserAPIFailed, "first read failed")
		}
		return okResponse(request.ID, []protocol.TabInfo{})
	})
	if !run.OK {
		t.Fatalf("read-only run should continue: %+v", run)
	}
	results := run.Result.(commandRunResult).Results
	if len(results) != 2 || results[0].Status != "failed" || results[1].Status != "completed" {
		t.Fatalf("unexpected run results: %+v", results)
	}
}

func TestLegacyForwardingIsDisabledByDefault(t *testing.T) {
	t.Setenv("ABB_LEGACY_BROWSER_FORWARDING", "")
	response := dispatchBridgeRequest(protocol.RequestEnvelope{ID: "1", Method: protocol.MethodClick}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		t.Fatalf("legacy request must not be forwarded: %+v", request)
		return protocol.ResponseEnvelope{}
	})
	if response.OK || response.Error == nil || response.Error.Code != protocol.ErrorUnsupportedMethod {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func TestLegacyForwardingRequiresExplicitOptIn(t *testing.T) {
	t.Setenv("ABB_LEGACY_BROWSER_FORWARDING", "true")
	forwarded := false
	response := dispatchBridgeRequest(protocol.RequestEnvelope{ID: "1", Method: protocol.MethodClick}, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
		forwarded = true
		return okResponse(request.ID, map[string]any{"tabId": 7})
	})
	if !response.OK || !forwarded {
		t.Fatalf("explicit legacy forwarding did not run: %+v", response)
	}
}
