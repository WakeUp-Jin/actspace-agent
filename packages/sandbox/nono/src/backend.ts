import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import type { CapabilityLevels, SandboxBackend, SandboxHostPort, SandboxPolicy } from "@actspace/sandbox/types";
import { contains, coverReadable, nodeCoverFs, type CoverFs, type ReadCover } from "./cover.js";
import { buildLinuxManifest, buildMacosProfile } from "./config.js";

const PROBE_TIMEOUT_MS = 3_000;
const WRAP = ["wrap", "-s", "--no-diagnostics"] as const;

/** Landlock cannot deny inside an allowed directory, so Linux lacks `filesystem.write-deny`. */
export function nonoCapabilities(platform: NodeJS.Platform): CapabilityLevels {
  return Object.freeze({ "filesystem.write": "full", "filesystem.read-deny": "full", "filesystem.write-deny": platform === "darwin" ? "full" : "unsupported", "network.blocked": "full", "network.allowlist": "unsupported", "process.inherit": "full" });
}

/** The bundled nono (Seatbelt on macOS, Landlock on Linux). Never falls back to a nono found on PATH. */
export function createNonoBackend(host: SandboxHostPort, fs: CoverFs = nodeCoverFs): SandboxBackend {
  const unavailable = (reason: string) => ({ available: false as const, reason });
  return Object.freeze({
    id: "nono",
    priority: 100,
    probe: async () => {
      const nonoPath = host.resources.nonoPath;
      if (!nonoPath) return unavailable("The bundled nono binary was not found.");
      if (host.platform !== "darwin" && host.platform !== "linux") return unavailable(`nono does not support ${host.platform}.`);
      const env = { HOME: host.homeDir, PATH: "/usr/bin:/bin" };
      const version = await host.run({ command: nonoPath, args: ["--version"], cwd: "/", env, timeoutMs: PROBE_TIMEOUT_MS });
      if (version.error !== undefined || version.exitCode !== 0) return unavailable(`nono --version failed: ${failure(version)}`);
      const parsed = /^nono (\S+)/.exec(version.stdout.trim());
      if (!parsed) return unavailable(`Unexpected nono --version output: ${version.stdout.trim().slice(0, 80)}`);
      // A real wrap proves the kernel mechanism works here (Landlock may be missing on Linux).
      const wrap = await host.run({ command: nonoPath, args: [...WRAP, "--read", "/usr", "--block-net", "--", "/usr/bin/true"], cwd: "/usr/bin", env, timeoutMs: PROBE_TIMEOUT_MS });
      if (wrap.error !== undefined || wrap.exitCode !== 0) return unavailable(`nono wrap probe failed: ${failure(wrap)}`);
      return { available: true as const, version: parsed[1]!, capabilities: nonoCapabilities(host.platform) };
    },
    prepare: async (policy: SandboxPolicy) => {
      const nonoPath = host.resources.nonoPath;
      if (!nonoPath) throw new Error("The bundled nono binary was not found.");
      if (policy.network.mode === "allowlist") throw new Error("Network allowlists are not supported by nono wrap.");
      const env = withoutNonoVariables(policy.env);
      const home = env.HOME;
      if (!home || !isAbsolute(home)) throw new Error("nono needs an absolute HOME in the environment.");
      const stateRoots = await Promise.all(nonoStateRoots(env, home).map(path => canonical(path, fs)));
      const { read, readWrite, denyRead } = policy.filesystem;
      for (const root of readWrite) {
        const overlap = stateRoots.find(state => contains(root, state) || contains(state, root));
        if (overlap) throw new Error(`Writable path ${root} overlaps nono state ${overlap}.`);
      }
      const darwin = host.platform === "darwin";
      // macOS denies reads with Seatbelt rules (see buildMacosProfile); Linux can only leave denied paths ungranted.
      const grants = {
        read: await coverReadable(read.mode === "all" ? ["/"] : read.paths, darwin ? stateRoots : [...denyRead, ...stateRoots], fs),
        readWrite: await splitByType(readWrite, fs),
      };
      const config = darwin ? buildMacosProfile(policy, grants, home) : buildLinuxManifest(policy, grants);
      const configPath = join(policy.scratchDir, `nono-${randomUUID()}.json`);
      await writeFile(configPath, JSON.stringify(config), { encoding: "utf8", mode: 0o600 });
      return {
        spawn: { command: nonoPath, args: [...WRAP, darwin ? "-p" : "-c", configPath, "--", ...policy.argv], cwd: policy.cwd, env },
        dispose: () => rm(configPath, { force: true }),
      };
    },
  });
}

/** `NONO_*` variables change nono's own behavior (extra grants, profiles, network), so they never reach it. */
export function withoutNonoVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith("NONO_")));
}

/** Directories nono refuses to grant (`~/.nono`, `$XDG_STATE_HOME/nono`), computed the way nono computes them. */
export function nonoStateRoots(env: NodeJS.ProcessEnv, home: string): readonly string[] {
  const state = env.XDG_STATE_HOME && isAbsolute(env.XDG_STATE_HOME) ? env.XDG_STATE_HOME : join(home, ".local", "state");
  return [join(home, ".nono"), join(state, "nono")];
}

async function canonical(path: string, fs: CoverFs): Promise<string> {
  try { return (await fs.resolve(path)).path; }
  catch { const parent = dirname(path); return parent === path ? path : join(await canonical(parent, fs), basename(path)); }
}

async function splitByType(paths: readonly string[], fs: CoverFs): Promise<ReadCover> {
  const directories: string[] = [];
  const files: string[] = [];
  for (const path of paths) {
    let target;
    try { target = await fs.resolve(path); } catch { throw new Error(`Writable path does not exist: ${path}`); }
    (target.isDirectory ? directories : files).push(path);
  }
  return { directories, files };
}

function failure(result: { readonly exitCode: number | null; readonly stderr: string; readonly error?: string }): string {
  return result.error ?? (result.stderr.trim().split("\n").at(-1) || `exit ${result.exitCode}`);
}
