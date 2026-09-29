import { createNodeToolPorts as createFilesystemread, FILESYSTEM_READ_HOST_PORT_ID } from "@actspace/tools-filesystem-read";
import { createNodeToolPorts as createFilesystemsearch, FILESYSTEM_SEARCH_HOST_PORT_ID } from "@actspace/tools-filesystem-search";
import { createNodeToolPorts as createFilesystemwrite, FILESYSTEM_WRITE_HOST_PORT_ID } from "@actspace/tools-filesystem-write";
import { createNodeBashToolPorts as createShelltools, SHELL_TOOLS_HOST_PORT_ID } from "@actspace/tools-shell-tools";
import { createNodeWebToolPorts as createWebtools, WEB_TOOLS_HOST_PORT_ID } from "@actspace/tools-web-tools";
import { createNodeToolPorts as createImagegeneration, IMAGE_GENERATION_HOST_PORT_ID } from "@actspace/tools-image-generation";
import { createNodeToolPorts as createImageinspection, IMAGE_INSPECTION_HOST_PORT_ID } from "@actspace/tools-image-inspection";
import { createLlmImageInspector, type SessionArtifactReader } from "@actspace/tools-image-inspection";
import { IMAGE_INSPECTION_CREDENTIAL_REF } from "./credential-resolver";
import type { DesktopRuntimeV2ModelPort } from "./model-port";
export function createDesktopToolHostServices(options: { readonly workspaceRoot: string; readonly tmpRoot: string; readonly modelRuntime: DesktopRuntimeV2ModelPort; readonly readArtifact: SessionArtifactReader; readonly resolveArtifact?: import("@actspace/tools-runtime").SessionArtifactResolver }) {
  return Object.freeze({
    [FILESYSTEM_READ_HOST_PORT_ID]: { createPorts: () => createFilesystemread(options) },
    [FILESYSTEM_SEARCH_HOST_PORT_ID]: { createPorts: () => createFilesystemsearch(options) },
    [FILESYSTEM_WRITE_HOST_PORT_ID]: { createPorts: () => createFilesystemwrite(options) },
    [SHELL_TOOLS_HOST_PORT_ID]: { createPorts: () => createShelltools(options) },
    [WEB_TOOLS_HOST_PORT_ID]: { createPorts: () => createWebtools({ credentials: options.modelRuntime.getToolEnvironment().searchCredentials }) },
    [IMAGE_GENERATION_HOST_PORT_ID]: { createPorts: () => ({ generate_image: (...args: Parameters<NonNullable<import("@actspace/tools-image-generation").ToolPorts["generate_image"]>>) => createImagegeneration({ generation: options.modelRuntime.getToolEnvironment().imageGeneration }).generate_image!(...args) }) },
    [IMAGE_INSPECTION_HOST_PORT_ID]: { createPorts: (llm: import("@actspace/llm-service").LlmService) => {
      const inspection = options.modelRuntime.resolveImageInspectionModel();
      return createImageinspection({ readArtifact: options.readArtifact, ...(inspection.ok ? { inspect: createLlmImageInspector({ llm, routeId: "default", model: inspection.model.key, credentialRef: IMAGE_INSPECTION_CREDENTIAL_REF }) } : {}) });
    } },
  });
}
