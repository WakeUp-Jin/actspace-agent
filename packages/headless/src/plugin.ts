import type { CordisContext } from "@actspace/cordis-adapter";
import { HEADLESS_HOST_PORT_ID, HeadlessRunner, type DisabledHeadlessHostPort, type HeadlessHostPort, type HeadlessSessionService } from "./runner.js";
import type { AgentLoopService } from "@actspace/core-agent-loop";

export const inject = Object.freeze([HEADLESS_HOST_PORT_ID, "session.runtime", "agent.loop"]);

export function apply(ctx: CordisContext): void {
  const host = ctx.get?.(HEADLESS_HOST_PORT_ID) as HeadlessHostPort | DisabledHeadlessHostPort | undefined;
  if (host === undefined || host.enabled === false) return;
  const sessions = ctx.get?.("session.runtime") as HeadlessSessionService | undefined;
  const agents = ctx.get?.("agent.loop") as AgentLoopService | undefined;
  if (sessions === undefined) throw new Error("Headless runner requires session.runtime.");
  if (agents === undefined) throw new Error("Headless runner requires agent.loop.");
  const runner = new HeadlessRunner({ host, sessions, agents, context: ctx });
  ctx.provide?.("headless.runner", runner);
  ctx.effect?.(() => () => undefined, "headless-runner");
}
