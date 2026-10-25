import { mkdtemp, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalPath, resolvePolicy, sandboxTemplate, templateCapabilities } from "../policy.js";
import type { SandboxRequest } from "../types.js";

const home = "/Users/agent";
const template = sandboxTemplate("tool", { homeDir: home, platform: "darwin" })!;
const request = (overrides: Partial<SandboxRequest> = {}): SandboxRequest => ({ purpose: "tool", isolation: "sandboxed", argv: ["/bin/zsh", "-lc", "true"], cwd: "/work", env: { A: "1" }, scratchDir: "/scratch", filesystem: { readWrite: ["/work", "/scratch"] }, ...overrides });

describe("sandbox policy", () => {
  it("merges the tool template over defaults and derives git write protection for each writable root", async () => {
    const resolved = await resolvePolicy(request(), template);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.policy.network).toEqual({ mode: "unrestricted" });
    expect(resolved.policy.filesystem.read).toEqual({ mode: "all" });
    expect(resolved.policy.filesystem.denyRead).toEqual(expect.arrayContaining([`${home}/.ssh`, `${home}/.aws`, `${home}/Library/Keychains`, "/Library/Keychains"]));
    expect(resolved.policy.filesystem.denyWrite).toEqual(["/scratch/.git/config", "/scratch/.git/hooks", "/work/.git/config", "/work/.git/hooks"]);
    expect(resolved.policy.requiredCapabilities).toEqual(["filesystem.read-deny", "filesystem.write", "filesystem.write-deny", "process.inherit"]);
    expect(Object.isFrozen(resolved.policy)).toBe(true);
  });

  it("allows narrowing the network but never widening it", async () => {
    const blocked = await resolvePolicy(request({ network: { mode: "blocked" } }), template);
    expect(blocked.ok && blocked.policy.requiredCapabilities).toContain("network.blocked");
    const narrow = { ...template, network: { mode: "blocked" as const } };
    const widened = await resolvePolicy(request({ network: { mode: "unrestricted" } }), narrow);
    expect(widened).toEqual({ ok: false, reasons: [expect.stringContaining("wider")] });
  });

  it("rejects writable paths that overlap denied reads, relative paths, and missing templates", async () => {
    expect(await resolvePolicy(request({ filesystem: { readWrite: [home] } }), template)).toEqual({ ok: false, reasons: expect.arrayContaining([expect.stringContaining(`${home}/.ssh`)]) });
    expect(await resolvePolicy(request({ filesystem: { readWrite: [`${home}/.ssh/keys`] } }), template)).toMatchObject({ ok: false });
    expect(await resolvePolicy(request({ filesystem: { readWrite: ["/"] } }), template)).toMatchObject({ ok: false });
    expect(await resolvePolicy(request({ cwd: "relative" }), template)).toMatchObject({ ok: false });
    expect(await resolvePolicy(request({ argv: [] }), template)).toMatchObject({ ok: false });
    expect(await resolvePolicy(request({ purpose: "evaluation" }), sandboxTemplate("evaluation", { homeDir: home, platform: "darwin" }))).toEqual({ ok: false, reasons: ['No sandbox template for purpose "evaluation".'] });
  });

  it("fingerprints limits only, stably", async () => {
    const a = await resolvePolicy(request(), template);
    const b = await resolvePolicy(request({ argv: ["/bin/sh", "-c", "other"], env: { B: "2" }, filesystem: { readWrite: ["/scratch", "/work"] } }), template);
    const c = await resolvePolicy(request({ network: { mode: "blocked" } }), template);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(a.policy.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a.policy.fingerprint).toBe(b.policy.fingerprint);
    expect(a.policy.fingerprint).not.toBe(c.policy.fingerprint);
  });

  it("reports template capabilities and platform-specific private paths", () => {
    expect(templateCapabilities(template)).toEqual(["filesystem.read-deny", "filesystem.write", "filesystem.write-deny", "process.inherit"]);
    const linux = sandboxTemplate("tool", { homeDir: "/home/agent", platform: "linux" })!;
    expect(linux.denyRead).toContain("/home/agent/.local/share/keyrings");
    expect(linux.denyRead.some(path => path.includes("Library"))).toBe(false);
  });

  it("canonicalizes symlinks through the longest existing prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "sandbox-policy-"));
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "link"));
    const real = await canonicalPath(join(root, "real"));
    expect(await canonicalPath(join(root, "link", "missing", "file"))).toBe(join(real, "missing", "file"));
  });
});
