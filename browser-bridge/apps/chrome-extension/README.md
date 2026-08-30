# ActSpace Browser Chrome Extension

This directory contains the Manifest V3 Chrome extension backend for ActSpace Browser. The extension connects to the Go Native Messaging host and executes browser-host operations against the user's real Chrome profile.

## Brand assets

- Chrome display name: `ActSpace Browser`
- Default automation tab group: `ActSpace`
- Selected toolbar icon: `assets/logo-variants/01-pointer-relay.svg`
- Chrome PNG icons: `assets/icons/`
- Six-direction offline review page: `assets/logo-showcase.html`

The visible CUA cursor is a versioned injected runtime. It starts at the viewport center on first use, remembers its last page position, animates to the next target, and resolves before the Go CUA engine dispatches the corresponding CDP input event.

## Local Load

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this directory: `apps/chrome-extension`.
5. Open the extension service worker console from the extension details page to inspect logs.
6. From `apps/cli`, run `GOCACHE=/private/tmp/abb-go-cache go run . install-native-host --json`.
7. Reload the extension so it reconnects to the installed native host.

The manifest contains a fixed public `key`, so loading this directory from different absolute paths produces the same extension ID:

```text
eneeikpgpieikinaimmgmdiafbgbanei
```

The Native Messaging host allowlist must contain that exact ID. `go test ./...` in `apps/cli` verifies that the manifest key and Go default ID do not drift apart.

## Permissions

The extension requests:

- `nativeMessaging`: launch and communicate with `com.agent_browser_bridge.host`.
- `tabs`: list, create, update, and remove Chrome tabs.
- `history`: read Chrome history for `abb history`.
- `debugger`: run basic CDP commands for `abb cdp` and `abb screenshot`.
- `<all_urls>` host permissions: allow tab metadata and debugger operations across user-selected pages.

The `debugger` permission is intentionally explicit because CDP commands can inspect and operate page targets. The CLI keeps that capability behind explicit commands such as `abb cdp` and `abb screenshot`.

## Native Request Router

The background service worker handles host-originated protocol methods:

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

Browser host operations use `chrome.tabs` and `chrome.history`. Page execution operations use `chrome.debugger` and currently allow:

- `Runtime.evaluate`
- `Page.navigate`
- `Page.captureScreenshot`

## Debugging Notes

Recommended local checks:

```sh
cd apps/cli
GOCACHE=/private/tmp/abb-go-cache go run . install-native-host --json
GOCACHE=/private/tmp/abb-go-cache go run . doctor --json
```

Then reload the unpacked extension and inspect the service worker console. A successful startup should log that the native host connected.

If the service worker logs `Native host has exited`, inspect the native host stderr log:

```text
~/Library/Application Support/AgentBrowserBridge/native-host.log
```

If `doctor --json` reports that the native host allows a different extension origin, rerun `install-native-host` before reloading the extension. If terminal commands report `socket_unavailable`, Chrome has not launched the native host yet, the extension needs to be reloaded, or the native host exited during startup. If commands report `extension_unavailable`, the host is running but did not receive a response from the extension.
