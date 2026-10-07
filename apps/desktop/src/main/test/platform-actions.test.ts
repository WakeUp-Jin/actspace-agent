import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));

import { isSafeExternalUrl, openExternalSafely } from "../platform-actions";

describe("openExternalSafely", () => {
  it.each([
    "https://github.com/acme/repo/pull/1",
    "http://127.0.0.1:3000/",
    "mailto:someone@example.com",
  ])("opens %s", async (url) => {
    const open = vi.fn(async () => undefined);
    expect(isSafeExternalUrl(url)).toBe(true);
    expect(await openExternalSafely(url, open)).toBe(true);
    expect(open).toHaveBeenCalledWith(url);
  });

  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "cursor://file/tmp/a.ts",
    "chrome://extensions",
    "/relative/path",
    "docs/readme.md",
    "not a url",
    "",
    undefined,
    42,
  ])("rejects %j", async (url) => {
    const open = vi.fn(async () => undefined);
    expect(isSafeExternalUrl(url)).toBe(false);
    expect(await openExternalSafely(url, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
