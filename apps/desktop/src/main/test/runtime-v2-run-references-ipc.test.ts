import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));
vi.mock("electron", () => ({ dialog: {}, nativeImage: {}, nativeTheme: {}, ipcMain: {
  handle: (channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener),
  removeHandler: (channel: string) => handlers.delete(channel), on: vi.fn(), removeListener: vi.fn(),
} }));
import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";

let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "run-references-"));
  await mkdir(join(workspace, "src"));
  await writeFile(join(workspace, "src", "a.ts"), "export {};\n");
});
afterEach(async () => {
  handlers.clear();
  await rm(workspace, { recursive: true, force: true });
});

const annotation = {
  annotationId: "ann_1", assistantMessageId: "v2-5", selectedText: "关键句", startOffset: 0, endOffset: 3, prefixContext: "", suffixContext: "。", comment: "为什么",
};

function setup(overrides: { agentForm?: "agent" | "chat"; journal?: Record<number, unknown> } = {}) {
  const runTurn = vi.fn(async () => ({ snapshot: { sessionId: "s" }, reason: "completed", finalText: "" }));
  const importAttachment = vi.fn(async () => ({ artifactId: "art-1", mimeType: "image/png", name: "shot.png" }));
  const journal = overrides.journal ?? { 5: { seq: 5, type: "assistant/message", surface: { kind: "append", node: { kind: "assistant", messageId: "m", content: "关键句。" } } } };
  const readSessionProjection = vi.fn(async ({ beforeSeq }: { beforeSeq: number }) => ({
    window: { events: journal[beforeSeq - 1] ? [journal[beforeSeq - 1]] : [] },
  }));
  const registration = registerFixedRendererIpc({
    roots: { dataRoot: "/tmp/run-references", workspaceRoot: workspace },
    registry: {
      subscribe: () => () => {}, subscribeRendererStream: () => () => {},
      inspectSession: async () => ({ agentForm: overrides.agentForm ?? "agent", workspaceRoot: workspace, throughJournalSeq: 9 }),
      importAttachment, runTurn, readSessionProjection, rollbackImportedAttachments: vi.fn(),
    },
    settings: { subscribeV4Changes: () => () => {} },
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { id: 7 } }),
  } as unknown as FixedRendererIpcOptions);
  const handler = handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.runAgent)!;
  return { registration, runTurn, importAttachment, readSessionProjection, run: (input: Record<string, unknown>) => handler({ sender: { id: 7 } }, { sessionId: "s", agentRunId: "r", userInput: "看这里", ...input }) };
}

it("writes text, file references, excerpts and attachments as ordered content blocks", async () => {
  const { registration, runTurn, readSessionProjection, run } = setup();
  try {
    await run({
      fileReferences: [{ relativePath: "./src/a.ts", displayName: "a.ts" }],
      responseAnnotations: [annotation],
      attachments: [{ id: "img", kind: "image", name: "shot.png", path: "/fixture/shot.png" }],
    });
    expect(readSessionProjection).toHaveBeenCalledWith({ sessionId: "s", beforeSeq: 6, maxWindowEvents: 1 });
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({ content: [
      { type: "text", text: "看这里" },
      { type: "file-reference", relativePath: "src/a.ts", displayName: "a.ts" },
      { type: "response-excerpt", ...annotation },
      { type: "artifact", artifact: { artifactId: "art-1", mediaType: "image/png" }, label: "shot.png" },
    ] }));
  } finally { registration.dispose(); }
});

it("keeps plain string content when there are no references or attachments", async () => {
  const { registration, runTurn, readSessionProjection, run } = setup();
  try {
    await run({ fileReferences: [], responseAnnotations: [] });
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({ content: "看这里" }));
    expect(readSessionProjection).not.toHaveBeenCalledWith(expect.objectContaining({ maxWindowEvents: 1 }));
  } finally { registration.dispose(); }
});

it("sends an excerpt without any typed text", async () => {
  const { registration, runTurn, run } = setup();
  try {
    await run({ userInput: "", responseAnnotations: [annotation] });
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({ content: [{ type: "response-excerpt", ...annotation }] }));
  } finally { registration.dispose(); }
});

it.each([
  ["a missing file", { fileReferences: [{ relativePath: "src/missing.ts", displayName: "missing.ts" }] }, { code: "file_not_found", kind: "file", index: 0, relativePath: "src/missing.ts" }],
  ["an escaping path", { fileReferences: [{ relativePath: "../etc/passwd", displayName: "passwd" }] }, { code: "invalid_reference", kind: "file", index: 0, relativePath: "../etc/passwd" }],
  ["an unknown reply", { responseAnnotations: [{ ...annotation, assistantMessageId: "v2-7" }] }, { code: "annotation_source_missing", kind: "annotation", index: 0 }],
  ["a reply beyond the journal", { responseAnnotations: [{ ...annotation, assistantMessageId: "v2-99" }] }, { code: "annotation_source_missing", kind: "annotation", index: 0 }],
  ["a malformed reply id", { responseAnnotations: [{ ...annotation, assistantMessageId: "turn:r:assistant" }] }, { code: "annotation_source_missing", kind: "annotation", index: 0 }],
])("rejects %s before importing attachments or starting a turn", async (_label, input, issue) => {
  const { registration, runTurn, importAttachment, run } = setup();
  try {
    const result = await run({ ...input, attachments: [{ id: "img", kind: "image", name: "shot.png", path: "/fixture/shot.png" }] });
    expect(JSON.parse(JSON.stringify(result))).toEqual({ status: "rejected", sessionId: "s", agentRunId: "r", referenceIssue: issue });
    expect(importAttachment).not.toHaveBeenCalled();
    expect(runTurn).not.toHaveBeenCalled();
  } finally { registration.dispose(); }
});

it("rejects a user message id used as a reply source", async () => {
  const { registration, runTurn, run } = setup({ journal: { 5: { seq: 5, type: "agent/inbox/spliced", surface: { kind: "append", node: { kind: "user", messageId: "u", content: "hi" } } } } });
  try {
    expect(await run({ responseAnnotations: [annotation] })).toMatchObject({ status: "rejected", referenceIssue: { code: "annotation_source_missing" } });
    expect(runTurn).not.toHaveBeenCalled();
  } finally { registration.dispose(); }
});

it("accepts a compacted assistant reply but rejects a compacted user message", async () => {
  const replaced = (kind: "assistant" | "user") => ({ 5: { seq: 5, type: "surface/replaced", surface: { kind: "replace", sourceEventSeqs: [2], node: { kind, messageId: "m", content: "关键句。" } } } });
  const accepted = setup({ journal: replaced("assistant") });
  try {
    await accepted.run({ responseAnnotations: [annotation] });
    expect(accepted.runTurn).toHaveBeenCalledTimes(1);
  } finally { accepted.registration.dispose(); }
  const rejected = setup({ journal: replaced("user") });
  try {
    expect(await rejected.run({ responseAnnotations: [annotation] })).toMatchObject({ status: "rejected", referenceIssue: { code: "annotation_source_missing" } });
    expect(rejected.runTurn).not.toHaveBeenCalled();
  } finally { rejected.registration.dispose(); }
});

it("rejects file references in Chat sessions but still accepts excerpts there", async () => {
  const { registration, runTurn, run } = setup({ agentForm: "chat" });
  try {
    expect(await run({ fileReferences: [{ relativePath: "src/a.ts", displayName: "a.ts" }] })).toMatchObject({ status: "rejected", referenceIssue: { code: "file_references_not_allowed", kind: "file" } });
    expect(runTurn).not.toHaveBeenCalled();
    await run({ responseAnnotations: [annotation] });
    expect(runTurn).toHaveBeenCalledTimes(1);
  } finally { registration.dispose(); }
});
