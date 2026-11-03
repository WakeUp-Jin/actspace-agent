import type { CordisContext } from "@actspace/cordis-adapter";
import type { ContextSource } from "@actspace/context-engine";
import type { RunningSubagent, SubagentHostPort } from "@actspace/subagent";
import { publish } from "@actspace/prompt/source-support";

export const SUBAGENTS_CONTEXT_OWNER = "actspace.context-subagents";

/**
 * Running subagents of the main agent (design 02 §6.4), refreshed once per turn, so the
 * model still knows who is working after compaction or a restart. Nothing while none run.
 */
export function createSubagentsSource(subagents: Pick<SubagentHostPort, "running">): ContextSource {
  let turn: string | undefined; let text: string | undefined;
  return { id: "context-subagents", owner: SUBAGENTS_CONTEXT_OWNER, order: 16, criticality: "optional", fields: ["supplements"],
    get: (context, write) => {
      if (turn !== context.request.turnId) { turn = context.request.turnId; text = render(subagents.running(context.request.sessionId)); }
      if (text === undefined) return;
      write({ supplements: [{ id: "subagents", owner: SUBAGENTS_CONTEXT_OWNER, text, sourceEventSeq: -1, afterEventSeq: -1 }] });
    } };
}

function render(running: readonly RunningSubagent[]): string | undefined {
  if (running.length === 0) return undefined;
  return [
    "Running subagents (this list supersedes earlier ones):",
    ...running.map(agent => `- ${agent.agentId} · ${agent.description} · ${agent.label} · started ${clock(agent.startedAt)} · transcript: ${agent.transcriptPath}`),
  ].join("\n");
}

/** Local wall-clock `HH:MM`, as `list_agents` shows it. */
function clock(iso: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

export function apply(ctx: CordisContext): void {
  const subagents = ctx.get?.("actspace.host.subagents") as SubagentHostPort | undefined;
  publish(ctx, "subagents", () => createSubagentsSource(subagents ?? { running: () => [] }));
}
