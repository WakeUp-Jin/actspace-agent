import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolBodyResult } from "@actspace/tools-runtime";
import { createNodeToolPorts as createReadPorts, type NodeToolPortsOptions } from "@actspace/tools-filesystem-read";
import { createNodeToolPorts as createSearchPorts } from "@actspace/tools-filesystem-search";
import { createNodeToolPorts as createWritePorts } from "@actspace/tools-filesystem-write";
function createTestToolPorts(options: NodeToolPortsOptions) { return { ...createReadPorts(options), ...createSearchPorts(options), ...createWritePorts(options) }; }


const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "actspace-v2-node-tools-")); roots.push(root); return root; }
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "test.integration", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

it("reads and searches only a Session-owned full-output file outside the workspace", async () => {
  const root = await workspace(); const managed = await workspace();
  const artifactId = "12345678-1234-1234-1234-123456789abc";
  const path = join(managed, artifactId);
  await writeFile(path, "one\nneedle\nthree\n");
  const ports = createTestToolPorts({ workspaceRoot: root, resolveArtifact: async (sessionId, id) => {
    if (sessionId !== "owner" || id !== artifactId) throw new Error("Artifact does not belong to this Session.");
    return { path: await import("node:fs/promises").then((fs) => fs.realpath(path)), mediaType: "text/plain" };
  } });
  expect(await invoke(ports.read_file, { path, offset: 2, limit: 1 }, "owner")).toMatchObject({ status: "completed" });
  expect(JSON.stringify(await invoke(ports.read_file, { path, offset: 2, limit: 1, force: true }, "owner"))).toContain("2|needle");
  expect(JSON.stringify(await invoke(ports.grep, { path, pattern: "needle" }, "owner"))).toContain("needle");
  expect(await invoke(ports.read_file, { path }, "other")).toMatchObject({ status: "failed" });
  expect(await invoke(ports.grep, { path, pattern: "needle" }, "other")).toMatchObject({ status: "failed" });
  expect(await invoke(ports.write_file, { path, content: "overwrite" }, "owner")).toMatchObject({ status: "failed" });
  await writeFile(path, "padding\n".repeat(150_000) + "large-output-needle\n");
  const large = await invoke(ports.grep, { path, pattern: "large-output-needle" }, "owner");
  expect(large.status).toBe("completed");
  expect(JSON.stringify(large)).toContain("large-output-needle");
});

describe("file boundaries across plugins", () => {
  it("rejects lexical and symlink workspace escapes", async () => {
    const root = await workspace(); const outside = await workspace(); await writeFile(join(outside, "secret.txt"), "secret"); await symlink(outside, join(root, "escape"));
    const ports = createTestToolPorts({ workspaceRoot: root });
    await expect(invoke(ports.read_file, { path: "../secret.txt" })).resolves.toMatchObject({ status: "failed" });
    await expect(invoke(ports.read_file, { path: "escape/secret.txt" })).resolves.toMatchObject({ status: "failed" });
    await expect(invoke(ports.write_file, { path: "escape/new.txt", content: "no" })).resolves.toMatchObject({ status: "failed" });
  });
});
