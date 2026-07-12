package commands

import "testing"

func TestRegistryHasCanonical62Commands(t *testing.T) {
	if got := len(All()); got != 62 {
		t.Fatalf("registry command count = %d, want 62", got)
	}
	wantCategories := map[string]int{
		"cua": 9, "dom": 7, "locator": 21, "navigation": 4, "tabs": 6,
		"user": 3, "wait": 5, "io": 6, "debug": 1,
	}
	for category, want := range wantCategories {
		if got := len(ByCategory(category)); got != want {
			t.Fatalf("category %s count = %d, want %d", category, got, want)
		}
	}
}

func TestCanonicalCommandsAreImplementedByGoHandlers(t *testing.T) {
	for _, item := range All() {
		if item.Status != StatusImplemented {
			t.Fatalf("command %s status = %s, want implemented", item.ID, item.Status)
		}
		if len(item.HandlerKey) < 3 || item.HandlerKey[:3] != "go." {
			t.Fatalf("command %s handler = %q, want Go handler", item.ID, item.HandlerKey)
		}
	}
}

func TestRegistryMetadataIsCompleteAndUnique(t *testing.T) {
	ids := map[string]struct{}{}
	actions := map[string]struct{}{}
	aliases := map[string]struct{}{}
	for _, item := range All() {
		if item.ID == "" || item.Category == "" || item.Action == "" || item.Description == "" {
			t.Fatalf("incomplete identity metadata: %+v", item)
		}
		if _, exists := ids[item.ID]; exists {
			t.Fatalf("duplicate command id %q", item.ID)
		}
		ids[item.ID] = struct{}{}
		key := item.Category + ":" + item.Action
		if _, exists := actions[key]; exists {
			t.Fatalf("duplicate category/action %q", key)
		}
		actions[key] = struct{}{}
		if item.InputSchema.Type != "object" || item.OutputSchema.Type != "object" {
			t.Fatalf("command %s must use object schemas", item.ID)
		}
		if len(item.BackendRequirements) == 0 || len(item.RequiredCapabilities) == 0 || item.RiskLevel == "" || item.Effect == "" || item.OriginPolicy == "" || item.PreviewKind == "" || item.Status == "" || len(item.Examples) == 0 {
			t.Fatalf("command %s is missing required metadata: %+v", item.ID, item)
		}
		if item.Status != StatusNotImplemented && item.HandlerKey == "" {
			t.Fatalf("command %s status %s requires handler key", item.ID, item.Status)
		}
		if item.Status == StatusNotImplemented && item.HandlerKey != "" {
			t.Fatalf("command %s is not implemented but has handler %q", item.ID, item.HandlerKey)
		}
		for _, alias := range item.LegacyAliases {
			if _, isID := ids[alias]; isID {
				t.Fatalf("legacy alias %q conflicts with command id", alias)
			}
			if _, exists := aliases[alias]; exists {
				t.Fatalf("duplicate legacy alias %q", alias)
			}
			aliases[alias] = struct{}{}
		}
	}
	for alias := range aliases {
		for id := range ids {
			if alias == id {
				t.Fatalf("legacy alias %q conflicts with command id", alias)
			}
		}
	}
}

func TestValidateInputRejectsUnknownMissingAndWrongTypes(t *testing.T) {
	command, ok := Find("locator", "fill")
	if !ok {
		t.Fatal("locator fill missing")
	}
	valid := map[string]any{"tab_id": float64(7), "selector": "input", "value": "hello"}
	if err := ValidateInput(command, valid); err != nil {
		t.Fatalf("valid input rejected: %v", err)
	}
	for name, params := range map[string]map[string]any{
		"missing": {"tab_id": float64(7), "selector": "input"},
		"unknown": {"tab_id": float64(7), "selector": "input", "value": "hello", "extra": true},
		"type":    {"tab_id": "7", "selector": "input", "value": "hello"},
	} {
		if err := ValidateInput(command, params); err == nil {
			t.Fatalf("%s input unexpectedly passed", name)
		}
	}
}

func TestDOMSnapshotAndLocatorListSchemasExposeFidelityControls(t *testing.T) {
	snapshot, ok := Find("dom", "snapshot")
	if !ok {
		t.Fatal("dom snapshot missing")
	}
	if snapshot.InputSchema.Properties["limit"].Type != "integer" {
		t.Fatal("dom snapshot must expose an integer limit")
	}
	for _, field := range []string{"total", "returned", "truncated", "nodes"} {
		if _, exists := snapshot.OutputSchema.Properties[field]; !exists {
			t.Fatalf("dom snapshot output missing %s", field)
		}
	}

	for _, action := range []string{"all_text_contents", "read_all"} {
		command, ok := Find("locator", action)
		if !ok {
			t.Fatalf("locator %s missing", action)
		}
		for _, field := range []string{"offset", "limit"} {
			if command.InputSchema.Properties[field].Type != "integer" {
				t.Fatalf("locator %s input missing integer %s", action, field)
			}
		}
		for _, field := range []string{"values", "total", "offset", "returned", "has_more"} {
			if _, exists := command.OutputSchema.Properties[field]; !exists {
				t.Fatalf("locator %s output missing %s", action, field)
			}
		}
	}
}
