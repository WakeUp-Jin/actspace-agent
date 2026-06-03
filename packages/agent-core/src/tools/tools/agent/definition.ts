import type { ToolDefinitionSpec } from "../../types";

export const agentDefinition: ToolDefinitionSpec = {
  name: "agent",
  description:
    "Agent: launch a read-only Explore SubAgent run for independent codebase exploration or localized analysis. " +
    "Use when the task benefits from isolated searching/reading without polluting the main context. " +
    "The SubAgent cannot edit files, run shell commands, browse the web, or call Agent recursively. " +
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
        description: "The complete task instructions for the Explore SubAgent run.",
      },
      subagent_type: {
        type: "string",
        enum: ["explore"],
        description: "SubAgent type. V0 only supports explore.",
      },
    },
    required: ["description", "prompt"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "agent",
  previewKind: "agent",
};
