import { describe, expect, it } from "vitest";
import type { SessionGrant } from "@actspace/shared/runtime-v2";
import { sessionGrantsCoverResources } from "../permission/grants.js";
import type { ToolResource } from "../permission/types.js";
const audience = { pluginId: "shell", permissionDomain: "bash", policyVersion: 1 };
const grant: SessionGrant = { schemaVersion: 1, grantId: "g", sessionId: "s", agentId: "a", audience, action: "process.execute", access: "execute", selector: { kind: "command_prefix", prefix: ["pnpm"], cwdRoot: "/work" }, sourceRequestId: "r", sourceCallId: "c", sourceToolName: "bash", issuedAt: "2026-10-11T00:00:00Z" };
const resource: Extract<ToolResource, { kind: "process" }> = { kind: "process", access: "execute", commandDigest: "digest", cwd: "/work/sub", workspaceRoot: "/work", dynamic: false, noSandbox: false, argv: ["pnpm", "test"], grantPrefix: ["pnpm"] };
const context = { sessionId: "s", agentId: "a", audience };
describe("process grant boundaries", () => {
  it("covers only matching resources and principals", () => {
    const covers = (g = grant, r = resource, c = context) => sessionGrantsCoverResources([g], [r], c);
    expect(covers()).toBe(true);
    for (const patch of [{ noSandbox: true }, { noSandbox: undefined }, { dynamic: true }, { argv: ["pnpmx"] }, { grantPrefix: undefined }, { cwd: "/work-other" }, { workspaceRoot: "/work/sub" }]) expect(covers(grant, { ...resource, ...patch })).toBe(false);
    for (const patch of [{ sessionId: "other" }, { agentId: "child" }, { audience: { ...audience, policyVersion: 2 } }, { expiresAt: "2000-01-01T00:00:00Z" }, { action: "file.read" as const }]) expect(covers({ ...grant, ...patch })).toBe(false);
    expect(sessionGrantsCoverResources([grant], [], context)).toBe(false);
  });
});
