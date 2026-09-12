import { expect, it } from "vitest";
import type { LlmMessage } from "@actspace/llm-service";
import { runToolStreamFixture } from "./tool-stream-fixture.js";

it("replays a large text tool artifact as a file reference, never an image", async () => {
  const requests: (readonly LlmMessage[])[] = [];
  const artifact = { artifactId: "full-output", mediaType: "text/plain", size: 40871, sha256: "fixture" };
  const run = await runToolStreamFixture({
    resolveArtifact: async () => ({ path: "/managed/full-output", mediaType: "text/plain" }),
    execute: async () => ({ status: "completed", summary: "Bash completed", modelOutput: [{ type: "text", text: "bounded head" }, { type: "artifact", artifact, label: "Full Bash output" }], artifacts: [artifact] }),
    onMessages: (messages) => requests.push(messages),
  });
  const tool = requests[1].find((message) => message.role === "tool")!;
  expect(tool.content).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "image" })]));
  expect(JSON.stringify(tool.content)).toContain("full-output");
  expect(JSON.stringify(tool.content)).toContain("/managed/full-output");
  expect(JSON.stringify(tool.content)).toContain("offset/limit");
  expect(run.result.reason).toBe("completed");
  expect(JSON.stringify(run.journal)).not.toContain("base64");
});

it("persists the sanitized terminal failure and publishes it live", async () => {
  let journal: readonly any[] = [];
  const live: any[] = [];
  await expect(runToolStreamFixture({ beforeFinalText: async () => { throw new Error("Provider rejected request token-abcdefgh"); }, onJournal: (events) => { journal = events; }, onLiveEvent: (event) => live.push(event) })).rejects.toThrow();
  const terminal = journal.find((event) => event.type === "turn/end");
  expect(terminal?.data.failure?.message).toContain("Provider rejected request");
  expect(JSON.stringify(terminal)).not.toContain("token-abcdefgh");
  expect(live.at(-1).failure).toEqual(terminal.data.failure);
});

it("keeps a missing historical output reference explicit without failing the next request", async () => {
  const requests: (readonly LlmMessage[])[] = [];
  const run = await runToolStreamFixture({
    resolveArtifact: async () => { throw new Error("file missing"); },
    execute: async () => ({ status: "completed", summary: "Bash completed", modelOutput: [{ type: "text", text: "saved head" }, { type: "artifact", artifact: { artifactId: "old-output", mediaType: "text/plain", size: 40000, sha256: "fixture" } }] }),
    onMessages: (messages) => requests.push(messages),
  });
  expect(run.result.reason).toBe("completed");
  expect(JSON.stringify(requests[1])).toContain("Full output file is unavailable");
  expect(JSON.stringify(requests[1])).toContain("saved head");
});
