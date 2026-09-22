// @vitest-environment node
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createNodeCoreToolPorts } from "@actspace/tools-core-tools";
import { runToolStreamFixture } from "@actspace/core-agent-loop/testing";
import { DesktopArtifactStore } from "../runtime-v2/artifact-store";
import type { ToolExecutionContext } from "@actspace/tools-runtime";
import type { LlmMessage } from "@actspace/llm-service";

it("runs large Bash output through storage, the next request, and paginated read/search", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "actspace-output-flow-")));
  const workspaceRoot = join(root, "workspace"); await mkdir(workspaceRoot);
  const store = new DesktopArtifactStore(join(root, "data"));
  const sessionId = "output-flow";
  const resolveArtifact = (session: string, id: string) => store.resolveForSession(session, id);
  const ports = createNodeCoreToolPorts({ workspaceRoot, tmpRoot: join(root, "tmp"), sandboxBash: false, resolveArtifact });
  const context: ToolExecutionContext = {
    sessionId, workspaceRoot, callId: "read-1", agentRunId: "run", turnId: "turn", stepId: "step", name: "bash", pluginId: "core",
    signal: new AbortController().signal, capabilities: { ids: [], has: () => false, get: () => { throw new Error("unused"); } },
    reportProgress: () => {}, defer: () => {},
    createArtifact: (input) => store.create({ ...input, owner: { sessionId, callId: "read-1", pluginId: "core", name: "bash" } }),
  };
  try {
    const body = await ports.bash!({ command: "for ((i=1;i<=3000;i++)); do printf 'line-%s needle\\n' \"$i\"; done", intent: "output regression", blockMs: 1000 }, context);
    expect(body.status).toBe("completed");
    expect(body.artifacts?.[0].mediaType).toBe("text/plain");
    const requests: (readonly LlmMessage[])[] = [];
    const run = await runToolStreamFixture({ sessionId, resolveArtifact, execute: async () => body, onMessages: (messages) => requests.push(messages) });
    const file = await store.resolveForSession(sessionId, body.artifacts![0].artifactId);
    const nextInput = JSON.stringify(requests[1]);
    expect(nextInput).toContain(file.path);
    expect(nextInput).not.toContain('"type":"image"');
    expect(nextInput).not.toContain("line-3000");
    const snapshot = run.journal.filter((event) => event.type === "request/context").at(-1)!;
    expect(JSON.stringify(snapshot.data)).toContain(file.path);
    const page = await ports.read_file!({ path: file.path, offset: 2999, limit: 2 }, context);
    expect(page.status).toBe("completed");
    expect(JSON.stringify(page)).toContain("3000|line-3000 needle");
    const search = await ports.grep!({ path: file.path, pattern: "line-3000" }, context);
    expect(search.status).toBe("completed");
    expect(JSON.stringify(search)).toContain("line-3000");
    const denied = await ports.read_file!({ path: file.path }, { ...context, sessionId: "other" });
    expect(denied.status).toBe("failed");
  } finally { await ports.dispose?.(); await rm(root, { recursive: true, force: true }); }
});
