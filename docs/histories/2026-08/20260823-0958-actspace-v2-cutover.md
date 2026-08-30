# ActSpace v2 runtime cutover

- 日期：2026-08-23
- 分支：`refactor-dsh-plugin`
- 范围：ActSpace v2 plugin runtime implementation and P15 source cutover

## 结果

- Added the ESM `@actspace/agent-runtime` island with Cordis lifecycle admission, Profile/Bundle/Patch composition, ActSpace-owned Session Journal, Prompt, Tool Runtime, LLM adapters, Agent loop, projections, and Host-neutral `RuntimeHandle`.
- Added the namespaced `packages/shared/src/runtime-v2/` contracts and wired Desktop and managed CLI `run`/`chat` to the v2 entry path.
- Fixed persistent Sessions to `sessions-v2/<session-id>/journal.jsonl`; no v1 importer or user-data deletion was performed.
- Removed the CLI v1 branch, Desktop v1 fallback, SEA packaging scripts, Kairos/fs-watch main and renderer integration, and Git-tracked Agent Core/fs-watch source files.
- Removed the remaining Kairos/fs-watch fields from shared settings and legacy Session/IPC contracts, and removed the Kairos product entry points from the site documentation; Browser Bridge remains explicitly modeled as a Host capability.
- Updated the P13/P14/P15 execution records so their status and fallback language match the v2-only source cutover and the real external release gates.
- Kept Browser Bridge as a Host capability and kept pi-ai behind the ActSpace LLM seam with the legacy transport fallback.
- Completed the fixed Desktop projection for provider settings, approval, Session-owned attachments/artifacts, Inbox/Todo/child agents, Compaction, Usage/Analysis, metadata, diagnostics, generic Tool rendering and an allowlisted image renderer.
- Upgraded the Desktop settings disk schema to v3 with a verified byte-for-byte v2 backup and SHA-256 digest; malformed or conflicting migration input fails closed without overwriting credentials or settings.
- Added an explicit demo-only Runtime v2 fixture gate for UI inspection; normal production builds tree-shake its demo data and strings.
- Added a namespaced fixed Desktop shell for Workspace file browsing and worker-isolated Git Review, plus Terminal main/preload lifecycle contracts that fail closed when native/UI dependencies are unavailable.
- Restored `node-pty` and xterm package declarations against existing lock records; sandboxed command-scoped proxy access failed with `EPERM`, while escalated execution did not start because the external approval service returned 503.
- Closed the Subagent terminal-to-parent-link crash window with a durable child terminal fact, idempotent resume repair before generic Session recovery, and cascade shutdown that waits for child terminal publication and cleanup.
- Hardened local release gates for append fsync/partial-write rollback, three provider-route stream truncation, proxy disconnect redaction, FAILED Fiber startup rejection, LLM/Tool activation lease timeout recovery, and LLM deadline timer cleanup.
- Added a typed Main-only credential channel for search and image-generation providers, fixed Settings controls for those credentials and installed-model enablement, and regression coverage proving plaintext keys never return to Renderer.
- Completed the local v2 Settings surface for extra provider credentials, pricing, model metadata/binding/removal, provider probes/balance, Tavily usage, system prompt, appearance, and a real global Quick Open lifecycle; provider network failures are normalized without reading upstream error bodies.
- Added the OpenRouter remote model catalog through the Main scoped proxy path, with runtime row validation, atomic last-good caching, corrupt-cache quarantine, fixed Renderer search/refresh/add controls, and failure behavior that preserves the usable catalog.
- Extended the real Cordis admission gate with PENDING-to-ACTIVE dependency recovery, ordered patches, relative/file/bare imports, invalid-config last-good retention, transactional tree rollback, and valid refresh recovery.
- Hardened the direct pi-ai boundary with historical tool call/result replay, exact AbortSignal forwarding, aborted/truncated terminal handling, HTTP 401/402/403/429/5xx classification, timeout/socket/DNS mapping, provider-code/Retry-After preservation, and URL credential redaction.

## Verification

- Agent Runtime: 36 test files, 153 passed, 6 published-package tests skipped by default; the explicit Cordis/pi-ai gate passes 6/6.
- CLI: 6 test files, 14 passed, plus 2 real-process SIGINT smoke tests.
- Shared v2 contracts, real Cordis/pi-ai smoke, isolated TypeScript checks, docs/repo/secrets checks, legacy-entry scan, and diff check passed.
- Root `pnpm build` passed with the required shared -> agent-runtime -> CLI/Desktop ordering. Root recursive typecheck/test still stop at the incompletely installed Site package: the former has no `astro` executable and the latter cannot resolve `astro/tsconfigs/strict`.
- Root process/repo/refactor tests passed.
- Desktop 10 test files / 32 tests, typecheck, production build and root build passed, including attachment/credential DTO redaction, settings migration, credential/provider/OpenRouter catalog/model/prompt/appearance/Quick Open controls, safe provider network probes, approval, specialized/generic renderer, Workspace/Review/Terminal fixed-shell paths and resizable side panels. Browser Bridge static checks plus CLI/protocol Go module tests passed, and direct CLI persistent/resume smoke passed with a real `sessions-v2` Journal.
- Direct PTY chat covered message execution, `/sessions`, `/exit`, approval and EOF; a second process attempting to resume the active Session was rejected with writer-owner diagnostics. Real-process tests covered structured first-SIGINT abort and second-SIGINT force exit, and a Host parity test proved the CLI artifact preserves the same Runtime snapshot consumed by Desktop.
- The in-app browser refused the local `file://` demo URL under its URL security policy, and the local dev server could not be approved while the external approval service returned 503. No visual acceptance is claimed.
- `abb doctor --json` reports the Native Messaging manifest as valid but the local RPC socket as offline; the available Codex browser control could not attach to Chrome, so no real Extension smoke is claimed.

## Remaining release gates

The change is not a publishable v2 release yet. npm registry access is unavailable, so the exact Cordis/pi-ai lockfile records cannot be generated or guessed. The user-provided local proxy was attempted as command-scoped environment variables: sandbox access to `127.0.0.1:7897` failed with `EPERM`, and escalated execution was blocked by an external approval-service 503 before startup. Fresh workspace install, packaged Electron, managed package deploy, real Provider/Browser/visual acceptance, and cleanup of untracked build caches remain pending. The temporary `packages/desktop/dist-demo/` generated for visual inspection also remains because its explicit cleanup was rejected by the same unavailable approval service. P15 stays blocked until those gates pass.

## 2026-08-24 follow-up

- The user-facing Settings section is now named **扩展**. It means a Host Extension such as Browser Bridge; internal `plugins/` paths, IPC names and Cordis backend Plugin terminology remain unchanged. The fixed renderer layout and styles were not changed.
- The original fixed ActSpace renderer is the only Desktop renderer entry. The temporary Runtime v2 demo workbench was removed; v2 changes are limited to Host wiring, IPC, projections and backend runtime behavior. `/eval`, Kairos and fs-watch product entries remain removed.
- Dependency installation and packaging gates completed through the user-approved local proxy. Root build, typecheck, test, Desktop production build, managed CLI package smoke, real published Cordis/pi-ai smoke and Browser Bridge static/Go checks passed. A real development Electron launch confirmed the original shell, Settings navigation, fixed right panel and absence of `/eval`/Kairos/fs-watch UI entries.
- v2 persists only `sessions-v2/<session-id>/journal.jsonl`. No v1 importer or compatibility reader exists. One old Session was retained under `legacy-session-reference/` as an inactive migration reference; other old Session data was moved to the user trash location, and v2 never scans it.
- The remaining acceptance boundary is manual real-provider and real-Chrome-extension use; no paid model request or browser-side action was made automatically.
- Added an async readiness assertion to the Desktop Analysis workspace test after the full suite exposed a timing-sensitive read of the initial empty index; production rendering was unchanged.
