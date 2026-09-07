package commands

import (
	"fmt"
	"sort"
)

const RegistryVersion = "1"

type commandSpec struct {
	id           string
	category     string
	action       string
	description  string
	input        Schema
	output       Schema
	risk         RiskLevel
	readOnly     bool
	effect       string
	originPolicy string
	capabilities []string
	status       ImplementationStatus
	handler      string
	aliases      []string
	examples     []string
}

func command(spec commandSpec) Command {
	effect := spec.effect
	if effect == "" {
		if spec.readOnly {
			effect = "read"
		} else {
			effect = "page_mutation"
		}
	}
	originPolicy := spec.originPolicy
	if originPolicy == "" {
		originPolicy = "target_origin"
	}
	capabilities := spec.capabilities
	if len(capabilities) == 0 {
		capabilities = []string{"cdp"}
	}
	examples := spec.examples
	if len(examples) == 0 {
		examples = []string{fmt.Sprintf("abb help %s %s --json", spec.category, spec.action)}
	}
	return Command{
		ID:                   spec.id,
		Category:             spec.category,
		Action:               spec.action,
		Title:                spec.id,
		Description:          spec.description,
		InputSchema:          spec.input,
		OutputSchema:         spec.output,
		BackendRequirements:  []string{"extension"},
		RequiredCapabilities: capabilities,
		RiskLevel:            spec.risk,
		ReadOnly:             spec.readOnly,
		Effect:               effect,
		OriginPolicy:         originPolicy,
		PreviewKind:          "browser_" + spec.category,
		Status:               spec.status,
		HandlerKey:           spec.handler,
		LegacyAliases:        spec.aliases,
		Examples:             examples,
	}
}

var registry = []Command{
	// CUA: 9
	command(commandSpec{id: "cua_get_visible_screenshot", category: "cua", action: "screenshot", description: "Capture the visible viewport with CSS-pixel coordinate metadata.", input: tabOnlySchema(), output: object([]string{"data"}, map[string]Schema{"data": stringProperty("Base64 image."), "mime_type": stringProperty("Image MIME type."), "width": integerProperty("CSS viewport width."), "height": integerProperty("CSS viewport height.")}), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.cua.screenshot", aliases: []string{"browser_screenshot"}}),
	command(commandSpec{id: "cua_click", category: "cua", action: "click", description: "Click a CSS-pixel coordinate.", input: pointSchema(map[string]Schema{"button": enumProperty("Mouse button.", "left", "middle", "right"), "keys": keys}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.cua.click"}),
	command(commandSpec{id: "cua_double_click", category: "cua", action: "double_click", description: "Double-click a CSS-pixel coordinate.", input: pointSchema(map[string]Schema{"keys": keys}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.cua.double_click"}),
	command(commandSpec{id: "cua_move", category: "cua", action: "move", description: "Move the virtual cursor to a CSS-pixel coordinate.", input: pointSchema(map[string]Schema{"keys": keys}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.cua.move"}),
	command(commandSpec{id: "cua_scroll", category: "cua", action: "scroll", description: "Scroll at a CSS-pixel coordinate.", input: pointSchema(map[string]Schema{"scroll_x": numberProperty("Horizontal scroll delta."), "scroll_y": numberProperty("Vertical scroll delta."), "keys": keys}, "scroll_x", "scroll_y"), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.cua.scroll"}),
	command(commandSpec{id: "cua_type", category: "cua", action: "type", description: "Insert text into the currently focused element.", input: object([]string{"tab_id", "text"}, map[string]Schema{"tab_id": tabID, "text": stringProperty("Text to insert.")}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.cua.type"}),
	command(commandSpec{id: "cua_keypress", category: "cua", action: "keypress", description: "Dispatch a key chord to the focused element.", input: object([]string{"tab_id", "keys"}, map[string]Schema{"tab_id": tabID, "keys": keys}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.cua.keypress"}),
	command(commandSpec{id: "cua_drag", category: "cua", action: "drag", description: "Drag the pointer along a CSS-pixel path.", input: object([]string{"tab_id", "path"}, map[string]Schema{"tab_id": tabID, "path": arrayProperty("Ordered drag path.", object([]string{"x", "y"}, map[string]Schema{"x": numberProperty("CSS x."), "y": numberProperty("CSS y.")})), "keys": keys}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.cua.drag"}),
	command(commandSpec{id: "cua_download_media", category: "cua", action: "download_media", description: "Trigger download for media at a coordinate.", input: pointSchema(nil), output: emptyResult, risk: RiskHigh, effect: "download", status: StatusImplemented, handler: "go.cua.download_media"}),

	// DOM CUA: 7
	command(commandSpec{id: "dom_cua_get_visible_dom", category: "dom", action: "snapshot", description: "Return visible interactive DOM nodes with stable node ids.", input: object([]string{"tab_id"}, map[string]Schema{"tab_id": tabID, "limit": integerProperty("Maximum visible nodes to return; defaults to 500 and is capped at 1000.")}), output: object([]string{"nodes", "total", "returned", "truncated"}, map[string]Schema{"generation": integerProperty("Snapshot generation."), "total": integerProperty("Total visible interactive nodes."), "returned": integerProperty("Returned node count."), "truncated": booleanProperty("Whether the node limit omitted visible nodes."), "nodes": arrayProperty("Visible DOM nodes.", object(nil, map[string]Schema{}))}), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.dom.snapshot"}),
	command(commandSpec{id: "dom_cua_click", category: "dom", action: "click", description: "Click a node from the latest visible DOM snapshot.", input: object([]string{"tab_id", "node_id"}, map[string]Schema{"tab_id": tabID, "node_id": nodeID}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.dom.click"}),
	command(commandSpec{id: "dom_cua_double_click", category: "dom", action: "double_click", description: "Double-click a node from the latest visible DOM snapshot.", input: object([]string{"tab_id", "node_id"}, map[string]Schema{"tab_id": tabID, "node_id": nodeID}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.dom.double_click"}),
	command(commandSpec{id: "dom_cua_scroll", category: "dom", action: "scroll", description: "Scroll a DOM node or the page viewport.", input: object([]string{"tab_id", "scroll_x", "scroll_y"}, map[string]Schema{"tab_id": tabID, "node_id": nodeID, "scroll_x": numberProperty("Horizontal scroll delta."), "scroll_y": numberProperty("Vertical scroll delta.")}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.dom.scroll"}),
	command(commandSpec{id: "dom_cua_type", category: "dom", action: "type", description: "Insert text into the focused DOM element.", input: object([]string{"tab_id", "text"}, map[string]Schema{"tab_id": tabID, "text": stringProperty("Text to insert.")}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.dom.type"}),
	command(commandSpec{id: "dom_cua_keypress", category: "dom", action: "keypress", description: "Dispatch a key chord in DOM CUA mode.", input: object([]string{"tab_id", "keys"}, map[string]Schema{"tab_id": tabID, "keys": keys}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.dom.keypress"}),
	command(commandSpec{id: "dom_cua_download_media", category: "dom", action: "download_media", description: "Trigger download for media represented by a DOM node id.", input: object([]string{"tab_id", "node_id"}, map[string]Schema{"tab_id": tabID, "node_id": nodeID}), output: emptyResult, risk: RiskHigh, effect: "download", status: StatusImplemented, handler: "go.dom.download_media"}),

	// Locator: 21
	command(commandSpec{id: "playwright_locator_click", category: "locator", action: "click", description: "Locate one element and click it after state checks.", input: selectorSchema(map[string]Schema{"button": enumProperty("Mouse button.", "left", "middle", "right"), "modifiers": modifiers, "force": booleanProperty("Skip non-essential actionability checks.")}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.locator.click", aliases: []string{"browser_click"}}),
	command(commandSpec{id: "playwright_locator_dblclick", category: "locator", action: "double_click", description: "Locate one element and double-click it.", input: selectorSchema(map[string]Schema{"modifiers": modifiers}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.locator.double_click"}),
	command(commandSpec{id: "playwright_locator_fill", category: "locator", action: "fill", description: "Fill an input using native setters and input/change events.", input: selectorSchema(map[string]Schema{"value": stringProperty("Value to fill."), "replace": booleanProperty("Replace existing content.")}, "value"), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.locator.fill", aliases: []string{"browser_fill"}}),
	command(commandSpec{id: "playwright_locator_press", category: "locator", action: "press", description: "Focus a located element and dispatch a key chord.", input: selectorSchema(map[string]Schema{"keys": keys}, "keys"), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.locator.press", aliases: []string{"browser_press_key"}}),
	command(commandSpec{id: "playwright_locator_select_option", category: "locator", action: "select_option", description: "Select one or more options in a select element.", input: selectorSchema(map[string]Schema{"selections": arrayProperty("Options selected by value or label.", object(nil, map[string]Schema{"value": stringProperty("Option value."), "label": stringProperty("Option label."), "value_or_label": stringProperty("Value or label fallback.")}))}, "selections"), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.locator.select_option", aliases: []string{"browser_select"}}),
	command(commandSpec{id: "playwright_locator_set_checked", category: "locator", action: "set_checked", description: "Set a checkbox or radio to the requested checked state.", input: selectorSchema(map[string]Schema{"checked": booleanProperty("Requested checked state.")}, "checked"), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.locator.set_checked"}),
	command(commandSpec{id: "playwright_locator_inner_text", category: "locator", action: "inner_text", description: "Read innerText from one located element.", input: selectorSchema(nil), output: valueStringResult, risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.inner_text"}),
	command(commandSpec{id: "playwright_locator_text_content", category: "locator", action: "text_content", description: "Read textContent from one located element.", input: selectorSchema(nil), output: valueStringResult, risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.text_content"}),
	command(commandSpec{id: "playwright_locator_all_text_contents", category: "locator", action: "all_text_contents", description: "Read a paginated slice of textContent from matching elements.", input: selectorSchema(map[string]Schema{"offset": integerProperty("Zero-based result offset; defaults to 0."), "limit": integerProperty("Maximum results to return; defaults to 200 and is capped at 1000.")}), output: paginatedValuesResult(arrayProperty("Text values.", stringProperty("Text content."))), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.all_text_contents"}),
	command(commandSpec{id: "playwright_locator_read_all", category: "locator", action: "read_all", description: "Read a paginated slice of attributes and text from matching elements.", input: selectorSchema(map[string]Schema{"relative_selector": stringProperty("Optional selector evaluated relative to each match."), "offset": integerProperty("Zero-based result offset; defaults to 0."), "limit": integerProperty("Maximum results to return; defaults to 200 and is capped at 1000.")}), output: paginatedValuesResult(arrayProperty("Element records.", object(nil, map[string]Schema{}))), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.read_all"}),
	command(commandSpec{id: "playwright_locator_get_attribute", category: "locator", action: "get_attribute", description: "Read one attribute from a located element.", input: selectorSchema(map[string]Schema{"name": stringProperty("Attribute name.")}, "name"), output: valueStringResult, risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.get_attribute"}),
	command(commandSpec{id: "playwright_locator_is_visible", category: "locator", action: "is_visible", description: "Check whether any matching element is visible.", input: selectorSchema(nil), output: valueBooleanResult, risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.is_visible"}),
	command(commandSpec{id: "playwright_locator_is_enabled", category: "locator", action: "is_enabled", description: "Check whether the strict match is enabled.", input: selectorSchema(nil), output: valueBooleanResult, risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.is_enabled"}),
	command(commandSpec{id: "playwright_locator_count", category: "locator", action: "count", description: "Count matching elements.", input: selectorSchema(nil), output: object([]string{"count"}, map[string]Schema{"count": integerProperty("Match count.")}), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.count"}),
	command(commandSpec{id: "playwright_locator_wait_for", category: "locator", action: "wait_for", description: "Wait for a selector to reach an attached or visibility state.", input: selectorSchema(map[string]Schema{"state": enumProperty("Requested state.", "attached", "detached", "visible", "hidden")}, "state"), output: emptyResult, risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.wait_for"}),
	command(commandSpec{id: "playwright_locator_download_media", category: "locator", action: "download_media", description: "Trigger download for media matched by a selector.", input: selectorSchema(nil), output: emptyResult, risk: RiskHigh, effect: "download", status: StatusImplemented, handler: "go.locator.download_media"}),
	command(commandSpec{id: "playwright_dom_snapshot", category: "locator", action: "dom_snapshot", description: "Read concise page body text.", input: tabOnlySchema(), output: object([]string{"dom_snapshot"}, map[string]Schema{"dom_snapshot": stringProperty("Page text snapshot.")}), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.dom_snapshot", aliases: []string{"browser_dom_snapshot"}}),
	command(commandSpec{id: "playwright_element_info", category: "locator", action: "element_info", description: "Inspect visible elements at a coordinate and propose selectors.", input: pointSchema(map[string]Schema{"include_non_interactable": booleanProperty("Include non-interactable ancestors."), "timeout_ms": timeoutMS}), output: object([]string{"elements"}, map[string]Schema{"elements": arrayProperty("Element information.", object(nil, map[string]Schema{}))}), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.element_info"}),
	command(commandSpec{id: "playwright_element_screenshot", category: "locator", action: "element_screenshot", description: "Capture the element located at a coordinate.", input: pointSchema(nil), output: object([]string{"data"}, map[string]Schema{"data": stringProperty("Base64 image.")}), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.element_screenshot"}),
	command(commandSpec{id: "playwright_screenshot", category: "locator", action: "screenshot", description: "Capture a page screenshot with optional crop coordinates.", input: object([]string{"tab_id"}, map[string]Schema{"tab_id": tabID, "crop_x": numberProperty("Crop x."), "crop_y": numberProperty("Crop y."), "crop_width": numberProperty("Crop width."), "crop_height": numberProperty("Crop height.")}), output: object([]string{"data"}, map[string]Schema{"data": stringProperty("Base64 image.")}), risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.locator.screenshot"}),
	command(commandSpec{id: "playwright_scroll", category: "locator", action: "scroll", description: "Scroll the page or a located element.", input: object([]string{"tab_id", "direction"}, map[string]Schema{"tab_id": tabID, "selector": selector, "target": locatorTarget, "direction": enumProperty("Scroll direction.", "up", "down", "left", "right"), "amount": numberProperty("Scroll amount in CSS pixels.")}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.locator.scroll", aliases: []string{"browser_scroll"}}),

	// Navigation: 4
	command(commandSpec{id: "navigate_tab_url", category: "navigation", action: "goto", description: "Navigate a tab to an HTTP or HTTPS URL and wait for readiness.", input: object([]string{"tab_id", "url"}, map[string]Schema{"tab_id": tabID, "url": stringProperty("Destination URL."), "timeout_ms": timeoutMS}), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.navigation.goto", aliases: []string{"browser_navigate"}}),
	command(commandSpec{id: "navigate_tab_back", category: "navigation", action: "back", description: "Navigate to the previous history entry.", input: tabOnlySchema(), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.navigation.back", aliases: []string{"browser_back"}}),
	command(commandSpec{id: "navigate_tab_forward", category: "navigation", action: "forward", description: "Navigate to the next history entry.", input: tabOnlySchema(), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.navigation.forward"}),
	command(commandSpec{id: "navigate_tab_reload", category: "navigation", action: "reload", description: "Reload a tab and wait for readiness.", input: tabTimeoutSchema(), output: emptyResult, risk: RiskMedium, status: StatusImplemented, handler: "go.navigation.reload"}),

	// Tabs: 6
	command(commandSpec{id: "create_tab", category: "tabs", action: "create", description: "Create a session-owned tab, optionally with a URL.", input: object(nil, map[string]Schema{"url": stringProperty("Optional initial URL."), "active": booleanProperty("Whether the tab becomes active.")}), output: object([]string{"id"}, map[string]Schema{"id": integerProperty("Created tab id.")}), risk: RiskMedium, originPolicy: "requested_origin", capabilities: []string{"tabs"}, status: StatusImplemented, handler: "go.tabs.create", aliases: []string{"browser_open_tab"}}),
	command(commandSpec{id: "close_tab", category: "tabs", action: "close", description: "Close a session-owned tab.", input: tabOnlySchema(), output: emptyResult, risk: RiskMedium, capabilities: []string{"tabs"}, status: StatusImplemented, handler: "go.tabs.close", aliases: []string{"browser_close_tab"}}),
	command(commandSpec{id: "list_tabs", category: "tabs", action: "list", description: "List tabs owned by the current browser session.", input: emptyObject(), output: object([]string{"tabs"}, map[string]Schema{"tabs": arrayProperty("Session tabs.", object(nil, map[string]Schema{}))}), risk: RiskLow, readOnly: true, originPolicy: "session", capabilities: []string{"tabs"}, status: StatusImplemented, handler: "go.tabs.list", aliases: []string{"browser_list_tabs"}}),
	command(commandSpec{id: "selected_tab", category: "tabs", action: "selected", description: "Return the selected tab for the current session.", input: emptyObject(), output: object([]string{"id"}, map[string]Schema{"id": integerProperty("Selected tab id.")}), risk: RiskLow, readOnly: true, originPolicy: "session", capabilities: []string{"tabs"}, status: StatusImplemented, handler: "go.tabs.selected"}),
	command(commandSpec{id: "name_session", category: "tabs", action: "name_session", description: "Set the Chrome tab group title for the session.", input: object([]string{"name"}, map[string]Schema{"name": stringProperty("Session display name.")}), output: emptyResult, risk: RiskMedium, originPolicy: "session", capabilities: []string{"tab_groups"}, status: StatusImplemented, handler: "go.tabs.name_session"}),
	command(commandSpec{id: "finalize_tabs", category: "tabs", action: "finalize", description: "Keep deliverable or handoff tabs and close other session tabs.", input: object([]string{"keep"}, map[string]Schema{"keep": arrayProperty("Tabs to keep.", object([]string{"tab_id", "status"}, map[string]Schema{"tab_id": tabID, "status": enumProperty("Keep status.", "deliverable", "handoff")}))}), output: emptyResult, risk: RiskMedium, effect: "tab_cleanup", originPolicy: "session", capabilities: []string{"tabs", "tab_groups"}, status: StatusImplemented, handler: "go.tabs.finalize", aliases: []string{"browser_finalize"}}),

	// User browser surface: 3
	command(commandSpec{id: "browser_user_open_tabs", category: "user", action: "open_tabs", description: "List tabs from the user's real Chrome profile.", input: emptyObject(), output: object([]string{"tabs"}, map[string]Schema{"tabs": arrayProperty("User tabs.", object(nil, map[string]Schema{}))}), risk: RiskMedium, readOnly: true, effect: "user_data_read", originPolicy: "user_browser", capabilities: []string{"tabs"}, status: StatusImplemented, handler: "go.user.open_tabs", aliases: []string{"browser_user_tabs"}}),
	command(commandSpec{id: "browser_user_claim_tab", category: "user", action: "claim_tab", description: "Claim an existing user tab into the current session.", input: tabOnlySchema(), output: object(nil, map[string]Schema{}), risk: RiskMedium, effect: "tab_claim", originPolicy: "user_browser", capabilities: []string{"tabs", "tab_groups"}, status: StatusImplemented, handler: "go.user.claim_tab", aliases: []string{"browser_claim_tab"}}),
	command(commandSpec{id: "browser_user_history", category: "user", action: "history", description: "Search the user's Chrome history.", input: object(nil, map[string]Schema{"query": stringProperty("Search query."), "limit": integerProperty("Maximum result count."), "from": stringProperty("Optional start time."), "to": stringProperty("Optional end time.")}), output: object([]string{"items"}, map[string]Schema{"items": arrayProperty("History entries.", object(nil, map[string]Schema{}))}), risk: RiskMedium, readOnly: true, effect: "user_data_read", originPolicy: "user_browser", capabilities: []string{"history"}, status: StatusImplemented, handler: "go.user.history"}),

	// Wait: 5
	command(commandSpec{id: "playwright_wait_for_load_state", category: "wait", action: "load_state", description: "Wait for load or DOMContentLoaded state.", input: object([]string{"tab_id", "state"}, map[string]Schema{"tab_id": tabID, "state": enumProperty("Load state.", "load", "domcontentloaded"), "timeout_ms": timeoutMS}), output: emptyResult, risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.wait.load_state"}),
	command(commandSpec{id: "playwright_wait_for_url", category: "wait", action: "url", description: "Wait for the tab URL to match a value.", input: object([]string{"tab_id", "url"}, map[string]Schema{"tab_id": tabID, "url": stringProperty("Expected URL or supported match pattern."), "timeout_ms": timeoutMS}), output: emptyResult, risk: RiskLow, readOnly: true, status: StatusImplemented, handler: "go.wait.url"}),
	command(commandSpec{id: "playwright_wait_for_timeout", category: "wait", action: "timeout", description: "Wait for a bounded duration.", input: object([]string{"tab_id", "timeout_ms"}, map[string]Schema{"tab_id": tabID, "timeout_ms": timeoutMS}), output: emptyResult, risk: RiskLow, readOnly: true, originPolicy: "session", capabilities: []string{"timer"}, status: StatusImplemented, handler: "go.wait.timeout"}),
	command(commandSpec{id: "playwright_wait_for_file_chooser", category: "wait", action: "file_chooser", description: "Arm file chooser observation and return a token for the next chooser event.", input: tabTimeoutSchema(), output: object([]string{"file_chooser_id", "is_multiple"}, map[string]Schema{"file_chooser_id": stringProperty("Chooser token."), "is_multiple": booleanProperty("Whether multiple files are accepted.")}), risk: RiskMedium, readOnly: true, effect: "file_chooser_observe", capabilities: []string{"file_chooser_events"}, status: StatusImplemented, handler: "go.wait.file_chooser"}),
	command(commandSpec{id: "playwright_wait_for_download", category: "wait", action: "download", description: "Arm download observation and return a token for the next download.", input: tabTimeoutSchema(), output: object([]string{"download_id"}, map[string]Schema{"download_id": stringProperty("Download id.")}), risk: RiskMedium, readOnly: true, effect: "download_observe", capabilities: []string{"downloads"}, status: StatusImplemented, handler: "go.wait.download"}),

	// IO: 6
	command(commandSpec{id: "playwright_file_chooser_set_files", category: "io", action: "set_file_chooser_files", description: "Set local files on a captured file chooser.", input: object([]string{"tab_id", "file_chooser_id", "files"}, map[string]Schema{"tab_id": tabID, "file_chooser_id": stringProperty("Chooser token."), "files": arrayProperty("Absolute local file paths.", stringProperty("Absolute path."))}), output: emptyResult, risk: RiskHigh, effect: "file_upload", capabilities: []string{"file_chooser"}, status: StatusImplemented, handler: "go.io.set_file_chooser_files"}),
	command(commandSpec{id: "playwright_download_path", category: "io", action: "download_path", description: "Resolve the local path for a completed download.", input: object([]string{"tab_id", "download_id"}, map[string]Schema{"tab_id": tabID, "download_id": stringProperty("Download id."), "timeout_ms": timeoutMS}), output: object(nil, map[string]Schema{"path": stringProperty("Downloaded path when complete.")}), risk: RiskMedium, readOnly: true, effect: "filesystem_metadata_read", capabilities: []string{"downloads"}, status: StatusImplemented, handler: "go.io.download_path"}),
	command(commandSpec{id: "tab_clipboard_read_text", category: "io", action: "clipboard_read_text", description: "Read text from the page clipboard context.", input: tabOnlySchema(), output: object([]string{"text"}, map[string]Schema{"text": stringProperty("Clipboard text.")}), risk: RiskMedium, readOnly: true, effect: "clipboard_read", capabilities: []string{"clipboard"}, status: StatusImplemented, handler: "go.io.clipboard_read_text"}),
	command(commandSpec{id: "tab_clipboard_write_text", category: "io", action: "clipboard_write_text", description: "Write text to the page clipboard context.", input: object([]string{"tab_id", "text"}, map[string]Schema{"tab_id": tabID, "text": stringProperty("Clipboard text.")}), output: emptyResult, risk: RiskHigh, effect: "clipboard_write", capabilities: []string{"clipboard"}, status: StatusImplemented, handler: "go.io.clipboard_write_text"}),
	command(commandSpec{id: "tab_clipboard_read", category: "io", action: "clipboard_read", description: "Read rich clipboard items.", input: tabOnlySchema(), output: object([]string{"items"}, map[string]Schema{"items": arrayProperty("Clipboard items.", object(nil, map[string]Schema{}))}), risk: RiskMedium, readOnly: true, effect: "clipboard_read", capabilities: []string{"clipboard"}, status: StatusImplemented, handler: "go.io.clipboard_read"}),
	command(commandSpec{id: "tab_clipboard_write", category: "io", action: "clipboard_write", description: "Write rich clipboard items.", input: object([]string{"tab_id", "items"}, map[string]Schema{"tab_id": tabID, "items": arrayProperty("Clipboard items.", object(nil, map[string]Schema{}))}), output: emptyResult, risk: RiskHigh, effect: "clipboard_write", capabilities: []string{"clipboard"}, status: StatusImplemented, handler: "go.io.clipboard_write"}),

	// Debug: 1
	command(commandSpec{id: "tab_dev_logs", category: "debug", action: "logs", description: "Read bounded console and runtime logs for a tab.", input: object([]string{"tab_id"}, map[string]Schema{"tab_id": tabID, "filter": stringProperty("Substring filter."), "levels": arrayProperty("Log levels.", enumProperty("Log level.", "debug", "info", "warn", "error", "log")), "limit": integerProperty("Maximum log entries.")}), output: object([]string{"logs"}, map[string]Schema{"logs": arrayProperty("Log entries.", object(nil, map[string]Schema{}))}), risk: RiskMedium, readOnly: true, effect: "page_log_read", capabilities: []string{"cdp_events"}, status: StatusImplemented, handler: "go.debug.logs"}),
}

func All() []Command {
	result := make([]Command, len(registry))
	copy(result, registry)
	return result
}

func Categories() []string {
	seen := map[string]struct{}{}
	for _, item := range registry {
		seen[item.Category] = struct{}{}
	}
	result := make([]string, 0, len(seen))
	for category := range seen {
		result = append(result, category)
	}
	sort.Strings(result)
	return result
}

func ByCategory(category string) []Command {
	result := make([]Command, 0)
	for _, item := range registry {
		if item.Category == category {
			result = append(result, item)
		}
	}
	return result
}

func Find(category string, action string) (Command, bool) {
	for _, item := range registry {
		if item.Category == category && item.Action == action {
			return item, true
		}
	}
	return Command{}, false
}

func Report(category string) RegistryReport {
	items := All()
	if category != "" {
		items = ByCategory(category)
	}
	return RegistryReport{
		Version:    RegistryVersion,
		Count:      len(items),
		Categories: Categories(),
		Commands:   items,
	}
}
