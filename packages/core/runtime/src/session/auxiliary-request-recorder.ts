import type { AuxiliaryRequestRecorder } from "@actspace/llm-service";
import { snapshotSessionJson } from "@actspace/session-journal";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { RuntimeSessionController } from "./session-controller.js";

/** Only the owner of an already live Session may record auxiliary requests. */
export function createAuxiliaryRequestRecorder(sessions: Pick<RuntimeSessionController, "getOpen">, now: () => string = () => new Date().toISOString()): AuxiliaryRequestRecorder {
  return {
    async start(input) {
      const session = sessions.getOpen(input.sessionId);
      if (session === undefined || session.header.sessionId !== input.sessionId) throw new Error("Auxiliary request requires its live owning Session.");
      const identity = snapshotSessionJson({ ...input, startedAt: now() });
      const started = await session.append({ type: "llm/auxiliary-start", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: identity, surface: null });
      await session.flush(started.seq);
      let terminal: Promise<void> | undefined;
      return {
        finish(result) {
          if (terminal !== undefined) return terminal;
          // Snapshot before entering the Session's serialized queue. The first
          // result and its persistence outcome win, including a failed flush.
          const data = snapshotSessionJson({ ...identity, finishedAt: now(), status: result.status, usage: result.usage });
          terminal = (async () => {
            const finished = await session.append({ type: "llm/auxiliary-end", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: data as unknown as RuntimeV2JsonValue, surface: null });
            await session.flush(finished.seq);
          })();
          return terminal;
        },
      };
    },
  };
}
