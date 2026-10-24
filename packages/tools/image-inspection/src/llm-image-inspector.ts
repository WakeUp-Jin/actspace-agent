import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { EMPTY_LLM_USAGE, LlmRuntimeError, normalizeRetryPolicy, retryDelay, type AuxiliaryRequestRecorder, type LlmFailure, type LlmRetryPolicy, type LlmService, type LlmUsage } from "@actspace/llm-service";

export type ImageInspectorInput = {
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly turnId: string;
  readonly stepId: string;
  readonly callId: string;
  readonly artifactId: string;
  readonly mediaType: string;
  readonly question: string;
  readonly signal: AbortSignal;
};
export type ImageInspector = (input: ImageInspectorInput) => Promise<string>;
export type LlmImageInspectorOptions = {
  readonly llm: LlmService;
  readonly recorder: AuxiliaryRequestRecorder;
  readonly routeId: string;
  readonly model: string;
  readonly credentialRef?: string;
  readonly retryPolicy?: LlmRetryPolicy;
};

export function createLlmImageInspector(options: LlmImageInspectorOptions): ImageInspector {
  const policy = normalizeRetryPolicy(options.retryPolicy);
  return async (input) => {
    const logicalRequestId = randomUUID();
    for (let attempt = 1; ; attempt++) {
      const prepared = options.llm.prepare({
        sessionId: input.sessionId, routeId: options.routeId, model: options.model,
        ...(options.credentialRef === undefined ? {} : { credentialRef: options.credentialRef }),
        signal: input.signal,
        messages: [
          { role: "system", content: "Inspect the supplied image. Answer only the user's specific visual question. Report uncertainty and never invent unreadable text." },
          { role: "user", content: [{ type: "text", text: input.question }, { type: "image", artifactId: input.artifactId, mimeType: input.mediaType }] },
        ],
        tools: [], options: { maxTokens: 12_000, reasoning: true },
      });
      let recorded;
      try {
        recorded = await options.recorder.start({
          sessionId: input.sessionId, agentRunId: input.agentRunId, turnId: input.turnId, stepId: input.stepId, callId: input.callId,
          logicalRequestId, attemptId: prepared.request.requestId, attempt, purpose: "image-inspection",
          routeId: prepared.request.routeId, model: prepared.request.model,
        });
      } catch (error) { prepared.release(); throw error; }

      let usage: LlmUsage = EMPTY_LLM_USAGE;
      let text = "";
      let terminal: "completed" | "failed" | "aborted" = "failed";
      let failure: LlmFailure | undefined;
      let error: unknown;
      let receivedTerminal = false;
      try {
        const stream = await prepared.dispatch();
        for await (const event of stream) {
          if (event.type === "text-delta") text += event.text;
          if (event.type !== "done" && event.type !== "error" && event.type !== "aborted") continue;
          usage = event.usage ?? EMPTY_LLM_USAGE;
          receivedTerminal = true;
          if (event.type === "done") {
            terminal = "completed";
            if (!text.trim()) text = event.content.flatMap(block => block.type === "text" ? [block.text] : []).join("\n");
          } else if (event.type === "error") {
            failure = event.failure;
            error = new Error(event.failure.message);
          } else { terminal = "aborted"; error = new Error(event.reason); }
          break;
        }
        if (!receivedTerminal) throw new Error("Vision model stream ended without a terminal event.");
      } catch (caught) {
        error = caught;
        terminal = input.signal.aborted ? "aborted" : "failed";
        if (caught instanceof LlmRuntimeError) failure = caught.failure;
      } finally { prepared.release(); }
      // Keep this outside the transport catch: a failed persistence barrier must
      // neither append a second terminal nor retry an already dispatched request.
      await recorded.finish({ status: terminal, usage });
      if (error === undefined) {
        if (!text.trim()) throw new Error("Vision model returned no text.");
        return text.length > 20_000 ? `${text.slice(0, 20_000)}\n\n[Visual report truncated.]` : text;
      }
      const wait = terminal === "failed" && failure !== undefined && !input.signal.aborted ? retryDelay(policy, failure, attempt) : null;
      if (wait === null) throw error;
      await delay(wait, undefined, { signal: input.signal });
    }
  };
}
