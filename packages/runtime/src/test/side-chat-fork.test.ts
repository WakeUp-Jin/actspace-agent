import { SessionStore } from "@actspace/session-persistence";
import { JsonlSessionStorage } from "@actspace/session-jsonl";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createCordisRoot, emitNotification, type CordisContext } from "@actspace/cordis-adapter";
import { PromptExtensionRegistry } from "@actspace/prompt";
import { createCoreCodecRegistry, type SessionEventCandidateV1 } from "@actspace/session-journal";
import type { SessionHandle } from "@actspace/session-persistence";
import { DesktopAppService } from "@actspace/desktop-app";
import { apply as applySideChat, PROMPT_ID } from "@actspace/side-chat";
import { RuntimeSessionController } from "../session/session-controller.js";

const source = { ownerPluginId: "@actspace/core" } as const;
const event = (type: string, data: SessionEventCandidateV1["data"]): SessionEventCandidateV1 => ({ type, eventVersion: 1, source, data, surface: null });

async function turn(session: SessionHandle, turnId: string, finished: boolean): Promise<void> {
  await session.append(event("turn/start", { turnId }));
  await session.append(event("step/start", { turnId, stepId: `${turnId}-s` }));
  await session.append(event("user/message", { messageId: `${turnId}-u`, content: "question" }));
  if (finished) {
    await session.append(event("step/end", { turnId, stepId: `${turnId}-s`, status: "completed" }));
    await session.append(event("turn/end", { turnId, status: "completed" }));
  }
  await session.flush();
}

it("opens a Plan-mode side chat from a running parent and attaches the boundary prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "side-chat-fork-"));
  const cordis = await createCordisRoot();
  const registry = createCoreCodecRegistry();
  const extensions = new PromptExtensionRegistry();
  const sessions = new RuntimeSessionController({
    dataRoot: root, runtimeId: "side-chat-test", registry, profileId: "test", manifestDigest: "test", plugins: [],
    onCreated: (sessionId) => emitNotification(cordis.context, "session/created", { sessionId }),
    onDisposed: (sessionId, outcome) => emitNotification(cordis.context, "session/disposed", { sessionId, outcome }),
  }, new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot: root, runtimeId: "side-chat-test", registry })));
  cordis.context.provide?.("actspace.host.prompt", { workspaceRoot: "/workspace", extensions });
  cordis.context.provide?.("session.runtime", sessions);
  await cordis.mount("side-chat", ({ context }) => { applySideChat(context!); });
  const runs = {
    inspectCapability: (_name: string, inspect: (service: undefined) => unknown) => inspect(undefined),
    configuration: () => ({}),
    service: { exclusive: async (_id: string, operation: () => Promise<unknown>) => operation() },
    isActive: () => false,
    initialize: async () => {},
  };
  const services = new Map<string, unknown>([["session.runtime", sessions], ["session.journal", { registry }], ["agent.runtime", { runs }], ["compaction.runtime", {}], ["llm.service", {}]]);
  const app = new DesktopAppService({ get: (id: string) => services.get(id) } as CordisContext);
  const prompts = (sessionId: string) => extensions.list(sessionId, `main:${sessionId}`, "main").map(item => item.id);
  try {
    const parent = await sessions.create("parent", "/workspace", "agent");
    await expect(app.openSideChat("parent", "too-early")).rejects.toMatchObject({ code: "SIDE_CHAT_NO_COMPLETED_TURN" });
    await turn(parent, "t1", true);
    await turn(parent, "t2", true);
    const completedThrough = parent.journal.lastSeq;
    await turn(parent, "t3", false);

    const opened = await app.openSideChat("parent", "side");
    expect(opened).toMatchObject({ inheritedTurnCount: 2, runningTurnExcluded: true });
    expect(opened.snapshot).toMatchObject({ agentMode: "plan", lineage: { origin: "side-chat", parentSessionId: "parent", parentBoundarySeq: completedThrough } });
    expect(sessions.getOpen("side")?.journal.events.some(item => item.type === "turn/start" && (item.data as { turnId?: string }).turnId === "t3")).toBe(false);
    expect(prompts("side")).toEqual([PROMPT_ID]);
    expect(prompts("parent")).toEqual([]);
    await expect(app.openSideChat("side", "nested")).rejects.toThrow("SIDE_CHAT_PARENT_NOT_MAIN");

    // Reopening after shutdown keeps the lineage, the mode and the prompt.
    await sessions.closeAll();
    expect(prompts("side")).toEqual([]);
    expect(await sessions.inspect("side")).toMatchObject({ agentMode: "plan", lineage: { origin: "side-chat" } });
    await sessions.resume("side");
    expect(prompts("side")).toEqual([PROMPT_ID]);

    // Chat-form parents keep a Chat side chat.
    const chat = await sessions.create("chat-parent", "/workspace", "chat");
    await turn(chat, "c1", true);
    expect((await app.openSideChat("chat-parent", "chat-side")).snapshot.agentMode).toBe("chat");
  } finally {
    await app.dispose();
    await sessions.closeAll();
    await cordis.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
