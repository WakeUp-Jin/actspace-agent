# Agent Browser Bridge CLI

`apps/cli` contains the Go CLI and Native Messaging host for Agent Browser Bridge. The short command name is fixed as `abb`.

## Run Locally

```sh
GOCACHE=/private/tmp/abb-go-cache go run . help
GOCACHE=/private/tmp/abb-go-cache go run . doctor --json
GOCACHE=/private/tmp/abb-go-cache go run . capabilities --json
```

## Install Native Host

For local development, run:

```sh
GOCACHE=/private/tmp/abb-go-cache go run . install-native-host --json
```

By default this writes the Chrome Native Messaging manifest for `com.agent_browser_bridge.host`, builds a stable development binary, and generates a macOS wrapper under the user's Application Support directory. The manifest points to the wrapper, and the wrapper explicitly runs the built binary as `host --stdio`; Chrome does not need a terminal `go` / `PATH` environment to launch the host.

The default allowed extension ID is fixed by the extension manifest public key:

```text
eneeikpgpieikinaimmgmdiafbgbanei
```

`--extension-id` and `ABB_EXTENSION_ID` remain available for explicit custom builds. `doctor --json` reports an error when the installed Native Messaging manifest does not allow the configured extension ID.

Useful overrides:

```sh
GOCACHE=/private/tmp/abb-go-cache go run . install-native-host --binary /absolute/path/to/abb --json
GOCACHE=/private/tmp/abb-go-cache go run . install-native-host --extension-id <chrome-extension-id> --json
ABB_SUPPORT_DIR=/private/tmp/abb-support GOCACHE=/private/tmp/abb-go-cache go run . install-native-host --json
```

## Command Surface

Connection and diagnostics:

- `abb install-native-host`
- `abb host --stdio`
- `abb doctor`
- `abb capabilities`
- `abb backends`
- `abb ping`
- `abb info`

Browser host information:

- `abb tabs`
- `abb user-tabs`
- `abb history`

Tab/session operations:

- `abb open-tab`
- `abb claim-tab`
- `abb navigate`
- `abb wait-load`
- `abb page-info`
- `abb finalize-tabs`

Basic CDP/debugger operations:

- `abb cdp`
- `abb screenshot`

Most commands support `--json`. Run `abb help <command> --json` for the machine-readable command schema.

The public browser-oriented CLI commands above are compatibility adapters. They translate their stable flags and legacy wire shapes into the same Go canonical command engine used by Agent category tools, then call Extension primitives. They do not require `ABB_LEGACY_BROWSER_FORWARDING`, and they do not restore the retired Extension-side click/fill/navigation orchestration.

## Bridge Runtime

When Chrome launches the native host, `abb` runs as a Native Messaging stdio process and opens a local Unix socket. Terminal commands such as `abb tabs --json` connect to that socket and the host forwards requests to the extension.

Default socket path:

```text
~/Library/Application Support/AgentBrowserBridge/agent-browser-bridge.sock
```

Override it with:

```sh
ABB_SOCKET=/private/tmp/custom-abb.sock abb tabs --json
```

Native host launch stderr is appended to:

```text
~/Library/Application Support/AgentBrowserBridge/native-host.log
```

`ABB_SUPPORT_DIR` can relocate the wrapper, built development binary, socket, and log for isolated tests.

If `abb doctor --json` reports `local_rpc_socket: offline` after `install-native-host` succeeds, reload the unpacked extension from `chrome://extensions` and accept any new `history` / `debugger` permission prompt. Chrome only launches the native host after the extension has accepted the current permission set.

## Final Manual Acceptance

After installing the host and loading the unpacked extension:

```sh
GOCACHE=/private/tmp/abb-go-cache go run . doctor --json
GOCACHE=/private/tmp/abb-go-cache go run . ping --json
GOCACHE=/private/tmp/abb-go-cache go run . info --json
GOCACHE=/private/tmp/abb-go-cache go run . tabs --json
GOCACHE=/private/tmp/abb-go-cache go run . user-tabs --json
GOCACHE=/private/tmp/abb-go-cache go run . history --query browser --limit 5 --json
GOCACHE=/private/tmp/abb-go-cache go run . open-tab --url https://example.com --json
GOCACHE=/private/tmp/abb-go-cache go run . navigate --tab-id <tab-id> --url https://example.com/agent-browser-bridge --json
GOCACHE=/private/tmp/abb-go-cache go run . page-info --tab-id <tab-id> --json
GOCACHE=/private/tmp/abb-go-cache go run . cdp --tab-id <tab-id> --method Runtime.evaluate --params '{"expression":"document.title","returnByValue":true}' --json
GOCACHE=/private/tmp/abb-go-cache go run . screenshot --tab-id <tab-id> --output /private/tmp/abb-screenshot.png --json
GOCACHE=/private/tmp/abb-go-cache go run . finalize-tabs --keep '[]' --json
```

The code path is implemented in this module; the commands above still require a loaded Chrome extension and installed Native Messaging host to verify against a real browser profile.
