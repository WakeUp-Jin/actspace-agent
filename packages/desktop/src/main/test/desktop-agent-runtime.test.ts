// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  desktopRootsFromRuntimeRequest,
  toDesktopRuntimeRequest,
} from "../desktop-agent-runtime";
import type { AppDataRoots } from "../agent-turn";

describe("Desktop Agent Runtime Adapter", () => {
  it("maps Electron data roots and preserves the shared turn contract", () => {
    const roots: AppDataRoots = {
      dataRoot: "/data",
      sessionRoot: "/data/sessions",
      logRoot: "/logs",
      tmpRoot: "/data/tmp",
      defaultWorkspaceRoot: "/workspace/default",
      workspaceRoot: "/workspace/current",
    };

    const request = toDesktopRuntimeRequest({
      sessionId: "session-1",
      turnId: "turn-1",
      userInput: "hello",
      mode: "plan",
      selectedSkills: ["llm-agent-dev"],
    }, roots);

    expect(request).toMatchObject({
      sessionId: "session-1",
      turnId: "turn-1",
      userInput: "hello",
      mode: "plan",
      selectedSkills: ["llm-agent-dev"],
      persistenceMode: "persistent",
      interactionMode: "desktop",
      workspaceRoot: "/workspace/current",
      roots: {
        dataRoot: "/data",
        sessionRoot: "/data/sessions",
        logRoot: "/logs",
        tmpRoot: "/data/tmp",
        defaultWorkspaceRoot: "/workspace/default",
      },
    });

    expect(desktopRootsFromRuntimeRequest(request)).toEqual(roots);
  });

  it("derives workspace preparation roots from each turn request", () => {
    const first = toDesktopRuntimeRequest({
      sessionId: "session-1",
      turnId: "turn-1",
      userInput: "first",
    }, {
      dataRoot: "/data",
      sessionRoot: "/data/sessions",
      logRoot: "/logs",
      tmpRoot: "/data/tmp",
      defaultWorkspaceRoot: "/workspace/default",
      workspaceRoot: "/workspace/first",
    });
    const second = {
      ...first,
      sessionId: "session-2",
      turnId: "turn-2",
      workspaceRoot: "/workspace/second",
    };

    expect(desktopRootsFromRuntimeRequest(first).workspaceRoot).toBe("/workspace/first");
    expect(desktopRootsFromRuntimeRequest(second).workspaceRoot).toBe("/workspace/second");
  });
});
