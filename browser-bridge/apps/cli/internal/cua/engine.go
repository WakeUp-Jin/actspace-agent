package cua

import (
	"context"
	"fmt"
	"math"
	"runtime"
	"strings"
	"time"

	"agent-browser-bridge/apps/cli/internal/backend"
	"agent-browser-bridge/apps/cli/internal/cdp"
	"agent-browser-bridge/packages/protocol"
)

type Engine struct {
	Backend backend.BrowserBackend
}

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type ScreenshotResult struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
}

type Clip struct {
	X      float64
	Y      float64
	Width  float64
	Height float64
}

func (engine Engine) Screenshot(ctx context.Context, tabID int) (ScreenshotResult, error) {
	return engine.ScreenshotClip(ctx, tabID, nil)
}

func (engine Engine) ScreenshotClip(ctx context.Context, tabID int, requestedClip *Clip) (ScreenshotResult, error) {
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	value, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		metrics, err := session.Execute(ctx, "Page.getLayoutMetrics", map[string]any{})
		if err != nil {
			return nil, err
		}
		viewport, _ := metrics["cssVisualViewport"].(map[string]any)
		width := int(number(viewport["clientWidth"], 1280))
		height := int(number(viewport["clientHeight"], 720))
		dprValue, err := session.Evaluate(ctx, "window.devicePixelRatio || 1")
		if err != nil {
			return nil, err
		}
		dpr := number(dprValue, 1)
		if dpr <= 0 {
			dpr = 1
		}
		clip := map[string]any{"x": 0, "y": 0, "width": width, "height": height, "scale": 1 / dpr}
		if requestedClip != nil {
			if requestedClip.Width <= 0 || requestedClip.Height <= 0 {
				return nil, fmt.Errorf("screenshot clip dimensions must be positive")
			}
			clip = map[string]any{"x": requestedClip.X, "y": requestedClip.Y, "width": requestedClip.Width, "height": requestedClip.Height, "scale": 1 / dpr}
			width = int(requestedClip.Width)
			height = int(requestedClip.Height)
		}
		capture, err := session.Execute(ctx, "Page.captureScreenshot", map[string]any{"format": "jpeg", "quality": 80, "clip": clip})
		if err != nil {
			return nil, err
		}
		data, _ := capture["data"].(string)
		return ScreenshotResult{MimeType: "image/jpeg", Data: data, Width: width, Height: height}, nil
	})
	if err != nil {
		return ScreenshotResult{}, err
	}
	return value.(ScreenshotResult), nil
}

func (engine Engine) ViewportCenter(ctx context.Context, tabID int) (Point, error) {
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	value, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		metrics, err := session.Execute(ctx, "Page.getLayoutMetrics", map[string]any{})
		if err != nil {
			return nil, err
		}
		viewport, _ := metrics["cssVisualViewport"].(map[string]any)
		return Point{X: number(viewport["clientWidth"], 1280) / 2, Y: number(viewport["clientHeight"], 720) / 2}, nil
	})
	if err != nil {
		return Point{}, err
	}
	return value.(Point), nil
}

func (engine Engine) Click(ctx context.Context, tabID int, point Point, button string, clickCount int, modifiers []string) error {
	if clickCount < 1 {
		clickCount = 1
	}
	if button == "" {
		button = "left"
	}
	before, hasBefore := engine.tabState(ctx, tabID)
	_ = engine.Backend.MoveCursor(ctx, tabID, point.X, point.Y, true)
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	_, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		modifierMask := modifierBits(modifiers)
		buttons := 1
		if button == "right" {
			buttons = 2
		} else if button == "middle" {
			buttons = 4
		}
		for currentClick := 1; currentClick <= clickCount; currentClick++ {
			base := map[string]any{"x": point.X, "y": point.Y, "button": button, "clickCount": currentClick, "modifiers": modifierMask}
			pressed := clone(base)
			pressed["type"] = "mousePressed"
			pressed["buttons"] = buttons
			if _, err := session.Execute(ctx, "Input.dispatchMouseEvent", pressed); err != nil {
				_ = dispatchMouseRelease(ctx, session, base)
				return nil, err
			}
			if err := dispatchMouseRelease(ctx, session, base); err != nil {
				_ = dispatchMouseRelease(ctx, session, base)
				return nil, err
			}
		}
		return map[string]any{}, nil
	})
	if err != nil || !hasBefore {
		return err
	}
	return engine.waitForNavigation(ctx, before)
}

func (engine Engine) Move(ctx context.Context, tabID int, point Point, modifiers []string) error {
	_ = engine.Backend.MoveCursor(ctx, tabID, point.X, point.Y, false)
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	_, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		_, err := session.Execute(ctx, "Input.dispatchMouseEvent", map[string]any{
			"type": "mouseMoved", "x": point.X, "y": point.Y, "button": "none", "buttons": 0, "modifiers": modifierBits(modifiers),
		})
		return map[string]any{}, err
	})
	return err
}

func (engine Engine) Scroll(ctx context.Context, tabID int, point Point, scrollX float64, scrollY float64, modifiers []string) error {
	_ = engine.Backend.MoveCursor(ctx, tabID, point.X, point.Y, false)
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	_, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		_, err := session.Execute(ctx, "Input.synthesizeScrollGesture", map[string]any{
			"x": point.X, "y": point.Y, "xDistance": -scrollX, "yDistance": -scrollY,
			"repeatCount": 1, "modifiers": modifierBits(modifiers),
		})
		return map[string]any{}, err
	})
	return err
}

func (engine Engine) Type(ctx context.Context, tabID int, text string) error {
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	_, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		_, err := session.Execute(ctx, "Input.insertText", map[string]any{"text": text})
		return map[string]any{}, err
	})
	return err
}

func (engine Engine) Keypress(ctx context.Context, tabID int, keys []string) error {
	if len(keys) == 0 {
		return fmt.Errorf("keys must not be empty")
	}
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	_, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		modifiers, primary := splitChord(keys)
		activeModifiers := make([]string, 0, len(modifiers))
		activeMask := 0
		cleanupModifiers := func() {
			for len(activeModifiers) > 0 {
				last := len(activeModifiers) - 1
				modifier := activeModifiers[last]
				remaining := activeModifiers[:last]
				_ = dispatchKey(ctx, session, "keyUp", modifier, modifierBits(remaining), "")
				activeModifiers = remaining
			}
		}
		for _, modifier := range modifiers {
			activeModifiers = append(activeModifiers, modifier)
			activeMask |= modifierBits([]string{modifier})
			if err := dispatchKey(ctx, session, "keyDown", modifier, activeMask, ""); err != nil {
				cleanupModifiers()
				return nil, err
			}
		}
		text := ""
		if len(primary) == 1 && activeMask == 0 {
			text = primary
		}
		if err := dispatchKey(ctx, session, "keyDown", primary, activeMask, text); err != nil {
			_ = dispatchKey(ctx, session, "keyUp", primary, activeMask, "")
			cleanupModifiers()
			return nil, err
		}
		if err := dispatchKey(ctx, session, "keyUp", primary, activeMask, ""); err != nil {
			_ = dispatchKey(ctx, session, "keyUp", primary, activeMask, "")
			cleanupModifiers()
			return nil, err
		}
		for len(activeModifiers) > 0 {
			last := len(activeModifiers) - 1
			modifier := activeModifiers[last]
			remaining := activeModifiers[:last]
			if err := dispatchKey(ctx, session, "keyUp", modifier, modifierBits(remaining), ""); err != nil {
				cleanupModifiers()
				return nil, err
			}
			activeModifiers = remaining
		}
		return map[string]any{}, nil
	})
	return err
}

func (engine Engine) Drag(ctx context.Context, tabID int, path []Point, modifiers []string) error {
	if len(path) < 2 {
		return fmt.Errorf("drag path must contain at least two points")
	}
	_ = engine.Backend.MoveCursor(ctx, tabID, path[0].X, path[0].Y, false)
	session := cdp.Session{Backend: engine.Backend, TabID: tabID}
	_, err := session.Run(ctx, func(ctx context.Context) (any, error) {
		mask := modifierBits(modifiers)
		start := path[0]
		if _, err := session.Execute(ctx, "Input.dispatchMouseEvent", map[string]any{"type": "mousePressed", "x": start.X, "y": start.Y, "button": "left", "buttons": 1, "clickCount": 1, "modifiers": mask}); err != nil {
			return nil, err
		}
		for _, point := range path[1:] {
			_ = engine.Backend.MoveCursor(ctx, tabID, point.X, point.Y, false)
			if _, err := session.Execute(ctx, "Input.dispatchMouseEvent", map[string]any{"type": "mouseMoved", "x": point.X, "y": point.Y, "button": "left", "buttons": 1, "modifiers": mask}); err != nil {
				return nil, err
			}
		}
		end := path[len(path)-1]
		_, err := session.Execute(ctx, "Input.dispatchMouseEvent", map[string]any{"type": "mouseReleased", "x": end.X, "y": end.Y, "button": "left", "buttons": 0, "clickCount": 1, "modifiers": mask})
		return map[string]any{}, err
	})
	return err
}

func dispatchMouseRelease(ctx context.Context, session cdp.Session, base map[string]any) error {
	released := clone(base)
	released["type"] = "mouseReleased"
	released["buttons"] = 0
	_, err := session.Execute(ctx, "Input.dispatchMouseEvent", released)
	return err
}

func dispatchKey(ctx context.Context, session cdp.Session, eventType string, key string, modifiers int, text string) error {
	normalized := normalizeKey(key)
	params := map[string]any{"type": eventType, "key": normalized, "code": keyCode(normalized), "modifiers": modifiers}
	if windows, native, ok := virtualKeyCodes(normalized); ok {
		params["windowsVirtualKeyCode"] = windows
		params["nativeVirtualKeyCode"] = native
	}
	if text != "" {
		params["text"] = text
	}
	if eventType == "keyDown" {
		if normalized == "Enter" && modifiers == 0 {
			params["text"] = "\r"
			params["unmodifiedText"] = "\r"
		} else if isPlatformSelectAllShortcut(normalized, modifiers) {
			params["commands"] = []string{"selectAll"}
		}
	}
	_, err := session.Execute(ctx, "Input.dispatchKeyEvent", params)
	return err
}

func isPlatformSelectAllShortcut(key string, modifiers int) bool {
	if !strings.EqualFold(key, "a") {
		return false
	}
	selectAllModifier := 2 // Control on Windows and Linux.
	if runtime.GOOS == "darwin" {
		selectAllModifier = 4 // Meta on macOS.
	}
	return modifiers == selectAllModifier
}

func splitChord(keys []string) ([]string, string) {
	if len(keys) == 1 {
		return nil, keys[0]
	}
	return keys[:len(keys)-1], keys[len(keys)-1]
}

func modifierBits(keys []string) int {
	mask := 0
	for _, key := range keys {
		switch normalizeKey(key) {
		case "Alt":
			mask |= 1
		case "Control":
			mask |= 2
		case "Meta":
			mask |= 4
		case "Shift":
			mask |= 8
		}
	}
	return mask
}

func normalizeKey(key string) string {
	switch strings.ToLower(key) {
	case "ctrl", "control":
		return "Control"
	case "cmd", "command", "meta":
		return "Meta"
	case "controlormeta":
		if runtime.GOOS == "darwin" {
			return "Meta"
		}
		return "Control"
	case "alt", "option":
		return "Alt"
	case "shift":
		return "Shift"
	case "backspace":
		return "Backspace"
	case "delete", "del":
		return "Delete"
	case "enter", "return":
		return "Enter"
	case "tab":
		return "Tab"
	case "escape", "esc":
		return "Escape"
	case "space", "spacebar", " ":
		return " "
	case "left", "arrowleft":
		return "ArrowLeft"
	case "up", "arrowup":
		return "ArrowUp"
	case "right", "arrowright":
		return "ArrowRight"
	case "down", "arrowdown":
		return "ArrowDown"
	case "home":
		return "Home"
	case "end":
		return "End"
	case "pageup", "page up":
		return "PageUp"
	case "pagedown", "page down":
		return "PageDown"
	case "insert", "ins":
		return "Insert"
	case "capslock", "caps lock":
		return "CapsLock"
	default:
		return key
	}
}

func keyCode(key string) string {
	normalized := normalizeKey(key)
	if normalized == " " {
		return "Space"
	}
	if len(normalized) == 1 {
		upper := strings.ToUpper(normalized)
		if upper[0] >= 'A' && upper[0] <= 'Z' {
			return "Key" + upper
		}
		if upper[0] >= '0' && upper[0] <= '9' {
			return "Digit" + upper
		}
		switch normalized {
		case ";":
			return "Semicolon"
		case "=":
			return "Equal"
		case ",":
			return "Comma"
		case "-":
			return "Minus"
		case ".":
			return "Period"
		case "/":
			return "Slash"
		case "`":
			return "Backquote"
		case "[":
			return "BracketLeft"
		case "\\":
			return "Backslash"
		case "]":
			return "BracketRight"
		case "'":
			return "Quote"
		}
	}
	switch normalized {
	case "Control":
		return "ControlLeft"
	case "Alt":
		return "AltLeft"
	case "Shift":
		return "ShiftLeft"
	case "Meta":
		return "MetaLeft"
	default:
		return normalized
	}
}

func virtualKeyCodes(key string) (windows int, native int, ok bool) {
	normalized := normalizeKey(key)
	windowsCodes := map[string]int{
		"Backspace": 8, "Tab": 9, "Enter": 13, "Shift": 16, "Control": 17, "Alt": 18,
		"Escape": 27, " ": 32, "PageUp": 33, "PageDown": 34, "End": 35, "Home": 36,
		"ArrowLeft": 37, "ArrowUp": 38, "ArrowRight": 39, "ArrowDown": 40, "Insert": 45, "Delete": 46,
		"Meta": 91, "CapsLock": 20,
		";": 186, "=": 187, ",": 188, "-": 189, ".": 190, "/": 191, "`": 192,
		"[": 219, "\\": 220, "]": 221, "'": 222,
	}
	if len(normalized) == 1 {
		upper := strings.ToUpper(normalized)
		if upper[0] >= 'A' && upper[0] <= 'Z' {
			windowsCodes[normalized] = int(upper[0])
			windowsCodes[upper] = int(upper[0])
		} else if upper[0] >= '0' && upper[0] <= '9' {
			windowsCodes[normalized] = int(upper[0])
		}
	}
	for number := 1; number <= 24; number++ {
		windowsCodes[fmt.Sprintf("F%d", number)] = 111 + number
	}
	windows, ok = windowsCodes[normalized]
	if !ok {
		return 0, 0, false
	}
	if runtime.GOOS == "windows" {
		return windows, windows, true
	}
	nativeCodes := map[string]int{}
	if runtime.GOOS == "darwin" {
		nativeCodes = map[string]int{
			"Backspace": 51, "Tab": 48, "Enter": 36, "Shift": 56, "Control": 59, "Alt": 58,
			"Escape": 53, " ": 49, "PageUp": 116, "PageDown": 121, "End": 119, "Home": 115,
			"ArrowLeft": 123, "ArrowUp": 126, "ArrowRight": 124, "ArrowDown": 125, "Insert": 114, "Delete": 117,
			"Meta": 55, "CapsLock": 57,
			"a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11,
			"q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21,
			"6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31,
			"u": 32, "[": 33, "i": 34, "p": 35, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42,
			",": 43, "/": 44, "n": 45, "m": 46, ".": 47, "`": 50,
		}
		for number := 1; number <= 12; number++ {
			macFunctionKeys := map[int]int{1: 122, 2: 120, 3: 99, 4: 118, 5: 96, 6: 97, 7: 98, 8: 100, 9: 101, 10: 109, 11: 103, 12: 111}
			nativeCodes[fmt.Sprintf("F%d", number)] = macFunctionKeys[number]
		}
	} else {
		nativeCodes = map[string]int{
			"Backspace": 22, "Tab": 23, "Enter": 36, "Shift": 50, "Control": 37, "Alt": 64,
			"Escape": 9, " ": 65, "PageUp": 112, "PageDown": 117, "End": 115, "Home": 110,
			"ArrowLeft": 113, "ArrowUp": 111, "ArrowRight": 114, "ArrowDown": 116, "Insert": 118, "Delete": 119,
			"Meta": 133, "CapsLock": 66,
		}
		if len(normalized) == 1 {
			lower := strings.ToLower(normalized)
			if lower[0] >= 'a' && lower[0] <= 'z' {
				// X11 keycodes for the US keyboard's alphabetic rows.
				linuxLetters := map[byte]int{'q': 24, 'w': 25, 'e': 26, 'r': 27, 't': 28, 'y': 29, 'u': 30, 'i': 31, 'o': 32, 'p': 33, 'a': 38, 's': 39, 'd': 40, 'f': 41, 'g': 42, 'h': 43, 'j': 44, 'k': 45, 'l': 46, 'z': 52, 'x': 53, 'c': 54, 'v': 55, 'b': 56, 'n': 57, 'm': 58}
				nativeCodes[normalized] = linuxLetters[lower[0]]
			} else if lower[0] >= '0' && lower[0] <= '9' {
				digits := map[byte]int{'1': 10, '2': 11, '3': 12, '4': 13, '5': 14, '6': 15, '7': 16, '8': 17, '9': 18, '0': 19}
				nativeCodes[normalized] = digits[lower[0]]
			}
		}
	}
	native, ok = nativeCodes[normalized]
	if !ok && len(normalized) == 1 {
		native, ok = nativeCodes[strings.ToLower(normalized)]
	}
	return windows, native, ok
}

func clone(input map[string]any) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func number(value any, fallback float64) float64 {
	switch typed := value.(type) {
	case float64:
		if !math.IsNaN(typed) && !math.IsInf(typed, 0) {
			return typed
		}
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	}
	return fallback
}

func (engine Engine) tabState(ctx context.Context, tabID int) (protocol.TabInfo, bool) {
	tabs, err := engine.Backend.ListTabs(ctx, backend.SessionRef{})
	if err != nil {
		return protocol.TabInfo{}, false
	}
	for _, tab := range tabs {
		if tab.ID == tabID {
			return tab, true
		}
	}
	return protocol.TabInfo{}, false
}

func (engine Engine) waitForNavigation(ctx context.Context, before protocol.TabInfo) error {
	detectDeadline := time.Now().Add(800 * time.Millisecond)
	navigating := false
	for time.Now().Before(detectDeadline) {
		current, ok := engine.tabState(ctx, before.ID)
		if !ok {
			return nil
		}
		if current.URL != before.URL || current.Status == "loading" {
			navigating = true
			break
		}
		if err := waitContext(ctx, 100*time.Millisecond); err != nil {
			return err
		}
	}
	if !navigating {
		return nil
	}
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		current, ok := engine.tabState(ctx, before.ID)
		if !ok || current.Status == "complete" {
			return nil
		}
		if err := waitContext(ctx, 150*time.Millisecond); err != nil {
			return err
		}
	}
	return fmt.Errorf("navigation_timeout: tab %d did not finish loading", before.ID)
}

func waitContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
