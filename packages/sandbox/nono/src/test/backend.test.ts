import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePolicy, sandboxTemplate, type SandboxHostPort, type SandboxPolicy, type SandboxRequest } from "@actspace/sandbox";
import { createNonoBackend, nonoStateRoots, withoutNonoVariables } from "../backend.js";
import { buildLinuxManifest, buildMacosProfile, sbplString } from "../config.js";
import { coverReadable, type CoverFs } from "../cover.js";

type Node = "dir" | "file" | { readonly link: string };
/** In-memory tree; links resolve through `realpath` semantics (missing target rejects). */
function fakeFs(tree: Record<string, Node>, unreadable: readonly string[] = []): CoverFs {
  const node = (path: string) => { const found = tree[path]; if (!found) throw Object.assign(new Error(`ENOENT ${path}`), { code: "ENOENT" }); return found; };
  const resolve = (path: string): string => { const found = node(path); return typeof found === "object" ? resolve(found.link) : path; };
  return {
    readdir: async path => {
      if (unreadable.includes(path)) throw new Error("EACCES");
      const prefix = path === "/" ? "/" : `${path}/`;
      return Object.keys(tree).filter(key => key !== path && key.startsWith(prefix) && !key.slice(prefix.length).includes("/")).map(key => key.slice(prefix.length));
    },
    lstat: async path => { const found = node(path); return { isDirectory: found === "dir", isSymbolicLink: typeof found === "object" }; },
    resolve: async path => { const target = resolve(path); return { path: target, isDirectory: tree[target] === "dir" }; },
  };
}

const TREE: Record<string, Node> = {
  "/": "dir", "/bin": "dir", "/etc": { link: "/private/etc" }, "/private": "dir", "/private/etc": "dir", "/.file": "file", "/broken": { link: "/gone" },
  "/Users": "dir", "/Users/agent": "dir", "/Users/agent/.ssh": "dir", "/Users/agent/.zshenv": "file", "/Users/agent/proj": "dir", "/Users/agent/proj/notes.txt": "file",
  "/Users/agent/sneaky": { link: "/Users/agent/.ssh" }, "/Users/agent/up": { link: "/Users" }, "/Users/agent/locked": "dir",
  "/Users/agent/.local": "dir", "/Users/agent/.local/state": "dir", "/Users/agent/.local/state/nono": "dir", "/Users/agent/.local/state/gh": "dir", "/Users/agent/.local/bin": "dir",
};

describe("split cover", () => {
  it("grants whole subtrees away from exclusions and splits their ancestors", async () => {
    const cover = await coverReadable(["/"], ["/Users/agent/.ssh", "/Users/agent/.local/state/nono", "/Users/agent/.nono"], fakeFs(TREE));
    expect(cover.directories).toEqual(["/Users/agent/.local/bin", "/Users/agent/.local/state/gh", "/Users/agent/locked", "/Users/agent/proj", "/bin", "/etc", "/private"]);
    expect(cover.files).toEqual(["/.file", "/Users/agent/.zshenv"]);
  });

  it("drops links whose target is excluded or above an exclusion, dangling links, and unreadable ancestors", async () => {
    const cover = await coverReadable(["/"], ["/Users/agent/.ssh"], fakeFs(TREE, ["/Users/agent"]));
    expect([...cover.directories, ...cover.files]).not.toEqual(expect.arrayContaining(["/Users/agent/sneaky"]));
    expect([...cover.directories, ...cover.files].some(path => path.startsWith("/Users/agent"))).toBe(false);
    const linked = await coverReadable(["/"], ["/Users/agent/.ssh"], fakeFs(TREE));
    expect(linked.directories).not.toContain("/Users/agent/up");
    expect(linked.directories).not.toContain("/broken");
    expect(linked.files).not.toContain("/broken");
  });

  it("only covers the requested roots", async () => {
    expect(await coverReadable(["/Users/agent"], ["/Users/agent/.ssh"], fakeFs(TREE))).toMatchObject({ directories: expect.arrayContaining(["/Users/agent/proj"]), files: ["/Users/agent/.zshenv"] });
    expect(await coverReadable(["/bin"], ["/Users/agent/.ssh"], fakeFs(TREE))).toEqual({ directories: ["/bin"], files: [] });
  });
});

const request = (overrides: Partial<SandboxRequest> = {}): SandboxRequest => ({ purpose: "tool", isolation: "sandboxed", argv: ["/bin/zsh", "-lc", "true"], cwd: "/work", env: {}, scratchDir: "/scratch", filesystem: { readWrite: ["/work", "/scratch"] }, ...overrides });
async function policyFor(platform: "darwin" | "linux", overrides: Partial<SandboxRequest> = {}): Promise<SandboxPolicy> {
  const template = sandboxTemplate("tool", { homeDir: "/Users/agent", platform })!;
  const resolved = await resolvePolicy(request(overrides), platform === "linux" ? { ...template, denyWriteWithinWritable: [], requiredCapabilities: template.requiredCapabilities.filter(cap => cap !== "filesystem.write-deny") } : template);
  if (!resolved.ok) throw new Error(resolved.reasons.join());
  return resolved.policy;
}
const grants = { read: { directories: ["/bin"], files: ["/.file"] }, readWrite: { directories: ["/work"], files: ["/work.log"] } };

describe("nono configuration", () => {
  it("builds a macOS profile with raw write denies and login-shell bypasses", async () => {
    const policy = await policyFor("darwin", { network: { mode: "blocked" } });
    const profile = buildMacosProfile(policy, grants, "/Users/agent");
    const [readRule, ...rest] = profile.unsafe_macos_seatbelt_rules as string[];
    expect(readRule).toMatch(/^\(deny file-read\* .*\)$/);
    expect(readRule).toContain('(subpath "/Users/agent/.ssh")');
    expect(readRule).toContain('(subpath "/Library/Keychains")');
    expect({ ...profile, unsafe_macos_seatbelt_rules: rest }).toEqual({
      meta: { name: "actspace-sandbox", description: `ActSpace tool sandbox ${policy.fingerprint}` },
      filesystem: {
        read: ["/bin"], read_file: ["/.file"], allow: ["/work"], allow_file: ["/work.log", "/dev/null"],
        bypass_protection: ["/Users/agent/.zshenv", "/Users/agent/.zprofile", "/Users/agent/.zlogin", "/Users/agent/.bash_profile", "/Users/agent/.bash_login", "/Users/agent/.profile"],
      },
      unsafe_macos_seatbelt_rules: ['(deny file-write* (subpath "/scratch/.git/config") (subpath "/scratch/.git/hooks") (subpath "/work/.git/config") (subpath "/work/.git/hooks"))'],
      network: { block: true },
    });
    expect(buildMacosProfile(await policyFor("darwin"), grants, "/Users/agent").network).toEqual({});
    expect(sbplString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("builds a Linux manifest without denies and refuses policies that need one", async () => {
    expect(buildLinuxManifest(await policyFor("linux"), grants)).toEqual({
      version: "0.1.0",
      filesystem: { grants: [{ path: "/bin", access: "read" }, { path: "/.file", access: "read", type: "file" }, { path: "/work", access: "readwrite" }, { path: "/work.log", access: "readwrite", type: "file" }, { path: "/dev/null", access: "readwrite", type: "file" }] },
      network: { mode: "unrestricted" },
      rollback: { enabled: false },
    });
    const darwin = await policyFor("darwin");
    expect(() => buildLinuxManifest(darwin, grants)).toThrow(/cannot deny writes/);
  });

  it("strips NONO_ variables and locates nono state like nono does", () => {
    expect(withoutNonoVariables({ PATH: "/bin", NONO_ALLOW: "/", nono_profile: "x", HOME: "/h" })).toEqual({ PATH: "/bin", HOME: "/h" });
    expect(nonoStateRoots({}, "/h")).toEqual(["/h/.nono", "/h/.local/state/nono"]);
    expect(nonoStateRoots({ XDG_STATE_HOME: "/state" }, "/h")).toEqual(["/h/.nono", "/state/nono"]);
    expect(nonoStateRoots({ XDG_STATE_HOME: "relative" }, "/h")).toEqual(["/h/.nono", "/h/.local/state/nono"]);
  });
});

function fakeHost(platform: NodeJS.Platform, nonoPath: string | undefined, run: SandboxHostPort["run"] = async () => ({ exitCode: 0, stdout: "nono 0.80.0\n", stderr: "" })): SandboxHostPort & { runs: string[][] } {
  const runs: string[][] = [];
  return { platform, homeDir: "/Users/agent", resources: nonoPath ? { nonoPath } : {}, runs, spawn: () => { throw new Error("not used"); }, run: async spec => { runs.push([spec.command, ...spec.args]); return run(spec); } };
}

describe("nono backend", () => {
  it("is unavailable without the bundled binary, off macOS/Linux, or when the probe fails", async () => {
    expect(await createNonoBackend(fakeHost("darwin", undefined)).probe()).toEqual({ available: false, reason: "The bundled nono binary was not found." });
    expect(await createNonoBackend(fakeHost("win32", "/n")).probe()).toEqual({ available: false, reason: "nono does not support win32." });
    expect(await createNonoBackend(fakeHost("linux", "/n", async spec => spec.args[0] === "wrap" ? { exitCode: 1, stdout: "", stderr: "nono: Landlock is not supported\n" } : { exitCode: 0, stdout: "nono 0.80.0", stderr: "" })).probe()).toEqual({ available: false, reason: "nono wrap probe failed: nono: Landlock is not supported" });
    expect(await createNonoBackend(fakeHost("darwin", "/n", async () => ({ exitCode: null, stdout: "", stderr: "", error: "timed out" }))).probe()).toEqual({ available: false, reason: "nono --version failed: timed out" });
  });

  it("reports the version and platform capabilities after a real wrap", async () => {
    const host = fakeHost("linux", "/n");
    expect(await createNonoBackend(host).probe()).toMatchObject({ available: true, version: "0.80.0", capabilities: { "filesystem.write-deny": "unsupported", "network.blocked": "full" } });
    expect(host.runs).toEqual([["/n", "--version"], ["/n", "wrap", "-s", "--no-diagnostics", "--read", "/usr", "--block-net", "--", "/usr/bin/true"]]);
    expect(await createNonoBackend(fakeHost("darwin", "/n")).probe()).toMatchObject({ capabilities: { "filesystem.write-deny": "full" } });
  });

  it("writes the config to scratch, wraps argv, strips NONO_ variables and removes the file on dispose", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "nono-prepare-"));
    const tree = { ...TREE, "/work": "dir" as const, [scratch]: "dir" as const };
    const policy = { ...await policyFor("darwin"), scratchDir: scratch, env: { HOME: "/Users/agent", NONO_ALLOW: "/" }, filesystem: { ...(await policyFor("darwin")).filesystem, readWrite: ["/work"] } };
    const launch = await createNonoBackend(fakeHost("darwin", "/n"), fakeFs(tree)).prepare(policy);
    const configPath = launch.spawn.args[4]!;
    expect(launch.spawn).toMatchObject({ command: "/n", args: ["wrap", "-s", "--no-diagnostics", "-p", configPath, "--", "/bin/zsh", "-lc", "true"], env: { HOME: "/Users/agent" } });
    expect(configPath.startsWith(scratch)).toBe(true);
    const profile = JSON.parse(await readFile(configPath, "utf8"));
    expect(profile.filesystem.allow).toEqual(["/work"]);
    expect(profile.filesystem.read).not.toContain("/Users/agent/.local/state/nono");
    // macOS denies reads by rule, so the grant list only splits around nono's state.
    expect(profile.filesystem.read).toContain("/Users/agent/.ssh");
    expect(profile.unsafe_macos_seatbelt_rules[0]).toContain('(subpath "/Users/agent/.ssh")');
    await launch.dispose();
    await expect(readFile(configPath)).rejects.toThrow(/ENOENT/);
  });

  it("refuses policies nono would reject instead of failing at run time", async () => {
    const backend = createNonoBackend(fakeHost("darwin", "/n"), fakeFs({ ...TREE, "/work": "dir" }));
    const policy = await policyFor("darwin");
    await expect(backend.prepare({ ...policy, env: {} })).rejects.toThrow(/absolute HOME/);
    await expect(backend.prepare({ ...policy, env: { HOME: "/Users/agent" }, filesystem: { ...policy.filesystem, readWrite: ["/Users/agent/.local"] } })).rejects.toThrow(/overlaps nono state/);
    await expect(backend.prepare({ ...policy, env: { HOME: "/Users/agent" }, filesystem: { ...policy.filesystem, readWrite: ["/missing"] } })).rejects.toThrow(/does not exist/);
    await expect(backend.prepare({ ...policy, network: { mode: "allowlist", domains: ["a.com"] } })).rejects.toThrow(/allowlists/);
  });
});
