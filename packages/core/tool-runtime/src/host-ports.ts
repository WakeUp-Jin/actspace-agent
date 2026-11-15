import { serviceKey } from "@actspace/cordis-adapter";
import type { SessionArtifactResolver } from "./executor.js";

/**
 * Capability grants the Host hands to the Harness tree. They carry only what the Host decides (roots, artifact
 * resolution, process lifetime hooks); the tool implementations themselves live in the Harness plugins, so a
 * Harness revision can replace file or shell tooling without a new Host port.
 */
export const FILESYSTEM_HOST_PORT_ID = "actspace.host.filesystem" as const;
export type FilesystemHostGrant = {
  readonly workspaceRoot: string;
  /** Resolves `session artifact` references for tools that read artifacts as files. */
  readonly resolveArtifact?: SessionArtifactResolver;
  /** Explicit ripgrep binary; tools fall back to `rg` on PATH. */
  readonly ripgrepPath?: string;
};
export const FILESYSTEM_HOST_PORT = serviceKey<FilesystemHostGrant>(FILESYSTEM_HOST_PORT_ID);

export const PROCESS_HOST_PORT_ID = "actspace.host.process" as const;
export type ProcessHostGrant = {
  readonly workspaceRoot: string;
  readonly tmpRoot: string;
  /** Called once the Harness has process control; the Host uses it to kill stragglers on forced shutdown. */
  readonly onProcesses?: (control: { readonly forceTerminate: () => void }) => void;
  /** The Python the app ships; absent when it does not, and then the prompt tells the model to use the system one. */
  readonly python?: BundledPythonGrant;
};
export const PROCESS_HOST_PORT = serviceKey<ProcessHostGrant>(PROCESS_HOST_PORT_ID);
/**
 * What Bash and the prompt need to know about the bundled Python: the shim directory goes in front of `PATH` so
 * the model's `actspace-python` resolves, `shim` becomes `ACTSPACE_PYTHON`, and the extension layer (read per
 * command, so a download that finishes mid-Session takes effect on the next command) becomes `ACTSPACE_PYTHON_EXT`.
 */
export type BundledPythonGrant = {
  readonly version: string;
  readonly shimDirectory: string;
  readonly shim: string;
  readonly corePackages: readonly string[];
  readonly extensionPackages: readonly string[];
  readonly extensionSitePackages?: () => string | undefined;
};
