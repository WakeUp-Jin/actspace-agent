import { describe, expect, it } from "vitest";
import type { SessionGrant } from "@actspace/shared/runtime-v2";
import { classifyFileResource, combinePermissionDecisions, evaluateGlobalBoundary, sessionGrantsCoverResources } from "../permission/index.js";

const file = (canonicalPath: string, access: "read" | "write" | "delete" = "read") => ({
  kind: "file" as const,
  access,
  canonicalPath,
  targetKind: "file" as const,
});

describe("permission engine", () => {
  it("orders decisions monotonically as deny over ask over allow", () => {
    expect(combinePermissionDecisions(
      { kind: "deny", code: "GLOBAL_DENY", reason: "blocked" },
      { kind: "ask", reason: "tool asks", risk: "medium" },
    )).toMatchObject({ kind: "deny", code: "GLOBAL_DENY" });
    expect(combinePermissionDecisions(
      { kind: "ask", reasons: [{ code: "GLOBAL_ASK", message: "scope", risk: "medium", reusable: true }] },
      { kind: "allow" },
    )).toMatchObject({ kind: "ask" });
    expect(combinePermissionDecisions({ kind: "pass" }, { kind: "allow" })).toEqual({ kind: "allow" });
  });

  it("asks outside the workspace only in default mode", () => {
    expect(evaluateGlobalBoundary("default", "/workspace", [file("/outside/file.txt")])).toMatchObject({ kind: "ask" });
    expect(evaluateGlobalBoundary("full-access", "/workspace", [file("/outside/file.txt")])).toEqual({ kind: "pass" });
  });

  it("keeps sensitive files once-only and protected resources denied in every mode", () => {
    expect(evaluateGlobalBoundary("full-access", "/workspace", [file("/outside/.env")])).toMatchObject({
      kind: "ask",
      reasons: [{ code: "SENSITIVE_FILE_APPROVAL_REQUIRED" }],
    });
    expect(evaluateGlobalBoundary("full-access", "/workspace", [file("/workspace/.git/config", "write")])).toMatchObject({
      kind: "deny",
      code: "GIT_METADATA_DENIED",
    });
    expect(classifyFileResource(file("/Users/example/.ssh/id_ed25519"))).toMatchObject({ kind: "protected", code: "CREDENTIAL_FILE_DENIED" });
  });

  it("matches exact and subtree grants without crossing path segments", () => {
    const context = { sessionId: "s1", agentId: "main:s1", audience: { pluginId: "core", permissionDomain: "core-files", policyVersion: 1 } } as const;
    expect(sessionGrantsCoverResources([grant({ selector: { kind: "exact", canonicalPath: "/outside/a.txt" } })], [file("/outside/a.txt")], context)).toBe(true);
    expect(sessionGrantsCoverResources([grant({ selector: { kind: "subtree", canonicalRoot: "/outside/project" } })], [file("/outside/project/src/a.ts")], context)).toBe(true);
    expect(sessionGrantsCoverResources([grant({ selector: { kind: "subtree", canonicalRoot: "/outside/project" } })], [file("/outside/project-other/a.ts")], context)).toBe(false);
  });

  it("requires complete resource coverage and exact subject, audience, access and expiry", () => {
    const context = { sessionId: "s1", agentId: "main:s1", audience: { pluginId: "core", permissionDomain: "core-files", policyVersion: 1 }, now: Date.parse("2026-09-24T00:00:00Z") } as const;
    const valid = grant({ selector: { kind: "subtree", canonicalRoot: "/outside/project" } });
    expect(sessionGrantsCoverResources([valid], [file("/outside/project/a"), file("/outside/project/b")], context)).toBe(true);
    expect(sessionGrantsCoverResources([valid], [file("/outside/project/a"), file("/other/b")], context)).toBe(false);
    expect(sessionGrantsCoverResources([{ ...valid, access: "write", action: "file.write" }], [file("/outside/project/a")], context)).toBe(false);
    expect(sessionGrantsCoverResources([{ ...valid, sessionId: "s2" }], [file("/outside/project/a")], context)).toBe(false);
    expect(sessionGrantsCoverResources([{ ...valid, agentId: "subagent:1" }], [file("/outside/project/a")], context)).toBe(false);
    expect(sessionGrantsCoverResources([{ ...valid, audience: { ...valid.audience, policyVersion: 2 } }], [file("/outside/project/a")], context)).toBe(false);
    expect(sessionGrantsCoverResources([{ ...valid, expiresAt: "2026-09-23T00:00:00Z" }], [file("/outside/project/a")], context)).toBe(false);
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
