# @actspace/agent-host

P4 standalone Host transport and Node adapters. Work in progress; see the approved
[execution plan](../../docs/exec-plans/completed/20261003-agent-harness-host-refactor/phase-4.md).

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
