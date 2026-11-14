import { ACTSPACE_SERVICE_IDS, getService, serviceView, type CordisContext } from "@actspace/cordis-adapter";
import type { SessionHandle } from "@actspace/session-persistence";
import { TOOL_RUNTIME_SERVICE } from "@actspace/tool-runtime";
import { registerTodoTools } from "./todo-tool.js";

/** 这个包用到的 `session.runtime`：按 id 取打开着的会话。 */
export const TODO_SESSIONS_VIEW = serviceView<{ getOpen(sessionId: string): SessionHandle | undefined }>(ACTSPACE_SERVICE_IDS.sessionRuntime);

/** Harness-owned tool registrations can coexist across generations. The Host-owned todo view lives in `./projection-plugin.js`. */
export function apply(ctx: CordisContext): void {
  const tools = getService(ctx, TOOL_RUNTIME_SERVICE);
  const sessions = getService(ctx, TODO_SESSIONS_VIEW);
  if (!tools || !sessions) throw new Error("Todo Tools requires tools.runtime and session.runtime.");
  const registrations = registerTodoTools(tools, sessionId => sessions.getOpen(sessionId));
  ctx.provide?.("tools.todo", Object.freeze({ registrations }));
  ctx.effect?.(() => async () => {
    const results = await Promise.allSettled(registrations.map(registration => registration.dispose()));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Todo Tools cleanup failed.");
  }, "todo-tools");
}
