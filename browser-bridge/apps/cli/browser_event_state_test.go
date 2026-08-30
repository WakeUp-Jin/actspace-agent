package main

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestBrowserEventStateBindsArmedFileChooser(t *testing.T) {
	state := newBrowserEventState()
	record := state.armFileChooser(7)
	state.ingest("agent_browser_bridge.event.cdp", map[string]any{
		"tabId":  7,
		"method": "Page.fileChooserOpened",
		"params": map[string]any{"backendNodeId": 99, "mode": "selectMultiple"},
	})
	resolved, err := state.waitFileChooser(context.Background(), record.ID, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.BackendNodeID != 99 || resolved.Mode != "selectMultiple" {
		t.Fatalf("unexpected chooser: %+v", resolved)
	}
}

func TestBrowserEventStateTracksDownloadToCompletedPath(t *testing.T) {
	state := newBrowserEventState()
	record := state.armDownload(7)
	state.ingest("agent_browser_bridge.event.download", map[string]any{
		"kind": "created",
		"item": map[string]any{"id": 12, "url": "https://example.test/report.pdf", "filename": "/tmp/report.crdownload", "state": "in_progress"},
	})
	state.ingest("agent_browser_bridge.event.download", map[string]any{
		"kind": "changed",
		"delta": map[string]any{
			"id":       12,
			"filename": map[string]any{"current": "/tmp/report.pdf"},
			"state":    map[string]any{"current": "complete"},
		},
	})
	resolved, err := state.waitDownload(context.Background(), record.ID, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Filename != "/tmp/report.pdf" || resolved.ChromeID != 12 {
		t.Fatalf("unexpected download: %+v", resolved)
	}
}

func TestBrowserEventStateKeepsBoundedFilteredLogs(t *testing.T) {
	state := newBrowserEventState()
	for index := 0; index < maxDevLogsPerTab+25; index++ {
		state.ingest("agent_browser_bridge.event.cdp", map[string]any{
			"tabId":  7,
			"method": "Runtime.consoleAPICalled",
			"params": map[string]any{
				"type": "log",
				"args": []any{map[string]any{"value": fmt.Sprintf("entry-%d", index)}},
			},
		})
	}
	logs := state.readLogs(7, "entry-5", []string{"log"}, 10)
	if len(logs) != 10 {
		t.Fatalf("filtered logs = %d, want 10", len(logs))
	}
	all := state.readLogs(7, "", nil, maxDevLogsPerTab)
	if len(all) != maxDevLogsPerTab {
		t.Fatalf("bounded logs = %d, want %d", len(all), maxDevLogsPerTab)
	}
}

func TestBrowserEventStateResetClearsTurnScopedData(t *testing.T) {
	state := newBrowserEventState()
	chooser := state.armFileChooser(7)
	download := state.armDownload(7)
	state.ingest("agent_browser_bridge.event.cdp", map[string]any{
		"tabId": 7, "method": "Runtime.consoleAPICalled",
		"params": map[string]any{"type": "log", "args": []any{map[string]any{"value": "secret"}}},
	})
	state.reset()
	if len(state.readLogs(7, "", nil, 100)) != 0 {
		t.Fatal("logs survived browser event state reset")
	}
	if _, err := state.waitFileChooser(context.Background(), chooser.ID, time.Millisecond); err == nil {
		t.Fatal("file chooser token survived reset")
	}
	if _, err := state.waitDownload(context.Background(), download.ID, time.Millisecond); err == nil {
		t.Fatal("download token survived reset")
	}
}
