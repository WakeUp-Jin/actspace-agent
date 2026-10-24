import type { CordisContext } from "@actspace/cordis-adapter";
import type { BackgroundTaskHost } from "@actspace/background-tasks";
import type { ToolRuntime } from "@actspace/tools-runtime";
import { registerBackgroundTaskTools } from "./tools.js";

/** Tool definitions live in the Harness; the task registry lives on the Host. */
export function apply(ctx: CordisContext): void {
  const tools = ctx.get?.("tools.runtime") as ToolRuntime | undefined;
  const tasks = ctx.get?.("actspace.host.background-tasks") as BackgroundTaskHost | undefined;
  if (!tools || !tasks) throw new Error("Background task tools require tools.runtime and actspace.host.background-tasks.");
  const registrations = registerBackgroundTaskTools(tools, tasks);
  ctx.provide?.("tools.background-tasks", Object.freeze({ registrations }));
  ctx.effect?.(() => async () => { await Promise.all(registrations.map(registration => registration.dispose())); }, "background-task-tools");
}
