import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RuntimeJsonValue, SessionGrant } from "@actspace/shared/runtime-v2";
import { ToolRuntime, type ApprovalBroker, type ApprovalRequest, type ToolCapabilitySet, type ToolPreparedEnvironment } from "@actspace/tool-runtime";
import { registerTools } from "../plugin.js";

const DOCUMENT_AUDIENCE = "actspace.document\u0000document-read\u00001";
let workspaceRoot = "";
let outsideDir = "";
beforeAll(async () => {
  workspaceRoot = await realpath(await mkdtemp(join(tmpdir(), "doc-perm-ws-")));
  // A subfolder, so the "This directory tree" suggestion is offered.
  outsideDir = join(await realpath(await mkdtemp(join(tmpdir(), "doc-perm-out-"))), "reports");
  await mkdir(outsideDir);
  await writeFile(join(outsideDir, "a.pdf"), "%PDF-1.7\n");
  await writeFile(join(outsideDir, "b.pdf"), "%PDF-1.7\n");
});
afterAll(async () => { await rm(workspaceRoot, { recursive: true, force: true }); });

const capabilitySet: ToolCapabilitySet = { ids: ["filesystem.read", "network"], has: () => true, get: <T>() => ({}) as T };
function environment(options: { broker?: ApprovalBroker; grants: SessionGrant[]; trusted?: ReadonlySet<string> }): ToolPreparedEnvironment {
  return {
    workspaceRoot,
    hostCapabilities: new Set(["filesystem.read", "network"]),
    capabilitySet,
    approvalBroker: options.broker,
    sessionGrantCapability: true,
    sessionGrants: options.grants,
    trustedGrantAudiences: options.trusted ?? new Set([DOCUMENT_AUDIENCE]),
    journal: {
      async recordDispatch() {},
      async recordPermission(type: string, data: Readonly<Record<string, RuntimeJsonValue>>) { if (type === "permission/grant-added") options.grants.push(data as unknown as SessionGrant); },
      async checkpointBeforeBody() {},
      async commitResult() {},
    },
    createArtifact: async () => { throw new Error("unused"); },
  };
}
const call = (callId: string, args: Record<string, string>) => ({ callId, name: "read_document", arguments: args, sessionId: "session-1", agentRunId: "run-1", turnId: "turn-1", stepId: "step-1" }) as const;

function setup() {
  const runtime = new ToolRuntime();
  const execute = vi.fn(async () => ({ status: "completed" as const, summary: "ok", modelOutput: [] }));
  registerTools(runtime, { read_document: execute });
  return { runtime, execute };
}

describe("read_document permissions", () => {
  it("asks for a path outside the workspace with exact and directory suggestions, then reuses the directory grant", async () => {
    const { runtime, execute } = setup();
    const grants: SessionGrant[] = [];
    const requests: ApprovalRequest[] = [];
    const broker: ApprovalBroker = { async requestApproval(request) {
      requests.push(request);
      const subtree = request.grantSuggestions.find(item => item.selector.kind === "subtree")!;
      return { requestId: request.requestId, kind: "session", suggestionId: subtree.suggestionId, decidedAt: new Date().toISOString() };
    } };
    const [first] = await runtime.executeBatch([call("c1", { path: join(outsideDir, "a.pdf") })], environment({ broker, grants }));
    expect(first).toMatchObject({ status: "completed" });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.grantSuggestions.map(item => item.selector)).toEqual([
      { kind: "exact", canonicalPath: join(outsideDir, "a.pdf") },
      { kind: "subtree", canonicalRoot: outsideDir },
    ]);
    const [second] = await runtime.executeBatch([call("c2", { path: join(outsideDir, "b.pdf") })], environment({ broker, grants }));
    expect(second).toMatchObject({ status: "completed" });
    expect(requests).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("does not accept a read_file session grant", async () => {
    const { runtime, execute } = setup();
    const readFileGrant: SessionGrant = {
      schemaVersion: 1, grantId: "fs", sessionId: "session-1", agentId: "main:session-1",
      audience: { pluginId: "actspace.filesystem-read", permissionDomain: "filesystem-read", policyVersion: 1 },
      action: "file.read", access: "read", selector: { kind: "subtree", canonicalRoot: outsideDir },
      sourceRequestId: "r", sourceCallId: "c", sourceToolName: "read_file", issuedAt: new Date().toISOString(),
    };
    const requestApproval = vi.fn<ApprovalBroker["requestApproval"]>(async request => ({ requestId: request.requestId, kind: "deny", code: "user-denied", decidedAt: new Date().toISOString() }));
    const [result] = await runtime.executeBatch([call("c1", { path: join(outsideDir, "a.pdf") })], environment({ broker: { requestApproval }, grants: [readFileGrant], trusted: new Set([DOCUMENT_AUDIENCE, "actspace.filesystem-read\u0000filesystem-read\u00001"]) }));
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "denied" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not ask for an attachment", async () => {
    const { runtime, execute } = setup();
    const requestApproval = vi.fn<ApprovalBroker["requestApproval"]>();
    const [result] = await runtime.executeBatch([call("c1", { artifact_id: "artifact-1" })], environment({ broker: { requestApproval }, grants: [] }));
    expect(result).toMatchObject({ status: "completed" });
    expect(requestApproval).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
