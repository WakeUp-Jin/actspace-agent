import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilityLevels, SandboxBackend, SandboxHostPort, SandboxPolicy } from "@actspace/sandbox/types";

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";
const PROBE_TIMEOUT_MS = 3_000;
export const SEATBELT_CAPABILITIES: CapabilityLevels = Object.freeze({ "filesystem.write": "full", "filesystem.read-deny": "full", "filesystem.write-deny": "full", "network.blocked": "full", "network.allowlist": "unsupported", "process.inherit": "full" });

/** macOS sandbox-exec. Apple marks it deprecated; it stays as the fallback below nono. */
export function createSeatbeltBackend(host: SandboxHostPort): SandboxBackend {
  return Object.freeze({
    id: "seatbelt",
    priority: 50,
    probe: async () => {
      if (host.platform !== "darwin") return { available: false as const, reason: "sandbox-exec is macOS only." };
      const result = await host.run({ command: SANDBOX_EXEC, args: ["-p", "(version 1)(allow default)", "/usr/bin/true"], cwd: "/", env: {}, timeoutMs: PROBE_TIMEOUT_MS });
      if (result.error !== undefined || result.exitCode !== 0) return { available: false as const, reason: `sandbox-exec probe failed: ${result.error ?? `exit ${result.exitCode}`}` };
      return { available: true as const, version: "sbpl-1", capabilities: SEATBELT_CAPABILITIES };
    },
    prepare: async (policy: SandboxPolicy) => {
      if (policy.network.mode === "allowlist") throw new Error("Network allowlists are not supported by seatbelt.");
      const profilePath = join(policy.scratchDir, `seatbelt-${randomUUID()}.sb`);
      await writeFile(profilePath, buildSeatbeltProfile(policy), { encoding: "utf8", mode: 0o600 });
      return { spawn: { command: SANDBOX_EXEC, args: ["-f", profilePath, ...policy.argv], cwd: policy.cwd, env: policy.env }, dispose: () => rm(profilePath, { force: true }) };
    },
  });
}

export function buildSeatbeltProfile(policy: SandboxPolicy): string {
  const { read, readWrite, denyRead, denyWrite } = policy.filesystem;
  return [
    "(version 1)",
    "(deny default)",
    "(allow process*)", "(allow signal)", ...policy.network.mode === "unrestricted" ? ["(allow network*)"] : [], "(allow sysctl-read)", "(allow mach-lookup)", "(allow ipc-posix*)", "(allow file-ioctl)",
    read.mode === "all" ? "(allow file-read*)" : `(allow file-read-metadata) (allow file-read* ${subpaths(read.paths)})`,
    ...denyRead.length ? [`(deny file-read* ${subpaths(denyRead)})`] : [],
    `(allow file-write* ${subpaths(readWrite)} (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))`,
    ...denyWrite.length ? [`(deny file-write* ${subpaths(denyWrite)})`] : [],
  ].join("\n");
}

function subpaths(paths: readonly string[]): string { return paths.map(path => `(subpath ${sbplString(path)})`).join(" "); }
export function sbplString(value: string): string { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
