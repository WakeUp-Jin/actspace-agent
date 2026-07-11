import { describe, expect, it } from "vitest";
import {
  BROWSER_REDACTED_VALUE,
  sanitizeBrowserToolArgs,
  sanitizeBrowserToolResult,
} from "../redaction";

describe("browser persistence redaction", () => {
  it("redacts direct input and clipboard payload fields while retaining routing context", () => {
    expect(sanitizeBrowserToolArgs("browser_locator", {
      action: "fill",
      tab_id: 42,
      selector: "#password",
      value: "hunter2",
    })).toEqual({
      action: "fill",
      tab_id: 42,
      selector: "#password",
      value: BROWSER_REDACTED_VALUE,
    });

    expect(sanitizeBrowserToolArgs("browser_io", {
      action: "clipboard_write",
      tab_id: 42,
      items: [{ entries: [{ mime_type: "text/plain", text: "private clipboard" }] }],
      files: ["/Users/test/private/report.pdf"],
    })).toEqual({
      action: "clipboard_write",
      tab_id: 42,
      items: BROWSER_REDACTED_VALUE,
      files: ["report.pdf"],
    });
  });

  it("redacts nested browser_run action params", () => {
    expect(sanitizeBrowserToolArgs("browser_run", {
      stop_on_error: true,
      actions: [{
        category: "io",
        action: "clipboard_write_text",
        params: { tab_id: 7, text: "batch secret" },
      }],
    })).toEqual({
      stop_on_error: true,
      actions: [{
        category: "io",
        action: "clipboard_write_text",
        params: { tab_id: 7, text: BROWSER_REDACTED_VALUE },
      }],
    });
  });

  it("removes browser data, rich content and structured output from persistent results", () => {
    const result = sanitizeBrowserToolResult("browser_cua", {
      success: true,
      data: "screenshot complete",
      content: [{ type: "image", data: "base64-secret", mimeType: "image/png" }],
      structured: { result: { data: "base64-secret" } },
    });

    expect(result).toEqual({
      success: true,
      data: "[browser output omitted from persistence]",
      redactInPersistence: true,
    });
    expect(JSON.stringify(result)).not.toContain("base64-secret");
  });
});
