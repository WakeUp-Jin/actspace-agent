import type { RuntimeV2BootManifest } from "@actspace/shared/runtime-v2";
import type { ResolvedComposition } from "@actspace/composition";
import type { BootDiagnostic } from "@actspace/diagnostics";
export type StartupFailureCode = "ENTRY_FIBER_MISSING" | "ENTRY_FAILED" | "ENTRY_PENDING" | "ENTRY_NOT_ACTIVE" | "REQUIRED_PROVIDER_MISSING";
export type StartupValidationResult = { readonly ok: boolean; readonly failures: readonly { readonly code: StartupFailureCode; readonly entryId: string; readonly message: string }[] };
export type RestartRequiredNotice = { readonly required: true; readonly reason: string; readonly source: string; readonly candidateDigest: string };
export type TrustedBootCandidate = { readonly manifest: RuntimeV2BootManifest; readonly composition: ResolvedComposition; readonly diagnostics: readonly BootDiagnostic[]; readonly codecCount: number; readonly disposeCandidate: () => Promise<void> };
