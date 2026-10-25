import type { MessageBlock } from "@actspace/shared";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createHash, webcrypto } from "node:crypto";
import { connectionWrapper, fakeClient, fakeConnection, FakeConnectionStore } from "../../../test/helpers/fake-session";
import type { Turn } from "../../../sessions/turn-model";
import { TurnView } from "../TurnView";
import { OutputFiles } from "../OutputFiles";

const at = "2026-10-23T00:00:00.000Z";
const write = (overrides: Record<string, unknown> = {}): MessageBlock => ({ kind: "write_diff", id: "write-1", filePath: "result.txt", outputRelativePath: "result.txt", additions: 1, deletions: 0, diff: "+result", collapsedLines: 0, createdAt: at, status: "completed", ...overrides } as MessageBlock);
const present = (overrides: Record<string, unknown> = {}): MessageBlock => ({ kind: "present", id: "present-1", files: [{ path: "report.html", outputRelativePath: "report.html" }], displayText: "report", createdAt: at, status: "completed", ...overrides } as MessageBlock);
const turn = (blocks: MessageBlock[]): Turn => ({ key: "turn-1", user: null, process: blocks.map(block => ({ key: block.id, type: "block", block })), reply: [{ key: "reply", type: "block", block: { kind: "assistant", id: "reply", content: "完成", createdAt: at } }], tail: [] });
const show = (blocks: MessageBlock[]) => render(<TurnView turn={turn(blocks)} sessionId="s1" active={false} approvalsAfter={new Map()} renderApproval={() => null} />, { wrapper: connectionWrapper(new FakeConnectionStore(fakeConnection(fakeClient(() => null)))) });

it("keeps a successful output downloadable when the tool process is folded", () => {
  show([write()]);
  expect(screen.queryByText("写入")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "下载 result.txt" })).toBeEnabled();
});

it("offers presented files without turning paths from arbitrary tool text into downloads", () => {
  show([present(), write({ id: "other", filePath: "/work/not-an-output.txt", outputRelativePath: undefined })]);
  expect(screen.getByRole("button", { name: "下载 report.html" })).toBeEnabled();
  expect(screen.getAllByRole("button", { name: /^下载 / })).toHaveLength(1);
});

it("excludes unfinished, failed, denied, escaping and duplicate output paths", () => {
  show([
    write(), write({ id: "duplicate" }),
    ...["pending", "running", "failed", "denied"].map(status => write({ id: status, status, outputRelativePath: `${status}.txt` })),
    write({ id: "error", errorMessage: "failed", outputRelativePath: "error.txt" }),
    ...["../outside", "/absolute", "a/../outside", "C:\\outside", "a\\b", "nul\0byte"].map((path, index) => write({ id: `unsafe-${index}`, outputRelativePath: path })),
    present({ id: "failed-present", isError: true }),
  ]);
  expect(screen.getAllByRole("button", { name: /^下载 / })).toHaveLength(1);
});

const emptyHash = createHash("sha256").digest("hex");
const reference = { id: "artifact", name: "result.txt", size: 0, sha256: emptyHash };
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:download"); static revokeObjectURL = vi.fn(); });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("prevents duplicate downloads while busy and displays the downloaded size", async () => {
  let release!: (value: unknown) => void;
  const client = fakeClient(() => new Promise(resolve => { release = resolve; }));
  render(<OutputFiles sessionId="s1" paths={["result.txt"]} />, { wrapper: connectionWrapper(new FakeConnectionStore(fakeConnection(client))) });
  const button = screen.getByRole("button", { name: "下载 result.txt" });
  await userEvent.dblClick(button);
  expect(button).toBeDisabled(); expect(client.calls).toHaveLength(1);
  await act(async () => { release(reference); });
  await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("status")).toHaveTextContent("0 字节"); expect(button).toBeEnabled();
});

it("keeps Host permission and missing-file errors visible and allows retry", async () => {
  let fail = true;
  const client = fakeClient(() => { if (fail) throw new Error("File is outside the Session workspace"); return reference; });
  render(<OutputFiles sessionId="s1" paths={["result.txt"]} />, { wrapper: connectionWrapper(new FakeConnectionStore(fakeConnection(client))) });
  await userEvent.click(screen.getByRole("button", { name: "下载 result.txt" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("outside the Session workspace");
  fail = false; await userEvent.click(screen.getByRole("button", { name: "下载 result.txt" }));
  await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["session", "disconnect", "unmount"])("discards an old download after %s changes", async kind => {
  let release!: (value: unknown) => void;
  const client = fakeClient(() => new Promise(resolve => { release = resolve; }));
  const store = new FakeConnectionStore(fakeConnection(client));
  const view = render(<OutputFiles sessionId="s1" paths={["result.txt"]} />, { wrapper: connectionWrapper(store) });
  await userEvent.click(screen.getByRole("button", { name: "下载 result.txt" }));
  if (kind === "session") view.rerender(<OutputFiles sessionId="s2" paths={["result.txt"]} />);
  else if (kind === "disconnect") act(() => store.set(null));
  else view.unmount();
  await act(async () => { release(reference); });
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  if (kind === "disconnect") expect(screen.getByRole("button", { name: "下载 result.txt" })).toBeDisabled();
});

it("enables a fresh request on reconnect without reviving the cancelled response", async () => {
  const client = fakeClient(() => reference), store = new FakeConnectionStore(null);
  render(<OutputFiles sessionId="s1" paths={["result.txt"]} />, { wrapper: connectionWrapper(store) });
  expect(screen.getByRole("button", { name: "下载 result.txt" })).toBeDisabled();
  act(() => store.set(fakeConnection(client)));
  await userEvent.click(screen.getByRole("button", { name: "下载 result.txt" }));
  await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
  expect(client.calls[0]?.params.sessionId).toBe("s1");
});
