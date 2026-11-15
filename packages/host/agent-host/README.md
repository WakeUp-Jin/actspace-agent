# @actspace/agent-host

P4 standalone Host transport and Node adapters. Work in progress; see the approved
[execution plan](../../../docs/exec-plans/completed/20261003-agent-harness-host-refactor/phase-4.md).

The Cordis application plugin publishes `host.application` only with the remote
Host marker. It delegates domain operations to `@actspace/agent-service` and does
not own another scheduler. The gateway owns connections, authentication and
subscriptions. Disconnecting a socket never cancels an Agent Run.

Errors on the wire come in three kinds. A `HostError` is a domain refusal: code
-32000 with `data.kind`. A `HostRequestError` means the caller sent something
wrong (malformed request -32600, unknown method -32601, invalid parameters
-32602) and its message goes back as written, so throw it for every parameter
check. Anything else, including a plain `TypeError`, is a Host fault: the device
gets -32603 `Host operation failed` and the detail goes to the Host log only.

`artifacts.read` reads only the requested range. The whole-file digest check is
remembered per file version (`verified-content.ts`), so a chunked download hashes
the file once instead of once per chunk. `uploads.begin` counts a device's staged
bytes from memory; only startup and the periodic cleanup read every upload's state.

`node-ports` contains shared CLI/Host LLM, tool and artifact adapters; the CJS
entry keeps the existing CLI compatible. Host bootstrap lives in the CLI launcher
to avoid an agent-host -> Runtime dependency cycle.

Tests: `pnpm --filter @actspace/agent-host test`.
Real isolated process fixture: `node --test scripts/test/host-process.test.mjs`
after building Runtime and CLI. It uses an explicit mock model.
