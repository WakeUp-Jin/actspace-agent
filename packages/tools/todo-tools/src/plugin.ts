import type { CordisContext } from "@actspace/cordis-adapter";
import type { SessionHandle } from "@actspace/session-persistence";
import type { SessionProjectionService } from "@actspace/session-projection";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { registerTodoTools } from "./todo-tool.js";
import { todoProjectionContributor } from "./projection.js";

/** Host-owned history projection is registered once, independently of live Harnesses. */
export function applyProjection(ctx: CordisContext): void {
  const projection = ctx.get?.("session.projection") as SessionProjectionService | undefined;
  if (!projection) throw new Error("Todo projection requires session.projection.");
  const unregister = projection.registerContributor(todoProjectionContributor);
  ctx.effect?.(() => unregister, "todo-projection");
}

/** Harness-owned tool registrations can coexist across generations. */
export function applyTools(ctx: CordisContext): void {
  const tools = ctx.get?.("tools.runtime") as ToolRuntime | undefined;
  const sessions = ctx.get?.("session.runtime") as { getOpen(sessionId: string): SessionHandle | undefined } | undefined;
  if (!tools || !sessions) throw new Error("Todo Tools requires tools.runtime and session.runtime.");
  const registrations = registerTodoTools(tools, sessionId => sessions.getOpen(sessionId));
  ctx.provide?.("tools.todo", Object.freeze({ registrations }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled(registrations.map(registration => registration.dispose()));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Todo Tools cleanup failed.");
  }, "todo-tools");
}

export function apply(ctx: CordisContext): void {
  applyProjection(ctx);
  applyTools(ctx);
}

export function activate() {
  return { services: { "tools.todo": Object.freeze({ registerTodoTools, todoProjectionContributor }) }, dispose: () => undefined };
}
