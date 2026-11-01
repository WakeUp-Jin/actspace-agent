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
    expect(await resolvePolicy(request({ purpose: "evaluation" }), undefined)).toEqual({ ok: false, reasons: ['No sandbox template for purpose "evaluation".'] });
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

  it("evaluation: allowlist only, domains from the request, no git write protection", async () => {
    const evaluation = sandboxTemplate("evaluation", { homeDir: home, platform: "darwin" })!;
    const run = (network?: SandboxRequest["network"], extra: Partial<SandboxRequest> = {}) => resolvePolicy(request({ purpose: "evaluation", filesystem: { readWrite: ["/eval"] }, ...network ? { network } : {}, ...extra }), evaluation);
    const resolved = await run({ mode: "allowlist", domains: ["API.Example.com.", "api.example.com", "b.example.com"], localPorts: [8080, 8080, 3000], upstreamProxy: "127.0.0.1:7897" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.policy.network).toEqual({ mode: "allowlist", domains: ["api.example.com", "b.example.com"], localPorts: [3000, 8080], upstreamProxy: "127.0.0.1:7897" });
    expect(resolved.policy.filesystem.denyWrite).toEqual([]);
    expect(resolved.policy.filesystem.denyRead).toContain(`${home}/.ssh`);
    expect(resolved.policy.requiredCapabilities).toEqual(["filesystem.read-deny", "filesystem.write", "network.allowlist", "network.local-ports", "network.upstream-proxy", "process.inherit"]);
    expect(templateCapabilities(evaluation)).toEqual(["filesystem.read-deny", "filesystem.write", "network.allowlist", "process.inherit"]);
    // Omitting the network falls back to the narrowest mode, never to unrestricted.
    expect(await run()).toMatchObject({ ok: true, policy: { network: { mode: "blocked" } } });
    expect(await run({ mode: "unrestricted" })).toEqual({ ok: false, reasons: [expect.stringContaining("wider")] });
    expect(await run({ mode: "allowlist", domains: [] })).toEqual({ ok: false, reasons: [expect.stringContaining("at least one domain")] });
    expect(await run({ mode: "allowlist", domains: [], localPorts: [11434] })).toMatchObject({ ok: true });
    expect(await run({ mode: "allowlist", domains: ["https://api.example.com"] })).toEqual({ ok: false, reasons: [expect.stringContaining("Invalid allowlist domain")] });
    expect(await run({ mode: "allowlist", domains: ["a.com"], localPorts: [0] })).toEqual({ ok: false, reasons: ["Invalid local port: 0"] });
    expect(await run({ mode: "allowlist", domains: ["a.com"], upstreamProxy: "http://proxy:80" })).toEqual({ ok: false, reasons: [expect.stringContaining("host:port")] });
    expect(await run({ mode: "allowlist", domains: ["a.com"] }, { limits: { memoryBytes: -1 } })).toEqual({ ok: false, reasons: ["limits must be positive integers."] });
    const limited = await run({ mode: "allowlist", domains: ["a.com"], credentials: [{ domain: "a.com", header: "Authorization", source: { env: "KEY" } }] }, { limits: { cpuSeconds: 60 } });
    expect(limited.ok && limited.policy.requiredCapabilities).toEqual(expect.arrayContaining(["network.credential-injection", "process.resource-limits"]));
    expect(limited.ok && limited.policy.limits).toEqual({ cpuSeconds: 60 });
  });

  it("tool: an allowlist is narrower than unrestricted; a fixed allowlist template caps domains, ports and proxy", async () => {
    expect(await resolvePolicy(request({ network: { mode: "allowlist", domains: ["a.com"] } }), template)).toMatchObject({ ok: true, policy: { network: { mode: "allowlist", domains: ["a.com"] } } });
    const fixed = { ...template, network: { mode: "allowlist" as const, domains: ["a.com", "b.com"], localPorts: [80] } };
    expect(await resolvePolicy(request({ network: { mode: "allowlist", domains: ["b.com"], localPorts: [80] } }), fixed)).toMatchObject({ ok: true });
    for (const network of [{ domains: ["c.com"] }, { domains: ["a.com"], localPorts: [81] }, { domains: ["a.com"], upstreamProxy: "p:1" }])
      expect(await resolvePolicy(request({ network: { mode: "allowlist", ...network } }), fixed)).toMatchObject({ ok: false });
  });

  it("canonicalizes symlinks through the longest existing prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "sandbox-policy-"));
    await mkdir(join(root, "real"));
    await symlink(join(root, "real"), join(root, "link"));
    const real = await canonicalPath(join(root, "real"));
    expect(await canonicalPath(join(root, "link", "missing", "file"))).toBe(join(real, "missing", "file"));
  });
});
