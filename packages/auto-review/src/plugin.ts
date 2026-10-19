import type { CordisContext } from "@actspace/cordis-adapter";
import type { LlmService } from "@actspace/llm-service";
import { createAutoReviewer } from "./review.js";
export function apply(ctx: CordisContext): void {
  const llm = ctx.get?.("llm.service") as LlmService | undefined;
  if (!llm) throw new Error("Auto review requires llm.service");
  ctx.provide?.("approval.auto-review", createAutoReviewer(llm));
}
