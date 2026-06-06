import type { ToolDefinitionSpec } from "../../types";

export const agentDefinition: ToolDefinitionSpec = {
  name: "agent",
  description:
    "Agent: launch a read-only general-purpose SubAgent run for broad, comprehensive codebase exploration or multi-file analysis. " +
    "Use this for large investigations that span many files and benefit from an isolated context with its own full transcript. " +
    "For small, focused lookups (confirm one fact, read a file or two), prefer the cheaper `explore` tool instead. " +
    "The SubAgent cannot edit files, run shell commands, browse the web, or call another SubAgent recursively. " +
    "The result returned to you is a concise summary plus a transcript reference.",
  parameters: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "A short 3-8 word title shown in the main message flow.",
      },
      prompt: {
        type: "string",
        description: "The complete task instructions for the SubAgent run.",
      },
      subagent_type: {
        type: "string",
        enum: ["explore"],
        description: "SubAgent type. Kept for compatibility; only one type is supported.",
      },
    },
    required: ["description", "prompt"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "agent",
  previewKind: "agent",
};

export const exploreDefinition: ToolDefinitionSpec = {
  name: "explore",
  description:
    "Explore: launch a built-in, read-only focused exploration for a small, well-scoped question. " +
    "Use this whenever you need to confirm a specific fact, locate where something is defined, or read a file or two — " +
    "the kind of quick lookup you would otherwise do inline. It runs on a fast, cheap model in an isolated context and " +
    "returns a short structured answer, keeping noisy intermediate output out of the main conversation. " +
    "Prefer `explore` over `agent` for narrow tasks; use `agent` only for broad multi-file investigations. " +
    "The exploration cannot edit files, run shell commands, browse the web, or delegate recursively.",
  parameters: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "A short 3-8 word title shown in the main message flow.",
      },
      prompt: {
        type: "string",
        description: "One specific, focused question or lookup for the exploration to answer.",
      },
    },
    required: ["description", "prompt"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "agent",
  previewKind: "agent",
};
