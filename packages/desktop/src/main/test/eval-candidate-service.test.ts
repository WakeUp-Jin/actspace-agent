import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendEvents,
  createMeta,
  createPersistedSessionEvent,
  createSessionStorePaths,
  ensureSessionStore,
  readSessionRecord,
} from "@actspace/agent-core";
import { generateEvalCandidate } from "../eval-candidate-service";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeRoots() {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-eval-candidate-"));
  created.push(dataRoot);
  const roots = {
    dataRoot,
    sessionRoot: join(dataRoot, "sessions"),
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: join(dataRoot, "workspace"),
    workspaceRoot: join(dataRoot, "workspace"),
  };
  await mkdir(roots.defaultWorkspaceRoot, { recursive: true });
  return roots;
}

describe("eval candidate service", () => {
  it("generates a candidate for the latest normal user turn and persists a status event", async () => {
    const roots = await makeRoots();
    const sessionId = "session-eval";
    const paths = await ensureSessionStore(join(roots.sessionRoot, sessionId));
    await createMeta(paths.metaPath, sessionId, "Eval session", { workspaceRoot: roots.defaultWorkspaceRoot });
    await appendEvents(paths.sessionPath, [
      createPersistedSessionEvent(sessionId, "turn-user", "user_message", { content: "Fix login" }),
      createPersistedSessionEvent(sessionId, "turn-user", "assistant_message", {
        content: "Done",
        stopReason: "stop",
        model: "mock",
        provider: "mock",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, currency: "USD" } },
      }),
    ]);

    const result = await generateEvalCandidate(
      {
        sessionId,
        agentRunId: "turn-eval-command",
        reason: "No test was added",
      },
      roots,
      async ({ candidateRoot }) => {
        await writeFile(join(candidateRoot, "case.json"), JSON.stringify({
          schemaVersion: 2,
          id: "regression.login-test",
          project: "login",
          category: "coding-regression",
          source: { kind: "regression-derived" },
          input: "Fix login and add a test",
          runtime: { permissionMode: "yolo", isolation: "docker", network: "deny" },
          workspace: { fixture: "fixture" },
          expect: {},
          graders: ["judge-final-response"],
        }));
        await writeFile(join(candidateRoot, "fixture", "README.md"), "fixture\n");
        return { modelId: "mock-model", finalText: "generated" };
      },
    );

    expect(result.status).toBe("generated");
    expect(result.targetAgentRunId).toBe("turn-user");
    expect(result.candidatePath).toContain(join("eval-candidates", "failure-"));
    const metadata = JSON.parse(await readFile(join(result.candidatePath!, "candidate.json"), "utf8"));
    expect(metadata).toMatchObject({
      status: "generated",
      source: {
        sessionId,
        agentRunId: "turn-user",
        userInput: "Fix login",
        failureReason: "No test was added",
      },
      generator: { modelId: "mock-model" },
    });

    const restored = await readSessionRecord(createSessionStorePaths(join(roots.sessionRoot, sessionId)));
    expect(restored?.events.at(-1)).toMatchObject({
      agentRunId: "turn-eval-command",
      type: "eval_candidate",
      payload: { status: "generated" },
    });
  });

  it("returns a persisted failure when the session has no user turn", async () => {
    const roots = await makeRoots();
    const sessionId = "session-empty";
    const paths = await ensureSessionStore(join(roots.sessionRoot, sessionId));
    await createMeta(paths.metaPath, sessionId, "Empty session", { workspaceRoot: roots.defaultWorkspaceRoot });

    const result = await generateEvalCandidate(
      { sessionId, agentRunId: "turn-eval-command" },
      roots,
      async () => {
        throw new Error("should not run");
      },
    );

    expect(result).toMatchObject({
      status: "failed",
      error: { code: "EVAL_CANDIDATE_GENERATION_FAILED" },
    });
  });
});
