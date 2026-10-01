import { afterEach, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock("electron", () => ({ dialog: {}, nativeImage: {}, nativeTheme: {}, ipcMain: {
  handle: (channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener),
  removeHandler: (channel: string) => handlers.delete(channel), on: vi.fn(), removeListener: vi.fn(),
} }));
import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";

afterEach(() => { handlers.clear(); });

function setup(overrides: { active?: boolean; steerRun?: () => Promise<unknown>; cancelStatus?: string } = {}) {
  const steerRun = vi.fn(overrides.steerRun ?? (async () => ({ messageId: "steer-1", enqueuedSeq: 4 })));
  const cancelSteer = vi.fn(async () => overrides.cancelStatus ?? "cancelled");
  const importAttachment = vi.fn(async () => ({ artifactId: "art-1", mimeType: "image/png", name: "shot.png" }));
  const rollbackImportedAttachments = vi.fn(async () => undefined);
  const registration = registerFixedRendererIpc({
    roots: { dataRoot: "/tmp/steer", workspaceRoot: "/tmp" },
    registry: {
      subscribe: () => () => {}, subscribeRendererStream: () => () => {},
      isRunActive: () => overrides.active ?? true,
      inspectSession: async () => ({ agentForm: "agent", agentMode: "agent", workspaceRoot: "/tmp", throughJournalSeq: 3 }),
      steerRun, cancelSteer, importAttachment, rollbackImportedAttachments,
    },
    settings: { subscribeV4Changes: () => () => {} },
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { id: 7 } }),
  } as unknown as FixedRendererIpcOptions);
  const steer = (input: Record<string, unknown> = {}) => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.steerAgentRun)!({ sender: { id: 7 } }, { sessionId: "s", agentRunId: "r", messageId: "steer-1", userInput: "保留 offset", ...input });
  const cancel = () => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.cancelSteer)!({ sender: { id: 7 } }, { sessionId: "s", messageId: "steer-1" });
  return { registration, steerRun, cancelSteer, importAttachment, rollbackImportedAttachments, steer, cancel };
}

it("writes the prepared content into the running turn", async () => {
  const { registration, steerRun, steer } = setup();
  try {
    await expect(steer({ attachments: [{ id: "img", kind: "image", name: "shot.png", path: "/fixture/shot.png" }] })).resolves.toEqual({ status: "accepted", sessionId: "s", agentRunId: "r", messageId: "steer-1" });
    expect(steerRun).toHaveBeenCalledWith("s", [
      { type: "text", text: "保留 offset" },
      { type: "artifact", artifact: { artifactId: "art-1", mediaType: "image/png" }, label: "shot.png" },
    ], "steer-1");
  } finally { registration.dispose(); }
});

it("reports unavailable without importing attachments when no turn is running", async () => {
  const { registration, steerRun, importAttachment, steer } = setup({ active: false });
  try {
    await expect(steer({ attachments: [{ id: "img", kind: "image", name: "shot.png", path: "/fixture/shot.png" }] })).resolves.toMatchObject({ status: "unavailable" });
    expect(importAttachment).not.toHaveBeenCalled();
    expect(steerRun).not.toHaveBeenCalled();
  } finally { registration.dispose(); }
});

it("rolls back imported attachments when the turn ends before the steer is written", async () => {
  const { registration, rollbackImportedAttachments, steer } = setup({ steerRun: async () => { throw new Error("STEER_UNAVAILABLE"); } });
  try {
    await expect(steer({ attachments: [{ id: "img", kind: "image", name: "shot.png", path: "/fixture/shot.png" }] })).resolves.toMatchObject({ status: "unavailable" });
    expect(rollbackImportedAttachments).toHaveBeenCalledWith("s", ["art-1"]);
  } finally { registration.dispose(); }
});

it("rejects invalid references like a normal send", async () => {
  const { registration, steerRun, steer } = setup();
  try {
    await expect(steer({ fileReferences: [{ relativePath: "../etc/passwd", displayName: "passwd" }] })).resolves.toMatchObject({ status: "rejected", referenceIssue: { code: "invalid_reference" } });
    expect(steerRun).not.toHaveBeenCalled();
  } finally { registration.dispose(); }
});

it.each(["cancelled", "claimed", "discarded", "missing"])("returns the %s cancel status", async (status) => {
  const { registration, cancelSteer, cancel } = setup({ cancelStatus: status });
  try {
    await expect(cancel()).resolves.toEqual({ status });
    expect(cancelSteer).toHaveBeenCalledWith("s", "steer-1");
  } finally { registration.dispose(); }
});
