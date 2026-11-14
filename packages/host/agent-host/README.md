# @actspace/agent-host

Standalone Host transport and Node adapters. Deployment and operation are described in the
[Host guide](../../../docs/design-docs/agent-plugin-runtime/agent-host-guide.md).

The Cordis application plugin publishes `host.application` only with the remote
Host marker. It delegates domain operations to `@actspace/agent-service` and does
not own another scheduler. The gateway owns connections, authentication and
subscriptions. Disconnecting a socket never cancels an Agent Run.

`node-ports` contains shared CLI/Host LLM, tool and artifact adapters; the CJS
entry keeps the existing CLI compatible. Host bootstrap lives in the CLI launcher
to avoid an agent-host -> Runtime dependency cycle.

Tests: `pnpm --filter @actspace/agent-host test`.
Real isolated process fixture: `node --test scripts/test/host-process.test.mjs`
after building Runtime and CLI. It uses an explicit mock model.
