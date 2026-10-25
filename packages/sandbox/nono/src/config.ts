import { join } from "node:path";
import type { SandboxPolicy } from "@actspace/sandbox/types";
import type { ReadCover } from "./cover.js";

/** Grants already resolved against the filesystem; `readWrite` is split by type because nono grants files separately. */
export type NonoGrants = { readonly read: ReadCover; readonly readWrite: ReadCover };

/**
 * Login shells read these before the command runs; nono's built-in shell-config protection would otherwise deny them
 * and `zsh -lc` would lose the user's PATH. Interactive files (`.zshrc`, `.bashrc`) stay protected.
 */
export const LOGIN_SHELL_FILES = Object.freeze([".zshenv", ".zprofile", ".zlogin", ".bash_profile", ".bash_login", ".profile"]);

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
    network: policy.network.mode === "blocked" ? { block: true } : {},
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
