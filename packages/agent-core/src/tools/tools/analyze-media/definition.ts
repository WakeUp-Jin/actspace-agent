import type { ToolDefinitionSpec } from "../../types";

export const analyzeMediaDefinition: ToolDefinitionSpec = {
  name: "analyze_media",
  description:
    "Analyze an image or video with Kimi vision and return text the main model can reason over. " +
    "Use this when the user asks about visual content or provides an image/video URL or data URL. " +
    "Do not use it for ordinary text files or webpage reading.",
  parameters: {
    type: "object",
    properties: {
      source: {
        type: "string",
        description: "Image or video URL, data URL, or provider-supported media reference.",
      },
      mimeType: {
        type: "string",
        description: "Optional MIME type such as image/png or video/mp4.",
      },
      prompt: {
        type: "string",
        description: "Optional visual question or analysis focus.",
      },
    },
    required: ["source"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "media",
  previewKind: "media_analysis",
  exposeOnlyTo: "deepseek",
};
