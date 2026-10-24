package cua

import (
	"context"
	"fmt"
	"runtime"
	"strings"
	"testing"

	"agent-browser-bridge/apps/cli/internal/backend"
	"agent-browser-bridge/packages/protocol"
)

func newInputTestEngine(t *testing.T, failAt string) (*Engine, *[]map[string]any) {
	t.Helper()
	events := []map[string]any{}
	failed := false
	failType, failKey, hasFailKey := strings.Cut(failAt, ":")
	request := func(_ context.Context, method string, input any) (any, error) {
		switch method {
		case protocol.MethodBackendAttach, protocol.MethodBackendDetach, protocol.MethodBackendCursorMove:
			return map[string]any{}, nil
		case protocol.MethodBackendTabsList:
			return []protocol.TabInfo{}, nil
		case protocol.MethodBackendExecuteCDP:
			params := input.(protocol.CDPParams)
			if params.Method == "Input.dispatchMouseEvent" || params.Method == "Input.dispatchKeyEvent" {
				copy := clone(params.CommandParams)
				copy["method"] = params.Method
				events = append(events, copy)
				matchesFailure := fmt.Sprint(copy["type"]) == failType
				if hasFailKey {
					matchesFailure = matchesFailure && fmt.Sprint(copy["key"]) == failKey
				}
				if !failed && failAt != "" && matchesFailure {
					failed = true
					return nil, fmt.Errorf("injected %s failure", failAt)
				}
			}
			return map[string]any{}, nil
		default:
			return map[string]any{}, nil
		}
	}
	return &Engine{Backend: &backend.ExtensionBackend{Request: request}}, &events
}

func TestClickDoubleClickDispatchesTwoCompleteClickPairs(t *testing.T) {
	engine, events := newInputTestEngine(t, "")
	if err := engine.Click(context.Background(), 7, Point{X: 12, Y: 34}, "left", 2, []string{"Control"}); err != nil {
		t.Fatal(err)
	}
	if len(*events) != 4 {
		t.Fatalf("mouse events = %d, want two press/release pairs: %+v", len(*events), *events)
	}
	wantTypes := []string{"mousePressed", "mouseReleased", "mousePressed", "mouseReleased"}
	wantCounts := []int{1, 1, 2, 2}
	wantButtons := []int{1, 0, 1, 0}
	for index, event := range *events {
		if event["type"] != wantTypes[index] || event["clickCount"] != wantCounts[index] || event["buttons"] != wantButtons[index] {
			t.Errorf("event %d = %+v, want type=%s clickCount=%d buttons=%d", index, event, wantTypes[index], wantCounts[index], wantButtons[index])
		}
		if event["x"] != float64(12) || event["y"] != float64(34) || event["button"] != "left" || event["modifiers"] != 2 {
			t.Errorf("event %d lost target/button/modifier: %+v", index, event)
		}
	}
}

func TestKeypressBackspaceIncludesKeyCodesForDefaultEditing(t *testing.T) {
	engine, events := newInputTestEngine(t, "")
	if err := engine.Keypress(context.Background(), 7, []string{"Backspace"}); err != nil {
		t.Fatal(err)
	}
	if len(*events) != 2 {
		t.Fatalf("key events = %d, want keyDown and keyUp: %+v", len(*events), *events)
	}
	for index, wantType := range []string{"keyDown", "keyUp"} {
		event := (*events)[index]
		if event["type"] != wantType || event["key"] != "Backspace" || event["code"] != "Backspace" {
			t.Errorf("event %d = %+v, want %s Backspace/Backspace", index, event, wantType)
		}
		if event["windowsVirtualKeyCode"] != 8 {
			t.Errorf("event %d windowsVirtualKeyCode = %v, want 8", index, event["windowsVirtualKeyCode"])
		}
		if _, ok := event["nativeVirtualKeyCode"]; !ok {
			t.Errorf("event %d has no nativeVirtualKeyCode: %+v", index, event)
		}
	}
}

func TestKeypressNormalizesCommonEditingAndNavigationKeys(t *testing.T) {
	cases := []struct {
		input   string
		key     string
		code    string
		windows int
	}{
		{input: "backspace", key: "Backspace", code: "Backspace", windows: 8},
		{input: "del", key: "Delete", code: "Delete", windows: 46},
		{input: "left", key: "ArrowLeft", code: "ArrowLeft", windows: 37},
		{input: "home", key: "Home", code: "Home", windows: 36},
		{input: "end", key: "End", code: "End", windows: 35},
	}
	for _, testCase := range cases {
		t.Run(testCase.input, func(t *testing.T) {
			engine, events := newInputTestEngine(t, "")
			if err := engine.Keypress(context.Background(), 7, []string{testCase.input}); err != nil {
				t.Fatal(err)
			}
			if len(*events) != 2 {
				t.Fatalf("key events = %d, want keyDown and keyUp: %+v", len(*events), *events)
			}
			for index, wantType := range []string{"keyDown", "keyUp"} {
				event := (*events)[index]
				if event["type"] != wantType || event["key"] != testCase.key || event["code"] != testCase.code {
					t.Errorf("event %d = %+v, want %s %s/%s", index, event, wantType, testCase.key, testCase.code)
				}
				if event["windowsVirtualKeyCode"] != testCase.windows {
					t.Errorf("event %d windowsVirtualKeyCode = %v, want %d", index, event["windowsVirtualKeyCode"], testCase.windows)
				}
				if _, ok := event["nativeVirtualKeyCode"]; !ok {
					t.Errorf("event %d has no nativeVirtualKeyCode: %+v", index, event)
				}
			}
		})
	}
}

func TestKeypressChordAccumulatesAndReleasesModifiers(t *testing.T) {
	engine, events := newInputTestEngine(t, "")
	if err := engine.Keypress(context.Background(), 7, []string{"Control", "Shift", "z"}); err != nil {
		t.Fatal(err)
	}
	want := []struct {
		typeName  string
		key       string
		modifiers int
	}{{"keyDown", "Control", 2}, {"keyDown", "Shift", 10}, {"keyDown", "z", 10}, {"keyUp", "z", 10}, {"keyUp", "Shift", 2}, {"keyUp", "Control", 0}}
	if len(*events) != len(want) {
		t.Fatalf("key events = %d, want %d: %+v", len(*events), len(want), *events)
	}
	for index, expected := range want {
		event := (*events)[index]
		if event["type"] != expected.typeName || event["key"] != expected.key || event["modifiers"] != expected.modifiers {
			t.Errorf("event %d = %+v, want type=%s key=%s modifiers=%d", index, event, expected.typeName, expected.key, expected.modifiers)
		}
	}
}

func TestKeypressSelectAllUsesChromeCommandForPlatformShortcut(t *testing.T) {
	platformModifier := "Control"
	otherModifier := "Meta"
	if runtime.GOOS == "darwin" {
		platformModifier = "Meta"
		otherModifier = "Control"
	}

	for _, testCase := range []struct {
		name string
		keys []string
	}{
		{name: "platform shortcut", keys: []string{platformModifier, "a"}},
		{name: "ControlOrMeta alias", keys: []string{"ControlOrMeta", "a"}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			engine, events := newInputTestEngine(t, "")
			if err := engine.Keypress(context.Background(), 7, testCase.keys); err != nil {
				t.Fatal(err)
			}
			var primaryDown map[string]any
			for _, event := range *events {
				if event["type"] == "keyDown" && event["key"] == "a" {
					primaryDown = event
					break
				}
			}
			if primaryDown == nil {
				t.Fatalf("primary A keyDown was not dispatched: %+v", *events)
			}
			commands, ok := primaryDown["commands"].([]string)
			if !ok || len(commands) != 1 || commands[0] != "selectAll" {
				t.Errorf("primary A keyDown commands = %v, want [selectAll]", primaryDown["commands"])
			}
		})
	}

	t.Run("other modifier does not select all", func(t *testing.T) {
		engine, events := newInputTestEngine(t, "")
		if err := engine.Keypress(context.Background(), 7, []string{otherModifier, "a"}); err != nil {
			t.Fatal(err)
		}
		for _, event := range *events {
			if event["type"] == "keyDown" && event["key"] == "a" {
				if _, ok := event["commands"]; ok {
					t.Errorf("non-platform shortcut unexpectedly has command: %+v", event)
				}
				return
			}
		}
		t.Fatalf("primary A keyDown was not dispatched: %+v", *events)
	})
}

func TestKeypressEnterIncludesTextMetadataOnlyOnKeyDown(t *testing.T) {
	engine, events := newInputTestEngine(t, "")
	if err := engine.Keypress(context.Background(), 7, []string{"Enter"}); err != nil {
		t.Fatal(err)
	}
	if len(*events) != 2 {
		t.Fatalf("key events = %d, want keyDown and keyUp: %+v", len(*events), *events)
	}
	keyDown, keyUp := (*events)[0], (*events)[1]
	if keyDown["type"] != "keyDown" || keyDown["text"] != "\r" || keyDown["unmodifiedText"] != "\r" {
		t.Errorf("Enter keyDown = %+v, want CR text and unmodifiedText", keyDown)
	}
	if keyUp["type"] != "keyUp" {
		t.Errorf("second event = %+v, want Enter keyUp", keyUp)
	}
	if _, ok := keyUp["text"]; ok {
		t.Errorf("Enter keyUp unexpectedly has text: %+v", keyUp)
	}
	if _, ok := keyUp["unmodifiedText"]; ok {
		t.Errorf("Enter keyUp unexpectedly has unmodifiedText: %+v", keyUp)
	}
}

func TestClickReleasesPressedButtonWhenFirstReleaseFails(t *testing.T) {
	engine, events := newInputTestEngine(t, "mouseReleased")
	err := engine.Click(context.Background(), 7, Point{X: 5, Y: 6}, "left", 2, nil)
	if err == nil {
		t.Fatal("Click succeeded after the first mouse release failed")
	}
	if len(*events) != 3 {
		t.Fatalf("mouse events = %d, want press, failed release, cleanup release: %+v", len(*events), *events)
	}
	if (*events)[2]["type"] != "mouseReleased" || (*events)[2]["buttons"] != 0 {
		t.Fatalf("cleanup event = %+v, want a released button", (*events)[2])
	}
}

func TestKeypressReleasesModifiersWhenPrimaryDispatchFails(t *testing.T) {
	engine, events := newInputTestEngine(t, "keyDown:x")
	err := engine.Keypress(context.Background(), 7, []string{"Control", "x"})
	if err == nil {
		t.Fatal("Keypress succeeded after keyDown failed")
	}
	want := []struct {
		typeName string
		key      string
	}{{"keyDown", "Control"}, {"keyDown", "x"}, {"keyUp", "x"}, {"keyUp", "Control"}}
	if len(*events) != len(want) {
		t.Fatalf("key events = %d, want modifier cleanup: %+v", len(*events), *events)
	}
	for index, expected := range want {
		event := (*events)[index]
		if event["type"] != expected.typeName || event["key"] != expected.key {
			t.Errorf("event %d = %+v, want type=%s key=%s", index, event, expected.typeName, expected.key)
		}
	}
}
