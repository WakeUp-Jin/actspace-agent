import type { CordisContext } from "@actspace/cordis-adapter";

type SessionRuntime = { readonly getOpen: (sessionId: string) => { readonly flush: (throughSeq?: number) => Promise<void> } | undefined };

export const inject = Object.freeze(["session.runtime"]);

export function apply(ctx: CordisContext): void {
  const runtime = ctx.get?.("session.runtime") as SessionRuntime | undefined;
  if (runtime === undefined) throw new Error("Session checkpoint policy requires session.runtime.");
  ctx.on?.("session/checkpoint", async (payload: unknown) => {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid session/checkpoint payload.");
    const record = payload as Record<string, unknown>;
    if (typeof record.sessionId !== "string" || typeof record.throughSeq !== "number" || !Number.isSafeInteger(record.throughSeq)) {
      throw new Error("Invalid session/checkpoint identity.");
    }
    const session = runtime.getOpen(record.sessionId);
    if (session === undefined) throw new Error(`Session ${record.sessionId} is not live.`);
    await session.flush(record.throughSeq);
  });
}

export function activate() { return { services: {}, dispose: () => undefined }; }
