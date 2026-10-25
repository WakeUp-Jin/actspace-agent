import { join } from "node:path";
import type { SandboxNetwork, SandboxPolicy } from "@actspace/sandbox/types";
import type { ReadCover } from "./cover.js";

/** Grants already resolved against the filesystem; `readWrite` is split by type because nono grants files separately. */
export type NonoGrants = { readonly read: ReadCover; readonly readWrite: ReadCover };

/**
 * Login shells read these before the command runs; nono's built-in shell-config protection would otherwise deny them
 * and `zsh -lc` would lose the user's PATH. Interactive files (`.zshrc`, `.bashrc`) stay protected.
 */
export const LOGIN_SHELL_FILES = Object.freeze([".zshenv", ".zprofile", ".zlogin", ".bash_profile", ".bash_login", ".profile"]);

/**
 * Profiles include nono's system write groups by default: all of /tmp on both platforms, and all of /private/var/folders
 * (every app's $TMPDIR) on macOS. An evaluation may write only its own temp root, so they are excluded there. The tool
 * sandbox keeps them as in the first phase.
 */
function systemWrite(policy: SandboxPolicy, group: "system_write_macos" | "system_write_linux"): Record<string, unknown> {
  return policy.purpose === "evaluation" ? { groups: { exclude: [group] } } : {};
}

/**
 * macOS uses profile mode: denies inside granted directories are only expressible as raw Seatbelt rules, and
 * profile mode also keeps nono's credential, keychain and history protections on top of our own denyRead.
 * `grants.read` therefore only needs to avoid nono's state roots; denyRead stays a rule, which keeps the grant
 * list around a hundred entries (nono's setup time grows with it: ~40ms here vs ~900ms when every denyRead
 * ancestor under ~/Library is split).
 */
export function buildMacosProfile(policy: SandboxPolicy, grants: NonoGrants, homeDir: string): Record<string, unknown> {
  const { denyRead, denyWrite } = policy.filesystem;
  return {
    meta: { name: "actspace-sandbox", description: `ActSpace ${policy.purpose} sandbox ${policy.fingerprint}` },
    ...systemWrite(policy, "system_write_macos"),
    filesystem: {
      read: grants.read.directories,
      read_file: grants.read.files,
      allow: grants.readWrite.directories,
      allow_file: [...grants.readWrite.files, "/dev/null"],
      bypass_protection: LOGIN_SHELL_FILES.map(file => join(homeDir, file)),
    },
    unsafe_macos_seatbelt_rules: [
      ...denyRead.length ? [`(deny file-read* ${subpaths(denyRead)})`] : [],
      ...denyWrite.length ? [`(deny file-write* ${subpaths(denyWrite)})`] : [],
    ],
    network: profileNetwork(policy.network),
  };
}

/**
 * Linux allowlists need `nono run`, and only profile mode carries `upstream_proxy` there (the manifest silently
 * drops it, and `-c` refuses every other flag). Grants are the same split cover as the manifest.
 */
export function buildLinuxProfile(policy: SandboxPolicy, grants: NonoGrants): Record<string, unknown> {
  if (policy.filesystem.denyWrite.length) throw new Error("nono on Linux cannot deny writes inside a writable directory.");
  return {
    meta: { name: "actspace-sandbox", description: `ActSpace ${policy.purpose} sandbox ${policy.fingerprint}` },
    ...systemWrite(policy, "system_write_linux"),
    filesystem: { read: grants.read.directories, read_file: grants.read.files, allow: grants.readWrite.directories, allow_file: [...grants.readWrite.files, "/dev/null"] },
    network: profileNetwork(policy.network),
  };
}

/**
 * Allowlisted traffic goes through nono's proxy; clients connect to 127.0.0.1 and localhost directly (nono sets
 * NO_PROXY for them), so local ports are opened separately and adding those hosts to the domain list does nothing.
 * An empty `allow_domain` turns the proxy off and leaves the network open, so local ports alone are written as a
 * blocked network with open ports.
 */
function profileNetwork(network: SandboxNetwork): Record<string, unknown> {
  if (network.mode === "blocked") return { block: true };
  if (network.mode === "unrestricted") return {};
  if (!network.domains.length) return { block: true, open_port: network.localPorts ?? [] };
  return {
    allow_domain: network.domains,
    ...network.localPorts?.length ? { open_port: network.localPorts } : {},
    ...network.upstreamProxy ? { upstream_proxy: network.upstreamProxy } : {},
  };
}

/**
 * Linux uses a capability manifest. Landlock only adds access, so there is no deny list: `grants.read` must already
 * leave out denyRead, and policies that need write denies are refused.
 */
export function buildLinuxManifest(policy: SandboxPolicy, grants: NonoGrants): Record<string, unknown> {
  if (policy.filesystem.denyWrite.length) throw new Error("nono on Linux cannot deny writes inside a writable directory.");
  return {
    version: "0.1.0",
    filesystem: {
      grants: [
        ...grants.read.directories.map(path => ({ path, access: "read" })),
        ...grants.read.files.map(path => ({ path, access: "read", type: "file" })),
        ...grants.readWrite.directories.map(path => ({ path, access: "readwrite" })),
        ...grants.readWrite.files.map(path => ({ path, access: "readwrite", type: "file" })),
        { path: "/dev/null", access: "readwrite", type: "file" },
      ],
    },
    network: { mode: policy.network.mode === "blocked" ? "blocked" : "unrestricted" },
    rollback: { enabled: false },
  };
}

function subpaths(paths: readonly string[]): string { return paths.map(path => `(subpath ${sbplString(path)})`).join(" "); }
export function sbplString(value: string): string { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
