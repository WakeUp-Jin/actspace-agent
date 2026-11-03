import { createNodeToolPorts as createFilesystemread, FILESYSTEM_READ_HOST_PORT_ID } from "@actspace/tool-fs-read";
import { createNodeToolPorts as createFilesystemsearch, FILESYSTEM_SEARCH_HOST_PORT_ID } from "@actspace/tool-fs-search";
import { createNodeToolPorts as createFilesystemwrite, FILESYSTEM_WRITE_HOST_PORT_ID } from "@actspace/tool-fs-write";
import { createNodeBashToolPorts as createShelltools, SHELL_TOOLS_HOST_PORT_ID } from "@actspace/tool-shell";
import { createNodeWebToolPorts as createWebtools, WEB_TOOLS_HOST_PORT_ID } from "@actspace/tool-web";
import { createNodeToolPorts as createImagegeneration, IMAGE_GENERATION_HOST_PORT_ID } from "@actspace/tool-image-generation";
import { createNodeToolPorts as createImageinspection, IMAGE_INSPECTION_HOST_PORT_ID } from "@actspace/tool-image-inspection";
import { createLlmImageInspector, type SessionArtifactReader } from "@actspace/tool-image-inspection";
import { createNodeSandboxHostPort, SANDBOX_HOST_PORT_ID } from "@actspace/sandbox";
import { IMAGE_INSPECTION_CREDENTIAL_REF } from "./credential-resolver";
import type { DesktopRuntimeV2ModelPort } from "./model-port";
export function createDesktopToolHostServices(options: { readonly workspaceRoot: string; readonly tmpRoot: string; readonly modelRuntime: DesktopRuntimeV2ModelPort; readonly readArtifact: SessionArtifactReader; readonly resolveArtifact?: import("@actspace/tool-runtime").SessionArtifactResolver; readonly nonoPath?: string }) {
  return Object.freeze({
    [SANDBOX_HOST_PORT_ID]: createNodeSandboxHostPort({ nonoPath: options.nonoPath }),
    [FILESYSTEM_READ_HOST_PORT_ID]: { createPorts: () => createFilesystemread(options) },
    [FILESYSTEM_SEARCH_HOST_PORT_ID]: { createPorts: () => createFilesystemsearch(options) },
    [FILESYSTEM_WRITE_HOST_PORT_ID]: { createPorts: () => createFilesystemwrite(options) },
    [SHELL_TOOLS_HOST_PORT_ID]: { createPorts: (background: Parameters<typeof createShelltools>[0]["background"], sandbox: Parameters<typeof createShelltools>[0]["sandbox"], session: { readonly dataRoot: string }) => createShelltools({ ...options, dataRoot: session.dataRoot, background, sandbox }) },
    [WEB_TOOLS_HOST_PORT_ID]: { createPorts: () => createWebtools({
      // Ports live as long as the Harness; each search must observe settings changes.
      get deepseekFetchApiKey() { return options.modelRuntime.getToolEnvironment().deepseekFetchApiKey; },
      get credentials() { return options.modelRuntime.getToolEnvironment().searchCredentials; },
    }) },
    [IMAGE_GENERATION_HOST_PORT_ID]: { createPorts: () => ({ generate_image: (...args: Parameters<NonNullable<import("@actspace/tool-image-generation").ToolPorts["generate_image"]>>) => createImagegeneration({ generation: options.modelRuntime.getToolEnvironment().imageGeneration }).generate_image!(...args) }) },
    [IMAGE_INSPECTION_HOST_PORT_ID]: { createPorts: (llm: import("@actspace/llm-service").LlmService, recorder: import("@actspace/llm-service").AuxiliaryRequestRecorder) => ({
      inspect_image: (...args: Parameters<NonNullable<import("@actspace/tool-image-inspection").ToolPorts["inspect_image"]>>) => {
        // The Harness outlives Settings edits; resolve the binding for each call.
        const inspection = options.modelRuntime.resolveImageInspectionModel();
        return createImageinspection({ readArtifact: options.readArtifact, ...(inspection.ok ? { inspect: createLlmImageInspector({ llm, recorder, routeId: "default", model: inspection.model.key, credentialRef: IMAGE_INSPECTION_CREDENTIAL_REF }) } : {}) }).inspect_image!(...args);
      },
    }) },
  });
}
