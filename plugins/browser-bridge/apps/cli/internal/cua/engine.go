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
		base := map[string]any{"x": point.X, "y": point.Y, "button": button, "clickCount": clickCount, "modifiers": modifierMask}
		pressed := clone(base)
		pressed["type"] = "mousePressed"
		pressed["buttons"] = buttons
		if _, err := session.Execute(ctx, "Input.dispatchMouseEvent", pressed); err != nil {
			return nil, err
		}
		released := clone(base)
		released["type"] = "mouseReleased"
		released["buttons"] = 0
		_, err := session.Execute(ctx, "Input.dispatchMouseEvent", released)
		return map[string]any{}, err
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
		mask := modifierBits(modifiers)
		for _, modifier := range modifiers {
			if err := dispatchKey(ctx, session, "keyDown", modifier, modifierBits([]string{modifier}), ""); err != nil {
				return nil, err
			}
		}
		text := ""
		if len(primary) == 1 && mask == 0 {
			text = primary
		}
		if err := dispatchKey(ctx, session, "keyDown", primary, mask, text); err != nil {
			return nil, err
		}
		if err := dispatchKey(ctx, session, "keyUp", primary, mask, ""); err != nil {
			return nil, err
		}
		for index := len(modifiers) - 1; index >= 0; index-- {
			if err := dispatchKey(ctx, session, "keyUp", modifiers[index], 0, ""); err != nil {
				return nil, err
			}
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

func dispatchKey(ctx context.Context, session cdp.Session, eventType string, key string, modifiers int, text string) error {
	params := map[string]any{"type": eventType, "key": normalizeKey(key), "code": keyCode(key), "modifiers": modifiers}
	if text != "" {
		params["text"] = text
	}
	_, err := session.Execute(ctx, "Input.dispatchKeyEvent", params)
	return err
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
	default:
		return key
	}
}

func keyCode(key string) string {
	normalized := normalizeKey(key)
	if len(normalized) == 1 {
		upper := strings.ToUpper(normalized)
		if upper[0] >= 'A' && upper[0] <= 'Z' {
			return "Key" + upper
		}
		if upper[0] >= '0' && upper[0] <= '9' {
			return "Digit" + upper
		}
	}
	return normalized
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
