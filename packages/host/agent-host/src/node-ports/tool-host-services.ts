import {
  FILESYSTEM_HOST_PORT_ID,
  PROCESS_HOST_PORT_ID,
  type FilesystemHostGrant,
  type ProcessHostGrant,
} from "@actspace/tool-runtime";
import { createNodeWebToolPorts as createWebtools, WEB_TOOLS_HOST_PORT_ID } from "@actspace/tool-web";
import {
  createNodeToolPorts as createImagegeneration,
  IMAGE_GENERATION_HOST_PORT_ID,
} from "@actspace/tool-image-generation";
import {
  createNodeToolPorts as createImageinspection,
  IMAGE_INSPECTION_HOST_PORT_ID,
} from "@actspace/tool-image-inspection";
import { createLlmImageInspector, type SessionArtifactReader } from "@actspace/tool-image-inspection";
import type { WebSearchCredentials } from "@actspace/tool-web";
import { createNodeSandboxHostPort, findBundledNono, repoNonoPath, SANDBOX_HOST_PORT_ID } from "@actspace/sandbox";
import {
  findBundledPythonRuntime,
  pythonRuntimeForBash,
  repoPythonRuntimePath,
  type PythonRuntime,
  type PythonRuntimeForBash,
} from "@actspace/python-runtime";

/**
 * `ACTSPACE_NONO_PATH`, then the copy `pnpm sandbox:fetch-nono` fetched when the caller runs from the repo.
 * This package also ships as a CommonJS bundle without `import.meta`, so the repo root comes from the caller.
 */
export function resolveNodeHostNonoPath(env: NodeJS.ProcessEnv = process.env, repoRoot?: string): string | undefined {
  return findBundledNono([env.ACTSPACE_NONO_PATH, repoRoot === undefined ? undefined : repoNonoPath(repoRoot)]);
}
/** `ACTSPACE_PYTHON_RUNTIME`, then the runtime `pnpm python-runtime:prepare` built when the caller runs from the repo. */
export function resolveNodeHostPythonRuntime(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot?: string,
): PythonRuntime | undefined {
  return findBundledPythonRuntime([
    env.ACTSPACE_PYTHON_RUNTIME,
    repoRoot === undefined ? undefined : repoPythonRuntimePath(repoRoot),
  ]);
}
/** The bundled Python as the process grant carries it; the extension layer is looked up under `dataRoot` per command. */
export function resolveNodeHostPython(
  env: NodeJS.ProcessEnv,
  repoRoot: string | undefined,
  dataRoot: string,
): PythonRuntimeForBash | undefined {
  const runtime = resolveNodeHostPythonRuntime(env, repoRoot);
  return runtime === undefined ? undefined : pythonRuntimeForBash(runtime, dataRoot);
}
/**
 * The sandbox Host port on its own (the CLI's `--mock` has no tool ports). `sandboxInherited` comes only from an
 * explicit launch flag; Desktop never sets it.
 */
export function createNodeSandboxHostServices(options: {
  readonly nonoPath?: string;
  readonly sandboxInherited?: boolean;
}) {
  return Object.freeze({
    [SANDBOX_HOST_PORT_ID]: createNodeSandboxHostPort({
      nonoPath: options.nonoPath ?? resolveNodeHostNonoPath(),
      inherited: options.sandboxInherited === true,
    }),
  });
}
/**
 * File and shell tools live in the Harness tree; the Host only grants them the filesystem (roots, artifact resolution)
 * and process execution (roots, forced-shutdown hook, the bundled Python). Web and image tools still receive Host-built ports.
 */
export function createNodeToolHostServices(options: {
  readonly onShellProcesses?: (control: { readonly forceTerminate: () => void }) => void;
  readonly workspaceRoot: string;
  readonly tmpRoot: string;
  readonly model: string;
  readonly readArtifact: SessionArtifactReader;
  readonly resolveArtifact?: import("@actspace/tool-runtime").SessionArtifactResolver;
  readonly nonoPath?: string;
  readonly sandboxInherited?: boolean;
  readonly python?: PythonRuntimeForBash;
}) {
  const keys = {
    deepseek: process.env.ACTSPACE_DEEPSEEK_SEARCH === "1" ? process.env.DEEPSEEK_API_KEY : undefined,
    zhipu: process.env.ZHIPU_API_KEY,
    tavily: process.env.TAVILY_API_KEY,
    tinyfish: process.env.TINYFISH_API_KEY,
    exa: process.env.EXA_API_KEY,
  };
  const credentials = Object.fromEntries(
    Object.entries(keys).filter((entry): entry is [keyof WebSearchCredentials, string] => Boolean(entry[1])),
  ) as WebSearchCredentials;
  const apiKey = process.env.IMAGE_GENERATION_API_KEY;
  const baseUrl = process.env.IMAGE_GENERATION_BASE_URL;
  const model = process.env.IMAGE_GENERATION_MODEL;
  return Object.freeze({
    ...createNodeSandboxHostServices(options),
    [FILESYSTEM_HOST_PORT_ID]: Object.freeze({
      workspaceRoot: options.workspaceRoot,
      resolveArtifact: options.resolveArtifact,
    } satisfies FilesystemHostGrant),
    [PROCESS_HOST_PORT_ID]: Object.freeze({
      workspaceRoot: options.workspaceRoot,
      tmpRoot: options.tmpRoot,
      onProcesses: options.onShellProcesses,
      python: options.python,
    } satisfies ProcessHostGrant),
    [WEB_TOOLS_HOST_PORT_ID]: {
      createPorts: () =>
        createWebtools({
          credentials,
          deepseekFetchApiKey: process.env.ACTSPACE_DEEPSEEK_FETCH === "1" ? process.env.DEEPSEEK_API_KEY : undefined,
        }),
    } satisfies import("@actspace/tool-web").HostPort,
    [IMAGE_GENERATION_HOST_PORT_ID]: {
      createPorts: () =>
        createImagegeneration({ generation: apiKey && baseUrl && model ? { apiKey, baseUrl, model } : undefined }),
    } satisfies import("@actspace/tool-image-generation").HostPort,
    [IMAGE_INSPECTION_HOST_PORT_ID]: {
      createPorts: (
        llm: import("@actspace/llm-service").LlmServiceContract,
        recorder: import("@actspace/llm-service").AuxiliaryRequestRecorder,
      ) =>
        createImageinspection({
          readArtifact: options.readArtifact,
          inspect: createLlmImageInspector({ llm, recorder, routeId: "default", model: options.model }),
        }),
    } satisfies import("@actspace/tool-image-inspection").HostPort,
  });
}
/** No filesystem or process grant: the Harness file and shell tools register and report the capability as unavailable. */
export function createUnavailableToolHostServices() {
  return Object.freeze(
    Object.fromEntries(
      [WEB_TOOLS_HOST_PORT_ID, IMAGE_GENERATION_HOST_PORT_ID, IMAGE_INSPECTION_HOST_PORT_ID].map((id) => [
        id,
        { createPorts: () => ({}) },
      ]),
    ),
  );
}
