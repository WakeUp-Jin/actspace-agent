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

export const PROCESS_HOST_PORT_ID = "actspace.host.process" as const;
export type ProcessHostGrant = {
  readonly workspaceRoot: string;
  readonly tmpRoot: string;
  /** Called once the Harness has process control; the Host uses it to kill stragglers on forced shutdown. */
  readonly onProcesses?: (control: { readonly forceTerminate: () => void }) => void;
};
