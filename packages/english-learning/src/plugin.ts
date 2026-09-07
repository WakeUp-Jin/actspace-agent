import type { CordisContext } from "@actspace/cordis-adapter";
import { EnglishLearningService } from "./service.js";
import { SPEECH_HOST_PORT_ID, type SpeechHostPort } from "./host-port.js";
export const inject = Object.freeze(["agent.registry", "session.runtime"]);
export function apply(ctx: CordisContext): void {
  const host = ctx.get?.(SPEECH_HOST_PORT_ID) as SpeechHostPort | undefined;
  if (!host) return;
  const service = new EnglishLearningService(ctx, host);
  ctx.provide?.("english-learning", service);
  ctx.effect?.(() => () => service.dispose(), "english-learning");
}
