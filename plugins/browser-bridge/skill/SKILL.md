---
name: browser-bridge
description: Diagnose or repair the local Agent Browser Bridge with its self-describing `abb` CLI. In actspace-agent, normal browser tasks use the built-in `browser_*` tools instead.
metadata:
  plugin: browser-bridge
  plugin-type: host-bridge
  process-management: agent
---

# Browser Bridge Skill

This skill exposes diagnostics for the `abb` CLI built from `plugins/browser-bridge/apps/cli`.

When running inside actspace-agent, use the standard `browser_*` tools for tabs, page reads, navigation, screenshots, and interactions. Do not route normal browser tasks through Bash. Use this Skill only when those tools report an unavailable Native Host, socket, or extension, or when installing/upgrading the bridge.

## First Checks

```sh
scripts/abb help
scripts/abb doctor --json
scripts/abb capabilities --json
```

If `doctor` reports that the Native Messaging host or local socket is offline, install the native host and reload the unpacked Chrome extension:

```sh
scripts/abb install-native-host --json
```

## External Agent Compatibility

Other agents without actspace-agent's standard browser tools can still use the self-describing CLI directly. For those consumers, discover the current command surface with `help` rather than treating this Skill as the protocol source of truth.

## CLI Compatibility Examples

```sh
scripts/abb tabs --json
scripts/abb user-tabs --json
scripts/abb history --query browser --limit 5 --json
scripts/abb open-tab --url https://example.com --json
scripts/abb navigate --tab-id <tab-id> --url https://example.com --json
scripts/abb page-info --tab-id <tab-id> --json
scripts/abb cdp --tab-id <tab-id> --method Runtime.evaluate --params '{"expression":"document.title","returnByValue":true}' --json
scripts/abb cdp --tab-id <tab-id> --method Runtime.evaluate --params-file /private/tmp/abb-params.json --json
scripts/abb eval --tab-id <tab-id> --expression 'document.title' --json
scripts/abb eval --tab-id <tab-id> --file /private/tmp/abb-eval.js --json
scripts/abb screenshot --tab-id <tab-id> --output /private/tmp/abb-screenshot.png --json
```

## Constraints

- Browser host operations require the Chrome extension backend and Native Messaging host.
- Basic page execution goes through `chrome.debugger`; supported CDP methods are intentionally limited.
- Prefer `eval`, `--params-file`, and screenshot `--output` for bulky page operations; do not create temporary helper scripts in the user's workspace.
- Do not assume the browser is ready just because the binary exists; always check `doctor` or `capabilities`.
- This skill is an operational wrapper. Long-term design and readiness notes live in `plugins/browser-bridge/docs/`.
