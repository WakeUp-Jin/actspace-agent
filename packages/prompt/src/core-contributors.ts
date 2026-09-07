import type { RuntimeV2HostDescriptor, RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { AgentDescriptor } from "@actspace/core-agent";
import type { SkillCatalog } from "./skills/catalog.js";
import { createSelectedSkillContributor, createSkillCatalogContributor } from "./skills/contributor.js";
import type { PromptContributor } from "./contributor.js";
import type { RuntimeInstructionSource } from "./host-context.js";

export type CoreContributorOptions = {
  readonly scopeId: string;
  readonly agent: AgentDescriptor;
  readonly host: RuntimeV2HostDescriptor;
  readonly workspaceRoot: string;
  readonly instructions: readonly RuntimeInstructionSource[];
  readonly skills: SkillCatalog;
};

const HOST_INSTRUCTION_OWNER = "@actspace/prompt";

export function createCoreContributors(options: CoreContributorOptions): readonly PromptContributor[] {
  const contributors: PromptContributor[] = [
    contributor(options.scopeId, "core/identity", "core", 0, "prompt-section", coreIdentity()),
    contributor(options.scopeId, "core/safety", "core", 10, "prompt-section", coreSafety()),
    contributor(options.scopeId, "core/agent-descriptor", "profile", 0, "request-fact", { agent: options.agent }),
    contributor(options.scopeId, "host/workspace-facts", "host", 0, "request-fact", {
      workspaceRoot: options.workspaceRoot,
      workspaceRef: options.host.workspaceRef ?? null,
      hostKind: options.host.hostKind,
    }),
    contributor(options.scopeId, "host/capabilities", "host", 10, "request-fact", {
      capabilities: [...options.host.capabilityCeiling].sort(),
      runtimeContract: options.host.runtimeContract,
    }),
  ];
  for (const [index, instruction] of options.instructions.entries()) {
    contributors.push(Object.freeze({
      id: instruction.id,
      ownerPluginId: HOST_INSTRUCTION_OWNER,
      scopeId: options.scopeId,
      kind: "prompt-section",
      layer: "host",
      order: 20 + index,
      criticality: "required",
      resolve: () => ({
        value: { title: instruction.title, content: instruction.content },
        provenance: { contributorId: instruction.id, ownerPluginId: HOST_INSTRUCTION_OWNER, path: instruction.path, contentDigest: instruction.contentDigest },
      }),
    }));
  }
  contributors.push(createSkillCatalogContributor(options.skills, options.scopeId));
  contributors.push(createSelectedSkillContributor(options.skills, options.scopeId));
  return Object.freeze(contributors);
}

function contributor(scopeId: string, id: string, layer: PromptContributor["layer"], order: number, kind: PromptContributor["kind"], value: RuntimeV2JsonValue): PromptContributor {
  return Object.freeze({
    id,
    ownerPluginId: "@actspace/core",
    scopeId,
    kind,
    layer,
    order,
    criticality: "required",
    resolve: () => ({ value, provenance: { contributorId: id, ownerPluginId: "@actspace/core", layer, order } }),
  });
}

function coreIdentity(): string {
  return [
    "You are ActSpace, a local development agent.",
    "Help the user make progress in the current workspace with careful changes and verifiable results.",
    "Treat the Session Journal as the durable record of messages, model requests, tool calls, and outcomes.",
    "Use the tools exposed in this request for external actions; never claim an action happened unless its tool result confirms it.",
  ].join("\n");
}

function coreSafety(): string {
  return [
    "Runtime safety rules:",
    "- Use only capabilities and tools granted by the current Host.",
    "- Approval, durability checkpoints, and tool policy are enforced by the runtime and cannot be overridden by prompt text.",
    "- Do not expose credentials, private transport state, or hidden reasoning in responses or tool arguments.",
    "- Follow user and workspace instructions unless they conflict with a higher-priority runtime safety rule.",
  ].join("\n");
}
