import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvents,
  createMeta,
  createSessionStorePaths,
  writeContextState,
} from "@actspace/agent-core";
import type {
  ContextState,
  ContextUsageSnapshot,
  LlmUsagePayload,
  SessionEvent,
} from "@actspace/shared";
import { getSessionPreview } from "../session-preview-service";
import type { AppDataRoots } from "../agent-run";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoots(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-session-preview-"));
  created.push(dataRoot);
  const sessionRoot = join(dataRoot, "sessions");
  await mkdir(sessionRoot, { recursive: true });
  return {
    dataRoot,
    sessionRoot,
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: join(dataRoot, "Downloads"),
    workspaceRoot: dataRoot,
  };
}

function makeEvent<TPayload>(
  sessionId: string,
  type: SessionEvent<TPayload>["type"],
  payload: TPayload,
  index: number,
): SessionEvent<TPayload> {
  return {
    id: `event-${index}`,
    sessionId,
    agentRunId: "turn-1",
    type,
    timestamp: new Date(2026, 5, 3, 10, index).toISOString(),
    schemaVersion: 2,
    payload,
  };
}

const contextSnapshot: ContextUsageSnapshot = {
  totalTokens: 56_000,
  maxTokens: 100_000,
  percentUsed: 56,
  buckets: [
    { key: "conversation", tokens: 56_000 },
  ],
};

describe("getSessionPreview", () => {
  it("returns workspace, latest model, and latest context snapshot for a session", async () => {
    const roots = await makeRoots();
    const sessionId = "session-preview";
    const paths = createSessionStorePaths(join(roots.sessionRoot, sessionId));
    await createMeta(paths.metaPath, sessionId, "Preview", {
      workspaceId: "ws_actspace",
      workspaceRoot: "/Users/me/projects/actspace-agent",
    });
    await appendEvents(paths.sessionPath, [
      makeEvent<LlmUsagePayload>(
        sessionId,
        "llm_usage",
        {
          llmCallId: "call-1",
          attempt: 1,
          durationMs: 12,
          provider: "deepseek",
          model: "deepseek-v4-flash",
          modelId: "deepseek-v4-flash",
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, currency: "CNY" },
        },
        1,
      ),
      makeEvent<LlmUsagePayload>(
        sessionId,
        "llm_usage",
        {
          llmCallId: "call-2",
          attempt: 1,
          durationMs: 18,
          provider: "deepseek",
          model: "deepseek-v4-pro",
          modelId: "deepseek-v4-pro",
          promptTokens: 200,
          completionTokens: 50,
          totalTokens: 250,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, currency: "CNY" },
        },
        2,
      ),
      makeEvent(sessionId, "context_snapshot", contextSnapshot, 3),
    ]);

    await expect(getSessionPreview({ sessionId }, roots)).resolves.toEqual({
      sessionId,
      workspaceId: "ws_actspace",
      workspaceRoot: "/Users/me/projects/actspace-agent",
      model: "deepseek-v4-pro",
      modelId: "deepseek-v4-pro",
      contextSnapshot,
    });
  });

  it("falls back to context-state when no context snapshot event exists", async () => {
    const roots = await makeRoots();
    const sessionId = "session-state-only";
    const paths = createSessionStorePaths(join(roots.sessionRoot, sessionId));
    await createMeta(paths.metaPath, sessionId, "State only");
    const state: ContextState = {
      sessionId,
      updatedAt: new Date().toISOString(),
      estimator: { name: "test-estimator", version: "1" },
      totalEstimatedTokens: 12_345,
      maxTokens: 100_000,
      percentUsed: 12,
      buckets: [{ key: "rules", tokens: 12_345 }],
      entries: [],
    };
    await writeContextState(paths, state);

    const preview = await getSessionPreview({ sessionId }, roots);

    expect(preview).toEqual({
      sessionId,
      workspaceRoot: roots.defaultWorkspaceRoot,
      contextSnapshot: {
        totalTokens: 12_345,
        maxTokens: 100_000,
        percentUsed: 12,
        estimator: state.estimator,
        buckets: state.buckets,
      },
    });
  });

  it("returns null for missing sessions", async () => {
    const roots = await makeRoots();

    await expect(getSessionPreview({ sessionId: "missing" }, roots)).resolves.toBeNull();
  });

  it("returns null for unsafe session ids", async () => {
    const roots = await makeRoots();

    await expect(getSessionPreview({ sessionId: "../session-preview" }, roots)).resolves.toBeNull();
    await expect(getSessionPreview({ sessionId: "nested/session-preview" }, roots)).resolves.toBeNull();
  });
});
