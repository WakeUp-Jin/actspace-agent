import { createHash, webcrypto } from "node:crypto";
import { HOST_LIMITS } from "@actspace/shared/host-protocol";
import { fakeClient } from "../../test/helpers/fake-session";
import { readOutputDownload, saveOutputDownload } from "../output-download";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const signal = () => new AbortController().signal;
const bytesOf = (blob: Blob) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer)); reader.onerror = reject; reader.readAsArrayBuffer(blob);
});
const fixture = (bytes: Uint8Array, change: (method: string, value: Record<string, unknown>) => unknown = (_method, value) => value) => fakeClient((method, params) => {
  if (method === "files.reference") return change(method, { id: "artifact-1", name: "report.html", size: bytes.length, sha256: hash(bytes), mediaType: "text/html" });
  if (method !== "artifacts.read") throw new Error(`Unexpected ${method}`);
  const part = bytes.subarray(params.offset as number, (params.offset as number) + (params.length as number));
  return change(method, { data: Buffer.from(part).toString("base64"), size: bytes.length, sha256: hash(part) });
});
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("reads bounded chunks of a session-owned snapshot and verifies the complete file", async () => {
  const bytes = Uint8Array.from({ length: HOST_LIMITS.chunkBytes + 3 }, (_, index) => index % 251);
  const client = fixture(bytes);
  const file = await readOutputDownload(client, "session-1", "out/report.html", signal());
  expect(file.name).toBe("report.html"); expect(file.size).toBe(bytes.length);
  expect(file.blob.type).toBe("application/octet-stream");
  expect(await bytesOf(file.blob)).toEqual(bytes);
  expect(client.calls).toEqual([
    { method: "files.reference", params: { sessionId: "session-1", path: "out/report.html" } },
    { method: "artifacts.read", params: { sessionId: "session-1", artifactId: "artifact-1", offset: 0, length: HOST_LIMITS.chunkBytes } },
    { method: "artifacts.read", params: { sessionId: "session-1", artifactId: "artifact-1", offset: HOST_LIMITS.chunkBytes, length: 3 } },
  ]);
});

it("downloads an empty file without requesting an invalid zero-byte chunk", async () => {
  const client = fixture(new Uint8Array());
  expect((await readOutputDownload(client, "s", "empty", signal())).size).toBe(0);
  expect(client.calls).toHaveLength(1);
});

it.each([
  ["truncated bytes", "artifacts.read", { data: "" }],
  ["bad chunk hash", "artifacts.read", { sha256: "0".repeat(64) }],
  ["bad file hash", "files.reference", { sha256: "0".repeat(64) }],
  ["changed total size", "artifacts.read", { size: 30 }],
  ["invalid size", "files.reference", { size: -1 }],
])("rejects %s", async (_label, changedMethod, overrides) => {
  const client = fixture(new Uint8Array([1, 2, 3]), (method, value) => method === changedMethod ? { ...value, ...overrides } : value);
  await expect(readOutputDownload(client, "s", "result", signal())).rejects.toThrow();
});

it("rejects oversized snapshots before requesting bytes", async () => {
  const client = fixture(new Uint8Array(), (_method, value) => ({ ...value, size: HOST_LIMITS.fileBytes + 1 }));
  await expect(readOutputDownload(client, "s", "large", signal())).rejects.toThrow("20 MiB");
  expect(client.calls).toHaveLength(1);
});

it("rejects path escape before making a Host request", async () => {
  const client = fixture(new Uint8Array());
  await expect(readOutputDownload(client, "s", "../escape", signal())).rejects.toThrow("路径");
  expect(client.calls).toHaveLength(0);
});

it("stops after an in-flight response when its scene was cancelled", async () => {
  const controller = new AbortController();
  let release!: (value: unknown) => void;
  const client = fakeClient(() => new Promise(resolve => { release = resolve; }));
  const pending = readOutputDownload(client, "s", "out", controller.signal);
  controller.abort(); release({ id: "stale" });
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(client.calls).toHaveLength(1);
});

it("forces safe attachment download, sanitizes the filename and releases the object URL", async () => {
  const client = fixture(new Uint8Array([1]), (method, value) => method === "files.reference" ? { ...value, name: "../bad\0.html" } : value);
  const file = await readOutputDownload(client, "s", "report.html", signal());
  vi.useFakeTimers();
  const createObjectURL = vi.fn(() => "blob:download"), revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("bad.html"); expect(this.href).toBe("blob:download"); expect(this.target).toBe("");
  });
  saveOutputDownload(file);
  expect(click).toHaveBeenCalledTimes(1); expect(createObjectURL).toHaveBeenCalledWith(file.blob);
  expect(document.querySelector("a")).toBeNull(); expect(revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000); expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
});
