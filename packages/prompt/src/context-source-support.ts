import { emptyRuntimePromptSource } from "./host-context.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import type { Context, ContextSource } from "@actspace/context-engine";
import type { RuntimeV2JsonValue, RuntimeV2AgentMode } from "@actspace/shared/runtime-v2";
import type { CoreContributorOptions } from "./core-contributors.js";
import type { AgentScope } from "@actspace/core-scope";
import type { PromptRuntimeService } from "./plugin.js";
import type { AssemblyInput, PromptContributor } from "./contributor.js";

export type SourceOptions = Omit<CoreContributorOptions, "instructions" | "skills" | "profile"> & {
  readonly scope: AgentScope;
  readonly prompt: PromptRuntimeService;
};
export type SourceFactory = { readonly create: (options: SourceOptions) => ContextSource };
export function publish(ctx: CordisContext, kind: string, create: SourceFactory["create"]): void { ctx.provide?.(`context.source.${kind}`, Object.freeze({ create })); }
export function runtimeInfo(context: Context): { mode: RuntimeV2AgentMode; selectedSkillIds: readonly string[]; hostFacts: RuntimeV2JsonValue } {
  const value = context.status.plugins["actspace.loop"] as { mode?: RuntimeV2AgentMode; selectedSkillIds?: string[]; hostFacts?: RuntimeV2JsonValue } | undefined;
  return { mode: value?.mode ?? "agent", selectedSkillIds: value?.selectedSkillIds ?? [], hostFacts: value?.hostFacts ?? {} };
}
export async function contribute(options: SourceOptions, context: Context, owner: string, filter: (value: PromptContributor) => boolean, write: Parameters<ContextSource["get"]>[1]): Promise<void> {
  const info = runtimeInfo(context);
  const source = owner.endsWith("rules") || owner.endsWith("skills") ? await options.prompt.resolveForTurn(options.workspaceRoot, context.request.turnId ?? context.request.requestId, info.mode === "chat") : emptyRuntimePromptSource();
  const contributors = options.prompt.createCoreContributors({ ...options, instructions: source.instructions, skills: source.skills, profile: info.mode === "chat" ? "chat" : "agent", deliverables: info.mode === "agent" }).filter(filter);
  const input: AssemblyInput = { sessionId: context.request.sessionId, turnId: context.request.turnId ?? "", stepId: context.request.stepId ?? "", scope: options.scope, surface: [], hostFacts: info.hostFacts, selectedSkillIds: info.selectedSkillIds };
  const sections = []; const modelFacts: RuntimeV2JsonValue[] = []; const modelFactSources: { id: string; owner: string }[] = [];
  for (const item of contributors) {
    const result = await item.resolve(input);
    if (item.kind === "prompt-section") sections.push({ id: item.id, owner, order: ["core", "profile", "host", "agent", "plugin"].indexOf(item.layer) * 1000 + item.order, content: result.value });
    if (item.kind === "model-fact") { modelFacts.push(result.value); modelFactSources.push({ id: item.id, owner }); }
  }
  write({ system: { sections, modelFacts, modelFactSources } });
}
