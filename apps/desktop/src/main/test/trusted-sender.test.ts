import { describe, expect, it } from "vitest";
import { assertTrustedSender, isTrustedSender } from "../ipc/trusted-sender";
import { trustedWindow } from "./ipc-sender-fixture";

describe("trusted IPC sender", () => {
  it("accepts only the live main window's main frame", () => {
    const { window, event } = trustedWindow();
    expect(isTrustedSender(event, window)).toBe(true);
    expect(() => assertTrustedSender(event, () => window)).not.toThrow();
  });

  it.each([
    ["no window", () => undefined],
    ["a null window", () => null],
  ])("fails closed with %s", (_label, getWindow) => {
    const { event } = trustedWindow();
    expect(() => assertTrustedSender(event, getWindow, "rejected")).toThrow("rejected");
  });

  it("rejects a destroyed window", () => {
    const { window, event } = trustedWindow();
    expect(isTrustedSender(event, { ...window, isDestroyed: () => true })).toBe(false);
  });

  it("rejects other webContents even with the same id", () => {
    const { window, event } = trustedWindow();
    expect(isTrustedSender({ ...event, sender: { ...window.webContents } }, window)).toBe(false);
  });

  it.each([
    ["a child frame", {}],
    ["a missing frame", undefined],
    ["a disposed frame", null],
  ])("rejects %s", (_label, senderFrame) => {
    const { window, event } = trustedWindow();
    expect(isTrustedSender({ ...event, senderFrame }, window)).toBe(false);
  });
});
