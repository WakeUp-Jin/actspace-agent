import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeV2JsonValue } from "@actspace/shared/runtime-v2";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { ToolBodyResult } from "@actspace/tools-runtime";
import { getBashHardRejectReason } from "../bash/command-rules.js";
import { createNodeCoreToolPorts } from "../node-ports.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "actspace-v2-node-tools-")); roots.push(root); return root; }
function context(sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = ""): ToolExecutionContext { return { pluginId: "actspace.core-tools", name: "test", callId: "call", sessionId, workspaceRoot, agentRunId: "run", turnId: "turn", stepId: "step", signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("missing"); } }, reportProgress: () => undefined, createArtifact: async ({ bytes, mediaType }) => ({ artifactId: "artifact", mediaType, size: bytes.byteLength, sha256: "sha" }), defer: () => undefined, ...(notifyAgent === undefined ? {} : { notifyAgent }) }; }
async function invoke(handler: ((args: Readonly<Record<string, RuntimeV2JsonValue>>, context: ToolExecutionContext) => Promise<ToolBodyResult>) | undefined, args: Readonly<Record<string, RuntimeV2JsonValue>>, sessionId = "session", notifyAgent?: (content: RuntimeV2JsonValue) => Promise<void>, workspaceRoot = "") { if (!handler) throw new Error("handler unavailable"); return handler(args, context(sessionId, notifyAgent, workspaceRoot)); }

it("reads and searches only a Session-owned full-output file outside the workspace", async () => {
  const root = await workspace(); const managed = await workspace();
  const artifactId = "12345678-1234-1234-1234-123456789abc";
  const path = join(managed, artifactId);
  await writeFile(path, "one\nneedle\nthree\n");
  const ports = createNodeCoreToolPorts({ workspaceRoot: root, resolveArtifact: async (sessionId, id) => {
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

describe("native v2 Core Tool ports", () => {
  it("reads numbered ranges, caches unchanged reads and lists deterministically", async () => {
    const root = await workspace(); await mkdir(join(root, "src")); await writeFile(join(root, "src", "b.txt"), "one\ntwo\nthree\n"); await writeFile(join(root, "src", "a.txt"), "alpha\n");
    const ports = createNodeCoreToolPorts({ workspaceRoot: root });
    const first = await invoke(ports.read_file, { path: "src/b.txt", offset: 2, limit: 1 });
    expect(first).toMatchObject({ status: "completed" }); expect(JSON.stringify(first)).toContain("     2|two");
    const second = await invoke(ports.read_file, { path: "src/b.txt", offset: 2, limit: 1 }); expect(JSON.stringify(second)).toContain("File unchanged");
    const listed = await invoke(ports.list_directory, { path: "src" }); const text = JSON.stringify(listed); expect(text.indexOf("a.txt")).toBeLessThan(text.indexOf("b.txt"));
  });

  it("writes atomically, edits a unique match and deletes only regular workspace files", async () => {
    const root = await workspace(); const ports = createNodeCoreToolPorts({ workspaceRoot: root });
    await expect(invoke(ports.write_file, { path: "nested/file.txt", content: "old\nkeep\n" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.edit_file, { path: "nested/file.txt", old_string: "old", new_string: "new" })).resolves.toMatchObject({ status: "completed" });
    expect(await readFile(join(root, "nested/file.txt"), "utf8")).toBe("new\nkeep\n");
    await expect(invoke(ports.delete_file, { path: "nested/file.txt" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.delete_file, { path: "nested" })).resolves.toMatchObject({ status: "failed", failure: { code: "NOT_A_FILE" } });
  });

  it("rejects lexical and symlink workspace escapes", async () => {
    const root = await workspace(); const outside = await workspace(); await writeFile(join(outside, "secret.txt"), "secret"); await symlink(outside, join(root, "escape"));
    const ports = createNodeCoreToolPorts({ workspaceRoot: root });
    await expect(invoke(ports.read_file, { path: "../secret.txt" })).resolves.toMatchObject({ status: "failed" });
    await expect(invoke(ports.read_file, { path: "escape/secret.txt" })).resolves.toMatchObject({ status: "failed" });
    await expect(invoke(ports.write_file, { path: "escape/new.txt", content: "no" })).resolves.toMatchObject({ status: "failed" });
  });

  it("uses the immutable Session workspace for every file operation", async () => {
    const defaultRoot = await workspace();
    const sessionRoot = await workspace();
    await writeFile(join(defaultRoot, "value.txt"), "default");
    await writeFile(join(sessionRoot, "value.txt"), "session");
    const ports = createNodeCoreToolPorts({ workspaceRoot: defaultRoot });
    const result = await invoke(ports.read_file, { path: "value.txt" }, "session", undefined, sessionRoot);
    expect(JSON.stringify(result)).toContain("session");
    expect(JSON.stringify(result)).not.toContain("default");
  });

  it("searches and globs with bounded, workspace-relative output", async () => {
    const root = await workspace(); await mkdir(join(root, "src")); await writeFile(join(root, "src", "old.ts"), "export const value = 'needle';\n"); await writeFile(join(root, "src", "new.ts"), "export const next = 'needle';\n"); await utimes(join(root, "src", "old.ts"), new Date("2024-01-01"), new Date("2024-01-01")); await utimes(join(root, "src", "new.ts"), new Date("2025-01-01"), new Date("2025-01-01"));
    const ports = createNodeCoreToolPorts({ workspaceRoot: root });
    const grep = await invoke(ports.grep, { pattern: "needle", path: "src", glob: "*.ts" }); expect(JSON.stringify(grep)).toContain("src/old.ts:1:");
    const glob = await invoke(ports.glob, { pattern: "*.ts", path: "src" }); const text = JSON.stringify(glob); expect(text.indexOf("src/new.ts")).toBeLessThan(text.indexOf("src/old.ts"));
  });

  it("runs foreground Bash, streams background output and isolates tasks by Session", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeCoreToolPorts({ workspaceRoot: root, tmpRoot, sandboxBash: false });
    const foreground = await invoke(ports.bash, { command: "printf hello", intent: "verify output", blockMs: 5_000 });
    expect(foreground).toMatchObject({ status: "completed" }); expect(JSON.stringify(foreground)).toContain("hello");
    const background = await invoke(ports.bash, { command: "printf ready; sleep 30", intent: "verify background", blockMs: 0 });
    const taskId = JSON.stringify(background).match(/bash_[0-9a-f-]+/)?.[0]; expect(taskId).toBeTruthy();
    expect(background.detail).toEqual([{ label: "background-task", value: { taskId, status: "running" } }]);
    await new Promise((resolveWait) => setTimeout(resolveWait, 30));
    const output = await invoke(ports.bash_output, { taskId: taskId! }); expect(JSON.stringify(output)).toContain("ready");
    await expect(invoke(ports.bash_output, { taskId: taskId! }, "other-session")).resolves.toMatchObject({ status: "failed", failure: { code: "BASH_TASK_NOT_FOUND" } });
    await ports.dispose?.();
    await expect(invoke(ports.bash_output, { taskId: taskId! })).resolves.toMatchObject({ status: "failed" });
  });

  it("keeps large foreground Bash output out of the model surface and exposes an artifact", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeCoreToolPorts({ workspaceRoot: root, tmpRoot, sandboxBash: false });
    const result = await invoke(ports.bash, { command: "node -e \"process.stdout.write('x'.repeat(9000))\"", intent: "verify bounded output", blockMs: 5_000 });
    expect(result).toMatchObject({ status: "completed", artifacts: [{ artifactId: "artifact", mediaType: "text/plain" }] });
    expect(JSON.stringify(result.modelOutput).length).toBeLessThan(10_000);
    await ports.dispose?.();
  });

  it("validates Bash output subscriptions before spawn and drains durable notifications on dispose", async () => {
    const root = await workspace(); const tmpRoot = await workspace(); const ports = createNodeCoreToolPorts({ workspaceRoot: root, tmpRoot, sandboxBash: false });
    await expect(invoke(ports.bash, { command: "printf invalid > should-not-exist", intent: "must not start", blockMs: 0, notifyOnOutput: { pattern: "[", reason: "invalid regex" } })).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS" } });
    await expect(readFile(join(root, "should-not-exist"), "utf8")).rejects.toThrow();

    const notifications: RuntimeV2JsonValue[] = [];
    const notifyAgent = async (content: RuntimeV2JsonValue) => { await new Promise((resolveWait) => setTimeout(resolveWait, 10)); notifications.push(content); };
    const background = await invoke(ports.bash, { command: "printf 'READY token-abcdefgh\\n'; sleep 30", intent: "verify notifications", blockMs: 0, notifyOnOutput: { pattern: "READY", reason: "service ready", debounceMs: 5_000 } }, "session", notifyAgent);
    expect(JSON.stringify(background)).toContain("bash_");
    await waitFor(() => notifications.some((item) => String(item).includes("output_match")));
    expect(JSON.stringify(notifications)).toContain("[REDACTED]");
    expect(JSON.stringify(notifications)).not.toContain("token-abcdefgh");

    await ports.dispose?.();
    expect(notifications.some((item) => String(item).includes("<status>killed</status>"))).toBe(true);
  });

  it("hard-rejects broad deletion and repository metadata targets before execution", async () => {
    const root = await workspace();
    expect(getBashHardRejectReason("rm -rf /", root, root)).toContain("dangerous delete");
    expect(getBashHardRejectReason("rm -rf .git", root, root)).toContain("repository metadata");
    expect(getBashHardRejectReason("printf ok", root, root)).toBeUndefined();
  });

  it("searches through Host-injected credentials without exposing the key", async () => {
    const root = await workspace(); const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers); calls.push({ url: String(input), authorization: headers.get("authorization") });
      return new Response(JSON.stringify({ results: [{ title: "Result", url: "https://example.com/page", content: "Useful result" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const ports = createNodeCoreToolPorts({ workspaceRoot: root, searchCredentials: { tavily: "secret-search-key" }, fetchImpl });
    const result = await invoke(ports.web_search, { query: "ActSpace", max_results: 3 });
    expect(result).toMatchObject({ status: "completed" });
    expect(JSON.stringify(result)).toContain("https://example.com/page");
    expect(JSON.stringify(result)).not.toContain("secret-search-key");
    expect(calls).toEqual([{ url: "https://api.tavily.com/search", authorization: "Bearer secret-search-key" }]);
  });

  it("routes the Chat web facade to search and open while rejecting unknown actions", async () => {
    const root = await workspace();
    const fetchImpl = (async (input: string | URL | Request) => String(input).includes("api.tavily.com")
      ? new Response(JSON.stringify({ results: [{ title: "Result", url: "https://example.com/page", content: "Useful result" }] }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response("public body", { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch;
    const ports = createNodeCoreToolPorts({ workspaceRoot: root, searchCredentials: { tavily: "key" }, fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    await expect(invoke(ports.web, { action: "search", query: "ActSpace" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.web, { action: "open", url: "https://example.com/page" })).resolves.toMatchObject({ status: "completed" });
    await expect(invoke(ports.web, { action: "invalid" })).resolves.toMatchObject({ status: "failed", failure: { code: "INVALID_ARGUMENTS", retryable: false } });
  });

  it("blocks private Web fetch targets and revalidates every redirect", async () => {
    const root = await workspace(); let requests = 0;
    const fetchImpl = (async () => { requests += 1; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }); }) as typeof fetch;
    const ports = createNodeCoreToolPorts({ workspaceRoot: root, fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    await expect(invoke(ports.web_fetch, { url: "http://127.0.0.1/secret" })).resolves.toMatchObject({ status: "failed", failure: { code: "WEB_FETCH_FAILED" } });
    expect(requests).toBe(0);
    await expect(invoke(ports.web_fetch, { url: "https://example.com/start" })).resolves.toMatchObject({ status: "failed", failure: { code: "WEB_FETCH_FAILED" } });
    expect(requests).toBe(1);
  });

  it("fetches bounded public text and serves the second read from its local cache", async () => {
    const root = await workspace(); let requests = 0;
    const fetchImpl = (async () => { requests += 1; return new Response("public body", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } }); }) as typeof fetch;
    const ports = createNodeCoreToolPorts({ workspaceRoot: root, fetchImpl, resolveHostname: async () => ["93.184.216.34"] });
    const first = await invoke(ports.web_fetch, { url: "https://example.com/read" }); expect(JSON.stringify(first)).toContain("public body");
    const second = await invoke(ports.web_fetch, { url: "https://example.com/read" }); expect(second).toMatchObject({ status: "completed" });
    expect(requests).toBe(1);
  });

  it("generates image artifacts from Host-injected credentials without exposing the key", async () => {
    const root = await workspace(); const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]); let authorization = "";
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const ports = createNodeCoreToolPorts({ workspaceRoot: root, imageGeneration: { apiKey: "secret-image-key", baseUrl: "https://images.example/v1", model: "image-v1" }, fetchImpl });
    const result = await invoke(ports.generate_image, { prompt: "A precise test image", size: "1024x1024", n: 1 });
    expect(result).toMatchObject({ status: "completed", artifacts: [{ artifactId: "artifact", mediaType: "image/png" }] });
    expect(authorization).toBe("Bearer secret-image-key");
    expect(JSON.stringify(result)).not.toContain("secret-image-key");
  });

  it("normalizes an HTML image-provider response instead of leaking a JSON parser error", async () => {
    const root = await workspace();
    const fetchImpl = (async () => new Response("<!doctype html><html><body>Gateway error</body></html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
    const ports = createNodeCoreToolPorts({ workspaceRoot: root, imageGeneration: { apiKey: "secret-image-key", baseUrl: "https://images.example/v1", model: "image-v1" }, fetchImpl });
    const result = await invoke(ports.generate_image, { prompt: "A precise test image", size: "1024x1024", n: 1 });
    expect(result).toMatchObject({ status: "failed", failure: { code: "IMAGE_GENERATION_INVALID_RESPONSE" } });
    expect(JSON.stringify(result)).toContain("returned HTML instead of JSON");
    expect(JSON.stringify(result)).not.toContain("<!doctype");
  });

  it("inspects only a Session-bound image artifact", async () => {
    const root = await workspace(); const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]); const reads: string[] = []; const inspections: string[] = [];
    const ports = createNodeCoreToolPorts({
      workspaceRoot: root,
      readArtifact: async (sessionId, artifactId) => { reads.push(`${sessionId}:${artifactId}`); if (sessionId !== "owner") throw new Error("wrong Session"); return { bytes: png, mediaType: "image/png" }; },
      inspectImage: async ({ sessionId, artifactId, question }) => { inspections.push(`${sessionId}:${artifactId}:${question}`); return "The image is valid."; },
    });
    const result = await invoke(ports.inspect_image, { artifact_id: "artifact-1", question: "What is visible?" }, "owner");
    expect(result).toMatchObject({ status: "completed" });
    expect(reads).toEqual(["owner:artifact-1"]);
    expect(inspections).toEqual(["owner:artifact-1:What is visible?"]);
    await expect(invoke(ports.inspect_image, { artifact_id: "artifact-1", question: "Read it" }, "other")).resolves.toMatchObject({ status: "failed", failure: { code: "IMAGE_INSPECTION_FAILED" } });
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for asynchronous notification.");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}
