# Harness control

Host-owned selection control for fixed Harness artifacts. Coordinates existing composition and boot lifecycle primitives; does not execute tasks, build source, or evaluate improvements.

`prepare` resolves artifact-backed patches; `activate` calls a Host-injected authorizer, persists the selection and publishes it before admitting new leases. Authorization defaults to denied. `prepareRollback` revalidates retained descriptions. Recovery blocks execution when artifacts or the Host contract no longer match; `recoverBuiltin` requires the same Host authorization.

State lives in `harness-state/selections.jsonl` under an exclusive writer lease. Artifacts remain in the Host artifact store. Old instances retire after their final lease; code cache unloading and automatic artifact deletion are not promised.

Cordis isolates registrations, not malicious JavaScript. Only trusted artifacts may be admitted. This package has no Agent-facing enable tool or UI.

`prepare` reports optional-dependency fallbacks and the final entry order. `inspect` reports the durable selection, retained history and live instance references, including cleanup failures. `artifactUsage` reports verified fixed-file occupancy without deleting artifacts. The Host fingerprint includes admitted contracts, module identities and capability ceiling; recovery never adopts historical permissions as current authority.

A Host may integrate the class through its existing lifecycle (Runtime does so), or use the standard `./plugin` entry with `actspace.host.harness-control` options. Neither path grants callers permission to activate. The authorizer remains a trusted Host port and is absent by default.
