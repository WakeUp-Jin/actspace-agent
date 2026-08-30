# Agent Browser Bridge Protocol

`packages/protocol/` is the shared contract layer for the Browser Bridge mainline. It keeps CLI, native host, and Chrome extension messages aligned without pulling Agent Runtime product rules into the transport layer.

## Current Artifacts

- `go.mod`
- `protocol.go`
- `protocol_test.go`

The package defines:

- protocol version and implementation phase
- RPC request/response envelopes
- Native Messaging frame helpers
- shared method names
- browser payload/result structs
- standard protocol error codes

## Protocol Version

- Current version: `0.1.0`
- Status: `complete-extension-backend`

`0.1.0` now covers the complete extension-backend command surface planned for the current milestone. It is still intentionally thin: it does not define Agent Runtime orchestration, model-visible summaries, approval UX, or a public SDK.

## Base Envelope

Requests use this JSON shape:

```json
{
  "protocolVersion": "0.1.0",
  "id": "req_123",
  "method": "agent_browser_bridge.tabs",
  "params": {}
}
```

Successful responses use this JSON shape:

```json
{
  "protocolVersion": "0.1.0",
  "id": "req_123",
  "ok": true,
  "result": {}
}
```

Failed responses use this JSON shape:

```json
{
  "protocolVersion": "0.1.0",
  "id": "req_123",
  "ok": false,
  "error": {
    "code": "extension_unavailable",
    "message": "Chrome extension is not connected to the native host."
  }
}
```

## Core Methods

Current methods:

- `agent_browser_bridge.ping`
- `agent_browser_bridge.info`
- `agent_browser_bridge.native.connect`
- `agent_browser_bridge.tabs`
- `agent_browser_bridge.user_tabs`
- `agent_browser_bridge.history`
- `agent_browser_bridge.open_tab`
- `agent_browser_bridge.claim_tab`
- `agent_browser_bridge.navigate`
- `agent_browser_bridge.wait_load`
- `agent_browser_bridge.page_info`
- `agent_browser_bridge.finalize_tabs`
- `agent_browser_bridge.cdp`
- `agent_browser_bridge.screenshot`

## Capability Ownership

- Browser host surface is extension-owned: tabs, user tabs, history, claiming tabs, opening tabs, navigation, page info, and session cleanup.
- Page execution is CDP/debugger-owned: `Runtime.evaluate`, `Page.navigate`, and `Page.captureScreenshot` route through extension-side `chrome.debugger`.
- CLI remains the user-facing entry point and sends requests through the local host/socket boundary.

## Error Codes

Standard codes currently include:

- `invalid_message`
- `invalid_params`
- `unsupported_message`
- `unsupported_method`
- `native_host_unavailable`
- `extension_unavailable`
- `socket_unavailable`
- `request_timeout`
- `browser_api_failed`
- `cdp_failed`

Rules:

- `code` should be short, stable, and machine-readable.
- `message` should be human-readable.
- Stack traces and large debug dumps should stay out of protocol-level error bodies.

## Transport

The protocol uses Chrome Native Messaging length-prefixed frames for extension-to-host communication. The CLI talks to the running host over a local Unix socket using the same framed JSON envelopes.

The current milestone implements macOS-oriented local development and verification first. Linux/Windows manifest paths can be added later without changing the envelope or method contract.
