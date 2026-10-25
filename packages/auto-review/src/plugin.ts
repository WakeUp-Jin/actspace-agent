import type { CordisContext } from "@actspace/cordis-adapter";
import type { AuxiliaryRequestRecorder, LlmService } from "@actspace/llm-service";
import { createAutoReviewer } from "./review.js";
export function apply(ctx: CordisContext): void {
  const llm = ctx.get?.("llm.service") as LlmService | undefined;
  if (!llm) throw new Error("Auto review requires llm.service");
  const recorder = ctx.get?.("llm.auxiliary-requests") as AuxiliaryRequestRecorder | undefined;
  if (!recorder) throw new Error("Auto review requires llm.auxiliary-requests");
  ctx.provide?.("approval.auto-review", createAutoReviewer(llm, recorder));
}
