import { getService, provideService, type CordisContext } from "@actspace/cordis-adapter";
import {
  HEADLESS_AGENT_RUNTIME_VIEW,
  HEADLESS_HOST_PORT,
  HEADLESS_HOST_PORT_ID,
  HEADLESS_RUNNER_SERVICE,
  HEADLESS_SESSIONS_VIEW,
  HeadlessRunner,
} from "./runner.js";

export const inject = Object.freeze([HEADLESS_HOST_PORT_ID, "session.runtime", "agent.runtime"]);

export function apply(ctx: CordisContext): void {
  const host = getService(ctx, HEADLESS_HOST_PORT);
  if (host === undefined || host.enabled === false) return;
  const sessions = getService(ctx, HEADLESS_SESSIONS_VIEW);
  const agents = getService(ctx, HEADLESS_AGENT_RUNTIME_VIEW)?.runs;
  if (sessions === undefined) throw new Error("Headless runner requires session.runtime.");
  if (agents === undefined) throw new Error("Headless runner requires agent.runtime.");
  const runner = new HeadlessRunner({ host, sessions, agents, context: ctx });
  provideService(ctx, HEADLESS_RUNNER_SERVICE, runner);
}
