import { createNodeToolPorts as createFilesystemread, FILESYSTEM_READ_HOST_PORT_ID } from "@actspace/tools-filesystem-read";
import { createNodeToolPorts as createFilesystemsearch, FILESYSTEM_SEARCH_HOST_PORT_ID } from "@actspace/tools-filesystem-search";
import { createNodeToolPorts as createFilesystemwrite, FILESYSTEM_WRITE_HOST_PORT_ID } from "@actspace/tools-filesystem-write";
import { createNodeBashToolPorts as createShelltools, SHELL_TOOLS_HOST_PORT_ID } from "@actspace/tools-shell-tools";
import { createNodeWebToolPorts as createWebtools, WEB_TOOLS_HOST_PORT_ID } from "@actspace/tools-web-tools";
import { createNodeToolPorts as createImagegeneration, IMAGE_GENERATION_HOST_PORT_ID } from "@actspace/tools-image-generation";
import { createNodeToolPorts as createImageinspection, IMAGE_INSPECTION_HOST_PORT_ID } from "@actspace/tools-image-inspection";
import { createLlmImageInspector, type SessionArtifactReader } from "@actspace/tools-image-inspection";
import type { WebSearchCredentials } from "@actspace/tools-web-tools";
import { createNodeSandboxHostPort, findBundledNono, repoNonoPath, SANDBOX_HOST_PORT_ID } from "@actspace/sandbox";

/**
 * `ACTSPACE_NONO_PATH`, then the copy `pnpm sandbox:fetch-nono` fetched when the caller runs from the repo.
 * This package also ships as a CommonJS bundle without `import.meta`, so the repo root comes from the caller.
 */
export function resolveNodeHostNonoPath(env: NodeJS.ProcessEnv = process.env, repoRoot?: string): string | undefined {
  return findBundledNono([env.ACTSPACE_NONO_PATH, repoRoot === undefined ? undefined : repoNonoPath(repoRoot)]);
}
/**
 * The sandbox Host port on its own (the CLI's `--mock` has no tool ports). `sandboxInherited` comes only from an
 * explicit launch flag; Desktop never sets it.
 */
export function createNodeSandboxHostServices(options: { readonly nonoPath?: string; readonly sandboxInherited?: boolean }) {
  return Object.freeze({ [SANDBOX_HOST_PORT_ID]: createNodeSandboxHostPort({ nonoPath: options.nonoPath ?? resolveNodeHostNonoPath(), inherited: options.sandboxInherited === true }) });
}
export function createNodeToolHostServices(options: { readonly onShellProcesses?: (control: { readonly forceTerminate: () => void }) => void; readonly workspaceRoot: string; readonly tmpRoot: string; readonly model: string; readonly readArtifact: SessionArtifactReader; readonly resolveArtifact?: import("@actspace/tools-runtime").SessionArtifactResolver; readonly nonoPath?: string; readonly sandboxInherited?: boolean }) {
  const keys = { deepseek: process.env.ACTSPACE_DEEPSEEK_SEARCH === "1" ? process.env.DEEPSEEK_API_KEY : undefined, zhipu: process.env.ZHIPU_API_KEY, tavily: process.env.TAVILY_API_KEY, tinyfish: process.env.TINYFISH_API_KEY, exa: process.env.EXA_API_KEY };
  const credentials = Object.fromEntries(Object.entries(keys).filter((entry): entry is [keyof WebSearchCredentials, string] => Boolean(entry[1]))) as WebSearchCredentials;
  const apiKey = process.env.IMAGE_GENERATION_API_KEY; const baseUrl = process.env.IMAGE_GENERATION_BASE_URL; const model = process.env.IMAGE_GENERATION_MODEL;
  return Object.freeze({
    ...createNodeSandboxHostServices(options),
    [FILESYSTEM_READ_HOST_PORT_ID]: { createPorts: () => createFilesystemread(options) },
    [FILESYSTEM_SEARCH_HOST_PORT_ID]: { createPorts: () => createFilesystemsearch(options) },
    [FILESYSTEM_WRITE_HOST_PORT_ID]: { createPorts: () => createFilesystemwrite(options) },
    [SHELL_TOOLS_HOST_PORT_ID]: { createPorts: (background?: Parameters<typeof createShelltools>[0]["background"], sandbox?: Parameters<typeof createShelltools>[0]["sandbox"]) => { const ports = createShelltools({ ...options, background, sandbox }); options.onShellProcesses?.(ports); return ports; } },
    [WEB_TOOLS_HOST_PORT_ID]: { createPorts: () => createWebtools({ credentials, deepseekFetchApiKey: process.env.ACTSPACE_DEEPSEEK_FETCH === "1" ? process.env.DEEPSEEK_API_KEY : undefined }) },
    [IMAGE_GENERATION_HOST_PORT_ID]: { createPorts: () => createImagegeneration({ generation: apiKey && baseUrl && model ? { apiKey, baseUrl, model } : undefined }) },
    [IMAGE_INSPECTION_HOST_PORT_ID]: { createPorts: (llm: import("@actspace/llm-service").LlmService, recorder: import("@actspace/llm-service").AuxiliaryRequestRecorder) => createImageinspection({ readArtifact: options.readArtifact, inspect: createLlmImageInspector({ llm, recorder, routeId: "default", model: options.model }) }) },
  });
}
export function createUnavailableToolHostServices() {
  return Object.freeze(Object.fromEntries([FILESYSTEM_READ_HOST_PORT_ID, FILESYSTEM_SEARCH_HOST_PORT_ID, FILESYSTEM_WRITE_HOST_PORT_ID, SHELL_TOOLS_HOST_PORT_ID, WEB_TOOLS_HOST_PORT_ID, IMAGE_GENERATION_HOST_PORT_ID, IMAGE_INSPECTION_HOST_PORT_ID].map(id => [id, { createPorts: () => ({}) }])));
}
