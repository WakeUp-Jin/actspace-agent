import { expect, it, vi } from "vitest";
import { SessionModeWriter } from "../session-commands.js";
it("blocks reuse after uncertain mode persistence and preserves workspace restrictions", async () => {
  const writer = new SessionModeWriter();
  const session = { header: { sessionId: "s" }, append: vi.fn(), flush: vi.fn(async () => { throw new Error("disk full"); }) };
  const snapshot = () => ({ agentMode: "chat", agentModeRevision: 0, workspaceRoot: "/workspace" }) as never;
  await expect(writer.change(session as never, "plan", snapshot, "host")).rejects.toThrow("disk full");
  await expect(writer.change(session as never, "agent", snapshot, "headless")).rejects.toThrow("RECOVERY_REQUIRED");
  expect(session.append).toHaveBeenCalledTimes(1);
  const other = new SessionModeWriter();
  await expect(other.change(session as never, "agent", () => ({ agentMode: "chat", workspaceRoot: null }) as never, "host")).rejects.toThrow("WORKSPACE_REQUIRED");
});
