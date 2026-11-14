import { getService, type CordisContext } from "@actspace/cordis-adapter";
import { BACKGROUND_TASK_HOST_PORT } from "@actspace/background-tasks";
import { TOOL_RUNTIME_SERVICE } from "@actspace/tool-runtime";
import { registerBackgroundTaskTools } from "./tools.js";

/** Tool definitions live in the Harness; the task registry lives on the Host. */
export function apply(ctx: CordisContext): void {
  const tools = getService(ctx, TOOL_RUNTIME_SERVICE);
  const tasks = getService(ctx, BACKGROUND_TASK_HOST_PORT);
  if (!tools || !tasks)
    throw new Error("Background task tools require tools.runtime and actspace.host.background-tasks.");
  const registrations = registerBackgroundTaskTools(tools, tasks);
  ctx.provide?.("tools.background-tasks", Object.freeze({ registrations }));
  ctx.effect?.(
    () => async () => {
      await Promise.all(registrations.map((registration) => registration.dispose()));
    },
    "background-task-tools",
  );
}
