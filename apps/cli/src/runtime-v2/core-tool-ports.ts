import { createLlmImageInspector, createNodeCoreToolPorts, type CoreToolPorts, type SessionArtifactReader, type WebSearchCredentials } from "@actspace/tools-core-tools";

export function createCliV2CoreToolPorts(options: { readonly workspaceRoot: string; readonly tmpRoot: string; readonly llm: unknown; readonly model: string; readonly readArtifact: SessionArtifactReader; readonly resolveArtifact?: import("@actspace/tools-runtime").SessionArtifactResolver }): CoreToolPorts {
  const keys = Object.freeze({
    zhipu: process.env.ZHIPU_API_KEY,
    tavily: process.env.TAVILY_API_KEY,
    tinyfish: process.env.TINYFISH_API_KEY,
    exa: process.env.EXA_API_KEY,
  });
  const searchCredentials = Object.fromEntries(Object.entries(keys).filter((entry): entry is [keyof WebSearchCredentials, string] => Boolean(entry[1]))) as WebSearchCredentials;
  const apiKey = process.env.IMAGE_GENERATION_API_KEY;
  const baseUrl = process.env.IMAGE_GENERATION_BASE_URL;
  const imageModel = process.env.IMAGE_GENERATION_MODEL;
  const imageGeneration = apiKey && baseUrl && imageModel ? Object.freeze({ apiKey, baseUrl, model: imageModel }) : undefined;
  return createNodeCoreToolPorts({
    workspaceRoot: options.workspaceRoot,
    tmpRoot: options.tmpRoot,
    searchCredentials,
    imageGeneration,
    readArtifact: options.readArtifact,
    resolveArtifact: options.resolveArtifact,
    inspectImage: createLlmImageInspector({ llm: options.llm as never, routeId: "default", model: options.model }),
  });
}
