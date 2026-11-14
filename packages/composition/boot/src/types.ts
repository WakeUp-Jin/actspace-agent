import type { RuntimeBootManifest } from "@actspace/shared/runtime-v2";
import type { ResolvedComposition } from "@actspace/composition";
import type { BootDiagnostic } from "@actspace/diagnostics";
export type TrustedBootCandidate = {
  readonly manifest: RuntimeBootManifest;
  readonly composition: ResolvedComposition;
  readonly diagnostics: readonly BootDiagnostic[];
  readonly codecCount: number;
  readonly disposeCandidate: () => Promise<void>;
};
