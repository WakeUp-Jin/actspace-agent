// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { openRemoteFile } from "../hooks/remoteArtifact";
const key = `host:${btoa(JSON.stringify(["host", "session"])) .replace(/=/g, "")}`;
afterEach(() => vi.unstubAllGlobals());
it("previews remote text without invoking local file APIs or enabling HTML", async () => {
  const call = vi.fn(async () => ({ id: "artifact" })), preview = vi.fn(async () => ({ name: "result.html", size: 8, text: "<script>unsafe()</script>" })), localRead = vi.fn(), open = vi.fn();
  vi.stubGlobal("window", { actspaceHosts: { call, preview }, actspace: { readWorkspaceFile: localRead } });
  expect(await openRemoteFile(key, "result.html", open)).toBe(true);
  expect(call).toHaveBeenCalledWith("host", "files.reference", { sessionId: "session", path: "result.html" });
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ kind: "text", content: "<script>unsafe()</script>" }));
  expect(open.mock.calls[0]![0]).not.toHaveProperty("relativePath");
  expect(localRead).not.toHaveBeenCalled();
});
it("downloads remote binary through its authenticated Session identity", async () => {
  const download = vi.fn(), open = vi.fn();
  vi.stubGlobal("window", { actspaceHosts: { call: async () => ({ id: "binary" }), preview: async () => ({ name: "result.bin", size: 9 }), download } });
  await openRemoteFile(key, "result.bin", open);
  expect(download).toHaveBeenCalledWith({ hostId: "host", sessionId: "session", artifactId: "binary" });
  expect(open).not.toHaveBeenCalled();
  expect(await openRemoteFile("local-session", "result.bin", open)).toBe(false);
});
