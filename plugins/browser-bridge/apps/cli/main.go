package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	commandregistry "agent-browser-bridge/apps/cli/internal/commands"
	"agent-browser-bridge/packages/protocol"
)

const (
	cliName            = "abb"
	version            = "0.1.0-dev"
	nativeHostName     = "com.agent_browser_bridge.host"
	defaultExtensionID = "eneeikpgpieikinaimmgmdiafbgbanei"
	defaultTimeout     = 15 * time.Second
)

type command struct {
	Name          string   `json:"name"`
	Usage         string   `json:"usage"`
	Summary       string   `json:"summary"`
	Description   string   `json:"description"`
	Arguments     []string `json:"arguments,omitempty"`
	Options       []string `json:"options,omitempty"`
	Backends      []string `json:"backends,omitempty"`
	Prerequisites []string `json:"prerequisites,omitempty"`
	Examples      []string `json:"examples,omitempty"`
}

type helpSchema struct {
	CLI             string    `json:"cli"`
	Version         string    `json:"version"`
	ProtocolVersion string    `json:"protocolVersion"`
	Commands        []command `json:"commands"`
}

type helpCommandSchema struct {
	CLI             string  `json:"cli"`
	Version         string  `json:"version"`
	ProtocolVersion string  `json:"protocolVersion"`
	Command         command `json:"command"`
}

type helpBrowserCommandSchema struct {
	CLI             string                  `json:"cli"`
	Version         string                  `json:"version"`
	ProtocolVersion string                  `json:"protocolVersion"`
	Command         commandregistry.Command `json:"command"`
}

type checkResult struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Detail  string `json:"detail"`
	Backend string `json:"backend,omitempty"`
}

type doctorReport struct {
	CLI             string        `json:"cli"`
	Version         string        `json:"version"`
	ProtocolVersion string        `json:"protocolVersion"`
	Summary         string        `json:"summary"`
	Checks          []checkResult `json:"checks"`
}

type capability struct {
	Name        string   `json:"name"`
	Status      string   `json:"status"`
	Backends    []string `json:"backends,omitempty"`
	Description string   `json:"description"`
	Fallback    string   `json:"fallback,omitempty"`
}

type capabilitiesReport struct {
	CLI             string       `json:"cli"`
	Version         string       `json:"version"`
	ProtocolVersion string       `json:"protocolVersion"`
	Phase           string       `json:"phase"`
	Capabilities    []capability `json:"capabilities"`
	Backends        []backend    `json:"backends"`
}

type backend struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	Description string `json:"description"`
}

type installReport struct {
	HostName      string `json:"hostName"`
	ManifestPath  string `json:"manifestPath"`
	BinaryPath    string `json:"binaryPath"`
	AllowedOrigin string `json:"allowedOrigin"`
	Installed     bool   `json:"installed"`
}

type cliOptions struct {
	JSON       bool
	SocketPath string
}

type hostOptions struct {
	Stdio      bool
	SocketPath string
}

type bridgeHost struct {
	stdin     io.Reader
	stdout    io.Writer
	stderr    io.Writer
	socket    string
	mu        sync.Mutex
	writeMu   sync.Mutex
	extension io.Writer
	pending   map[string]chan protocol.ResponseEnvelope
	events    *EventBus
}

type bridgeConnectionState struct {
	host         *bridgeHost
	mu           sync.Mutex
	sessionID    string
	turnID       string
	attachedTabs map[int]int
	browser      *browserEventState
}

var cliCommands = []command{
	{
		Name:        "help",
		Usage:       "abb help [command] [--json] | abb help <category> <action> [--json]",
		Summary:     "Show self-describing command help.",
		Description: "Lists CLI commands or returns details for a CLI command or one canonical Browser Use category/action.",
		Arguments:   []string{"command: optional CLI command name", "category action: optional canonical Browser Use action"},
		Options:     []string{"--json: print machine-readable help schema"},
		Examples:    []string{"abb help", "abb help tabs", "abb help cdp --json", "abb help locator click --json"},
	},
	{
		Name:        "commands",
		Usage:       "abb commands [--category <name>] [--json]",
		Summary:     "List the canonical Browser Use command registry.",
		Description: "Returns the 62 canonical Browser Use commands with category, action, schemas, risk, backend requirements, preview metadata, implementation status, and legacy aliases.",
		Options:     []string{"--category <name>: filter by one of the 9 categories", "--json: print the complete machine-readable registry"},
		Examples:    []string{"abb commands", "abb commands --category locator", "abb commands --json"},
	},
	{
		Name:        "install-native-host",
		Usage:       "abb install-native-host [--manifest-path <path>] [--binary <path>] [--extension-id <id>] [--json]",
		Summary:     "Install the Chrome Native Messaging host manifest.",
		Description: "Writes the Chrome Native Messaging manifest that allows the Agent Browser Bridge extension to launch abb as its local host.",
		Options: []string{
			"--manifest-path <path>: override the manifest destination",
			"--binary <path>: override the abb executable path",
			"--extension-id <id>: Chrome extension id allowed to connect",
			"--json: print machine-readable install report",
		},
		Backends: []string{"extension"},
		Examples: []string{"abb install-native-host", "abb install-native-host --json"},
	},
	{
		Name:        "host",
		Usage:       "abb host [--stdio] [--socket <path>]",
		Summary:     "Run the Native Messaging host and local RPC broker.",
		Description: "Starts the Native Messaging stdio loop and a local socket that lets abb CLI commands route requests to the connected Chrome extension.",
		Options: []string{
			"--stdio: explicitly run Native Messaging stdio mode",
			"--socket <path>: override local RPC socket path",
		},
		Backends: []string{"extension"},
		Examples: []string{"abb host --stdio", "abb host --stdio --socket /tmp/abb.sock"},
	},
	{
		Name:        "doctor",
		Usage:       "abb doctor [--json]",
		Summary:     "Check local bridge prerequisites.",
		Description: "Reports CLI, native host manifest, local socket, extension backend, and CDP/debugger readiness.",
		Options:     []string{"--json: print machine-readable diagnostic report"},
		Backends:    []string{"extension", "cdp"},
		Examples:    []string{"abb doctor", "abb doctor --json"},
	},
	{
		Name:        "capabilities",
		Usage:       "abb capabilities [--json]",
		Summary:     "Describe bridge capabilities and backend availability.",
		Description: "Prints the current capability surface for agents and humans.",
		Options:     []string{"--json: print machine-readable capability report"},
		Backends:    []string{"extension", "cdp"},
		Examples:    []string{"abb capabilities", "abb capabilities --json"},
	},
	{
		Name:        "backends",
		Usage:       "abb backends [--json]",
		Summary:     "List browser backend status.",
		Description: "Reports the extension backend and CDP/debugger backend status as understood by the local bridge.",
		Options:     []string{"--json: print machine-readable backend report"},
		Backends:    []string{"extension", "cdp"},
		Examples:    []string{"abb backends --json"},
	},
	{
		Name:        "ping",
		Usage:       "abb ping [--json]",
		Summary:     "Ping the connected browser bridge.",
		Description: "Routes a ping through the local host to the extension backend.",
		Options:     []string{"--json: print machine-readable response"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb ping --json"},
	},
	{
		Name:        "info",
		Usage:       "abb info [--json]",
		Summary:     "Show connected bridge information.",
		Description: "Returns host and extension information through the local bridge.",
		Options:     []string{"--json: print machine-readable response"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb info --json"},
	},
	{
		Name:        "tabs",
		Usage:       "abb tabs [--json]",
		Summary:     "List current browser tabs through the extension backend.",
		Description: "Returns real Chrome tabs from the connected extension backend.",
		Options:     []string{"--json: print machine-readable tab output"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb tabs", "abb tabs --json"},
	},
	{
		Name:        "user-tabs",
		Usage:       "abb user-tabs [--json]",
		Summary:     "List user-facing tab summaries.",
		Description: "Returns tabs formatted for agent selection and user handoff workflows.",
		Options:     []string{"--json: print machine-readable tab output"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb user-tabs --json"},
	},
	{
		Name:        "history",
		Usage:       "abb history [--query <text>] [--limit <n>] [--json]",
		Summary:     "Search Chrome history through the extension backend.",
		Description: "Returns browser history entries from the user's Chrome profile.",
		Options:     []string{"--query <text>: history search text", "--limit <n>: maximum results", "--json: print machine-readable history output"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb history --query browser --limit 5 --json"},
	},
	{
		Name:        "open-tab",
		Usage:       "abb open-tab --url <url> [--active] [--json]",
		Summary:     "Open a new Chrome tab.",
		Description: "Creates a real tab through the extension backend and marks it as bridge-owned.",
		Options:     []string{"--url <url>: URL to open", "--active: make the new tab active", "--json: print machine-readable tab output"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb open-tab --url https://example.com --json"},
	},
	{
		Name:        "claim-tab",
		Usage:       "abb claim-tab --tab-id <id> [--json]",
		Summary:     "Claim an existing tab for the bridge session.",
		Description: "Marks an existing browser tab as selected for the current bridge session.",
		Options:     []string{"--tab-id <id>: target tab id", "--json: print machine-readable response"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb claim-tab --tab-id 123 --json"},
	},
	{
		Name:        "navigate",
		Usage:       "abb navigate --tab-id <id> --url <url> [--json]",
		Summary:     "Navigate a Chrome tab.",
		Description: "Navigates a real Chrome tab through the extension backend.",
		Options:     []string{"--tab-id <id>: target tab id", "--url <url>: destination URL", "--json: print machine-readable response"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb navigate --tab-id 123 --url https://example.com --json"},
	},
	{
		Name:        "wait-load",
		Usage:       "abb wait-load --tab-id <id> [--state loading|domcontentloaded|complete] [--timeout-ms <n>] [--json]",
		Summary:     "Wait for a tab loading state.",
		Description: "Waits for a practical loading state using extension observations.",
		Options:     []string{"--tab-id <id>: target tab id", "--state <state>: loading, domcontentloaded, or complete", "--timeout-ms <n>: timeout", "--json: print machine-readable response"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb wait-load --tab-id 123 --state complete --json"},
	},
	{
		Name:        "page-info",
		Usage:       "abb page-info --tab-id <id> [--json]",
		Summary:     "Read page and tab metadata.",
		Description: "Returns title, URL, loading status, active state, and concise page metadata where available.",
		Options:     []string{"--tab-id <id>: target tab id", "--json: print machine-readable response"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb page-info --tab-id 123 --json"},
	},
	{
		Name:        "finalize-tabs",
		Usage:       "abb finalize-tabs --keep <json> [--json]",
		Summary:     "Close or hand off bridge-owned tabs.",
		Description: "Closes bridge-owned tabs unless they are listed in the keep list.",
		Options:     []string{"--keep <json>: keep list such as [] or [{\"tabId\":123,\"status\":\"handoff\"}]", "--json: print machine-readable response"},
		Backends:    []string{"extension"},
		Examples:    []string{"abb finalize-tabs --keep '[]' --json"},
	},
	{
		Name:        "cdp",
		Usage:       "abb cdp --tab-id <id> --method <method> [--params <json>|--params-file <path>] [--json]",
		Summary:     "Run a basic CDP command through chrome.debugger.",
		Description: "Runs supported page execution commands such as Runtime.evaluate, Page.navigate, and Page.captureScreenshot through the extension debugger backend.",
		Options:     []string{"--tab-id <id>: target tab id", "--method <method>: CDP method", "--params <json>: CDP command params", "--params-file <path>: read CDP command params JSON from a file", "--json: print machine-readable response"},
		Backends:    []string{"extension", "cdp"},
		Examples:    []string{"abb cdp --tab-id 123 --method Runtime.evaluate --params '{\"expression\":\"document.title\",\"returnByValue\":true}' --json", "abb cdp --tab-id 123 --method Runtime.evaluate --params-file /private/tmp/abb-params.json --json"},
	},
	{
		Name:        "eval",
		Usage:       "abb eval --tab-id <id> (--expression <js>|--file <path>) [--await-promise] [--json]",
		Summary:     "Evaluate JavaScript in a tab.",
		Description: "Thin Runtime.evaluate wrapper for page inspection and automation without hand-writing CDP JSON.",
		Options:     []string{"--tab-id <id>: target tab id", "--expression <js>: JavaScript expression to evaluate", "--file <path>: read JavaScript expression from a file", "--await-promise: wait for a returned promise", "--json: print machine-readable response"},
		Backends:    []string{"extension", "cdp"},
		Examples:    []string{"abb eval --tab-id 123 --expression 'document.title' --json", "abb eval --tab-id 123 --file /private/tmp/abb-eval.js --json"},
	},
	{
		Name:        "screenshot",
		Usage:       "abb screenshot --tab-id <id> [--output <path>] [--json]",
		Summary:     "Capture a tab screenshot through CDP/debugger.",
		Description: "Captures a screenshot from the target tab using Page.captureScreenshot.",
		Options:     []string{"--tab-id <id>: target tab id", "--output <path>: write image file", "--json: print machine-readable response"},
		Backends:    []string{"extension", "cdp"},
		Examples:    []string{"abb screenshot --tab-id 123 --output /private/tmp/abb-screenshot.png --json"},
	},
}

func main() {
	if isNativeMessagingLaunch(os.Args[1:]) {
		if err := runBrokerHost(os.Stdin, os.Stdout, os.Stderr, defaultSocketPath()); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) == 0 {
		printHelp(stdout)
		return 0
	}

	var err error
	switch args[0] {
	case "help", "--help", "-h":
		err = handleHelp(args[1:], stdout)
	case "commands":
		err = handleCommands(args[1:], stdout)
	case "install-native-host":
		err = handleInstallNativeHost(args[1:], stdout)
	case "host":
		err = handleHost(args[1:], stdout, stderr)
	case "doctor":
		err = handleDoctor(args[1:], stdout)
	case "capabilities":
		err = handleCapabilities(args[1:], stdout)
	case "backends":
		err = handleBackends(args[1:], stdout)
	case "ping":
		err = handleSimpleRequest(args[1:], stdout, protocol.MethodPing, "pong")
	case "info":
		err = handleSimpleRequest(args[1:], stdout, protocol.MethodInfo, "info")
	case "tabs":
		err = handleTabList(args[1:], stdout, protocol.MethodTabs)
	case "user-tabs":
		err = handleTabList(args[1:], stdout, protocol.MethodUserTabs)
	case "history":
		err = handleHistory(args[1:], stdout)
	case "open-tab":
		err = handleOpenTab(args[1:], stdout)
	case "claim-tab":
		err = handleTabTarget(args[1:], stdout, protocol.MethodClaimTab, "claim-tab")
	case "navigate":
		err = handleNavigate(args[1:], stdout)
	case "wait-load":
		err = handleWaitLoad(args[1:], stdout)
	case "page-info":
		err = handleTabTarget(args[1:], stdout, protocol.MethodPageInfo, "page-info")
	case "finalize-tabs":
		err = handleFinalizeTabs(args[1:], stdout)
	case "cdp":
		err = handleCDP(args[1:], stdout)
	case "eval":
		err = handleEval(args[1:], stdout)
	case "screenshot":
		err = handleScreenshot(args[1:], stdout)
	case "serve":
		return cmdServe(args[1:], stdout, stderr)
	default:
		fmt.Fprintf(stderr, "unknown command %q\n\n", args[0])
		printHelp(stderr)
		return 2
	}
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	return 0
}

func isNativeMessagingLaunch(args []string) bool {
	for _, arg := range args {
		if strings.HasPrefix(arg, "chrome-extension://") {
			return true
		}
	}
	return false
}

func handleHelp(args []string, stdout io.Writer) error {
	jsonOut, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	if len(rest) > 2 {
		return errors.New("usage: abb help [command] [--json] | abb help <category> <action> [--json]")
	}
	if len(rest) == 0 {
		if jsonOut.JSON {
			return writeJSON(stdout, helpSchema{
				CLI:             cliName,
				Version:         version,
				ProtocolVersion: protocol.ProtocolVersion,
				Commands:        cliCommands,
			})
		}
		printHelp(stdout)
		return nil
	}
	if len(rest) == 2 {
		browserCommand, ok := commandregistry.Find(rest[0], rest[1])
		if !ok {
			return fmt.Errorf("unknown Browser Use action %q in category %q", rest[1], rest[0])
		}
		if jsonOut.JSON {
			return writeJSON(stdout, helpBrowserCommandSchema{
				CLI:             cliName,
				Version:         version,
				ProtocolVersion: protocol.ProtocolVersion,
				Command:         browserCommand,
			})
		}
		return printBrowserCommandHelp(stdout, browserCommand)
	}
	cmd, ok := findCommand(rest[0])
	if !ok {
		return fmt.Errorf("unknown command %q", rest[0])
	}
	if jsonOut.JSON {
		return writeJSON(stdout, helpCommandSchema{
			CLI:             cliName,
			Version:         version,
			ProtocolVersion: protocol.ProtocolVersion,
			Command:         cmd,
		})
	}
	printCommandHelp(stdout, cmd)
	return nil
}

func handleCommands(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	category := ""
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--category":
			i++
			if i >= len(rest) {
				return errors.New("--category requires a value")
			}
			category = rest[i]
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if category != "" && len(commandregistry.ByCategory(category)) == 0 {
		return fmt.Errorf("unknown Browser Use category %q", category)
	}
	report := commandregistry.Report(category)
	if opts.JSON {
		return writeJSON(stdout, report)
	}
	fmt.Fprintf(stdout, "Browser Use canonical commands (%d)\n\n", report.Count)
	currentCategory := ""
	for _, item := range report.Commands {
		if item.Category != currentCategory {
			currentCategory = item.Category
			fmt.Fprintf(stdout, "%s:\n", currentCategory)
		}
		fmt.Fprintf(stdout, "  %-24s %-18s %s\n", item.Action, item.Status, item.ID)
	}
	fmt.Fprintf(stdout, "\nRun %q for an exact schema.\n", "abb help <category> <action> --json")
	return nil
}

func handleInstallNativeHost(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	manifestPath := defaultChromeManifestPath()
	binaryPath := ""
	extensionID := configuredExtensionID()
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--manifest-path":
			i++
			if i >= len(rest) {
				return errors.New("--manifest-path requires a value")
			}
			manifestPath = rest[i]
		case "--binary":
			i++
			if i >= len(rest) {
				return errors.New("--binary requires a value")
			}
			binaryPath = rest[i]
		case "--extension-id":
			i++
			if i >= len(rest) {
				return errors.New("--extension-id requires a value")
			}
			extensionID = rest[i]
		case "--chrome":
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if binaryPath == "" {
		binaryPath, err = ensureDevHostWrapper()
		if err != nil {
			return err
		}
	}
	allowedOrigin := extensionOrigin(extensionID)
	report, err := installNativeHostManifest(manifestPath, binaryPath, allowedOrigin)
	if err != nil {
		return err
	}
	if opts.JSON {
		return writeJSON(stdout, report)
	}
	fmt.Fprintf(stdout, "Installed %s native host manifest:\n", nativeHostName)
	fmt.Fprintf(stdout, "  manifest: %s\n", report.ManifestPath)
	fmt.Fprintf(stdout, "  binary:   %s\n", report.BinaryPath)
	fmt.Fprintf(stdout, "  origin:   %s\n", report.AllowedOrigin)
	return nil
}

func handleHost(args []string, stdout io.Writer, stderr io.Writer) error {
	globalOpts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	opts := hostOptions{SocketPath: globalOpts.SocketPath}
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--stdio", "stdio":
			opts.Stdio = true
		case "--socket":
			i++
			if i >= len(rest) {
				return errors.New("--socket requires a value")
			}
			opts.SocketPath = rest[i]
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if !opts.Stdio {
		fmt.Fprintln(stdout, "abb host runs as a Chrome Native Messaging stdio host.")
		fmt.Fprintln(stdout, "Use `abb host --stdio` for manual host startup, or install the native host manifest for Chrome.")
		return nil
	}
	fmt.Fprintf(stderr, "starting abb host stdio loop with local socket %s\n", opts.SocketPath)
	return runBrokerHost(os.Stdin, os.Stdout, os.Stderr, opts.SocketPath)
}

func handleDoctor(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	if len(rest) > 0 {
		return errors.New("usage: abb doctor [--json]")
	}
	report := currentDoctorReport()
	if opts.JSON {
		return writeJSON(stdout, report)
	}
	fmt.Fprintf(stdout, "%s doctor\n\n", cliName)
	fmt.Fprintln(stdout, report.Summary)
	fmt.Fprintln(stdout)
	for _, check := range report.Checks {
		backendLabel := ""
		if check.Backend != "" {
			backendLabel = " [" + check.Backend + "]"
		}
		fmt.Fprintf(stdout, "- %s%s: %s\n  %s\n", check.Name, backendLabel, check.Status, check.Detail)
	}
	return nil
}

func handleCapabilities(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	if len(rest) > 0 {
		return errors.New("usage: abb capabilities [--json]")
	}
	report := currentCapabilitiesReport()
	if opts.JSON {
		return writeJSON(stdout, report)
	}
	fmt.Fprintf(stdout, "%s capabilities (%s)\n\n", cliName, report.Phase)
	printBackends(stdout, report.Backends)
	fmt.Fprintln(stdout)
	fmt.Fprintln(stdout, "Capabilities:")
	for _, capability := range report.Capabilities {
		fmt.Fprintf(stdout, "- %s: %s\n  %s\n", capability.Name, capability.Status, capability.Description)
		if capability.Fallback != "" {
			fmt.Fprintf(stdout, "  fallback: %s\n", capability.Fallback)
		}
	}
	return nil
}

func handleBackends(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	if len(rest) > 0 {
		return errors.New("usage: abb backends [--json]")
	}
	backends := currentCapabilitiesReport().Backends
	if opts.JSON {
		return writeJSON(stdout, backends)
	}
	printBackends(stdout, backends)
	return nil
}

func handleSimpleRequest(args []string, stdout io.Writer, method string, label string) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	if len(rest) > 0 {
		return fmt.Errorf("usage: abb %s [--json]", label)
	}
	response, err := sendCLIRequest(opts.SocketPath, method, nil)
	if err != nil {
		return err
	}
	if opts.JSON {
		return writeJSON(stdout, response)
	}
	return printResponse(stdout, response)
}

func handleTabList(args []string, stdout io.Writer, method string) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	if len(rest) > 0 {
		return errors.New("usage: abb tabs [--json]")
	}
	response, err := sendCLIRequest(opts.SocketPath, method, nil)
	if err != nil {
		return err
	}
	if opts.JSON {
		return writeJSON(stdout, response.Result)
	}
	tabs, err := decodeResult[[]protocol.TabInfo](response.Result)
	if err != nil {
		return err
	}
	if len(tabs) == 0 {
		fmt.Fprintln(stdout, "No tabs available.")
		return nil
	}
	for _, tab := range tabs {
		active := ""
		if tab.Active {
			active = " (active)"
		}
		claimed := ""
		if tab.Claimed {
			claimed = " [claimed]"
		}
		fmt.Fprintf(stdout, "- [%d] %s%s%s\n  %s\n", tab.ID, tab.Title, active, claimed, tab.URL)
	}
	return nil
}

func handleHistory(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	params := protocol.HistoryQueryParams{Limit: 20}
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--query":
			i++
			if i >= len(rest) {
				return errors.New("--query requires a value")
			}
			params.Query = rest[i]
		case "--limit":
			i++
			if i >= len(rest) {
				return errors.New("--limit requires a value")
			}
			params.Limit, err = strconv.Atoi(rest[i])
			if err != nil || params.Limit < 1 {
				return errors.New("--limit must be a positive integer")
			}
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	response, err := sendCLIRequest(opts.SocketPath, protocol.MethodHistory, params)
	if err != nil {
		return err
	}
	if opts.JSON {
		return writeJSON(stdout, response.Result)
	}
	entries, err := decodeResult[[]protocol.HistoryEntry](response.Result)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		fmt.Fprintf(stdout, "- %s\n  %s\n", entry.Title, entry.URL)
	}
	return nil
}

func handleOpenTab(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	params := protocol.OpenTabParams{}
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--url":
			i++
			if i >= len(rest) {
				return errors.New("--url requires a value")
			}
			params.URL = rest[i]
		case "--active":
			params.Active = true
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if err := validateURL(params.URL); err != nil {
		return err
	}
	return handleRequestWithResult(stdout, opts, protocol.MethodOpenTab, params)
}

func handleTabTarget(args []string, stdout io.Writer, method string, label string) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	tabID, err := parseTabID(rest)
	if err != nil {
		return err
	}
	if label == "page-info" {
		response, err := sendCLIRequest(opts.SocketPath, method, protocol.TabTargetParams{TabID: tabID})
		if err != nil {
			return err
		}
		if opts.JSON {
			return writeJSON(stdout, response.Result)
		}
		info, err := decodeResult[protocol.PageInfo](response.Result)
		if err != nil {
			return err
		}
		fmt.Fprintf(stdout, "[%d] %s\n%s\nstatus: %s\n", info.TabID, info.Title, info.URL, info.Status)
		return nil
	}
	return handleRequestWithResult(stdout, opts, method, protocol.TabTargetParams{TabID: tabID})
}

func handleNavigate(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	params := protocol.NavigateParams{}
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--tab-id":
			i++
			if i >= len(rest) {
				return errors.New("--tab-id requires a value")
			}
			params.TabID, err = strconv.Atoi(rest[i])
			if err != nil || params.TabID < 1 {
				return errors.New("--tab-id must be a positive integer")
			}
		case "--url":
			i++
			if i >= len(rest) {
				return errors.New("--url requires a value")
			}
			params.URL = rest[i]
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if params.TabID < 1 {
		return errors.New("--tab-id is required")
	}
	if err := validateURL(params.URL); err != nil {
		return err
	}
	return handleRequestWithResult(stdout, opts, protocol.MethodNavigate, params)
}

func handleWaitLoad(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	params := protocol.WaitLoadParams{State: "complete", TimeoutMS: 15000}
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--tab-id":
			i++
			if i >= len(rest) {
				return errors.New("--tab-id requires a value")
			}
			params.TabID, err = strconv.Atoi(rest[i])
			if err != nil || params.TabID < 1 {
				return errors.New("--tab-id must be a positive integer")
			}
		case "--state":
			i++
			if i >= len(rest) {
				return errors.New("--state requires a value")
			}
			params.State = rest[i]
		case "--timeout-ms":
			i++
			if i >= len(rest) {
				return errors.New("--timeout-ms requires a value")
			}
			params.TimeoutMS, err = strconv.Atoi(rest[i])
			if err != nil || params.TimeoutMS < 1 {
				return errors.New("--timeout-ms must be a positive integer")
			}
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if params.TabID < 1 {
		return errors.New("--tab-id is required")
	}
	switch params.State {
	case "loading", "domcontentloaded", "complete":
	default:
		return errors.New("--state must be loading, domcontentloaded, or complete")
	}
	return handleRequestWithResult(stdout, opts, protocol.MethodWaitLoad, params)
}

func handleFinalizeTabs(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	keepRaw := ""
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--keep":
			i++
			if i >= len(rest) {
				return errors.New("--keep requires a value")
			}
			keepRaw = rest[i]
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if keepRaw == "" {
		return errors.New("--keep is required")
	}
	var keep []protocol.FinalizeTabKeep
	if err := json.Unmarshal([]byte(keepRaw), &keep); err != nil {
		return fmt.Errorf("invalid --keep json: %w", err)
	}
	return handleRequestWithResult(stdout, opts, protocol.MethodFinalizeTabs, protocol.FinalizeTabsParams{Keep: keep})
}

func handleCDP(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	params := protocol.CDPParams{}
	params.CommandParams = map[string]any{}
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--tab-id":
			i++
			if i >= len(rest) {
				return errors.New("--tab-id requires a value")
			}
			params.TabID, err = strconv.Atoi(rest[i])
			if err != nil || params.TabID < 1 {
				return errors.New("--tab-id must be a positive integer")
			}
		case "--method":
			i++
			if i >= len(rest) {
				return errors.New("--method requires a value")
			}
			params.Method = rest[i]
		case "--params":
			i++
			if i >= len(rest) {
				return errors.New("--params requires a value")
			}
			if err := decodeCDPParams([]byte(rest[i]), &params.CommandParams, "--params"); err != nil {
				return err
			}
		case "--params-file":
			i++
			if i >= len(rest) {
				return errors.New("--params-file requires a value")
			}
			payload, err := os.ReadFile(rest[i])
			if err != nil {
				return fmt.Errorf("failed to read --params-file: %w", err)
			}
			if err := decodeCDPParams(payload, &params.CommandParams, "--params-file"); err != nil {
				return err
			}
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if params.TabID < 1 {
		return errors.New("--tab-id is required")
	}
	if params.Method == "" {
		return errors.New("--method is required")
	}
	return handleRequestWithResult(stdout, opts, protocol.MethodCDP, params)
}

func decodeCDPParams(payload []byte, target *map[string]any, sourceLabel string) error {
	if err := json.Unmarshal(payload, target); err != nil {
		return fmt.Errorf("invalid %s json: %w", sourceLabel, err)
	}
	return nil
}

func handleEval(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	params := protocol.CDPParams{
		Method:        "Runtime.evaluate",
		CommandParams: map[string]any{"returnByValue": true},
	}
	var expression string
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--tab-id":
			i++
			if i >= len(rest) {
				return errors.New("--tab-id requires a value")
			}
			params.TabID, err = strconv.Atoi(rest[i])
			if err != nil || params.TabID < 1 {
				return errors.New("--tab-id must be a positive integer")
			}
		case "--expression":
			i++
			if i >= len(rest) {
				return errors.New("--expression requires a value")
			}
			expression = rest[i]
		case "--file":
			i++
			if i >= len(rest) {
				return errors.New("--file requires a value")
			}
			payload, err := os.ReadFile(rest[i])
			if err != nil {
				return fmt.Errorf("failed to read --file: %w", err)
			}
			expression = string(payload)
		case "--await-promise":
			params.CommandParams["awaitPromise"] = true
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if params.TabID < 1 {
		return errors.New("--tab-id is required")
	}
	if strings.TrimSpace(expression) == "" {
		return errors.New("--expression or --file is required")
	}
	params.CommandParams["expression"] = expression
	return handleRequestWithResult(stdout, opts, protocol.MethodCDP, params)
}

func handleScreenshot(args []string, stdout io.Writer) error {
	opts, rest, err := parseGlobalFlags(args)
	if err != nil {
		return err
	}
	params := protocol.ScreenshotParams{}
	for i := 0; i < len(rest); i++ {
		switch rest[i] {
		case "--tab-id":
			i++
			if i >= len(rest) {
				return errors.New("--tab-id requires a value")
			}
			params.TabID, err = strconv.Atoi(rest[i])
			if err != nil || params.TabID < 1 {
				return errors.New("--tab-id must be a positive integer")
			}
		case "--output":
			i++
			if i >= len(rest) {
				return errors.New("--output requires a value")
			}
			params.Output = rest[i]
		default:
			return fmt.Errorf("unknown option %q", rest[i])
		}
	}
	if params.TabID < 1 {
		return errors.New("--tab-id is required")
	}
	response, err := sendCLIRequest(opts.SocketPath, protocol.MethodScreenshot, params)
	if err != nil {
		return err
	}
	result, err := decodeResult[protocol.ScreenshotResult](response.Result)
	if err != nil {
		return err
	}
	if params.Output != "" && result.Data != "" {
		payload, err := base64.StdEncoding.DecodeString(result.Data)
		if err != nil {
			return err
		}
		if err := os.WriteFile(params.Output, payload, 0644); err != nil {
			return err
		}
		result.Output = params.Output
		result.Bytes = len(payload)
		result.Data = ""
	}
	if opts.JSON {
		return writeJSON(stdout, result)
	}
	if result.Output != "" {
		fmt.Fprintf(stdout, "screenshot written: %s\n", result.Output)
		return nil
	}
	fmt.Fprintf(stdout, "screenshot captured: %d bytes %s\n", result.Bytes, result.MimeType)
	return nil
}

func handleRequestWithResult(stdout io.Writer, opts cliOptions, method string, params any) error {
	response, err := sendCLIRequest(opts.SocketPath, method, params)
	if err != nil {
		return err
	}
	if opts.JSON {
		return writeJSON(stdout, response.Result)
	}
	return printResponse(stdout, response)
}

func parseGlobalFlags(args []string) (cliOptions, []string, error) {
	opts := cliOptions{SocketPath: defaultSocketPath()}
	rest := make([]string, 0, len(args))
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--json":
			opts.JSON = true
		case "--socket":
			i++
			if i >= len(args) {
				return opts, nil, errors.New("--socket requires a value")
			}
			opts.SocketPath = args[i]
		default:
			rest = append(rest, args[i])
		}
	}
	return opts, rest, nil
}

func parseTabID(args []string) (int, error) {
	tabID := 0
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--tab-id":
			i++
			if i >= len(args) {
				return 0, errors.New("--tab-id requires a value")
			}
			value, err := strconv.Atoi(args[i])
			if err != nil || value < 1 {
				return 0, errors.New("--tab-id must be a positive integer")
			}
			tabID = value
		default:
			return 0, fmt.Errorf("unknown option %q", args[i])
		}
	}
	if tabID < 1 {
		return 0, errors.New("--tab-id is required")
	}
	return tabID, nil
}

func validateURL(raw string) error {
	if raw == "" {
		return errors.New("--url is required")
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("--url must use http or https")
	}
	if parsed.Host == "" {
		return errors.New("--url must include a host")
	}
	return nil
}

func printHelp(w io.Writer) {
	fmt.Fprintf(w, "%s - Agent Browser Bridge CLI\n\n", cliName)
	fmt.Fprintln(w, "Usage:")
	fmt.Fprintf(w, "  %s <command> [options]\n\n", cliName)
	fmt.Fprintln(w, "Commands:")
	for _, cmd := range cliCommands {
		fmt.Fprintf(w, "  %-20s %s\n", cmd.Name, cmd.Summary)
	}
	fmt.Fprintln(w)
	fmt.Fprintf(w, "Run \"%s help <command>\" for command details.\n", cliName)
	fmt.Fprintf(w, "Run \"%s help <command> --json\" for machine-readable command help.\n", cliName)
}

func printCommandHelp(w io.Writer, cmd command) {
	fmt.Fprintf(w, "%s\n\n", cmd.Usage)
	fmt.Fprintln(w, cmd.Description)
	printList(w, "Arguments", cmd.Arguments)
	printList(w, "Options", cmd.Options)
	printList(w, "Backends", cmd.Backends)
	printList(w, "Prerequisites", cmd.Prerequisites)
	printList(w, "Examples", cmd.Examples)
}

func printBrowserCommandHelp(w io.Writer, cmd commandregistry.Command) error {
	fmt.Fprintf(w, "%s %s (%s)\n\n", cmd.Category, cmd.Action, cmd.ID)
	fmt.Fprintln(w, cmd.Description)
	fmt.Fprintf(w, "\nRisk: %s\nRead only: %t\nEffect: %s\nOrigin policy: %s\nStatus: %s\n", cmd.RiskLevel, cmd.ReadOnly, cmd.Effect, cmd.OriginPolicy, cmd.Status)
	printList(w, "Backends", cmd.BackendRequirements)
	printList(w, "Capabilities", cmd.RequiredCapabilities)
	printList(w, "Legacy aliases", cmd.LegacyAliases)
	printList(w, "Examples", cmd.Examples)
	fmt.Fprintln(w, "\nInput schema:")
	if err := writeJSON(w, cmd.InputSchema); err != nil {
		return err
	}
	fmt.Fprintln(w, "Output schema:")
	return writeJSON(w, cmd.OutputSchema)
}

func printList(w io.Writer, title string, items []string) {
	if len(items) == 0 {
		return
	}
	fmt.Fprintf(w, "\n%s:\n", title)
	for _, item := range items {
		fmt.Fprintf(w, "  - %s\n", item)
	}
}

func findCommand(name string) (command, bool) {
	for _, cmd := range cliCommands {
		if cmd.Name == name {
			return cmd, true
		}
	}
	return command{}, false
}

func printBackends(w io.Writer, backends []backend) {
	fmt.Fprintln(w, "Backends:")
	for _, backend := range backends {
		fmt.Fprintf(w, "- %s: %s\n  %s\n", backend.Name, backend.Status, backend.Description)
	}
}

func printResponse(w io.Writer, response protocol.ResponseEnvelope) error {
	if !response.OK {
		if response.Error == nil {
			return errors.New("request failed")
		}
		return fmt.Errorf("%s: %s", response.Error.Code, response.Error.Message)
	}
	payload, err := json.MarshalIndent(response.Result, "", "  ")
	if err != nil {
		return err
	}
	fmt.Fprintln(w, string(payload))
	return nil
}

func currentDoctorReport() doctorReport {
	manifestPath := defaultChromeManifestPath()
	socketPath := defaultSocketPath()
	checks := []checkResult{
		{
			Name:   "cli_entrypoint",
			Status: "ok",
			Detail: "The abb command can start and render self-describing help.",
		},
	}
	if manifest, err := readNativeHostManifest(manifestPath); err == nil {
		checks = append(checks, assessNativeHostManifest(manifestPath, manifest))
	} else {
		checks = append(checks, checkResult{Name: "native_messaging_host", Status: "missing", Backend: "extension", Detail: "Run abb install-native-host after building or selecting the abb binary."})
	}
	if err := probeSocket(socketPath); err == nil {
		checks = append(checks, checkResult{Name: "local_rpc_socket", Status: "ok", Backend: "extension", Detail: fmt.Sprintf("Local bridge socket is accepting requests at %s.", socketPath)})
	} else {
		checks = append(checks, checkResult{Name: "local_rpc_socket", Status: "offline", Backend: "extension", Detail: fmt.Sprintf("Local bridge socket is not reachable at %s. It becomes available after Chrome launches the native host; reload the unpacked extension from chrome://extensions and accept any new history/debugger permission prompt.", socketPath)})
	}
	checks = append(checks,
		checkResult{Name: "extension_backend", Status: "available_when_connected", Backend: "extension", Detail: "The extension backend supports tabs, history, tab operations, and basic chrome.debugger CDP routing once connected."},
		checkResult{Name: "cdp_debugger", Status: "available_when_connected", Backend: "cdp", Detail: "Basic Runtime.evaluate, Page.navigate, and Page.captureScreenshot calls are routed through chrome.debugger in the extension backend."},
	)
	return doctorReport{
		CLI:             cliName,
		Version:         version,
		ProtocolVersion: protocol.ProtocolVersion,
		Summary:         "CLI, native host manifest, local RPC, extension backend, and basic CDP/debugger routing are defined; live availability depends on the installed host and loaded Chrome extension.",
		Checks:          checks,
	}
}

func currentCapabilitiesReport() capabilitiesReport {
	return capabilitiesReport{
		CLI:             cliName,
		Version:         version,
		ProtocolVersion: protocol.ProtocolVersion,
		Phase:           protocol.Phase,
		Backends: []backend{
			{
				Name:        "extension",
				Status:      "implemented_requires_connection",
				Description: "Chrome extension plus Native Messaging host path into the user's real Chrome profile.",
			},
			{
				Name:        "cdp",
				Status:      "basic_via_extension_debugger",
				Description: "Basic CDP commands are available through chrome.debugger once a tab is targeted.",
			},
		},
		Capabilities: []capability{
			{Name: "self_describing_help", Status: "available", Description: "Human-readable and JSON help surfaces are available through abb help."},
			{Name: "canonical_command_registry", Status: "available", Description: "The Go command engine exposes exactly 62 canonical Browser Use commands across 9 categories."},
			{Name: "command_protocol", Status: "available", Description: "command.list, command.describe, command.preflight, command.execute, and approval-gated command.run are handled locally by Go."},
			{Name: "extension_primitive_backend", Status: "implemented_requires_connection", Backends: []string{"extension"}, Description: "The extension exposes attach/detach/execute_cdp plus tabs, history, session, and cursor primitives."},
			{Name: "browser_event_forwarding", Status: "implemented_requires_connection", Backends: []string{"extension"}, Description: "CDP, debugger detach, download, and tab close notifications are broadcast to connected socket clients."},
			{Name: "native_host_install", Status: "available", Backends: []string{"extension"}, Description: "abb install-native-host can write the Chrome Native Messaging host manifest."},
			{Name: "local_rpc_socket", Status: "available_when_host_running", Backends: []string{"extension"}, Description: "CLI commands route through a local socket exposed by the Native Messaging host."},
			{Name: "browser_host_info", Status: "implemented_requires_connection", Backends: []string{"extension"}, Description: "ping, info, tabs, user-tabs, and history route through the extension backend."},
			{Name: "tab_session_actions", Status: "implemented_requires_connection", Backends: []string{"extension"}, Description: "open-tab, claim-tab, navigate, wait-load, page-info, and finalize-tabs route through chrome.tabs."},
			{Name: "cdp_debugger", Status: "basic_via_extension_debugger", Backends: []string{"extension", "cdp"}, Description: "Runtime.evaluate, Page.navigate, and Page.captureScreenshot route through chrome.debugger."},
			{Name: "protocol_contract", Status: "available", Description: "Core method names, payload shapes, error codes, and frame helpers are defined in packages/protocol."},
		},
	}
}

func writeJSON(w io.Writer, value any) error {
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func defaultSocketPath() string {
	if value := os.Getenv("ABB_SOCKET"); value != "" {
		return value
	}
	return filepath.Join(defaultSupportDir(), "agent-browser-bridge.sock")
}

func defaultChromeManifestPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), nativeHostName+".json")
	}
	return filepath.Join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", nativeHostName+".json")
}

func defaultSupportDir() string {
	if value := os.Getenv("ABB_SUPPORT_DIR"); value != "" {
		return value
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "agent-browser-bridge")
	}
	return filepath.Join(home, "Library", "Application Support", "AgentBrowserBridge")
}

func configuredExtensionID() string {
	if value := os.Getenv("ABB_EXTENSION_ID"); value != "" {
		return value
	}
	return defaultExtensionID
}

func extensionOrigin(extensionID string) string {
	return fmt.Sprintf("chrome-extension://%s/", extensionID)
}

func assessNativeHostManifest(manifestPath string, manifest protocol.NativeHostManifest) checkResult {
	expectedOrigin := extensionOrigin(configuredExtensionID())
	if !containsString(manifest.AllowedOrigins, expectedOrigin) {
		return checkResult{
			Name:    "native_messaging_host",
			Status:  "error",
			Backend: "extension",
			Detail: fmt.Sprintf(
				"Native host manifest at %s allows %v, but the loaded extension must use %s. Re-register the native host and reload the extension.",
				manifestPath,
				manifest.AllowedOrigins,
				expectedOrigin,
			),
		}
	}
	if _, err := os.Stat(manifest.Path); err != nil {
		return checkResult{
			Name:    "native_messaging_host",
			Status:  "warning",
			Backend: "extension",
			Detail:  fmt.Sprintf("Native host manifest exists at %s, but binary path is not accessible: %s.", manifestPath, manifest.Path),
		}
	}
	return checkResult{
		Name:    "native_messaging_host",
		Status:  "ok",
		Backend: "extension",
		Detail:  fmt.Sprintf("Native host manifest exists at %s, points to %s, and allows %s.", manifestPath, manifest.Path, expectedOrigin),
	}
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func ensureDevHostWrapper() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	supportDir := defaultSupportDir()
	hostBinPath := filepath.Join(supportDir, "abb-native-host-bin")
	wrapperPath := filepath.Join(supportDir, "abb-native-host")
	logPath := filepath.Join(supportDir, "native-host.log")
	if err := os.MkdirAll(filepath.Dir(wrapperPath), 0755); err != nil {
		return "", err
	}
	if err := replaceBuiltBinaryAtomically(hostBinPath, func(tempPath string) error {
		buildCmd := exec.Command("go", "build", "-o", tempPath, ".")
		buildCmd.Dir = cwd
		buildCmd.Env = append(os.Environ(), "GOCACHE=/private/tmp/abb-go-cache")
		output, err := buildCmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("build native host binary: %w\n%s", err, strings.TrimSpace(string(output)))
		}
		probeCmd := exec.Command(tempPath, "help")
		probeOutput, err := probeCmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("probe native host binary: %w\n%s", err, strings.TrimSpace(string(probeOutput)))
		}
		return nil
	}); err != nil {
		return "", err
	}
	script := fmt.Sprintf("#!/bin/sh\nexec %q host --stdio \"$@\" 2>> %q\n", hostBinPath, logPath)
	if err := os.WriteFile(wrapperPath, []byte(script), 0755); err != nil {
		return "", err
	}
	return wrapperPath, nil
}

func replaceBuiltBinaryAtomically(destination string, build func(tempPath string) error) error {
	temp, err := os.CreateTemp(filepath.Dir(destination), "."+filepath.Base(destination)+".tmp-*")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	if err := temp.Close(); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	defer os.Remove(tempPath)

	if err := build(tempPath); err != nil {
		return err
	}
	if err := os.Chmod(tempPath, 0755); err != nil {
		return err
	}
	if err := os.Rename(tempPath, destination); err != nil {
		return fmt.Errorf("replace native host binary atomically: %w", err)
	}
	return nil
}

func installNativeHostManifest(manifestPath string, binaryPath string, allowedOrigin string) (installReport, error) {
	if err := os.MkdirAll(filepath.Dir(manifestPath), 0755); err != nil {
		return installReport{}, err
	}
	manifest := protocol.NativeHostManifest{
		Name:           nativeHostName,
		Description:    "Agent Browser Bridge native host",
		Path:           binaryPath,
		Type:           "stdio",
		AllowedOrigins: []string{allowedOrigin},
	}
	payload, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return installReport{}, err
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(manifestPath, payload, 0644); err != nil {
		return installReport{}, err
	}
	return installReport{HostName: nativeHostName, ManifestPath: manifestPath, BinaryPath: binaryPath, AllowedOrigin: allowedOrigin, Installed: true}, nil
}

func readNativeHostManifest(path string) (protocol.NativeHostManifest, error) {
	var manifest protocol.NativeHostManifest
	payload, err := os.ReadFile(path)
	if err != nil {
		return manifest, err
	}
	err = json.Unmarshal(payload, &manifest)
	return manifest, err
}

func probeSocket(path string) error {
	conn, err := net.DialTimeout("unix", path, 250*time.Millisecond)
	if err != nil {
		return err
	}
	_ = conn.Close()
	return nil
}

func sendCLIRequest(socketPath string, method string, params any) (protocol.ResponseEnvelope, error) {
	conn, err := net.DialTimeout("unix", socketPath, defaultTimeout)
	if err != nil {
		return protocol.ResponseEnvelope{}, fmt.Errorf("%s: bridge socket is unavailable at %s", protocol.ErrorSocketUnavailable, socketPath)
	}
	defer conn.Close()
	if err := conn.SetDeadline(time.Now().Add(defaultTimeout)); err != nil {
		return protocol.ResponseEnvelope{}, err
	}
	request := protocol.RequestEnvelope{
		ProtocolVersion: protocol.ProtocolVersion,
		ID:              fmt.Sprintf("cli_%d", time.Now().UnixNano()),
		Method:          method,
		Params:          params,
	}
	if err := protocol.WriteJSONFrame(conn, request); err != nil {
		return protocol.ResponseEnvelope{}, err
	}
	response, err := protocol.ReadResponseFrame(conn)
	if err != nil {
		return protocol.ResponseEnvelope{}, err
	}
	if !response.OK {
		if response.Error == nil {
			return response, errors.New("request failed without error details")
		}
		return response, fmt.Errorf("%s: %s", response.Error.Code, response.Error.Message)
	}
	return response, nil
}

func runBrokerHost(stdin io.Reader, stdout io.Writer, stderr io.Writer, socketPath string) error {
	host := &bridgeHost{
		stdin:     stdin,
		stdout:    stdout,
		stderr:    stderr,
		socket:    socketPath,
		extension: stdout,
		pending:   map[string]chan protocol.ResponseEnvelope{},
		events:    NewEventBus(),
	}
	errCh := make(chan error, 2)
	go func() {
		errCh <- host.serveSocket()
	}()
	go func() {
		errCh <- host.readExtensionLoop()
	}()
	return <-errCh
}

func (h *bridgeHost) serveSocket() error {
	_ = os.Remove(h.socket)
	if err := os.MkdirAll(filepath.Dir(h.socket), 0755); err != nil {
		return err
	}
	listener, err := net.Listen("unix", h.socket)
	if err != nil {
		return err
	}
	defer listener.Close()
	defer os.Remove(h.socket)
	for {
		conn, err := listener.Accept()
		if err != nil {
			return err
		}
		go h.handleClient(conn)
	}
}

func (h *bridgeHost) handleClient(conn net.Conn) {
	connID := fmt.Sprintf("native_conn_%d", time.Now().UnixNano())
	events := h.events.Subscribe(connID)
	commandEventID := connID + "_command_state"
	commandEvents := h.events.Subscribe(commandEventID)
	defer h.events.Unsubscribe(connID)
	state := &bridgeConnectionState{host: h, sessionID: "cli", turnID: "cli", attachedTabs: map[int]int{}, browser: newBrowserEventState()}
	commandEventsDone := make(chan struct{})
	go func() {
		defer close(commandEventsDone)
		for event := range commandEvents {
			state.browser.ingest(event.Method, event.Params)
		}
	}()
	defer func() {
		h.events.Unsubscribe(commandEventID)
		<-commandEventsDone
		state.cleanup()
	}()
	handleClientRequestsWithEvents(conn, state.dispatch, events)
}

func (state *bridgeConnectionState) dispatch(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
	switch request.Method {
	case protocol.MethodSessionStart:
		var params protocol.SessionStartParams
		if err := protocol.DecodeParams(request.Params, &params); err != nil {
			return errorResponse(request.ID, protocol.ErrorInvalidParams, err.Error())
		}
		state.mu.Lock()
		state.sessionID = params.SessionID
		state.turnID = params.TurnID
		state.mu.Unlock()
	case protocol.MethodSessionEnd:
		state.cleanup()
	}
	return dispatchBridgeRequestWithState(request, state.forward, state.browser)
}

func (state *bridgeConnectionState) forward(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
	state.mu.Lock()
	sessionID := state.sessionID
	turnID := state.turnID
	state.mu.Unlock()
	request = withBackendSession(request, sessionID, turnID)
	response := state.host.forwardToExtension(request)
	if !response.OK {
		return response
	}
	var params protocol.TabTargetParams
	switch request.Method {
	case protocol.MethodBackendAttach:
		if protocol.DecodeParams(request.Params, &params) == nil && params.TabID > 0 {
			state.mu.Lock()
			addAttachedTab(state.attachedTabs, params.TabID)
			state.mu.Unlock()
		}
	case protocol.MethodBackendDetach:
		if protocol.DecodeParams(request.Params, &params) == nil && params.TabID > 0 {
			state.mu.Lock()
			removeAttachedTab(state.attachedTabs, params.TabID)
			state.mu.Unlock()
		}
	}
	return response
}

func (state *bridgeConnectionState) cleanup() {
	state.mu.Lock()
	tabIDs := expandedAttachedTabs(state.attachedTabs)
	state.attachedTabs = map[int]int{}
	state.browser.reset()
	state.mu.Unlock()
	for _, tabID := range tabIDs {
		state.forward(protocol.RequestEnvelope{
			ProtocolVersion: protocol.ProtocolVersion,
			ID:              fmt.Sprintf("cleanup_%d_%d", tabID, time.Now().UnixNano()),
			Method:          protocol.MethodBackendDetach,
			Params:          protocol.TabTargetParams{TabID: tabID},
		})
	}
}

func handleClientRequests(
	conn net.Conn,
	forward func(protocol.RequestEnvelope) protocol.ResponseEnvelope,
) {
	defer conn.Close()
	for {
		request, err := protocol.ReadRequestFrame(conn)
		if err != nil {
			if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
				return
			}
			_ = protocol.WriteJSONFrame(conn, errorResponse("", protocol.ErrorInvalidMessage, err.Error()))
			return
		}
		response := forward(request)
		if err := protocol.WriteJSONFrame(conn, response); err != nil {
			return
		}
	}
}

func handleClientRequestsWithEvents(
	conn net.Conn,
	forward func(protocol.RequestEnvelope) protocol.ResponseEnvelope,
	events <-chan protocol.RequestEnvelope,
) {
	defer conn.Close()
	var writeMu sync.Mutex
	done := make(chan struct{})
	defer close(done)
	go func() {
		for {
			select {
			case event, ok := <-events:
				if !ok {
					return
				}
				writeMu.Lock()
				err := protocol.WriteJSONFrame(conn, event)
				writeMu.Unlock()
				if err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()
	for {
		request, err := protocol.ReadRequestFrame(conn)
		if err != nil {
			if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
				return
			}
			writeMu.Lock()
			_ = protocol.WriteJSONFrame(conn, errorResponse("", protocol.ErrorInvalidMessage, err.Error()))
			writeMu.Unlock()
			return
		}
		response := forward(request)
		writeMu.Lock()
		err = protocol.WriteJSONFrame(conn, response)
		writeMu.Unlock()
		if err != nil {
			return
		}
	}
}

func (h *bridgeHost) forwardToExtension(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
	if request.ID == "" {
		request.ID = fmt.Sprintf("host_%d", time.Now().UnixNano())
	}
	request.ProtocolVersion = protocol.ProtocolVersion
	ch := make(chan protocol.ResponseEnvelope, 1)
	h.mu.Lock()
	if h.extension == nil {
		h.mu.Unlock()
		return errorResponse(request.ID, protocol.ErrorExtensionUnavailable, "Chrome extension is not connected to the native host.")
	}
	h.pending[request.ID] = ch
	h.writeMu.Lock()
	if err := protocol.WriteJSONFrame(h.extension, request); err != nil {
		h.writeMu.Unlock()
		delete(h.pending, request.ID)
		h.mu.Unlock()
		return errorResponse(request.ID, protocol.ErrorExtensionUnavailable, err.Error())
	}
	h.writeMu.Unlock()
	h.mu.Unlock()
	select {
	case response := <-ch:
		return response
	case <-time.After(defaultTimeout):
		h.mu.Lock()
		delete(h.pending, request.ID)
		h.mu.Unlock()
		return errorResponse(request.ID, protocol.ErrorRequestTimeout, "Timed out waiting for the Chrome extension response.")
	}
}

func (h *bridgeHost) readExtensionLoop() error {
	for {
		payload, err := protocol.ReadFrame(h.stdin, protocol.DefaultMaxFrame)
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		var message struct {
			ProtocolVersion string               `json:"protocolVersion"`
			ID              string               `json:"id"`
			Method          string               `json:"method"`
			Params          any                  `json:"params"`
			OK              bool                 `json:"ok"`
			Result          any                  `json:"result"`
			Error           *protocol.ErrorShape `json:"error"`
		}
		if err := json.Unmarshal(payload, &message); err != nil {
			continue
		}
		if message.ID == "" && message.Method != "" {
			h.events.Publish(protocol.RequestEnvelope{
				ProtocolVersion: protocol.ProtocolVersion,
				Method:          message.Method,
				Params:          message.Params,
			})
			continue
		}
		response := protocol.ResponseEnvelope{
			ProtocolVersion: message.ProtocolVersion,
			ID:              message.ID,
			OK:              message.OK,
			Result:          message.Result,
			Error:           message.Error,
		}
		if response.ID == "" {
			continue
		}
		h.mu.Lock()
		ch := h.pending[response.ID]
		delete(h.pending, response.ID)
		h.mu.Unlock()
		if ch != nil {
			ch <- response
		}
	}
}

func errorResponse(id string, code string, message string) protocol.ResponseEnvelope {
	return protocol.ResponseEnvelope{
		ProtocolVersion: protocol.ProtocolVersion,
		ID:              id,
		OK:              false,
		Error:           &protocol.ErrorShape{Code: code, Message: message},
	}
}

func decodeResult[T any](result any) (T, error) {
	var target T
	payload, err := json.Marshal(result)
	if err != nil {
		return target, err
	}
	err = json.Unmarshal(payload, &target)
	return target, err
}
