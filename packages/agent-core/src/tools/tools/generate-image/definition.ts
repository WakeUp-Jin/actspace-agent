import type { ToolDefinitionSpec } from "../../types";

export const generateImageDefinition: ToolDefinitionSpec = {
  name: "generate_image",
  description:
    "Generate one or more images from a text prompt using the configured OpenAI-compatible image service. " +
    "Choose n based on user intent: default to 1, use multiple images only when the user asks for alternatives or a set. " +
    "n must be an integer from 1 to 10. The model and service endpoint come from Settings, not tool arguments.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Detailed description of the image to generate.",
      },
      size: {
        type: "string",
        description: "Output image dimensions.",
        enum: ["1024x1024", "1536x1024", "1024x1536"],
        default: "1024x1024",
      },
      n: {
        type: "integer",
        description: "Number of images. Default 1; choose 2-10 only when the request benefits from variants or a set.",
        minimum: 1,
        maximum: 10,
        default: 1,
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "media",
  previewKind: "image_generation",
  requiresKey: "imageGeneration",
};
