import type { CordisContext } from "@actspace/cordis-adapter";
import type { SessionHandle } from "@actspace/session-persistence";
import type { SessionProjectionService } from "@actspace/session-projection";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { registerTodoTools } from "./todo-tool.js";
import { todoProjectionContributor } from "./projection.js";

export function apply(ctx: CordisContext): void {
  const tools = ctx.get?.("tools.runtime") as ToolRuntime | undefined;
  const sessions = ctx.get?.("session.runtime") as { getOpen(sessionId: string): SessionHandle | undefined } | undefined;
  const projection = ctx.get?.("session.projection") as SessionProjectionService | undefined;
  if (!tools || !sessions || !projection) throw new Error("Todo Tools requires tools.runtime, session.runtime and session.projection.");
  const unregisterProjection = projection.registerContributor(todoProjectionContributor);
  let registrations: ReturnType<typeof registerTodoTools>;
  try { registrations = registerTodoTools(tools, sessionId => sessions.getOpen(sessionId)); }
  catch (error) { unregisterProjection(); throw error; }
  ctx.provide?.("tools.todo", Object.freeze({ registrations }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled(registrations.map(registration => registration.dispose()));
    unregisterProjection();
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Todo Tools cleanup failed.");
  }, "todo-tools");
}

export function activate() {
  return { services: { "tools.todo": Object.freeze({ registerTodoTools, todoProjectionContributor }) }, dispose: () => undefined };
}
