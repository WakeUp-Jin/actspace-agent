import type { AuxiliaryRequestOwner, AuxiliaryRequestRecorder, AuxiliaryRequestEnd } from "./auxiliary-request.js";
import type { PreparedLlmCall } from "./prepared-call.js";
import { EMPTY_LLM_USAGE } from "./usage.js";

/** Account transport completion before callers parse or apply the returned text. */
export async function completeAuxiliaryText(prepared: PreparedLlmCall, input: {
  readonly recorder: AuxiliaryRequestRecorder;
  readonly owner: AuxiliaryRequestOwner;
  readonly logicalRequestId?: string;
  readonly signal?: AbortSignal;
  readonly maxTextLength?: number;
}) {
  try {
    const attempt = await input.recorder.start({ ...input.owner, logicalRequestId: input.logicalRequestId ?? prepared.request.requestId, attemptId: prepared.request.requestId, attempt: 1, routeId: prepared.request.routeId, model: prepared.request.model });
    let usage = EMPTY_LLM_USAGE, text = "", stopReason: string | null = null;
    let status: AuxiliaryRequestEnd["status"] = "failed";
    let failure: unknown;
    let failed = false;
    try {
      for await (const event of await prepared.dispatch()) {
        if (event.type === "text-delta") text += event.text;
        if (event.type === "done") {
          usage = event.usage;
          stopReason = event.stopReason;
          if (!text) text = event.content.filter(block => block.type === "text").map(block => block.text).join("");
          status = "completed";
        }
        if (event.type === "error" || event.type === "aborted") {
          usage = event.usage ?? usage;
          status = event.type === "aborted" ? "aborted" : "failed";
          throw new Error(event.type === "error" ? event.failure.message : event.reason || "LLM request was aborted.");
        }
        if (input.maxTextLength !== undefined && text.length > input.maxTextLength) throw new Error("Auxiliary response exceeds limit");
      }
      if (status !== "completed") throw new Error("Incomplete auxiliary response");
    } catch (error) {
      failed = true;
      failure = error;
      if (status !== "completed" && input.signal?.aborted) status = "aborted";
    }
    // Persistence failure must propagate; never retry a possibly committed terminal fact.
    await attempt.finish({ status, usage });
    if (failed) throw failure;
    return { text, usage, stopReason };
  } finally { prepared.release(); }
}
