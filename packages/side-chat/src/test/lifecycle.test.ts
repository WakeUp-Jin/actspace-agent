import { describe, expect, it } from "vitest";
import { createCordisRoot, emitNotification } from "@actspace/cordis-adapter";
import { PromptExtensionRegistry } from "@actspace/prompt";
import { apply, type SideChatService } from "../plugin.js";
import { manifest } from "../manifest.js";
import { PROMPT_ID } from "../prompt.js";

describe("side chat prompt lifecycle", () => {
  it("registers the boundary prompt only for side chats and removes it on dispose", async () => {
    const root = await createCordisRoot();
    const extensions = new PromptExtensionRegistry();
    const lineage = (origin: string | null) => origin === null ? null : { parentSessionId: "main", parentBoundarySeq: 3, origin, delegationDepth: 0 };
    const open = new Map([["main", lineage(null)], ["side", lineage("side-chat")], ["fork", lineage("fork")]]);
    root.context.provide?.("actspace.host.prompt", { workspaceRoot: "/fixture", extensions });
    root.context.provide?.("session.runtime", { getOpen: (id: string) => open.has(id) ? { header: { sessionId: id, lineage: open.get(id) } } : undefined });
    await root.mount("side-chat-test", ({ context }) => { apply(context!); });
    const service = root.getService<SideChatService>("side-chat")!;
    try {
      expect(manifest.contributions.services).toEqual(["side-chat"]);
      for (const sessionId of ["main", "side", "fork"]) emitNotification(root.context, "session/created", { sessionId });
      emitNotification(root.context, "session/created", { sessionId: "side" });
      const sources = (id: string) => extensions.list(id, `main:${id}`, "main").map(source => source.id);
      expect(sources("side")).toEqual([PROMPT_ID]);
      expect(sources("main")).toEqual([]);
      expect(sources("fork")).toEqual([]);
      emitNotification(root.context, "session/disposed", { sessionId: "side", outcome: { ok: true } });
      expect(sources("side")).toEqual([]);
      expect(service.isAttached("side")).toBe(false);
      emitNotification(root.context, "session/created", { sessionId: "side" });
      expect(sources("side")).toEqual([PROMPT_ID]);
    } finally { await root.dispose(); }
    expect(extensions.list("side", "main:side", "main")).toEqual([]);
  });
});
