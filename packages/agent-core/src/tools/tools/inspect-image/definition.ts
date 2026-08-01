import type { ToolDefinitionSpec } from "../../types";

export const inspectImageDefinition: ToolDefinitionSpec = {
  name: "inspect_image",
  description:
    "Inspect a local image with the configured vision model and return a high-level image brief, a direct answer, and detailed visual evidence. " +
    "Use this only when visual information is needed, especially for OCR, UI inspection, charts, screenshots, diagrams, or photos. " +
    "Provide a specific question, but expect the result to include relevant whole-image context. " +
    "The path must be inside the workspace, a current-turn image attachment, or a current-session artifact. " +
    "Do not use this for remote URLs, non-image files, or when the current model already received the image natively.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Workspace-relative path or an authorized local path for the image to inspect.",
      },
      question: {
        type: "string",
        description: "The specific visual question to answer, such as extracting text, checking UI state, or explaining the whole image.",
      },
    },
    required: ["path", "question"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "media",
  previewKind: "media_analysis",
  requiresKey: "imageInspection",
  extractPaths: (args) => typeof args.path === "string" ? [args.path] : [],
};
