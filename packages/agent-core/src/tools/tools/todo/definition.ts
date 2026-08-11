import type { ToolDefinitionSpec } from "../../types";

const todoStatusItems = {
  type: "string",
  description: "Todo status",
  enum: ["pending", "in_progress", "completed"],
};

export const todoReadDefinition: ToolDefinitionSpec = {
  name: "todo_read",
  description:
    "Read the Todo list for the current main AgentRun. " +
    "Use this to inspect the current execution plan or select items by ID and status. " +
    "Filters use AND semantics. Do not use this for team task assignment or workspace files.",
  parameters: {
    type: "object",
    properties: {
      statusFilter: {
        type: "array",
        description: "Optional statuses to include",
        items: todoStatusItems,
      },
      ids: {
        type: "array",
        description: "Optional Todo IDs to include",
        items: { type: "string", description: "Opaque Todo ID" },
      },
    },
    required: [],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "state",
  previewKind: "todo",
};

export const todoWriteDefinition: ToolDefinitionSpec = {
  name: "todo_write",
  description:
    "Replace or merge the Todo list for the current main AgentRun. " +
    "Use replace mode for a new complete plan and merge mode to update existing opaque IDs or append ID-less items. " +
    "Keep at most one item in_progress. Do not use this for team tasks, dependencies, ownership, or user-editable data.",
  parameters: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        description: "Complete replacement list or merge entries",
        items: {
          type: "object",
          description: "One Todo item",
          properties: {
            id: { type: "string", description: "Existing opaque Todo ID; omit for a new item" },
            content: { type: "string", description: "Non-empty user-readable work item" },
            status: todoStatusItems,
            activeForm: { type: "string", description: "Optional present-progress wording" },
          },
          required: ["content", "status"],
          additionalProperties: false,
        },
      },
      merge: {
        type: "boolean",
        description: "Merge by ID when true; replace the full list when false or omitted",
        default: false,
      },
    },
    required: ["todos"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "state",
  previewKind: "todo",
};
