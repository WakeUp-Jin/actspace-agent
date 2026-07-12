package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	backendpkg "agent-browser-bridge/apps/cli/internal/backend"
	"agent-browser-bridge/apps/cli/internal/cdp"
	commandregistry "agent-browser-bridge/apps/cli/internal/commands"
	"agent-browser-bridge/apps/cli/internal/cua"
	"agent-browser-bridge/apps/cli/internal/domcua"
	"agent-browser-bridge/apps/cli/internal/locator"
	"agent-browser-bridge/packages/protocol"
)

type requestForwarder func(protocol.RequestEnvelope) protocol.ResponseEnvelope

type preflightAction struct {
	Index        int                                  `json:"index"`
	CommandID    string                               `json:"commandId"`
	Category     string                               `json:"category"`
	Action       string                               `json:"action"`
	RiskLevel    commandregistry.RiskLevel            `json:"riskLevel"`
	ReadOnly     bool                                 `json:"readOnly"`
	Effect       string                               `json:"effect"`
	OriginPolicy string                               `json:"originPolicy"`
	Status       commandregistry.ImplementationStatus `json:"status"`
	Target       string                               `json:"target,omitempty"`
	Origin       string                               `json:"origin,omitempty"`
}

type preflightResult struct {
	ActionHash  string                    `json:"actionHash"`
	HighestRisk commandregistry.RiskLevel `json:"highestRisk"`
	ReadOnly    bool                      `json:"readOnly"`
	Actions     []preflightAction         `json:"actions"`
	Approval    string                    `json:"approval,omitempty"`
	ExpiresAt   int64                     `json:"expiresAt,omitempty"`
}

type commandExecutionResult struct {
	CommandID string               `json:"commandId"`
	Category  string               `json:"category"`
	Action    string               `json:"action"`
	Status    string               `json:"status"`
	Duration  int64                `json:"durationMs"`
	Result    any                  `json:"result,omitempty"`
	Error     *protocol.ErrorShape `json:"error,omitempty"`
}

type approvalPayload struct {
	ActionHash string `json:"actionHash"`
	SessionID  string `json:"sessionId"`
	TurnID     string `json:"turnId"`
	ExpiresAt  int64  `json:"expiresAt"`
}

type commandRunResult struct {
	ActionHash string                   `json:"actionHash"`
	Results    []commandExecutionResult `json:"results"`
}

var approvalSecret = newApprovalSecret()

func dispatchBridgeRequest(req protocol.RequestEnvelope, forward requestForwarder) protocol.ResponseEnvelope {
	return dispatchBridgeRequestWithState(req, forward, nil)
}

func dispatchBridgeRequestWithState(req protocol.RequestEnvelope, forward requestForwarder, events *browserEventState) protocol.ResponseEnvelope {
	switch req.Method {
	case protocol.MethodCommandList:
		return okResponse(req.ID, commandregistry.Report(""))
	case protocol.MethodCommandDescribe:
		var params protocol.CommandDescribeParams
		if err := protocol.DecodeParams(req.Params, &params); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error())
		}
		item, ok := commandregistry.Find(params.Category, params.Action)
		if !ok {
			return errorResp(req.ID, protocol.ErrorInvalidAction, fmt.Sprintf("unknown Browser Use action %s.%s", params.Category, params.Action))
		}
		return okResponse(req.ID, item)
	case protocol.MethodCommandPreflight:
		var params protocol.CommandPreflightParams
		if err := protocol.DecodeParams(req.Params, &params); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error())
		}
		result, code, err := buildPreflight(params.Actions)
		if err != nil {
			return errorResp(req.ID, code, err.Error())
		}
		enrichPreflight(&result, params.Actions, forward)
		if params.SessionID != "" && params.TurnID != "" {
			result.Approval, result.ExpiresAt = issueApproval(result.ActionHash, params.SessionID, params.TurnID)
		}
		return okResponse(req.ID, result)
	case protocol.MethodCommandExecute:
		var params protocol.CommandExecuteParams
		if err := protocol.DecodeParams(req.Params, &params); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error())
		}
		return executeCanonicalCommand(req.ID, params, forward, events)
	case protocol.MethodCommandRun:
		var params protocol.CommandRunParams
		if err := protocol.DecodeParams(req.Params, &params); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error())
		}
		result, code, err := buildPreflight(params.Actions)
		if err != nil {
			return errorResp(req.ID, code, err.Error())
		}
		if err := verifyApproval(params.Approval, result.ActionHash, params.SessionID, params.TurnID); err != nil {
			return protocol.ResponseEnvelope{ProtocolVersion: protocol.ProtocolVersion, ID: req.ID, OK: false, Result: result, Error: &protocol.ErrorShape{Code: protocol.ErrorApprovalRequired, Message: err.Error()}}
		}
		runResult := commandRunResult{ActionHash: result.ActionHash, Results: make([]commandExecutionResult, 0, len(params.Actions))}
		stopOnError := params.StopOnError || !result.ReadOnly
		for index, action := range params.Actions {
			started := time.Now()
			response := executeCanonicalCommand(fmt.Sprintf("%s_%d", req.ID, index), protocol.CommandExecuteParams{Category: action.Category, Action: action.Action, Params: action.Params}, forward, events)
			if !response.OK {
				item, _ := commandregistry.Find(action.Category, action.Action)
				runResult.Results = append(runResult.Results, commandExecutionResult{
					CommandID: item.ID, Category: action.Category, Action: action.Action,
					Status: "failed", Duration: time.Since(started).Milliseconds(), Error: response.Error,
				})
				if stopOnError {
					response.ID = req.ID
					response.Result = runResult
					return response
				}
				continue
			}
			execution, ok := response.Result.(commandExecutionResult)
			if ok {
				runResult.Results = append(runResult.Results, execution)
			}
		}
		return okResponse(req.ID, runResult)
	default:
		if response, handled := executeLegacyCLICompatibility(req, forward, events); handled {
			return response
		}
		if isLegacyHighLevelMethod(req.Method) && !legacyForwardingEnabled() {
			return errorResp(req.ID, protocol.ErrorUnsupportedMethod, "legacy Browser Use forwarding is disabled; use agent_browser_bridge.command.execute")
		}
		if forward == nil {
			return errorResp(req.ID, protocol.ErrorExtensionUnavailable, "extension forwarder is not available")
		}
		return forward(req)
	}
}

func executeLegacyCLICompatibility(req protocol.RequestEnvelope, forward requestForwarder, events *browserEventState) (protocol.ResponseEnvelope, bool) {
	execute := func(category string, action string, params map[string]any) protocol.ResponseEnvelope {
		response := executeCanonicalCommand(req.ID, protocol.CommandExecuteParams{Category: category, Action: action, Params: params}, forward, events)
		if !response.OK {
			return response
		}
		execution, ok := response.Result.(commandExecutionResult)
		if !ok {
			return errorResp(req.ID, protocol.ErrorBrowserAPIFailed, "canonical compatibility result is malformed")
		}
		return okResponse(req.ID, execution.Result)
	}
	field := func(response protocol.ResponseEnvelope, name string) protocol.ResponseEnvelope {
		if !response.OK {
			return response
		}
		result, ok := response.Result.(map[string]any)
		if !ok {
			return errorResp(req.ID, protocol.ErrorBrowserAPIFailed, "canonical compatibility result is malformed")
		}
		return okResponse(req.ID, result[name])
	}
	tabInfo := func(tabID int) protocol.ResponseEnvelope {
		if forward == nil {
			return errorResp(req.ID, protocol.ErrorExtensionUnavailable, "extension forwarder is not available")
		}
		browserBackend := &backendpkg.ExtensionBackend{Request: func(_ context.Context, method string, requestParams any) (any, error) {
			response := forward(protocol.RequestEnvelope{
				ProtocolVersion: protocol.ProtocolVersion,
				ID:              fmt.Sprintf("legacy_cli_%s", randomRequestSuffix()),
				Method:          method,
				Params:          requestParams,
			})
			if !response.OK {
				if response.Error == nil {
					return nil, fmt.Errorf("extension primitive request failed")
				}
				return nil, fmt.Errorf("%s: %s", response.Error.Code, response.Error.Message)
			}
			return response.Result, nil
		}}
		tabs, err := browserBackend.ListUserTabs(context.Background())
		if err != nil {
			return errorResp(req.ID, protocol.ErrorBrowserAPIFailed, err.Error())
		}
		for _, tab := range tabs {
			if tab.ID == tabID {
				return okResponse(req.ID, tab)
			}
		}
		return errorResp(req.ID, protocol.ErrorTabNotInSession, fmt.Sprintf("tab %d was not found", tabID))
	}

	switch req.Method {
	case protocol.MethodTabs:
		return field(execute("tabs", "list", map[string]any{}), "tabs"), true
	case protocol.MethodUserTabs:
		return field(execute("user", "open_tabs", map[string]any{}), "tabs"), true
	case protocol.MethodHistory:
		var input protocol.HistoryQueryParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		return field(execute("user", "history", map[string]any{
			"query": input.Query, "limit": input.Limit, "from": input.From, "to": input.To,
		}), "items"), true
	case protocol.MethodOpenTab:
		var input protocol.OpenTabParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		return execute("tabs", "create", map[string]any{"url": input.URL, "active": input.Active}), true
	case protocol.MethodClaimTab:
		var input protocol.TabTargetParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		return execute("user", "claim_tab", map[string]any{"tab_id": input.TabID}), true
	case protocol.MethodNavigate:
		var input protocol.NavigateParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		response := execute("navigation", "goto", map[string]any{"tab_id": input.TabID, "url": input.URL})
		if !response.OK {
			return response, true
		}
		return tabInfo(input.TabID), true
	case protocol.MethodNavigateBack:
		var input protocol.TabTargetParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		response := execute("navigation", "back", map[string]any{"tab_id": input.TabID})
		if !response.OK {
			return response, true
		}
		return tabInfo(input.TabID), true
	case protocol.MethodWaitLoad:
		var input protocol.WaitLoadParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		state := input.State
		if state == "" || state == "complete" || state == "loading" {
			state = "load"
		}
		response := execute("wait", "load_state", map[string]any{"tab_id": input.TabID, "state": state, "timeout_ms": input.TimeoutMS})
		if !response.OK {
			return response, true
		}
		return tabInfo(input.TabID), true
	case protocol.MethodPageInfo:
		var input protocol.TabTargetParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		response := tabInfo(input.TabID)
		if !response.OK {
			return response, true
		}
		tab := response.Result.(protocol.TabInfo)
		return okResponse(req.ID, protocol.PageInfo{TabID: tab.ID, Window: tab.Window, Title: tab.Title, URL: tab.URL, Status: tab.Status, Active: tab.Active, Summary: strings.TrimSpace(tab.Title + " " + tab.URL)}), true
	case protocol.MethodFinalizeTabs:
		var input protocol.FinalizeTabsParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		keep := make([]any, 0, len(input.Keep))
		for _, entry := range input.Keep {
			keep = append(keep, map[string]any{"tab_id": entry.TabID, "status": entry.Status})
		}
		return execute("tabs", "finalize", map[string]any{"keep": keep}), true
	case protocol.MethodScreenshot:
		var input protocol.ScreenshotParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		return execute("cua", "screenshot", map[string]any{"tab_id": input.TabID}), true
	case protocol.MethodCloseTab:
		var input protocol.TabTargetParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		return execute("tabs", "close", map[string]any{"tab_id": input.TabID}), true
	case protocol.MethodNameSession:
		var input protocol.NameSessionParams
		if err := protocol.DecodeParams(req.Params, &input); err != nil {
			return errorResp(req.ID, protocol.ErrorInvalidParams, err.Error()), true
		}
		return execute("tabs", "name_session", map[string]any{"name": input.Name}), true
	default:
		return protocol.ResponseEnvelope{}, false
	}
}

func buildPreflight(actions []protocol.CommandAction) (preflightResult, string, error) {
	if len(actions) == 0 {
		return preflightResult{}, protocol.ErrorInvalidParams, fmt.Errorf("actions must not be empty")
	}
	result := preflightResult{HighestRisk: commandregistry.RiskLow, ReadOnly: true, Actions: make([]preflightAction, 0, len(actions))}
	for index, action := range actions {
		item, ok := commandregistry.Find(action.Category, action.Action)
		if !ok {
			return preflightResult{}, protocol.ErrorInvalidAction, fmt.Errorf("unknown Browser Use action %s.%s at index %d", action.Category, action.Action, index)
		}
		if err := commandregistry.ValidateInput(item, action.Params); err != nil {
			return preflightResult{}, protocol.ErrorInvalidParams, fmt.Errorf("invalid %s.%s params at index %d: %w", action.Category, action.Action, index, err)
		}
		if riskRank(item.RiskLevel) > riskRank(result.HighestRisk) {
			result.HighestRisk = item.RiskLevel
		}
		result.ReadOnly = result.ReadOnly && item.ReadOnly
		result.Actions = append(result.Actions, preflightAction{
			Index: index, CommandID: item.ID, Category: item.Category, Action: item.Action,
			RiskLevel: item.RiskLevel, ReadOnly: item.ReadOnly, Effect: item.Effect,
			OriginPolicy: item.OriginPolicy, Status: item.Status,
		})
	}
	payload, err := json.Marshal(actions)
	if err != nil {
		return preflightResult{}, protocol.ErrorInvalidParams, err
	}
	digest := sha256.Sum256(payload)
	result.ActionHash = hex.EncodeToString(digest[:])
	return result, "", nil
}

func enrichPreflight(result *preflightResult, actions []protocol.CommandAction, forward requestForwarder) {
	tabURLs := map[int]string{}
	if forward != nil {
		response := forward(protocol.RequestEnvelope{
			ProtocolVersion: protocol.ProtocolVersion,
			ID:              fmt.Sprintf("preflight_tabs_%s", randomRequestSuffix()),
			Method:          protocol.MethodBackendUserTabsList,
			Params:          map[string]any{},
		})
		if response.OK {
			payload, _ := json.Marshal(response.Result)
			var tabs []protocol.TabInfo
			if json.Unmarshal(payload, &tabs) == nil {
				for _, tab := range tabs {
					tabURLs[tab.ID] = tab.URL
				}
			}
		}
	}
	for index := range result.Actions {
		params := actions[index].Params
		if rawURL, _ := params["url"].(string); rawURL != "" {
			result.Actions[index].Target = rawURL
			result.Actions[index].Origin = URLOrigin(rawURL)
			continue
		}
		if selector, _ := params["selector"].(string); selector != "" {
			result.Actions[index].Target = selector
		}
		if files, ok := params["files"].([]any); ok && len(files) > 0 {
			names := make([]string, 0, len(files))
			for _, file := range files {
				if path, ok := file.(string); ok {
					names = append(names, filepath.Base(path))
				}
			}
			result.Actions[index].Target = strings.Join(names, ", ")
		}
		if tabID, ok := numberValue(params["tab_id"]); ok {
			id := int(tabID)
			if result.Actions[index].Target == "" {
				result.Actions[index].Target = fmt.Sprintf("tab %d", id)
			}
			result.Actions[index].Origin = URLOrigin(tabURLs[id])
		}
	}
}

func executeCanonicalCommand(id string, params protocol.CommandExecuteParams, forward requestForwarder, events *browserEventState) protocol.ResponseEnvelope {
	started := time.Now()
	item, ok := commandregistry.Find(params.Category, params.Action)
	if !ok {
		return errorResp(id, protocol.ErrorInvalidAction, fmt.Sprintf("unknown Browser Use action %s.%s", params.Category, params.Action))
	}
	if err := commandregistry.ValidateInput(item, params.Params); err != nil {
		return errorResp(id, protocol.ErrorInvalidParams, err.Error())
	}
	if item.Status == commandregistry.StatusNotImplemented || item.HandlerKey == "" {
		return errorResp(id, protocol.ErrorNotImplemented, fmt.Sprintf("%s is not implemented yet", item.ID))
	}
	if err := events.requireCapabilities(forward, item.RequiredCapabilities); err != nil {
		return errorResp(id, protocol.ErrorCapabilityUnavailable, err.Error())
	}
	if strings.HasPrefix(item.HandlerKey, "go.") {
		result, code, err := executeGoHandler(item.HandlerKey, params.Params, forward, events)
		if err != nil {
			return errorResp(id, classifyBrowserError(code, err), err.Error())
		}
		return okResponse(id, commandExecutionResult{CommandID: item.ID, Category: item.Category, Action: item.Action, Status: "completed", Duration: time.Since(started).Milliseconds(), Result: result})
	}
	if !legacyForwardingEnabled() {
		return errorResp(id, protocol.ErrorNotImplemented, fmt.Sprintf("%s still depends on migration-only legacy forwarding", item.ID))
	}
	if forward == nil {
		return errorResp(id, protocol.ErrorExtensionUnavailable, "extension forwarder is not available")
	}
	method, mappedParams, ok := legacyRequest(item.HandlerKey, params.Params)
	if !ok {
		return errorResp(id, protocol.ErrorNotImplemented, fmt.Sprintf("handler %s is not wired to the extension backend", item.HandlerKey))
	}
	response := forward(protocol.RequestEnvelope{
		ProtocolVersion: protocol.ProtocolVersion,
		ID:              id,
		Method:          method,
		Params:          mappedParams,
	})
	if !response.OK {
		return response
	}
	return okResponse(id, commandExecutionResult{
		CommandID: item.ID,
		Category:  item.Category,
		Action:    item.Action,
		Status:    "completed",
		Duration:  time.Since(started).Milliseconds(),
		Result:    response.Result,
	})
}

func executeGoHandler(handler string, params map[string]any, forward requestForwarder, events *browserEventState) (any, string, error) {
	if forward == nil {
		return nil, protocol.ErrorExtensionUnavailable, fmt.Errorf("extension forwarder is not available")
	}
	browserBackend := &backendpkg.ExtensionBackend{Request: func(_ context.Context, method string, requestParams any) (any, error) {
		response := forward(protocol.RequestEnvelope{
			ProtocolVersion: protocol.ProtocolVersion,
			ID:              fmt.Sprintf("go_handler_%s_%s", strings.ReplaceAll(handler, ".", "_"), randomRequestSuffix()),
			Method:          method,
			Params:          requestParams,
		})
		if !response.OK {
			if response.Error == nil {
				return nil, fmt.Errorf("extension primitive request failed")
			}
			return nil, fmt.Errorf("%s: %s", response.Error.Code, response.Error.Message)
		}
		return response.Result, nil
	}}
	engine := cua.Engine{Backend: browserBackend}
	locatorEngine := locator.Engine{Backend: browserBackend}
	domEngine := domcua.Engine{Backend: browserBackend}
	ctx := context.Background()
	switch handler {
	case "go.cua.screenshot":
		var input struct {
			TabID int `json:"tab_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		result, err := engine.Screenshot(ctx, input.TabID)
		return result, protocol.ErrorCDPFailed, err
	case "go.cua.click", "go.cua.double_click":
		var input struct {
			TabID  int      `json:"tab_id"`
			X      float64  `json:"x"`
			Y      float64  `json:"y"`
			Button string   `json:"button"`
			Keys   []string `json:"keys"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		clickCount := 1
		if handler == "go.cua.double_click" {
			clickCount = 2
		}
		err := engine.Click(ctx, input.TabID, cua.Point{X: input.X, Y: input.Y}, input.Button, clickCount, input.Keys)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.cua.move":
		var input struct {
			TabID int      `json:"tab_id"`
			X     float64  `json:"x"`
			Y     float64  `json:"y"`
			Keys  []string `json:"keys"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := engine.Move(ctx, input.TabID, cua.Point{X: input.X, Y: input.Y}, input.Keys)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.cua.scroll":
		var input struct {
			TabID   int      `json:"tab_id"`
			X       float64  `json:"x"`
			Y       float64  `json:"y"`
			ScrollX float64  `json:"scroll_x"`
			ScrollY float64  `json:"scroll_y"`
			Keys    []string `json:"keys"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := engine.Scroll(ctx, input.TabID, cua.Point{X: input.X, Y: input.Y}, input.ScrollX, input.ScrollY, input.Keys)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.cua.type":
		var input struct {
			TabID int    `json:"tab_id"`
			Text  string `json:"text"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := engine.Type(ctx, input.TabID, input.Text)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.cua.keypress":
		var input struct {
			TabID int      `json:"tab_id"`
			Keys  []string `json:"keys"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := engine.Keypress(ctx, input.TabID, input.Keys)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.cua.drag":
		var input struct {
			TabID int         `json:"tab_id"`
			Path  []cua.Point `json:"path"`
			Keys  []string    `json:"keys"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := engine.Drag(ctx, input.TabID, input.Path, input.Keys)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.cua.download_media":
		var input struct {
			TabID int     `json:"tab_id"`
			X     float64 `json:"x"`
			Y     float64 `json:"y"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		result, err := locatorEngine.Invoke(ctx, input.TabID, "download_media_at_point", map[string]any{"x": input.X, "y": input.Y})
		return result, protocol.ErrorCDPFailed, err
	case "go.dom.snapshot":
		var input struct {
			TabID int `json:"tab_id"`
			Limit int `json:"limit"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		result, err := domEngine.Snapshot(ctx, input.TabID, input.Limit)
		return result, protocol.ErrorCDPFailed, err
	case "go.dom.click", "go.dom.double_click":
		var input struct {
			TabID  int    `json:"tab_id"`
			NodeID string `json:"node_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		clickCount := 1
		if handler == "go.dom.double_click" {
			clickCount = 2
		}
		err := domEngine.Click(ctx, input.TabID, input.NodeID, clickCount)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.dom.scroll":
		var input struct {
			TabID   int     `json:"tab_id"`
			NodeID  string  `json:"node_id"`
			ScrollX float64 `json:"scroll_x"`
			ScrollY float64 `json:"scroll_y"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := domEngine.Scroll(ctx, input.TabID, input.NodeID, input.ScrollX, input.ScrollY)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.dom.type":
		var input struct {
			TabID int    `json:"tab_id"`
			Text  string `json:"text"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := domEngine.Type(ctx, input.TabID, input.Text)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.dom.keypress":
		var input struct {
			TabID int      `json:"tab_id"`
			Keys  []string `json:"keys"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := domEngine.Keypress(ctx, input.TabID, input.Keys)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.dom.download_media":
		var input struct {
			TabID  int    `json:"tab_id"`
			NodeID string `json:"node_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		result, err := locatorEngine.Invoke(ctx, input.TabID, "node_download_media", map[string]any{"nodeId": input.NodeID})
		return result, protocol.ErrorCDPFailed, err
	case "go.locator.click", "go.locator.double_click":
		var input struct {
			TabID     int      `json:"tab_id"`
			Selector  string   `json:"selector"`
			Button    string   `json:"button"`
			Modifiers []string `json:"modifiers"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		value, err := locatorEngine.Invoke(ctx, input.TabID, "point", map[string]any{"selector": input.Selector})
		if err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		point, err := cdpPoint(value)
		if err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		clickCount := 1
		if handler == "go.locator.double_click" {
			clickCount = 2
		}
		err = engine.Click(ctx, input.TabID, point, input.Button, clickCount, input.Modifiers)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.locator.fill":
		var input struct {
			TabID    int    `json:"tab_id"`
			Selector string `json:"selector"`
			Value    string `json:"value"`
			Replace  *bool  `json:"replace"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		if input.Replace != nil && !*input.Replace {
			if _, err := locatorEngine.Invoke(ctx, input.TabID, "focus", map[string]any{"selector": input.Selector}); err != nil {
				return nil, protocol.ErrorCDPFailed, err
			}
			err := engine.Type(ctx, input.TabID, input.Value)
			return map[string]any{}, protocol.ErrorCDPFailed, err
		}
		result, err := locatorEngine.Invoke(ctx, input.TabID, "fill", map[string]any{"selector": input.Selector, "value": input.Value})
		return result, protocol.ErrorCDPFailed, err
	case "go.locator.press":
		var input struct {
			TabID    int      `json:"tab_id"`
			Selector string   `json:"selector"`
			Keys     []string `json:"keys"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		if _, err := locatorEngine.Invoke(ctx, input.TabID, "focus", map[string]any{"selector": input.Selector}); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		err := engine.Keypress(ctx, input.TabID, input.Keys)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.locator.set_checked":
		var input struct {
			TabID    int    `json:"tab_id"`
			Selector string `json:"selector"`
			Checked  bool   `json:"checked"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		state, err := locatorEngine.Invoke(ctx, input.TabID, "set_checked", map[string]any{"selector": input.Selector, "checked": input.Checked})
		if err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		var stateResult struct {
			Value bool      `json:"value"`
			Point cua.Point `json:"point"`
		}
		if err := decodeAny(state, &stateResult); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		if stateResult.Value != input.Checked {
			if err := engine.Click(ctx, input.TabID, stateResult.Point, "left", 1, nil); err != nil {
				return nil, protocol.ErrorCDPFailed, err
			}
		}
		verified, err := locatorEngine.Invoke(ctx, input.TabID, "checked_state", map[string]any{"selector": input.Selector})
		if err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		var verifiedResult struct {
			Value bool `json:"value"`
		}
		if err := decodeAny(verified, &verifiedResult); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		if verifiedResult.Value != input.Checked {
			return nil, protocol.ErrorCDPFailed, fmt.Errorf("checked_state_mismatch")
		}
		return map[string]any{"value": verifiedResult.Value}, protocol.ErrorCDPFailed, nil
	case "go.locator.scroll":
		var input struct {
			TabID     int     `json:"tab_id"`
			Selector  string  `json:"selector"`
			Direction string  `json:"direction"`
			Amount    float64 `json:"amount"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		if input.Amount == 0 {
			input.Amount = 500
		}
		point, err := engine.ViewportCenter(ctx, input.TabID)
		if err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		if input.Selector != "" {
			value, err := locatorEngine.Invoke(ctx, input.TabID, "point", map[string]any{"selector": input.Selector})
			if err != nil {
				return nil, protocol.ErrorCDPFailed, err
			}
			point, err = cdpPoint(value)
			if err != nil {
				return nil, protocol.ErrorCDPFailed, err
			}
		}
		var scrollX, scrollY float64
		switch input.Direction {
		case "up":
			scrollY = -input.Amount
		case "down":
			scrollY = input.Amount
		case "left":
			scrollX = -input.Amount
		case "right":
			scrollX = input.Amount
		}
		err = engine.Scroll(ctx, input.TabID, point, scrollX, scrollY, nil)
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.locator.screenshot":
		var input struct {
			TabID      int      `json:"tab_id"`
			CropX      *float64 `json:"crop_x"`
			CropY      *float64 `json:"crop_y"`
			CropWidth  *float64 `json:"crop_width"`
			CropHeight *float64 `json:"crop_height"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		var clip *cua.Clip
		if input.CropWidth != nil || input.CropHeight != nil {
			if input.CropX == nil || input.CropY == nil || input.CropWidth == nil || input.CropHeight == nil {
				return nil, protocol.ErrorInvalidParams, fmt.Errorf("crop_x, crop_y, crop_width, and crop_height must be provided together")
			}
			clip = &cua.Clip{X: *input.CropX, Y: *input.CropY, Width: *input.CropWidth, Height: *input.CropHeight}
		}
		result, err := engine.ScreenshotClip(ctx, input.TabID, clip)
		return result, protocol.ErrorCDPFailed, err
	case "go.locator.element_screenshot":
		var input struct {
			TabID int     `json:"tab_id"`
			X     float64 `json:"x"`
			Y     float64 `json:"y"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		info, err := locatorEngine.Invoke(ctx, input.TabID, "element_info", map[string]any{"x": input.X, "y": input.Y})
		if err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		var infoResult struct {
			Elements []struct {
				BoundingBox struct {
					X      float64 `json:"x"`
					Y      float64 `json:"y"`
					Width  float64 `json:"width"`
					Height float64 `json:"height"`
				} `json:"boundingBox"`
			} `json:"elements"`
		}
		if err := decodeAny(info, &infoResult); err != nil || len(infoResult.Elements) == 0 {
			if err == nil {
				err = fmt.Errorf("element_not_found_at_point")
			}
			return nil, protocol.ErrorCDPFailed, err
		}
		box := infoResult.Elements[0].BoundingBox
		result, err := engine.ScreenshotClip(ctx, input.TabID, &cua.Clip{X: box.X, Y: box.Y, Width: box.Width, Height: box.Height})
		return result, protocol.ErrorCDPFailed, err
	case "go.locator.download_media":
		var input struct {
			TabID    int    `json:"tab_id"`
			Selector string `json:"selector"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		result, err := locatorEngine.Invoke(ctx, input.TabID, "download_media_selector", map[string]any{"selector": input.Selector})
		return result, protocol.ErrorCDPFailed, err
	case "go.locator.select_option", "go.locator.inner_text", "go.locator.text_content", "go.locator.all_text_contents", "go.locator.read_all", "go.locator.get_attribute", "go.locator.is_visible", "go.locator.is_enabled", "go.locator.count", "go.locator.wait_for", "go.locator.dom_snapshot", "go.locator.element_info":
		var input struct {
			TabID int `json:"tab_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		action := strings.TrimPrefix(handler, "go.locator.")
		runtimeParams := camelizeMap(params)
		delete(runtimeParams, "tabId")
		result, err := locatorEngine.Invoke(ctx, input.TabID, action, runtimeParams)
		return result, protocol.ErrorCDPFailed, err
	case "go.navigation.goto", "go.navigation.back", "go.navigation.forward", "go.navigation.reload":
		var input struct {
			TabID     int    `json:"tab_id"`
			URL       string `json:"url"`
			TimeoutMS int    `json:"timeout_ms"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		if handler == "go.navigation.goto" {
			if err := validateHTTPURL(input.URL); err != nil {
				return nil, protocol.ErrorInvalidParams, err
			}
		}
		err := executeNavigation(ctx, browserBackend, handler, input.TabID, input.URL, boundedTimeout(input.TimeoutMS, 15*time.Second))
		return map[string]any{}, protocol.ErrorNavigationBlocked, err
	case "go.tabs.create":
		var input struct {
			URL    string `json:"url"`
			Active bool   `json:"active"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		if input.URL != "" {
			if err := validateHTTPURL(input.URL); err != nil {
				return nil, protocol.ErrorInvalidParams, err
			}
		}
		result, err := browserBackend.CreateTab(ctx, backendpkg.SessionRef{}, protocol.OpenTabParams{URL: input.URL, Active: input.Active})
		return result, protocol.ErrorBrowserAPIFailed, err
	case "go.tabs.close":
		var input struct {
			TabID int `json:"tab_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := browserBackend.CloseTab(ctx, backendpkg.SessionRef{}, input.TabID)
		return map[string]any{}, protocol.ErrorBrowserAPIFailed, err
	case "go.tabs.list", "go.tabs.selected":
		tabs, err := browserBackend.ListTabs(ctx, backendpkg.SessionRef{})
		if err != nil {
			return nil, protocol.ErrorBrowserAPIFailed, err
		}
		if handler == "go.tabs.list" {
			return map[string]any{"tabs": tabs}, protocol.ErrorBrowserAPIFailed, nil
		}
		for _, tab := range tabs {
			if tab.Active {
				return tab, protocol.ErrorBrowserAPIFailed, nil
			}
		}
		if len(tabs) == 0 {
			return nil, protocol.ErrorTabNotInSession, fmt.Errorf("tab_not_in_session: session has no tabs")
		}
		return tabs[0], protocol.ErrorBrowserAPIFailed, nil
	case "go.tabs.name_session":
		var input struct {
			Name string `json:"name"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := browserBackend.NameSession(ctx, backendpkg.SessionRef{}, input.Name)
		return map[string]any{}, protocol.ErrorBrowserAPIFailed, err
	case "go.tabs.finalize":
		var input struct {
			Keep []struct {
				TabID  int    `json:"tab_id"`
				Status string `json:"status"`
			} `json:"keep"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		keep := make([]protocol.FinalizeTabKeep, 0, len(input.Keep))
		for _, entry := range input.Keep {
			keep = append(keep, protocol.FinalizeTabKeep{TabID: entry.TabID, Status: entry.Status})
		}
		result, err := browserBackend.FinalizeTabs(ctx, backendpkg.SessionRef{}, keep)
		return result, protocol.ErrorBrowserAPIFailed, err
	case "go.user.open_tabs":
		tabs, err := browserBackend.ListUserTabs(ctx)
		return map[string]any{"tabs": tabs}, protocol.ErrorBrowserAPIFailed, err
	case "go.user.claim_tab":
		var input struct {
			TabID int `json:"tab_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		result, err := browserBackend.ClaimTab(ctx, backendpkg.SessionRef{}, input.TabID)
		return result, protocol.ErrorBrowserAPIFailed, err
	case "go.user.history":
		var input protocol.HistoryQueryParams
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		items, err := browserBackend.SearchHistory(ctx, input)
		return map[string]any{"items": items}, protocol.ErrorBrowserAPIFailed, err
	case "go.wait.load_state", "go.wait.url":
		var input struct {
			TabID     int    `json:"tab_id"`
			State     string `json:"state"`
			URL       string `json:"url"`
			TimeoutMS int    `json:"timeout_ms"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		err := waitForTab(ctx, browserBackend, input.TabID, input.State, input.URL, boundedTimeout(input.TimeoutMS, 15*time.Second))
		return map[string]any{}, protocol.ErrorRequestTimeout, err
	case "go.wait.timeout":
		var input struct {
			TimeoutMS int `json:"timeout_ms"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		if input.TimeoutMS < 0 || input.TimeoutMS > 60_000 {
			return nil, protocol.ErrorInvalidParams, fmt.Errorf("timeout_ms must be between 0 and 60000")
		}
		err := waitWithContext(ctx, time.Duration(input.TimeoutMS)*time.Millisecond)
		return map[string]any{"waited_ms": input.TimeoutMS}, protocol.ErrorRequestTimeout, err
	case "go.wait.file_chooser":
		if events == nil {
			return nil, protocol.ErrorExtensionUnavailable, fmt.Errorf("file chooser event state is unavailable")
		}
		var input struct {
			TabID int `json:"tab_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		if err := browserBackend.Attach(ctx, input.TabID); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		if _, err := browserBackend.ExecuteCDP(ctx, input.TabID, "Page.enable", map[string]any{}); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		if _, err := browserBackend.ExecuteCDP(ctx, input.TabID, "Page.setInterceptFileChooserDialog", map[string]any{"enabled": true}); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		record := events.armFileChooser(input.TabID)
		return map[string]any{"file_chooser_id": record.ID, "is_multiple": false, "armed": true}, protocol.ErrorCDPFailed, nil
	case "go.wait.download":
		if events == nil {
			return nil, protocol.ErrorExtensionUnavailable, fmt.Errorf("download event state is unavailable")
		}
		var input struct {
			TabID int `json:"tab_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		record := events.armDownload(input.TabID)
		return map[string]any{"download_id": record.ID, "armed": true}, protocol.ErrorBrowserAPIFailed, nil
	case "go.io.set_file_chooser_files":
		if events == nil {
			return nil, protocol.ErrorExtensionUnavailable, fmt.Errorf("file chooser event state is unavailable")
		}
		var input struct {
			TabID         int      `json:"tab_id"`
			FileChooserID string   `json:"file_chooser_id"`
			Files         []string `json:"files"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		for _, file := range input.Files {
			if !filepath.IsAbs(file) {
				return nil, protocol.ErrorInvalidParams, fmt.Errorf("upload path must be absolute: %s", file)
			}
			if info, err := os.Stat(file); err != nil || info.IsDir() {
				return nil, protocol.ErrorInvalidParams, fmt.Errorf("upload file is unavailable: %s", file)
			}
		}
		record, err := events.waitFileChooser(ctx, input.FileChooserID, 15*time.Second)
		if err != nil {
			return nil, protocol.ErrorFileChooserNotFound, err
		}
		if record.TabID != input.TabID {
			return nil, protocol.ErrorTabNotInSession, fmt.Errorf("file chooser belongs to another tab")
		}
		if err := browserBackend.Attach(ctx, input.TabID); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		_, err = browserBackend.ExecuteCDP(ctx, input.TabID, "DOM.setFileInputFiles", map[string]any{"backendNodeId": record.BackendNodeID, "files": input.Files})
		return map[string]any{}, protocol.ErrorCDPFailed, err
	case "go.io.download_path":
		if events == nil {
			return nil, protocol.ErrorExtensionUnavailable, fmt.Errorf("download event state is unavailable")
		}
		var input struct {
			TabID      int    `json:"tab_id"`
			DownloadID string `json:"download_id"`
			TimeoutMS  int    `json:"timeout_ms"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		record, err := events.waitDownload(ctx, input.DownloadID, boundedTimeout(input.TimeoutMS, 30*time.Second))
		if err != nil {
			return nil, protocol.ErrorDownloadFailed, err
		}
		if record.TabID != input.TabID {
			return nil, protocol.ErrorTabNotInSession, fmt.Errorf("download token belongs to another tab")
		}
		return map[string]any{"path": record.Filename, "url": record.URL}, protocol.ErrorBrowserAPIFailed, nil
	case "go.io.clipboard_read_text", "go.io.clipboard_write_text", "go.io.clipboard_read", "go.io.clipboard_write":
		var input struct {
			TabID int `json:"tab_id"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		action := strings.TrimPrefix(handler, "go.io.clipboard_")
		result, err := locatorEngine.Invoke(ctx, input.TabID, "clipboard_"+action, camelizeMap(params))
		return result, protocol.ErrorCDPFailed, err
	case "go.debug.logs":
		if events == nil {
			return nil, protocol.ErrorExtensionUnavailable, fmt.Errorf("debug event state is unavailable")
		}
		var input struct {
			TabID  int      `json:"tab_id"`
			Filter string   `json:"filter"`
			Levels []string `json:"levels"`
			Limit  int      `json:"limit"`
		}
		if err := decodeCommandParams(params, &input); err != nil {
			return nil, protocol.ErrorInvalidParams, err
		}
		if err := browserBackend.Attach(ctx, input.TabID); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		if _, err := browserBackend.ExecuteCDP(ctx, input.TabID, "Runtime.enable", map[string]any{}); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		if _, err := browserBackend.ExecuteCDP(ctx, input.TabID, "Log.enable", map[string]any{}); err != nil {
			return nil, protocol.ErrorCDPFailed, err
		}
		return map[string]any{"logs": events.readLogs(input.TabID, input.Filter, input.Levels, input.Limit), "attached": true}, protocol.ErrorCDPFailed, nil
	default:
		return nil, protocol.ErrorNotImplemented, fmt.Errorf("Go handler %s is not implemented", handler)
	}
}

func executeNavigation(ctx context.Context, browserBackend backendpkg.BrowserBackend, handler string, tabID int, targetURL string, timeout time.Duration) error {
	session := cdp.Session{Backend: browserBackend, TabID: tabID}
	_, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		switch handler {
		case "go.navigation.goto":
			result, err := session.Execute(ctx, "Page.navigate", map[string]any{"url": targetURL})
			if err != nil {
				return nil, err
			}
			if errorText, _ := result["errorText"].(string); errorText != "" {
				return nil, fmt.Errorf("navigation_blocked: %s", errorText)
			}
		case "go.navigation.reload":
			if _, err := session.Execute(ctx, "Page.reload", map[string]any{}); err != nil {
				return nil, err
			}
		default:
			history, err := session.Execute(ctx, "Page.getNavigationHistory", map[string]any{})
			if err != nil {
				return nil, err
			}
			currentIndex := intValue(history["currentIndex"])
			entries, _ := history["entries"].([]any)
			targetIndex := currentIndex - 1
			if handler == "go.navigation.forward" {
				targetIndex = currentIndex + 1
			}
			if targetIndex < 0 || targetIndex >= len(entries) {
				return nil, fmt.Errorf("navigation_blocked: no history entry")
			}
			entry, _ := entries[targetIndex].(map[string]any)
			if _, err := session.Execute(ctx, "Page.navigateToHistoryEntry", map[string]any{"entryId": intValue(entry["id"])}); err != nil {
				return nil, err
			}
		}
		return map[string]any{}, nil
	})
	if err != nil {
		return err
	}
	return waitForTab(ctx, browserBackend, tabID, "load", "", timeout)
}

func waitForTab(ctx context.Context, browserBackend backendpkg.BrowserBackend, tabID int, state string, expectedURL string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		tabs, err := browserBackend.ListTabs(ctx, backendpkg.SessionRef{})
		if err != nil {
			return err
		}
		found := false
		for _, tab := range tabs {
			if tab.ID != tabID {
				continue
			}
			found = true
			if expectedURL != "" && matchURL(tab.URL, expectedURL) {
				return nil
			}
			if expectedURL == "" && (state == "domcontentloaded" || state == "load" || state == "") && tab.Status == "complete" {
				return nil
			}
		}
		if !found {
			return fmt.Errorf("tab_not_in_session: %d", tabID)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("navigation_timeout: tab %d did not reach requested state", tabID)
		}
		if err := waitWithContext(ctx, 125*time.Millisecond); err != nil {
			return err
		}
	}
}

func matchURL(actual string, expected string) bool {
	if strings.HasSuffix(expected, "*") {
		return strings.HasPrefix(actual, strings.TrimSuffix(expected, "*"))
	}
	return normalizeURLRootPath(actual) == normalizeURLRootPath(expected)
}

func normalizeURLRootPath(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return value
	}
	if parsed.Path == "" {
		parsed.Path = "/"
	}
	return parsed.String()
}

func validateHTTPURL(value string) error {
	parsed, err := url.ParseRequestURI(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return fmt.Errorf("URL must be an absolute http or https URL")
	}
	return nil
}

func URLOrigin(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

func boundedTimeout(value int, fallback time.Duration) time.Duration {
	if value <= 0 {
		return fallback
	}
	if value > 60_000 {
		value = 60_000
	}
	return time.Duration(value) * time.Millisecond
}

func decodeAny(value any, target any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(payload, target)
}

func cdpPoint(value any) (cua.Point, error) {
	var point cua.Point
	if err := decodeAny(value, &point); err != nil {
		return point, err
	}
	return point, nil
}

func classifyBrowserError(fallback string, err error) string {
	message := strings.ToLower(err.Error())
	for marker, code := range map[string]string{
		"unsupported_selector":     protocol.ErrorUnsupportedMethod,
		"selector_not_found":       protocol.ErrorSelectorNotFound,
		"selector_ambiguous":       protocol.ErrorSelectorAmbiguous,
		"element_not_visible":      protocol.ErrorElementNotVisible,
		"element_disabled":         protocol.ErrorElementDisabled,
		"element_not_editable":     protocol.ErrorElementNotEditable,
		"locator_timeout":          protocol.ErrorLocatorTimeout,
		"node_snapshot_stale":      "node_snapshot_stale",
		"download_media_not_found": "download_media_not_found",
		"tab_not_in_session":       protocol.ErrorTabNotInSession,
		"navigation_timeout":       protocol.ErrorNavigationTimeout,
		"navigation_blocked":       protocol.ErrorNavigationBlocked,
		"file_chooser_not_found":   protocol.ErrorFileChooserNotFound,
		"download_failed":          protocol.ErrorDownloadFailed,
	} {
		if strings.Contains(message, marker) {
			return code
		}
	}
	return fallback
}

func decodeCommandParams(params map[string]any, target any) error {
	payload, err := json.Marshal(params)
	if err != nil {
		return err
	}
	return json.Unmarshal(payload, target)
}

func randomRequestSuffix() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func legacyRequest(handler string, params map[string]any) (string, map[string]any, bool) {
	methods := map[string]string{
		"legacy.browser_screenshot":        protocol.MethodScreenshot,
		"legacy.browser_screenshot_crop":   protocol.MethodScreenshot,
		"legacy.browser_click_coordinate":  protocol.MethodClick,
		"legacy.browser_click_selector":    protocol.MethodClick,
		"legacy.browser_scroll_coordinate": protocol.MethodScroll,
		"legacy.browser_scroll":            protocol.MethodScroll,
		"legacy.browser_fill":              protocol.MethodFill,
		"legacy.browser_press_key":         protocol.MethodPressKey,
		"legacy.browser_select":            protocol.MethodSelectOption,
		"legacy.browser_dom_snapshot":      protocol.MethodDomSnapshot,
		"legacy.browser_navigate":          protocol.MethodNavigate,
		"legacy.browser_back":              protocol.MethodNavigateBack,
		"legacy.browser_open_tab":          protocol.MethodBackendTabsCreate,
		"legacy.browser_close_tab":         protocol.MethodBackendTabsClose,
		"legacy.browser_list_tabs":         protocol.MethodBackendTabsList,
		"legacy.browser_finalize":          protocol.MethodBackendSessionFinalize,
		"legacy.browser_user_tabs":         protocol.MethodBackendUserTabsList,
		"legacy.browser_claim_tab":         protocol.MethodBackendUserTabsClaim,
		"legacy.wait_load":                 protocol.MethodWaitLoad,
		"protocol.cua_type":                protocol.MethodCuaType,
		"protocol.get_visible_dom":         protocol.MethodGetVisibleDom,
		"protocol.dom_click":               protocol.MethodDomClick,
		"protocol.dom_double_click":        protocol.MethodDomDoubleClick,
		"protocol.dom_scroll":              protocol.MethodDomScroll,
		"protocol.name_session":            protocol.MethodBackendSessionName,
		"protocol.history":                 protocol.MethodBackendHistorySearch,
	}
	method, ok := methods[handler]
	if !ok {
		return "", nil, false
	}
	mapped := camelizeMap(params)
	if handler == "legacy.browser_scroll" {
		amount, _ := numberValue(params["amount"])
		if amount == 0 {
			amount = 500
		}
		switch params["direction"] {
		case "up":
			mapped["scrollY"] = -amount
		case "down":
			mapped["scrollY"] = amount
		case "left":
			mapped["scrollX"] = -amount
		case "right":
			mapped["scrollX"] = amount
		}
		delete(mapped, "direction")
		delete(mapped, "amount")
	}
	return method, mapped, true
}

func camelizeMap(input map[string]any) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[snakeToCamel(key)] = camelizeValue(value)
	}
	return result
}

func camelizeValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return camelizeMap(typed)
	case []any:
		result := make([]any, len(typed))
		for index, item := range typed {
			result[index] = camelizeValue(item)
		}
		return result
	default:
		return value
	}
}

func snakeToCamel(value string) string {
	parts := strings.Split(value, "_")
	for index := 1; index < len(parts); index++ {
		if parts[index] != "" {
			parts[index] = strings.ToUpper(parts[index][:1]) + parts[index][1:]
		}
	}
	return strings.Join(parts, "")
}

func numberValue(value any) (float64, bool) {
	switch number := value.(type) {
	case float64:
		return number, true
	case float32:
		return float64(number), true
	case int:
		return float64(number), true
	case int64:
		return float64(number), true
	default:
		return 0, false
	}
}

func riskRank(risk commandregistry.RiskLevel) int {
	switch risk {
	case commandregistry.RiskHigh:
		return 3
	case commandregistry.RiskMedium:
		return 2
	default:
		return 1
	}
}

func newApprovalSecret() []byte {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		panic(fmt.Sprintf("generate browser approval secret: %v", err))
	}
	return secret
}

func issueApproval(actionHash string, sessionID string, turnID string) (string, int64) {
	expiresAt := time.Now().Add(5 * time.Minute).UnixMilli()
	payload, _ := json.Marshal(approvalPayload{ActionHash: actionHash, SessionID: sessionID, TurnID: turnID, ExpiresAt: expiresAt})
	mac := hmac.New(sha256.New, approvalSecret)
	_, _ = mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), expiresAt
}

func verifyApproval(token string, actionHash string, sessionID string, turnID string) error {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return fmt.Errorf("browser_run requires a valid approval token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("browser_run approval token is malformed")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("browser_run approval signature is malformed")
	}
	mac := hmac.New(sha256.New, approvalSecret)
	_, _ = mac.Write(payload)
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return fmt.Errorf("browser_run approval signature is invalid")
	}
	var approved approvalPayload
	if err := json.Unmarshal(payload, &approved); err != nil {
		return fmt.Errorf("browser_run approval payload is invalid")
	}
	if approved.ActionHash != actionHash || approved.SessionID != sessionID || approved.TurnID != turnID {
		return fmt.Errorf("browser_run approval does not match this action batch, session, and turn")
	}
	if time.Now().UnixMilli() > approved.ExpiresAt {
		return fmt.Errorf("browser_run approval has expired")
	}
	return nil
}

func legacyForwardingEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("ABB_LEGACY_BROWSER_FORWARDING"))) {
	case "1", "true", "on", "enabled":
		return true
	default:
		return false
	}
}

func isLegacyHighLevelMethod(method string) bool {
	legacyMethods := map[string]struct{}{
		protocol.MethodTabs: {}, protocol.MethodUserTabs: {}, protocol.MethodHistory: {},
		protocol.MethodOpenTab: {}, protocol.MethodClaimTab: {}, protocol.MethodNavigate: {},
		protocol.MethodNavigateBack: {}, protocol.MethodWaitLoad: {}, protocol.MethodPageInfo: {},
		protocol.MethodFinalizeTabs: {}, protocol.MethodScreenshot: {}, protocol.MethodDomSnapshot: {},
		protocol.MethodCloseTab: {}, protocol.MethodNameSession: {}, protocol.MethodClick: {},
		protocol.MethodFill: {}, protocol.MethodPressKey: {}, protocol.MethodSelectOption: {},
		protocol.MethodScroll: {}, protocol.MethodGetVisibleDom: {}, protocol.MethodDomClick: {},
		protocol.MethodDomDoubleClick: {}, protocol.MethodDomScroll: {}, protocol.MethodCuaScreenshot: {},
		protocol.MethodCuaClick: {}, protocol.MethodCuaScroll: {}, protocol.MethodCuaType: {},
		protocol.MethodCuaKeypress: {},
	}
	_, exists := legacyMethods[method]
	return exists
}
