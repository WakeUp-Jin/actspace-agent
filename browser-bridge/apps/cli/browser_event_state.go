package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"agent-browser-bridge/packages/protocol"
)

const maxDevLogsPerTab = 500

type browserEventState struct {
	mu                 sync.RWMutex
	sequence           atomic.Int64
	logs               map[int][]map[string]any
	choosers           map[string]*chooserRecord
	downloads          map[string]*downloadRecord
	capabilities       map[string]bool
	capabilitiesLoaded bool
}

type chooserRecord struct {
	ID            string
	TabID         int
	BackendNodeID int
	Mode          string
	CreatedAt     time.Time
}

type downloadRecord struct {
	ID        string
	TabID     int
	ChromeID  int
	Filename  string
	URL       string
	State     string
	CreatedAt time.Time
}

func newBrowserEventState() *browserEventState {
	return &browserEventState{
		logs:         map[int][]map[string]any{},
		choosers:     map[string]*chooserRecord{},
		downloads:    map[string]*downloadRecord{},
		capabilities: map[string]bool{"timer": true},
	}
}

func (state *browserEventState) reset() {
	if state == nil {
		return
	}
	state.mu.Lock()
	state.logs = map[int][]map[string]any{}
	state.choosers = map[string]*chooserRecord{}
	state.downloads = map[string]*downloadRecord{}
	state.capabilities = map[string]bool{"timer": true}
	state.capabilitiesLoaded = false
	state.mu.Unlock()
}

func (state *browserEventState) requireCapabilities(forward requestForwarder, required []string) error {
	if state == nil || len(required) == 0 {
		return nil
	}
	state.mu.RLock()
	loaded := state.capabilitiesLoaded
	state.mu.RUnlock()
	if !loaded {
		if forward == nil {
			return fmt.Errorf("capability_unavailable: extension capability report is unavailable")
		}
		response := forward(protocol.RequestEnvelope{
			ProtocolVersion: protocol.ProtocolVersion,
			ID:              fmt.Sprintf("capabilities_%s", state.nextID("request")),
			Method:          protocol.MethodInfo,
			Params:          map[string]any{},
		})
		if !response.OK {
			return fmt.Errorf("capability_unavailable: extension capability report failed")
		}
		result, _ := response.Result.(map[string]any)
		raw, _ := result["capabilities"].(map[string]any)
		state.mu.Lock()
		for name, value := range raw {
			available, _ := value.(bool)
			state.capabilities[name] = available
		}
		state.capabilitiesLoaded = true
		state.mu.Unlock()
	}
	state.mu.RLock()
	defer state.mu.RUnlock()
	missing := make([]string, 0)
	for _, capability := range required {
		if !state.capabilities[capability] {
			missing = append(missing, capability)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("capability_unavailable: %s", strings.Join(missing, ", "))
	}
	return nil
}

func (state *browserEventState) ingest(method string, params any) {
	if state == nil {
		return
	}
	payload, _ := params.(map[string]any)
	switch method {
	case "agent_browser_bridge.event.cdp":
		state.ingestCDP(payload)
	case "agent_browser_bridge.event.download":
		state.ingestDownload(payload)
	case "agent_browser_bridge.event.tab_closed":
		tabID := intValue(payload["tabId"])
		state.mu.Lock()
		delete(state.logs, tabID)
		state.mu.Unlock()
	}
}

func (state *browserEventState) armFileChooser(tabID int) chooserRecord {
	record := chooserRecord{ID: state.nextID("chooser"), TabID: tabID, CreatedAt: time.Now()}
	state.mu.Lock()
	state.choosers[record.ID] = &record
	state.mu.Unlock()
	return record
}

func (state *browserEventState) waitFileChooser(ctx context.Context, id string, timeout time.Duration) (chooserRecord, error) {
	deadline := time.Now().Add(timeout)
	for {
		state.mu.RLock()
		record := state.choosers[id]
		if record != nil && record.BackendNodeID > 0 {
			copy := *record
			state.mu.RUnlock()
			return copy, nil
		}
		state.mu.RUnlock()
		if time.Now().After(deadline) {
			return chooserRecord{}, fmt.Errorf("file_chooser_not_found: %s", id)
		}
		if err := waitWithContext(ctx, 75*time.Millisecond); err != nil {
			return chooserRecord{}, err
		}
	}
}

func (state *browserEventState) armDownload(tabID int) downloadRecord {
	record := downloadRecord{ID: state.nextID("download"), TabID: tabID, CreatedAt: time.Now()}
	state.mu.Lock()
	state.downloads[record.ID] = &record
	state.mu.Unlock()
	return record
}

func (state *browserEventState) waitDownload(ctx context.Context, id string, timeout time.Duration) (downloadRecord, error) {
	deadline := time.Now().Add(timeout)
	for {
		state.mu.RLock()
		record := state.downloads[id]
		if record != nil && record.ChromeID > 0 && record.State == "complete" && record.Filename != "" {
			copy := *record
			state.mu.RUnlock()
			return copy, nil
		}
		state.mu.RUnlock()
		if time.Now().After(deadline) {
			return downloadRecord{}, fmt.Errorf("download_failed: %s did not complete", id)
		}
		if err := waitWithContext(ctx, 100*time.Millisecond); err != nil {
			return downloadRecord{}, err
		}
	}
}

func (state *browserEventState) readLogs(tabID int, filter string, levels []string, limit int) []map[string]any {
	state.mu.RLock()
	entries := append([]map[string]any(nil), state.logs[tabID]...)
	state.mu.RUnlock()
	allowed := map[string]bool{}
	for _, level := range levels {
		allowed[strings.ToLower(level)] = true
	}
	result := make([]map[string]any, 0, len(entries))
	for _, entry := range entries {
		level, _ := entry["level"].(string)
		text, _ := entry["text"].(string)
		if len(allowed) > 0 && !allowed[strings.ToLower(level)] {
			continue
		}
		if filter != "" && !strings.Contains(strings.ToLower(text), strings.ToLower(filter)) {
			continue
		}
		result = append(result, entry)
	}
	if limit <= 0 || limit > maxDevLogsPerTab {
		limit = 100
	}
	if len(result) > limit {
		result = result[len(result)-limit:]
	}
	return result
}

func (state *browserEventState) ingestCDP(payload map[string]any) {
	tabID := intValue(payload["tabId"])
	method, _ := payload["method"].(string)
	params, _ := payload["params"].(map[string]any)
	if method == "Page.fileChooserOpened" {
		state.mu.Lock()
		ids := make([]string, 0)
		for id, record := range state.choosers {
			if record.TabID == tabID && record.BackendNodeID == 0 {
				ids = append(ids, id)
			}
		}
		sort.Strings(ids)
		if len(ids) > 0 {
			record := state.choosers[ids[0]]
			record.BackendNodeID = intValue(params["backendNodeId"])
			record.Mode, _ = params["mode"].(string)
		}
		state.mu.Unlock()
		return
	}
	entry, ok := devLogEntry(method, params)
	if !ok || tabID < 1 {
		return
	}
	state.mu.Lock()
	state.logs[tabID] = append(state.logs[tabID], entry)
	if len(state.logs[tabID]) > maxDevLogsPerTab {
		state.logs[tabID] = append([]map[string]any(nil), state.logs[tabID][len(state.logs[tabID])-maxDevLogsPerTab:]...)
	}
	state.mu.Unlock()
}

func (state *browserEventState) ingestDownload(payload map[string]any) {
	kind, _ := payload["kind"].(string)
	state.mu.Lock()
	defer state.mu.Unlock()
	if kind == "created" {
		item, _ := payload["item"].(map[string]any)
		chromeID := intValue(item["id"])
		var target *downloadRecord
		for _, record := range state.downloads {
			if record.ChromeID == 0 && (target == nil || record.CreatedAt.Before(target.CreatedAt)) {
				target = record
			}
		}
		if target == nil {
			record := downloadRecord{ID: state.nextID("download"), CreatedAt: time.Now()}
			state.downloads[record.ID] = &record
			target = &record
		}
		target.ChromeID = chromeID
		target.Filename, _ = item["filename"].(string)
		target.URL, _ = item["url"].(string)
		target.State, _ = item["state"].(string)
		return
	}
	delta := payload
	if kind == "changed" {
		delta, _ = payload["delta"].(map[string]any)
	}
	chromeID := intValue(delta["id"])
	for _, record := range state.downloads {
		if record.ChromeID != chromeID {
			continue
		}
		if value := deltaCurrent(delta["filename"]); value != "" {
			record.Filename = value
		}
		if value := deltaCurrent(delta["state"]); value != "" {
			record.State = value
		}
	}
}

func devLogEntry(method string, params map[string]any) (map[string]any, bool) {
	entry := map[string]any{"timestamp": time.Now().UnixMilli(), "source": method}
	switch method {
	case "Runtime.consoleAPICalled":
		entry["level"], _ = params["type"].(string)
		args, _ := params["args"].([]any)
		parts := make([]string, 0, len(args))
		for _, raw := range args {
			arg, _ := raw.(map[string]any)
			if value, exists := arg["value"]; exists {
				parts = append(parts, fmt.Sprint(value))
			} else if description, _ := arg["description"].(string); description != "" {
				parts = append(parts, description)
			}
		}
		entry["text"] = strings.Join(parts, " ")
	case "Log.entryAdded":
		raw, _ := params["entry"].(map[string]any)
		entry["level"], _ = raw["level"].(string)
		entry["text"], _ = raw["text"].(string)
	case "Runtime.exceptionThrown":
		entry["level"] = "error"
		details, _ := params["exceptionDetails"].(map[string]any)
		entry["text"] = fmt.Sprint(details["text"])
	default:
		return nil, false
	}
	return entry, true
}

func (state *browserEventState) nextID(prefix string) string {
	return fmt.Sprintf("%s_%d_%d", prefix, time.Now().UnixMilli(), state.sequence.Add(1))
}

func deltaCurrent(value any) string {
	object, _ := value.(map[string]any)
	current, _ := object["current"].(string)
	return current
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	}
	return 0
}

func waitWithContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
