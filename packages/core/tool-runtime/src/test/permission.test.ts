import { describe, expect, it } from "vitest";
import type { SessionGrant } from "@actspace/shared/runtime-v2";
import { mkdtemp, mkdir, rm, symlink, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyFileResource,
  combinePermissionDecisions,
  evaluateGlobalBoundary,
  HostReadableFiles,
  HostWritableRoots,
  isPathWithin,
  sessionGrantsCoverResources,
} from "../permission/index.js";

const file = (canonicalPath: string, access: "read" | "write" | "delete" = "read") => ({
  kind: "file" as const,
  access,
  canonicalPath,
  targetKind: "file" as const,
});

describe("permission engine", () => {
  it("does not reuse a retired aggregate audience for any split file plugin", () => {
    const old = grant({
      audience: { pluginId: "actspace.core-tools", permissionDomain: "core-files", policyVersion: 1 },
    });
    for (const slug of ["filesystem-read", "filesystem-search", "filesystem-write"]) {
      expect(
        sessionGrantsCoverResources([old], [file("/outside/a.txt")], {
          sessionId: "s1",
          agentId: "main:s1",
          audience: { pluginId: `actspace.${slug}`, permissionDomain: slug, policyVersion: 1 },
        }),
      ).toBe(false);
    }
  });

  it("orders decisions monotonically as deny over ask over allow", () => {
    expect(
      combinePermissionDecisions(
        { kind: "deny", code: "GLOBAL_DENY", reason: "blocked" },
        { kind: "ask", reason: "tool asks", risk: "medium" },
      ),
    ).toMatchObject({ kind: "deny", code: "GLOBAL_DENY" });
    expect(
      combinePermissionDecisions(
        { kind: "ask", reasons: [{ code: "GLOBAL_ASK", message: "scope", risk: "medium", reusable: true }] },
        { kind: "allow" },
      ),
    ).toMatchObject({ kind: "ask" });
    expect(combinePermissionDecisions({ kind: "pass" }, { kind: "allow" })).toEqual({ kind: "allow" });
  });

  it("asks outside the workspace in default and auto review modes", () => {
    expect(evaluateGlobalBoundary("auto-review", "/workspace", [file("/outside/file.txt")])).toMatchObject({
      kind: "ask",
    });
    expect(evaluateGlobalBoundary("default", "/workspace", [file("/outside/file.txt")])).toMatchObject({ kind: "ask" });
    expect(evaluateGlobalBoundary("full-access", "/workspace", [file("/outside/file.txt")])).toEqual({ kind: "pass" });
  });

  it("lets Host-readable paths skip the workspace scope only for reads", () => {
    const readable = (path: string) => path === "/data/sessions-v2/s1/transcript.md";
    expect(
      evaluateGlobalBoundary("default", "/workspace", [file("/data/sessions-v2/s1/transcript.md")], readable),
    ).toEqual({ kind: "pass" });
    expect(
      evaluateGlobalBoundary("default", "/workspace", [file("/data/sessions-v2/s1/journal.jsonl")], readable),
    ).toMatchObject({ kind: "ask" });
    expect(
      evaluateGlobalBoundary("default", "/workspace", [file("/data/sessions-v2/s1/transcript.md", "write")], readable),
    ).toMatchObject({ kind: "ask" });
  });

  it("keeps sensitive files once-only and protected resources denied in every mode", () => {
    expect(evaluateGlobalBoundary("full-access", "/workspace", [file("/outside/.env")])).toMatchObject({
      kind: "ask",
      reasons: [{ code: "SENSITIVE_FILE_APPROVAL_REQUIRED" }],
    });
    expect(
      evaluateGlobalBoundary("full-access", "/workspace", [file("/workspace/.git/config", "write")]),
    ).toMatchObject({
      kind: "deny",
      code: "GIT_METADATA_DENIED",
    });
    expect(classifyFileResource(file("/Users/example/.ssh/id_ed25519"))).toMatchObject({
      kind: "protected",
      code: "CREDENTIAL_FILE_DENIED",
    });
  });

  it("matches exact and subtree grants without crossing path segments", () => {
    const context = {
      sessionId: "s1",
      agentId: "main:s1",
      audience: { pluginId: "core", permissionDomain: "core-files", policyVersion: 1 },
    } as const;
    expect(
      sessionGrantsCoverResources(
        [grant({ selector: { kind: "exact", canonicalPath: "/outside/a.txt" } })],
        [file("/outside/a.txt")],
        context,
      ),
    ).toBe(true);
    expect(
      sessionGrantsCoverResources(
        [grant({ selector: { kind: "subtree", canonicalRoot: "/outside/project" } })],
        [file("/outside/project/src/a.ts")],
        context,
      ),
    ).toBe(true);
    expect(
      sessionGrantsCoverResources(
        [grant({ selector: { kind: "subtree", canonicalRoot: "/outside/project" } })],
        [file("/outside/project-other/a.ts")],
        context,
      ),
    ).toBe(false);
  });

  it("requires complete resource coverage and exact subject, audience, access and expiry", () => {
    const context = {
      sessionId: "s1",
      agentId: "main:s1",
      audience: { pluginId: "core", permissionDomain: "core-files", policyVersion: 1 },
      now: Date.parse("2026-09-24T00:00:00Z"),
    } as const;
    const valid = grant({ selector: { kind: "subtree", canonicalRoot: "/outside/project" } });
    expect(
      sessionGrantsCoverResources([valid], [file("/outside/project/a"), file("/outside/project/b")], context),
    ).toBe(true);
    expect(sessionGrantsCoverResources([valid], [file("/outside/project/a"), file("/other/b")], context)).toBe(false);
    expect(
      sessionGrantsCoverResources(
        [{ ...valid, access: "write", action: "file.write" }],
        [file("/outside/project/a")],
        context,
      ),
    ).toBe(false);
    expect(sessionGrantsCoverResources([{ ...valid, sessionId: "s2" }], [file("/outside/project/a")], context)).toBe(
      false,
    );
    expect(
      sessionGrantsCoverResources([{ ...valid, agentId: "subagent:1" }], [file("/outside/project/a")], context),
    ).toBe(false);
    expect(
      sessionGrantsCoverResources(
        [{ ...valid, audience: { ...valid.audience, policyVersion: 2 } }],
        [file("/outside/project/a")],
        context,
      ),
    ).toBe(false);
    expect(
      sessionGrantsCoverResources(
        [{ ...valid, expiresAt: "2026-09-23T00:00:00Z" }],
        [file("/outside/project/a")],
        context,
      ),
    ).toBe(false);
  });
});

function grant(overrides: Partial<SessionGrant> = {}): SessionGrant {
  return {
    schemaVersion: 1,
    grantId: "g1",
    sessionId: "s1",
    agentId: "main:s1",
    audience: { pluginId: "core", permissionDomain: "core-files", policyVersion: 1 },
    action: "file.read",
    access: "read",
    selector: { kind: "exact", canonicalPath: "/outside/a.txt" },
    sourceRequestId: "r1",
    sourceCallId: "c1",
    sourceToolName: "read_file",
    issuedAt: "2026-09-23T00:00:00Z",
    ...overrides,
  };
}

describe("host-readable exact files", () => {
  it("lets reads of a listed file skip the scope approval while its siblings, writes and directory still ask", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "actspace-host-readable-")));
    try {
      const records = join(root, "records");
      await mkdir(records);
      const listed = join(records, "rollout.jsonl");
      const sibling = join(records, "other.jsonl");
      await writeFile(listed, "{}\n");
      await writeFile(sibling, "{}\n");
      const files = new HostReadableFiles();
      files.add(listed);
      files.add(join(root, "dir-only"));
      const has = (path: string) => files.has(path);
      expect(evaluateGlobalBoundary("default", "/workspace", [file(listed)], has)).toEqual({ kind: "pass" });
      expect(evaluateGlobalBoundary("default", "/workspace", [file(sibling)], has)).toMatchObject({
        kind: "ask",
        reasons: [{ code: "WORKSPACE_SCOPE_APPROVAL_REQUIRED" }],
      });
      expect(evaluateGlobalBoundary("default", "/workspace", [file(listed, "write")], has)).toMatchObject({
        kind: "ask",
      });
      expect(
        evaluateGlobalBoundary("default", "/workspace", [file(join(root, "dir-only", "inside.txt"))], has),
      ).toMatchObject({ kind: "ask" });
      files.remove(listed);
      expect(evaluateGlobalBoundary("default", "/workspace", [file(listed)], has)).toMatchObject({ kind: "ask" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lets reads and writes inside a Host-writable root pass while deletes, siblings and other temp paths still ask", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "actspace-host-writable-")));
    try {
      const scratch = join(root, "bash-v2", "process");
      await mkdir(scratch, { recursive: true });
      const inside = join(scratch, "scripts", "session", "convert.py");
      const other = join(root, "other", "convert.py");
      const roots = new HostWritableRoots();
      roots.add(scratch);
      const has = (path: string) => roots.has(path);
      expect(evaluateGlobalBoundary("default", "/workspace", [file(inside, "write")], undefined, has)).toEqual({
        kind: "pass",
      });
      expect(evaluateGlobalBoundary("default", "/workspace", [file(inside)], undefined, has)).toEqual({ kind: "pass" });
      expect(evaluateGlobalBoundary("default", "/workspace", [file(inside, "delete")], undefined, has)).toMatchObject({
        kind: "ask",
        reasons: [{ code: "WORKSPACE_SCOPE_APPROVAL_REQUIRED" }],
      });
      expect(evaluateGlobalBoundary("default", "/workspace", [file(other, "write")], undefined, has)).toMatchObject({
        kind: "ask",
        reasons: [{ code: "WORKSPACE_SCOPE_APPROVAL_REQUIRED" }],
      });
      expect(
        evaluateGlobalBoundary(
          "default",
          "/workspace",
          [file(join(root, "bash-v2", "process-other", "x.py"), "write")],
          undefined,
          has,
        ),
      ).toMatchObject({ kind: "ask" });
      roots.remove(scratch);
      expect(evaluateGlobalBoundary("default", "/workspace", [file(inside, "write")], undefined, has)).toMatchObject({
        kind: "ask",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("matches the canonical path when a file was added through a symlinked directory", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "actspace-host-readable-")));
    try {
      const real = join(root, "real");
      await mkdir(real);
      await writeFile(join(real, "a.jsonl"), "");
      await symlink(real, join(root, "link"));
      const files = new HostReadableFiles();
      files.add(join(root, "link", "a.jsonl"));
      expect(files.has(join(real, "a.jsonl"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("isPathWithin", () => {
  it("resolves a symlinked root before comparing, counts the root itself, and compares the candidate as written", async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), "actspace-path-within-")));
    try {
      const real = join(base, "real");
      const link = join(base, "link");
      await mkdir(real);
      await symlink(real, link);
      expect(isPathWithin(link, real)).toBe(true);
      expect(isPathWithin(link, join(real, "..data", "a.txt"))).toBe(true);
      expect(isPathWithin(link, join(base, "real-sibling", "a.txt"))).toBe(false);
      expect(isPathWithin(link, base)).toBe(false);
      // 只有 root 会换成真实路径；candidate 要由调用方先解析好。
      expect(isPathWithin(link, join(link, "a.txt"))).toBe(false);
      // root 不存在时两边都按字面比较。
      expect(isPathWithin(join(base, "missing"), join(base, "missing", "a.txt"))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
