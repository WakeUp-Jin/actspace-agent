import { emptyRuntimePromptSource } from "./host-context.js";
import type { Context, ContextSource } from "@actspace/context-engine";
import type { RuntimeJsonValue, RuntimeAgentMode } from "@actspace/shared/runtime-v2";
import type { CoreContributorOptions } from "./core-contributors.js";
import type { AgentScope } from "@actspace/scope";
import type { PromptRuntimeService } from "./plugin.js";
import type { AssemblyInput, PromptContributor } from "./contributor.js";

export type SourceOptions = Omit<CoreContributorOptions, "instructions" | "skills" | "profile"> & {
  readonly scope: AgentScope;
  readonly prompt: PromptRuntimeService;
};
/** Shape of a `context.source.<kind>` service; `@actspace/context-assembly` publishes it and hands the factory to the loop. */
export type SourceFactory = { readonly create: (options: SourceOptions) => ContextSource };
export function runtimeInfo(context: Context): {
  mode: RuntimeAgentMode;
  selectedSkillIds: readonly string[];
  hostFacts: RuntimeJsonValue;
} {
  const value = context.status.plugins["actspace.loop"] as
    | { mode?: RuntimeAgentMode; selectedSkillIds?: string[]; hostFacts?: RuntimeJsonValue }
    | undefined;
  return {
    mode: value?.mode ?? "agent",
    selectedSkillIds: value?.selectedSkillIds ?? [],
    hostFacts: value?.hostFacts ?? {},
  };
}
export async function contribute(
  options: SourceOptions,
  context: Context,
  owner: string,
  filter: (value: PromptContributor) => boolean,
  write: Parameters<ContextSource["get"]>[1],
): Promise<void> {
  const info = runtimeInfo(context);
  const source =
    owner.endsWith("rules") || owner.endsWith("skills")
      ? await options.prompt.resolveForTurn(
          options.workspaceRoot,
          context.request.turnId ?? context.request.requestId,
          info.mode === "chat",
        )
      : emptyRuntimePromptSource();
  const contributors = options.prompt
    .createCoreContributors({
      ...options,
      instructions: source.instructions,
      skills: source.skills,
      profile: info.mode === "chat" ? "chat" : "agent",
      deliverables: info.mode === "agent",
    })
    .filter(filter);
  const input: AssemblyInput = {
    sessionId: context.request.sessionId,
    turnId: context.request.turnId ?? "",
    stepId: context.request.stepId ?? "",
    scope: options.scope,
    surface: [],
    hostFacts: info.hostFacts,
    selectedSkillIds: info.selectedSkillIds,
  };
  const sections = [];
  const modelFacts: RuntimeJsonValue[] = [];
  const modelFactSources: { id: string; owner: string }[] = [];
  for (const item of contributors) {
    const result = await item.resolve(input);
    if (item.kind === "prompt-section")
      sections.push({
        id: item.id,
        owner,
        order: ["core", "profile", "host", "agent", "plugin"].indexOf(item.layer) * 1000 + item.order,
        content: result.value,
        ...(result.provenance ? { provenance: result.provenance } : {}),
      });
    if (item.kind === "model-fact") {
      modelFacts.push(result.value);
      modelFactSources.push({ id: item.id, owner });
    }
  }
  write({ system: { sections, modelFacts, modelFactSources } });
}

/** Matches the existing per-Turn prompt loader; Step/request ids are not inputs. */
export function promptSourceKey(context: Context): string {
  return JSON.stringify([
    context.request.turnId ?? context.request.requestId,
    context.request.routeId,
    context.request.model,
    runtimeInfo(context),
  ]);
}
