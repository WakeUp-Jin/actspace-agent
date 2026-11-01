import type { CordisContext } from "@actspace/cordis-adapter";
import type { SessionHandle } from "@actspace/session-persistence";
import type { ToolRuntime } from "@actspace/tool-runtime";
import { registerTodoTools } from "./todo-tool.js";

/** Harness-owned tool registrations can coexist across generations. The Host-owned todo view lives in `./projection-plugin.js`. */
export function apply(ctx: CordisContext): void {
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
