import { getService, provideService, type CordisContext } from "@actspace/cordis-adapter";
import { LLM_AUXILIARY_REQUESTS_SERVICE, LLM_SERVICE } from "@actspace/llm-service";
import { AUTO_REVIEW_SERVICE, createAutoReviewer } from "./review.js";
export function apply(ctx: CordisContext): void {
  const llm = getService(ctx, LLM_SERVICE);
  if (!llm) throw new Error("Auto review requires llm.service");
  const recorder = getService(ctx, LLM_AUXILIARY_REQUESTS_SERVICE);
  if (!recorder) throw new Error("Auto review requires llm.auxiliary-requests");
  provideService(ctx, AUTO_REVIEW_SERVICE, createAutoReviewer(llm, recorder));
}
