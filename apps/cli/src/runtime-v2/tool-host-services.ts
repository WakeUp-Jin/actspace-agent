import { createNodeToolPorts as createFilesystemread, FILESYSTEM_READ_HOST_PORT_ID } from "@actspace/tools-filesystem-read";
import { createNodeToolPorts as createFilesystemsearch, FILESYSTEM_SEARCH_HOST_PORT_ID } from "@actspace/tools-filesystem-search";
import { createNodeToolPorts as createFilesystemwrite, FILESYSTEM_WRITE_HOST_PORT_ID } from "@actspace/tools-filesystem-write";
import { createNodeBashToolPorts as createShelltools, SHELL_TOOLS_HOST_PORT_ID } from "@actspace/tools-shell-tools";
import { createNodeWebToolPorts as createWebtools, WEB_TOOLS_HOST_PORT_ID } from "@actspace/tools-web-tools";
import { createNodeToolPorts as createImagegeneration, IMAGE_GENERATION_HOST_PORT_ID } from "@actspace/tools-image-generation";
import { createNodeToolPorts as createImageinspection, IMAGE_INSPECTION_HOST_PORT_ID } from "@actspace/tools-image-inspection";
import { createLlmImageInspector, type SessionArtifactReader } from "@actspace/tools-image-inspection";
import type { WebSearchCredentials } from "@actspace/tools-web-tools";
export function createCliToolHostServices(options: { readonly workspaceRoot: string; readonly tmpRoot: string; readonly model: string; readonly readArtifact: SessionArtifactReader; readonly resolveArtifact?: import("@actspace/tools-runtime").SessionArtifactResolver }) {
  const keys = { zhipu: process.env.ZHIPU_API_KEY, tavily: process.env.TAVILY_API_KEY, tinyfish: process.env.TINYFISH_API_KEY, exa: process.env.EXA_API_KEY };
  const credentials = Object.fromEntries(Object.entries(keys).filter((entry): entry is [keyof WebSearchCredentials, string] => Boolean(entry[1]))) as WebSearchCredentials;
  const apiKey = process.env.IMAGE_GENERATION_API_KEY; const baseUrl = process.env.IMAGE_GENERATION_BASE_URL; const model = process.env.IMAGE_GENERATION_MODEL;
  return Object.freeze({
    [FILESYSTEM_READ_HOST_PORT_ID]: { createPorts: () => createFilesystemread(options) },
    [FILESYSTEM_SEARCH_HOST_PORT_ID]: { createPorts: () => createFilesystemsearch(options) },
    [FILESYSTEM_WRITE_HOST_PORT_ID]: { createPorts: () => createFilesystemwrite(options) },
    [SHELL_TOOLS_HOST_PORT_ID]: { createPorts: () => createShelltools(options) },
    [WEB_TOOLS_HOST_PORT_ID]: { createPorts: () => createWebtools({ credentials }) },
    [IMAGE_GENERATION_HOST_PORT_ID]: { createPorts: () => createImagegeneration({ generation: apiKey && baseUrl && model ? { apiKey, baseUrl, model } : undefined }) },
    [IMAGE_INSPECTION_HOST_PORT_ID]: { createPorts: (llm: import("@actspace/llm-service").LlmService) => createImageinspection({ readArtifact: options.readArtifact, inspect: createLlmImageInspector({ llm, routeId: "default", model: options.model }) }) },
  });
}
export function createUnavailableToolHostServices() {
  return Object.freeze(Object.fromEntries([FILESYSTEM_READ_HOST_PORT_ID, FILESYSTEM_SEARCH_HOST_PORT_ID, FILESYSTEM_WRITE_HOST_PORT_ID, SHELL_TOOLS_HOST_PORT_ID, WEB_TOOLS_HOST_PORT_ID, IMAGE_GENERATION_HOST_PORT_ID, IMAGE_INSPECTION_HOST_PORT_ID].map(id => [id, { createPorts: () => ({}) }])));
}
