import type { RuntimeHostDescriptor, RuntimeJsonValue } from "@actspace/shared/runtime-v2";
import type { AgentDescriptor } from "@actspace/agent";
import type { SkillCatalog } from "@actspace/skill";
import { createSelectedSkillContributor, createSkillCatalogContributor } from "./skills/contributor.js";
import type { PromptContributor } from "./contributor.js";
import type { RuntimeInstructionSource } from "./host-context.js";

export type CoreContributorOptions = {
  readonly scopeId: string;
  readonly agent: AgentDescriptor;
  readonly host: RuntimeHostDescriptor;
  readonly workspaceRoot: string;
  readonly instructions: readonly RuntimeInstructionSource[];
  readonly skills: SkillCatalog;
  readonly profile?: "agent" | "chat";
  /** Agent mode exposes `present`; its output-choice guidance is omitted elsewhere. */
  readonly deliverables?: boolean;
  /** Script execution through Bash; absent when the Harness has no Bash tool. */
  readonly scripting?: ScriptingFacts;
};

/**
 * What the `tools.shell-tools` service knows about running scripts: where a Session's temporary scripts go, and the
 * bundled Python (absent in a development build without `pnpm python-runtime:prepare`, when the system `python3`
 * is the fallback). `extensionInstalled` is read on every assembly so a download that finishes mid-Session shows up.
 */
export type ScriptingFacts = {
  readonly scratchDirectory: (sessionId: string) => string;
  readonly python?: {
    readonly version: string;
    readonly corePackages: readonly string[];
    readonly extensionPackages: readonly string[];
    readonly extensionInstalled: () => boolean;
  };
};

const HOST_INSTRUCTION_OWNER = "@actspace/prompt";

export function createCoreContributors(options: CoreContributorOptions): readonly PromptContributor[] {
  const chat = options.profile === "chat";
  const contributors: PromptContributor[] = [
    contributor(options.scopeId, "core/identity", "core", 0, "prompt-section", chat ? chatIdentity() : coreIdentity()),
    contributor(options.scopeId, "core/safety", "core", 10, "prompt-section", chat ? chatSafety() : coreSafety()),
    contributor(options.scopeId, "core/agent-descriptor", "profile", 0, "model-fact", { agent: options.agent }),
  ];
  if (!chat && options.deliverables)
    contributors.push(
      contributor(options.scopeId, "core/output-choice", "core", 20, "prompt-section", coreOutputChoice()),
    );
  const scripting = options.scripting;
  if (!chat && scripting) {
    contributors.push(
      contributor(
        options.scopeId,
        "core/scripting",
        "core",
        30,
        "prompt-section",
        coreScripting(scripting.python !== undefined),
      ),
    );
    contributors.push(
      Object.freeze({
        id: "host/scripting-facts",
        ownerPluginId: "@actspace/core",
        scopeId: options.scopeId,
        kind: "model-fact",
        layer: "host",
        order: 15,
        criticality: "required",
        resolve: (input) => ({
          value: scriptingFacts(scripting, input.sessionId),
          provenance: {
            contributorId: "host/scripting-facts",
            ownerPluginId: "@actspace/core",
            layer: "host",
            order: 15,
          },
        }),
      } satisfies PromptContributor),
    );
  }
  if (!chat)
    contributors.push(
      contributor(options.scopeId, "host/workspace-facts", "host", 0, "model-fact", {
        workspaceRoot: options.workspaceRoot,
        workspaceRef: options.host.workspaceRef ?? null,
        hostKind: options.host.hostKind,
      }),
      contributor(options.scopeId, "host/capabilities", "host", 10, "model-fact", {
        capabilities: [...options.host.capabilityCeiling].sort(),
        runtimeContract: options.host.runtimeContract,
      }),
    );
  const instructions = chat
    ? options.instructions.filter((instruction) => instruction.id === "host/user-instructions")
    : options.instructions;
  for (const [index, instruction] of instructions.entries()) {
    contributors.push(
      Object.freeze({
        id: instruction.id,
        ownerPluginId: HOST_INSTRUCTION_OWNER,
        scopeId: options.scopeId,
        kind: "prompt-section",
        layer: "host",
        order: 20 + index,
        criticality: "required",
        resolve: () => ({
          value: { title: instruction.title, content: instruction.content },
          provenance: {
            contributorId: instruction.id,
            ownerPluginId: HOST_INSTRUCTION_OWNER,
            path: instruction.path,
            contentDigest: instruction.contentDigest,
          },
        }),
      }),
    );
  }
  if (!chat) {
    contributors.push(createSkillCatalogContributor(options.skills, options.scopeId));
    contributors.push(createSelectedSkillContributor(options.skills, options.scopeId));
  }
  return Object.freeze(contributors);
}

function contributor(
  scopeId: string,
  id: string,
  layer: PromptContributor["layer"],
  order: number,
  kind: PromptContributor["kind"],
  value: RuntimeJsonValue,
): PromptContributor {
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
    "- Follow user and workspace instructions unless they conflict with a higher-priority runtime safety rule. User instructions take priority over conflicting workspace instructions.",
  ].join("\n");
}

const MERMAID_GUIDANCE =
  "Chat replies render ```mermaid fences as zoomable, exportable diagrams. For flowcharts, sequence diagrams, or architecture diagrams, write a mermaid fence directly in the reply; do not generate HTML or image files for them or look for a rendering tool.";

function coreOutputChoice(): string {
  return [
    "Prefer showing the primary results within your final response alongside a brief explanation.",
    "Do not call present just to list edited source files, or run commands to check whether a diff view will appear.",
    "Use present when a separate file card helps the user open the complete deliverable, including images, Office documents, spreadsheets, and slide decks. Each presented file adds a card below the reply, with preview and native-open actions.",
    "Avoid repeating results already shown inline unless the separate card adds useful access.",
    `${MERMAID_GUIDANCE} Use present for a diagram only when the user explicitly asks for a file.`,
  ].join(" ");
}

/**
 * Kept to about ten lines: the two ways to run a script, where temporary files go, how to handle large output, and
 * which interpreter to use. Package names live in the model fact, not here.
 */
function coreScripting(bundledPython: boolean): string {
  const interpreter = bundledPython ? "actspace-python" : "python3";
  return [
    "Running scripts (Bash):",
    `- One-off logic: \`${interpreter} -c '...'\` with the source in single quotes (the same for \`node -e\`). Scripts you will rerun, hand to the user, or that exceed about 20 lines: write the file into $ACTSPACE_SCRATCH with write_file, then run it.`,
    "- $ACTSPACE_SCRATCH is this Session's temporary directory; it is cleaned up automatically, so write deliverables (converted files, charts, reports) into the workspace instead.",
    "- Bash returns at most 8000 characters. For larger results write to a file and read_file / grep it; print summaries, not whole tables.",
    bundledPython
      ? "- actspace-python is ActSpace's own interpreter with the Office / PDF libraries listed in the runtime facts. Do not pip install into it or search for a system Python for ActSpace work. When the task is the user's own Python project, use that project's interpreter or venv."
      : "- This build has no bundled Python; use the system python3 and tell the user when a library is missing instead of installing packages without asking.",
    "- Office and PDF files: convert with markitdown when the data extension is installed, otherwise read with python-docx / openpyxl / pypdf; to see a page's layout render it with pypdfium2 and inspect_image. Data analysis needs the data extension (numpy, pandas); when it is not installed, say so and point the user to 设置 › 扩展 › 插件 › 命令行.",
  ].join("\n");
}

function scriptingFacts(scripting: ScriptingFacts, sessionId: string): RuntimeJsonValue {
  const python = scripting.python;
  return {
    scratchDirectory: scripting.scratchDirectory(sessionId),
    python:
      python === undefined
        ? null
        : {
            command: "actspace-python",
            version: python.version,
            corePackages: [...python.corePackages],
            dataExtension: { packages: [...python.extensionPackages], installed: python.extensionInstalled() },
          },
  };
}

function chatIdentity(): string {
  return [
    "You are ActSpace Chat, a focused conversational assistant.",
    "Answer the user directly and use only the tools exposed in the current request.",
    "Files explicitly attached by the user are conversation inputs, not permission to inspect the workspace.",
    MERMAID_GUIDANCE,
  ].join("\n");
}

function chatSafety(): string {
  return [
    "Chat safety rules:",
    "- Do not inspect or modify the local workspace.",
    "- Do not claim network or image actions unless the corresponding tool result confirms them.",
    "- Do not expose credentials, private transport state, or hidden reasoning.",
  ].join("\n");
}
