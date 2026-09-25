import { createLlmImageInspector, createNodeCoreToolPorts, createNodeImageToolPorts, type CoreToolPorts, type SessionArtifactReader } from "@actspace/tools-core-tools";
import { IMAGE_INSPECTION_CREDENTIAL_REF } from "./credential-resolver";
import type { DesktopRuntimeV2ModelPort } from "./model-port";

export type CreateCoreToolPortsOptions = {
  readonly workspaceRoot: string;
  readonly tmpRoot: string;
  readonly modelRuntime: DesktopRuntimeV2ModelPort;
  readonly llm: unknown;
  readonly readArtifact: SessionArtifactReader;
  readonly resolveArtifact?: import("@actspace/tools-runtime").SessionArtifactResolver;
};

export function createDesktopCoreToolPorts(options: CreateCoreToolPortsOptions): CoreToolPorts {
  const toolEnvironment = options.modelRuntime.getToolEnvironment();
  const imageInspection = options.modelRuntime.resolveImageInspectionModel();
  const ports = createNodeCoreToolPorts({
    workspaceRoot: options.workspaceRoot,
    tmpRoot: options.tmpRoot,
    searchCredentials: toolEnvironment.searchCredentials,
    readArtifact: options.readArtifact,
    resolveArtifact: options.resolveArtifact,
    ...(imageInspection.ok ? { inspectImage: createLlmImageInspector({ llm: options.llm as never, routeId: "default", model: imageInspection.model.key, credentialRef: IMAGE_INSPECTION_CREDENTIAL_REF }) } : {}),
  });
  return Object.freeze({
    ...ports,
    generate_image: (args, context) => createNodeImageToolPorts({
      generation: options.modelRuntime.getToolEnvironment().imageGeneration,
    }).generate_image!(args, context),
  } satisfies CoreToolPorts);
}
