/**
 * Explicit, reviewable input allowlist for the contract matrix generator.
 * Keep this list small and intentional: the generator must never infer
 * runtime meaning by scanning arbitrary repository files.
 */

export const GENERATOR_VERSION = "1.0.0";

export const EVENT_SOURCES = Object.freeze({
  sessionCore: Object.freeze({ path: "packages/session/journal/src/core-codecs.ts", symbol: "CORE_EVENT_TYPES" }),
  sessionExtensions: Object.freeze({ path: "packages/session/journal/src/core-codecs.ts", symbol: "PERSISTED_EXTENSION_EVENT_TYPES" }),
  loopInterventions: Object.freeze({ path: "packages/cordis-adapter/src/event-contract.ts", symbol: "AgentLoopIntervention" }),
  notifications: Object.freeze({ path: "packages/cordis-adapter/src/event-contract.ts", symbol: "AgentNotification" }),
});

export const SERVICE_SOURCE = Object.freeze({
  path: "packages/cordis-adapter/src/service-contract.ts",
  definitionsSymbol: "ACTSPACE_SERVICE_DEFINITIONS",
  rolesSymbol: "ACTSPACE_SERVICE_ROLE_METADATA",
  idsSymbol: "ACTSPACE_SERVICE_IDS",
});

export const MANIFEST_PATHS = Object.freeze([
  "packages/compaction/src/manifest.ts",
  "packages/context/src/manifest.ts",
  "packages/core/agent-loop/src/manifest.ts",
  "packages/core/agent/src/manifest.ts",
  "packages/core/scope/src/manifest.ts",
  "packages/desktop-app/src/manifest.ts",
  "packages/headless/src/manifest.ts",
  "packages/llm/pi-ai/src/manifest.ts",
  "packages/llm/service/src/manifest.ts",
  "packages/prompt/src/manifest.ts",
  "packages/session/journal/src/manifest.ts",
  "packages/session/jsonl/src/manifest.ts",
  "packages/session/persistence/src/manifest.ts",
  "packages/session/projection/src/manifest.ts",
  "packages/subagent/src/manifest.ts",
  "packages/tools/approval/src/manifest.ts",
  "packages/tools/browser-tools/src/manifest.ts",
  "packages/tools/core-tools/src/manifest.ts",
  "packages/tools/runtime/src/manifest.ts",
]);

export const COMPOSITION_SOURCES = Object.freeze([
  "packages/runtime/src/profiles/composition.ts",
  "packages/runtime/src/profiles/base.bundle.ts",
  "packages/runtime/src/profiles/kernel.bundle.ts",
  "packages/desktop-app/src/bundle.ts",
  "packages/bundle/src/index.ts",
  "packages/composition/src/types.ts",
  "packages/composition/src/compose.ts",
]);

export const PACKAGE_PATHS = Object.freeze([
  "packages/boot/package.json",
  "packages/bundle/package.json",
  "packages/client/package.json",
  "packages/compaction/package.json",
  "packages/composition/package.json",
  "packages/context/package.json",
  "packages/cordis-adapter/package.json",
  "packages/core/agent-loop/package.json",
  "packages/core/agent/package.json",
  "packages/core/scope/package.json",
  "packages/diagnostics/package.json",
  "packages/headless/package.json",
  "packages/desktop-app/package.json",
  "packages/llm/pi-ai/package.json",
  "packages/llm/service/package.json",
  "packages/prompt/package.json",
  "packages/runtime/package.json",
  "packages/session/journal/package.json",
  "packages/session/jsonl/package.json",
  "packages/session/persistence/package.json",
  "packages/session/projection/package.json",
  "packages/shared/package.json",
  "packages/subagent/package.json",
  "packages/test-support/package.json",
  "packages/tools/approval/package.json",
  "packages/tools/browser-tools/package.json",
  "packages/tools/core-tools/package.json",
  "packages/tools/runtime/package.json",
  "packages/util/package.json",
  "apps/cli/package.json",
  "apps/desktop/package.json",
  "apps/site/package.json",
]);

export const VERIFICATION_SOURCES = Object.freeze([
  Object.freeze({ id: "session-journal/core-codec-contract", path: "packages/session/journal/src/test/journal.test.ts", kind: "contract" }),
  Object.freeze({ id: "session-journal/lifecycle-contract", path: "packages/session/journal/src/test/lifecycle.test.ts", kind: "lifecycle" }),
  Object.freeze({ id: "session-persistence/provider-seam", path: "packages/session/persistence/src/test/provider-seam.test.ts", kind: "contract" }),
  Object.freeze({ id: "cordis-adapter/event-contract", path: "packages/cordis-adapter/tests/contract.spec.ts", kind: "contract" }),
  Object.freeze({ id: "cordis-adapter/service-contract", path: "packages/cordis-adapter/tests/service-contract.spec.ts", kind: "contract" }),
  Object.freeze({ id: "composition/admission-contract", path: "packages/composition/tests/composition.spec.ts", kind: "contract" }),
  Object.freeze({ id: "runtime/lifecycle-contract", path: "packages/runtime/src/runtime/agent-runtime-lifecycle.test.ts", kind: "lifecycle" }),
  Object.freeze({ id: "runtime/profile-composition-contract", path: "packages/runtime/src/profiles/composition.test.ts", kind: "contract" }),
  Object.freeze({ id: "desktop-app/lifecycle-contract", path: "packages/desktop-app/src/test/lifecycle.test.ts", kind: "lifecycle" }),
]);
