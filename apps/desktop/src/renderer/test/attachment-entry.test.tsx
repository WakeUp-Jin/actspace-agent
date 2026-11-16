import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { attachmentEntry, useDocumentParsingAvailable } from "../components/composer/attachment-entry";
import { overrideBridge, setupBridge } from "./helpers/bridge";

const base = { isChatForm: false, acceptsFiles: false, isRemoteTarget: false, documentParsing: false };

describe("attachmentEntry", () => {
  it("Chat keeps the Chat file set", () => {
    expect(attachmentEntry({ ...base, isChatForm: true, documentParsing: true })).toEqual({ label: "图片与文件", description: "PNG、JPEG、WEBP、GIF、TXT、Markdown、JSON、CSV", icon: "files", picker: "files" });
  });

  it("a target that accepts files keeps the plain file picker", () => {
    expect(attachmentEntry({ ...base, acceptsFiles: true, documentParsing: true })).toEqual({ label: "图片与文件", icon: "files", picker: "files" });
  });

  it("a local Agent with document parsing offers documents", () => {
    expect(attachmentEntry({ ...base, documentParsing: true })).toEqual({ label: "图片与文件", description: "PNG、JPEG、WEBP、GIF、PDF、Word、PPT", icon: "files", picker: "documents" });
  });

  it("falls back to images, including a remote target with document parsing", () => {
    expect(attachmentEntry(base)).toEqual({ label: "图片", icon: "images", picker: "images" });
    expect(attachmentEntry({ ...base, isRemoteTarget: true, documentParsing: true })).toEqual({ label: "图片", icon: "images", picker: "images" });
  });
});

describe("useDocumentParsingAvailable", () => {
  function bridgeWith(documentEnabled: boolean, hasKey: boolean) {
    const handle = setupBridge();
    handle.db.settingsV4.settings.tools.deepseekDocumentEnabled = documentEnabled;
    handle.db.settings.providers.deepseek.hasApiKey = hasKey;
    return handle;
  }

  it("starts false and turns true only with the switch on and a key saved", async () => {
    bridgeWith(true, true);
    const { result } = renderHook(() => useDocumentParsingAvailable());
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it.each([
    ["without a key", true, false],
    ["with the switch off", false, true],
  ])("stays false %s", async (_case, documentEnabled, hasKey) => {
    const handle = bridgeWith(documentEnabled, hasKey);
    const getV4 = vi.fn(async () => handle.db.settingsV4);
    overrideBridge({ "settings.getV4": getV4 });
    const { result } = renderHook(() => useDocumentParsingAvailable());
    await waitFor(() => expect(getV4).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe(false);
  });

  it("follows settingsChanged and keeps the value when a read fails", async () => {
    const handle = bridgeWith(false, true);
    const { result } = renderHook(() => useDocumentParsingAvailable());
    handle.db.settingsV4.settings.tools.deepseekDocumentEnabled = true;
    act(() => handle.emit("settingsChanged", { revision: "r2", changedNamespaces: ["tools"] }));
    await waitFor(() => expect(result.current).toBe(true));

    overrideBridge({ "settings.getV4": async () => { throw new Error("offline"); } });
    act(() => handle.emit("settingsChanged", { revision: "r3", changedNamespaces: ["tools"] }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe(true);
  });

  it("shares one listener and removes it after the last subscriber unmounts", async () => {
    const handle = bridgeWith(true, true);
    const getV4 = vi.fn(async () => handle.db.settingsV4);
    overrideBridge({ "settings.getV4": getV4 });
    const first = renderHook(() => useDocumentParsingAvailable());
    const second = renderHook(() => useDocumentParsingAvailable());
    await waitFor(() => expect(second.result.current).toBe(true));
    expect(getV4).toHaveBeenCalledTimes(1);
    act(() => handle.emit("settingsChanged", { revision: "r2", changedNamespaces: ["tools"] }));
    await waitFor(() => expect(getV4).toHaveBeenCalledTimes(2));
    first.unmount();
    second.unmount();
    act(() => handle.emit("settingsChanged", { revision: "r3", changedNamespaces: ["tools"] }));
    await act(async () => { await Promise.resolve(); });
    expect(getV4).toHaveBeenCalledTimes(2);
  });
});
