package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	commandregistry "agent-browser-bridge/apps/cli/internal/commands"
	"agent-browser-bridge/packages/protocol"
)

func TestHandleClientRequestsKeepsConnectionOpen(t *testing.T) {
	client, server := net.Pipe()
	done := make(chan struct{})
	go func() {
		handleClientRequests(server, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
			return protocol.ResponseEnvelope{
				ProtocolVersion: protocol.ProtocolVersion,
				ID:              request.ID,
				OK:              true,
				Result:          map[string]any{"method": request.Method},
			}
		})
		close(done)
	}()

	for index, method := range []string{protocol.MethodSessionStart, protocol.MethodTabs, protocol.MethodSessionEnd} {
		request := protocol.RequestEnvelope{
			ProtocolVersion: protocol.ProtocolVersion,
			ID:              string(rune('1' + index)),
			Method:          method,
		}
		if err := protocol.WriteJSONFrame(client, request); err != nil {
			t.Fatal(err)
		}
		response, err := protocol.ReadResponseFrame(client)
		if err != nil {
			t.Fatal(err)
		}
		if !response.OK || response.ID != request.ID {
			t.Fatalf("unexpected response: %+v", response)
		}
	}

	_ = client.Close()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("server did not close after client disconnect")
	}
}

func TestHandleClientRequestsBroadcastsEventsWithoutCorruptingResponses(t *testing.T) {
	client, server := net.Pipe()
	events := make(chan protocol.RequestEnvelope, 1)
	done := make(chan struct{})
	go func() {
		handleClientRequestsWithEvents(server, func(request protocol.RequestEnvelope) protocol.ResponseEnvelope {
			return okResponse(request.ID, map[string]any{"method": request.Method})
		}, events)
		close(done)
	}()

	events <- protocol.RequestEnvelope{ProtocolVersion: protocol.ProtocolVersion, Method: protocol.MethodEventCDP, Params: map[string]any{"tabId": 7}}
	event, err := protocol.ReadRequestFrame(client)
	if err != nil {
		t.Fatal(err)
	}
	if event.ID != "" || event.Method != protocol.MethodEventCDP {
		t.Fatalf("unexpected event: %+v", event)
	}

	request := protocol.RequestEnvelope{ProtocolVersion: protocol.ProtocolVersion, ID: "1", Method: protocol.MethodPing}
	if err := protocol.WriteJSONFrame(client, request); err != nil {
		t.Fatal(err)
	}
	response, err := protocol.ReadResponseFrame(client)
	if err != nil {
		t.Fatal(err)
	}
	if !response.OK || response.ID != "1" {
		t.Fatalf("unexpected response: %+v", response)
	}

	_ = client.Close()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("event-aware server did not close")
	}
}

func TestReadExtensionLoopPublishesNotifications(t *testing.T) {
	var input bytes.Buffer
	if err := protocol.WriteJSONFrame(&input, protocol.RequestEnvelope{
		ProtocolVersion: protocol.ProtocolVersion,
		Method:          protocol.MethodEventDownload,
		Params:          map[string]any{"id": 9},
	}); err != nil {
		t.Fatal(err)
	}
	eventBus := NewEventBus()
	events := eventBus.Subscribe("test")
	host := &bridgeHost{stdin: &input, events: eventBus, pending: map[string]chan protocol.ResponseEnvelope{}}

	if err := host.readExtensionLoop(); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-events:
		if event.Method != protocol.MethodEventDownload {
			t.Fatalf("unexpected event: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("extension notification was not published")
	}
}

func TestChromeExtensionManifestKeyMatchesDefaultExtensionID(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "chrome-extension", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatal(err)
	}
	der, err := base64.StdEncoding.DecodeString(manifest.Key)
	if err != nil {
		t.Fatalf("invalid extension manifest key: %v", err)
	}
	digest := sha256.Sum256(der)
	var id strings.Builder
	for _, value := range digest[:16] {
		id.WriteByte('a' + value>>4)
		id.WriteByte('a' + value&0x0f)
	}
	if id.String() != defaultExtensionID {
		t.Fatalf("extension id = %q, defaultExtensionID = %q", id.String(), defaultExtensionID)
	}
}

func TestChromeExtensionDeclaresPrimitiveAndEventMethods(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "chrome-extension", "src", "background.js"))
	if err != nil {
		t.Fatal(err)
	}
	source := string(payload)
	for _, method := range []string{
		protocol.MethodBackendAttach,
		protocol.MethodBackendExecuteCDP,
		protocol.MethodBackendTabsList,
		protocol.MethodBackendHistorySearch,
		protocol.MethodEventCDP,
		protocol.MethodEventDownload,
	} {
		if !strings.Contains(source, method) {
			t.Fatalf("background.js missing %q", method)
		}
	}
}

func TestHelpListsExpandedCommands(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"help"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	output := stdout.String()
	for _, want := range []string{"install-native-host", "tabs", "history", "open-tab", "navigate", "cdp", "screenshot"} {
		if !strings.Contains(output, want) {
			t.Fatalf("help output missing %q:\n%s", want, output)
		}
	}
}

func TestHelpCommandJSON(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"help", "cdp", "--json"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	var schema helpCommandSchema
	if err := json.Unmarshal(stdout.Bytes(), &schema); err != nil {
		t.Fatalf("invalid json: %v\n%s", err, stdout.String())
	}
	if schema.Command.Name != "cdp" {
		t.Fatalf("command name = %q, want cdp", schema.Command.Name)
	}
	if schema.ProtocolVersion != protocol.ProtocolVersion {
		t.Fatalf("protocol version = %q, want %q", schema.ProtocolVersion, protocol.ProtocolVersion)
	}
	if !contains(schema.Command.Options, "--params-file <path>: read CDP command params JSON from a file") {
		t.Fatalf("cdp help missing params-file option: %+v", schema.Command.Options)
	}
}

func TestHelpEvalCommandJSON(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"help", "eval", "--json"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	var schema helpCommandSchema
	if err := json.Unmarshal(stdout.Bytes(), &schema); err != nil {
		t.Fatalf("invalid json: %v\n%s", err, stdout.String())
	}
	if schema.Command.Name != "eval" {
		t.Fatalf("command name = %q, want eval", schema.Command.Name)
	}
	if !contains(schema.Command.Options, "--file <path>: read JavaScript expression from a file") {
		t.Fatalf("eval help missing file option: %+v", schema.Command.Options)
	}
}

func TestCommandsJSONExposesCanonicalRegistry(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"commands", "--json"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	var report commandregistry.RegistryReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("invalid json: %v\n%s", err, stdout.String())
	}
	if report.Count != 62 || len(report.Commands) != 62 {
		t.Fatalf("registry count = %d commands = %d, want 62", report.Count, len(report.Commands))
	}
	if len(report.Categories) != 9 {
		t.Fatalf("category count = %d, want 9: %+v", len(report.Categories), report.Categories)
	}
}

func TestCommandsCategoryFilter(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"commands", "--category", "locator", "--json"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	var report commandregistry.RegistryReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.Count != 21 {
		t.Fatalf("locator count = %d, want 21", report.Count)
	}
	for _, item := range report.Commands {
		if item.Category != "locator" {
			t.Fatalf("unexpected category %q in locator filter", item.Category)
		}
	}
}

func TestHelpBrowserActionJSON(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"help", "locator", "click", "--json"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	var schema helpBrowserCommandSchema
	if err := json.Unmarshal(stdout.Bytes(), &schema); err != nil {
		t.Fatalf("invalid json: %v\n%s", err, stdout.String())
	}
	if schema.Command.ID != "playwright_locator_click" {
		t.Fatalf("command id = %q, want playwright_locator_click", schema.Command.ID)
	}
	if schema.Command.InputSchema.Type != "object" || schema.Command.RiskLevel != commandregistry.RiskMedium {
		t.Fatalf("unexpected action metadata: %+v", schema.Command)
	}
}

func TestCDPParamsFileValidation(t *testing.T) {
	dir := t.TempDir()
	paramsPath := filepath.Join(dir, "params.json")
	if err := os.WriteFile(paramsPath, []byte(`{"expression":"document.title","returnByValue":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"cdp", "--socket", filepath.Join(dir, "missing.sock"), "--tab-id", "1", "--method", "Runtime.evaluate", "--params-file", paramsPath, "--json"}, &stdout, &stderr)

	if exitCode == 0 {
		t.Fatalf("cdp unexpectedly succeeded with missing socket: %s", stdout.String())
	}
	if strings.Contains(stderr.String(), "invalid --params-file json") {
		t.Fatalf("params-file should have parsed before socket failure:\n%s", stderr.String())
	}
	if !strings.Contains(stderr.String(), protocol.ErrorSocketUnavailable) {
		t.Fatalf("stderr missing socket error:\n%s", stderr.String())
	}
}

func TestEvalFileValidation(t *testing.T) {
	dir := t.TempDir()
	expressionPath := filepath.Join(dir, "eval.js")
	if err := os.WriteFile(expressionPath, []byte("document.title"), 0644); err != nil {
		t.Fatal(err)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"eval", "--socket", filepath.Join(dir, "missing.sock"), "--tab-id", "1", "--file", expressionPath, "--json"}, &stdout, &stderr)

	if exitCode == 0 {
		t.Fatalf("eval unexpectedly succeeded with missing socket: %s", stdout.String())
	}
	if !strings.Contains(stderr.String(), protocol.ErrorSocketUnavailable) {
		t.Fatalf("stderr missing socket error:\n%s", stderr.String())
	}
}

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func TestCapabilitiesJSONIncludesFullBridgeCapabilities(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"capabilities", "--json"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	var report capabilitiesReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("invalid json: %v\n%s", err, stdout.String())
	}
	for _, want := range []string{"native_host_install", "browser_host_info", "tab_session_actions", "cdp_debugger"} {
		found := false
		for _, capability := range report.Capabilities {
			if capability.Name == want {
				found = true
			}
		}
		if !found {
			t.Fatalf("missing capability %q: %+v", want, report.Capabilities)
		}
	}
}

func TestInstallNativeHostWritesManifest(t *testing.T) {
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "host.json")
	binaryPath := filepath.Join(dir, "abb")
	if err := os.WriteFile(binaryPath, []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatal(err)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"install-native-host", "--manifest-path", manifestPath, "--binary", binaryPath, "--extension-id", "abcdefghijklmnopabcdefghijklmnop", "--json"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	manifest, err := readNativeHostManifest(manifestPath)
	if err != nil {
		t.Fatalf("failed to read manifest: %v", err)
	}
	if manifest.Name != nativeHostName {
		t.Fatalf("manifest name = %q, want %q", manifest.Name, nativeHostName)
	}
	if manifest.Path != binaryPath {
		t.Fatalf("manifest path = %q, want %q", manifest.Path, binaryPath)
	}
	if len(manifest.AllowedOrigins) != 1 || manifest.AllowedOrigins[0] != "chrome-extension://abcdefghijklmnopabcdefghijklmnop/" {
		t.Fatalf("unexpected origins: %+v", manifest.AllowedOrigins)
	}
}

func TestInstallNativeHostUsesStableDefaultExtensionID(t *testing.T) {
	t.Setenv("ABB_EXTENSION_ID", "")
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "host.json")
	binaryPath := filepath.Join(dir, "abb")
	if err := os.WriteFile(binaryPath, []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatal(err)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"install-native-host", "--manifest-path", manifestPath, "--binary", binaryPath, "--json"}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	manifest, err := readNativeHostManifest(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	want := extensionOrigin(defaultExtensionID)
	if len(manifest.AllowedOrigins) != 1 || manifest.AllowedOrigins[0] != want {
		t.Fatalf("allowed origins = %+v, want %q", manifest.AllowedOrigins, want)
	}
}

func TestAssessNativeHostManifestReportsExtensionOriginMismatch(t *testing.T) {
	t.Setenv("ABB_EXTENSION_ID", "")
	binaryPath := filepath.Join(t.TempDir(), "abb")
	if err := os.WriteFile(binaryPath, []byte("#!/bin/sh\n"), 0755); err != nil {
		t.Fatal(err)
	}
	manifest := protocol.NativeHostManifest{
		Path:           binaryPath,
		AllowedOrigins: []string{"chrome-extension://oldextensionid/"},
	}

	check := assessNativeHostManifest("/tmp/native-host.json", manifest)

	if check.Status != "error" {
		t.Fatalf("status = %q, want error", check.Status)
	}
	if !strings.Contains(check.Detail, extensionOrigin(defaultExtensionID)) {
		t.Fatalf("detail missing expected origin: %s", check.Detail)
	}
}

func TestEnsureDevHostWrapperUsesBuiltBinary(t *testing.T) {
	t.Setenv("ABB_SUPPORT_DIR", t.TempDir())

	wrapperPath, err := ensureDevHostWrapper()
	if err != nil {
		t.Fatalf("ensureDevHostWrapper failed: %v", err)
	}
	payload, err := os.ReadFile(wrapperPath)
	if err != nil {
		t.Fatalf("failed to read wrapper: %v", err)
	}
	script := string(payload)
	if strings.Contains(script, "go run") {
		t.Fatalf("wrapper should not depend on go run:\n%s", script)
	}
	if !strings.Contains(script, "abb-native-host-bin") {
		t.Fatalf("wrapper should execute the built native host binary:\n%s", script)
	}
	if !strings.Contains(script, "host --stdio") {
		t.Fatalf("wrapper should explicitly enter host stdio mode:\n%s", script)
	}
	if !strings.Contains(script, "native-host.log") {
		t.Fatalf("wrapper should append stderr to a stable native-host log:\n%s", script)
	}
}

func TestReplaceBuiltBinaryAtomicallyPreservesOldBinaryOnFailure(t *testing.T) {
	dir := t.TempDir()
	destination := filepath.Join(dir, "abb-native-host-bin")
	if err := os.WriteFile(destination, []byte("old"), 0755); err != nil {
		t.Fatal(err)
	}

	err := replaceBuiltBinaryAtomically(destination, func(tempPath string) error {
		if err := os.WriteFile(tempPath, []byte("incomplete"), 0755); err != nil {
			return err
		}
		return errors.New("build failed")
	})
	if err == nil || !strings.Contains(err.Error(), "build failed") {
		t.Fatalf("error = %v, want build failure", err)
	}
	payload, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != "old" {
		t.Fatalf("destination changed after failed build: %q", payload)
	}
}

func TestReplaceBuiltBinaryAtomicallySwapsCompletedBinary(t *testing.T) {
	dir := t.TempDir()
	destination := filepath.Join(dir, "abb-native-host-bin")
	if err := os.WriteFile(destination, []byte("old"), 0755); err != nil {
		t.Fatal(err)
	}

	if err := replaceBuiltBinaryAtomically(destination, func(tempPath string) error {
		return os.WriteFile(tempPath, []byte("new"), 0600)
	}); err != nil {
		t.Fatal(err)
	}
	payload, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != "new" {
		t.Fatalf("destination = %q, want new binary", payload)
	}
	info, err := os.Stat(destination)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0100 == 0 {
		t.Fatalf("replacement is not executable: %v", info.Mode())
	}
	temps, err := filepath.Glob(filepath.Join(dir, ".abb-native-host-bin.tmp-*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(temps) != 0 {
		t.Fatalf("temporary binaries were not cleaned up: %v", temps)
	}
}

func TestTabsWithoutSocketReturnsUnavailableInsteadOfStub(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	socketPath := filepath.Join(t.TempDir(), "missing.sock")

	exitCode := run([]string{"tabs", "--socket", socketPath, "--json"}, &stdout, &stderr)

	if exitCode == 0 {
		t.Fatalf("tabs unexpectedly succeeded with stdout: %s", stdout.String())
	}
	if !strings.Contains(stderr.String(), protocol.ErrorSocketUnavailable) {
		t.Fatalf("stderr missing socket error:\n%s", stderr.String())
	}
	if strings.Contains(stdout.String(), "https://example.com/agent-browser-bridge") {
		t.Fatalf("tabs returned old stub data:\n%s", stdout.String())
	}
}

func TestDefaultSocketPathUsesStableSupportDir(t *testing.T) {
	t.Setenv("ABB_SOCKET", "")

	socketPath := defaultSocketPath()

	if filepath.Base(socketPath) != "agent-browser-bridge.sock" {
		t.Fatalf("unexpected socket filename: %s", socketPath)
	}
	if !strings.Contains(socketPath, "AgentBrowserBridge") {
		t.Fatalf("socket path should use stable support dir, got %s", socketPath)
	}
}

func TestCommandValidation(t *testing.T) {
	tests := [][]string{
		{"open-tab", "--url", "file:///tmp/nope"},
		{"navigate", "--tab-id", "0", "--url", "https://example.com"},
		{"cdp", "--tab-id", "1"},
		{"finalize-tabs", "--keep", "not-json"},
	}
	for _, args := range tests {
		var stdout bytes.Buffer
		var stderr bytes.Buffer
		if exitCode := run(args, &stdout, &stderr); exitCode == 0 {
			t.Fatalf("%v unexpectedly succeeded", args)
		}
	}
}

func TestHostAcceptsGlobalSocketOption(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	socketPath := filepath.Join(t.TempDir(), "manual.sock")

	exitCode := run([]string{"host", "--socket", socketPath}, &stdout, &stderr)

	if exitCode != 0 {
		t.Fatalf("run returned %d, stderr: %s", exitCode, stderr.String())
	}
	if !strings.Contains(stdout.String(), "Native Messaging stdio host") {
		t.Fatalf("unexpected stdout:\n%s", stdout.String())
	}
}

func TestUnknownCommandReturnsUsageError(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	exitCode := run([]string{"missing"}, &stdout, &stderr)

	if exitCode != 2 {
		t.Fatalf("run returned %d, want 2", exitCode)
	}
	if !strings.Contains(stderr.String(), "unknown command") {
		t.Fatalf("stderr missing unknown command message:\n%s", stderr.String())
	}
}
