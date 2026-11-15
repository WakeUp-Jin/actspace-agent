import { getService, provideService, type CordisContext } from "@actspace/cordis-adapter";
import { ENGLISH_LEARNING_SERVICE, EnglishLearningService } from "./service.js";
import { SPEECH_HOST_PORT } from "./host-port.js";
export const inject = Object.freeze(["session.runtime"]);
export function apply(ctx: CordisContext): void {
  const host = getService(ctx, SPEECH_HOST_PORT);
  if (!host) return;
  const service = new EnglishLearningService(ctx, host);
  provideService(ctx, ENGLISH_LEARNING_SERVICE, service);
  ctx.effect?.(() => () => service.dispose(), "english-learning");
}
