import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { describe, expect, it, vi } from "vitest";
import { createSessionRecord } from "../../persistence";
import { createAgentHostRuntime } from "../agent-runtime";
import {
  HOST_FIXTURE_PROFILES,
  createHostFixtureDeps,
  createHostFixtureRequest,
  createHostFixtureResult,
  eventTypes,
} from "./fixtures";

describe("Agent Runtime host parity", () => {
  it("keeps Context and Harness semantics equal across explicit host profiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-host-parity-"));
    const observations = [] as Array<{
      profile: string;
      mode: string | undefined;
      selectedSkills: string[] | undefined;
      includeUserEvent: boolean | undefined;
      emitTerminalEvent: boolean | undefined;
    }>;

    for (const profile of HOST_FIXTURE_PROFILES) {
      const request = createHostFixtureRequest(root, profile);
      if (profile.persistenceMode === "persistent") {
        const record = await createSessionRecord(request.roots.sessionRoot, { workspaceRoot: request.workspaceRoot });
        request.sessionId = record.meta.id;
      }
      const runtime = createAgentHostRuntime({
        contextProvider: {
          load: async (loadedRequest) => {
            observations.push({
              profile: profile.name,
              mode: loadedRequest.mode,
              selectedSkills: loadedRequest.selectedSkills,
              includeUserEvent: undefined,
              emitTerminalEvent: undefined,
            });
            return {
              systemPrompt: "same prompt",
              systemPromptSegments: [{
                id: "same-rules",
                title: "Rules",
                content: "same",
                bucket: "rules",
                priority: 1,
              }],
            };
          },
        },
        modelResolver: { resolveConfig: () => ({}) as never },
        eventSink: { emit: () => {} },
        approvalBroker: {
          waitForDecision: async (approval) => ({
            requestId: approval.id,
            decision: profile.name === "cli-headless" ? "abort" : "approve_once",
            decidedAt: 0,
          }),
        },
        createDependencies: async () => createHostFixtureDeps(),
        runHarness: vi.fn(async (_input, _deps, harnessOptions) => {
          const observation = observations.at(-1)!;
          observation.includeUserEvent = harnessOptions?.includeUserEvent;
          observation.emitTerminalEvent = harnessOptions?.emitTerminalEvent;
          return createHostFixtureResult(request);
        }),
        harnessObserver: { createCacheAudit: () => undefined },
      });
      await runtime.runTurn(request);
      await runtime.dispose();
    }

    expect(observations.map(({ profile, ...observation }) => observation)).toEqual([
      { mode: "agent", selectedSkills: [], includeUserEvent: false, emitTerminalEvent: false },
      { mode: "agent", selectedSkills: [], includeUserEvent: true, emitTerminalEvent: false },
      { mode: "agent", selectedSkills: [], includeUserEvent: false, emitTerminalEvent: false },
    ]);
  });

  it.each([
    ["completed", ["turn_started", "turn_finished"]],
    ["failed", ["turn_started", "turn_failed"]],
    ["aborted", ["turn_started", "turn_aborted"]],
  ] as const)("keeps %s terminal ordering stable", async (status, expected) => {
    const root = await mkdtemp(join(tmpdir(), "actspace-host-events-"));
    const profile = HOST_FIXTURE_PROFILES[1];
    const request = createHostFixtureRequest(root, profile);
    const events: RuntimeStreamEvent[] = [];
    const runtime = createAgentHostRuntime({
      contextProvider: { load: async () => ({ systemPrompt: "same" }) },
      modelResolver: { resolveConfig: () => ({}) as never },
      eventSink: { emit: (event) => { events.push(event); } },
      createDependencies: async () => createHostFixtureDeps(),
      runHarness: async () => createHostFixtureResult(request, status),
      harnessObserver: { createCacheAudit: () => undefined },
    });

    await runtime.runTurn(request);
    expect(eventTypes(events)).toEqual(expected);
  });
});
