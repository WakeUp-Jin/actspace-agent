// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createBrowserActionPermissionChecker,
  createBrowserRunPermissionChecker,
} from "../permissions";

describe("browser capability permissions", () => {
  it("denies only the disabled high-risk effect while keeping other actions available", async () => {
    const checker = createBrowserActionPermissionChecker(
      "io",
      new Set(["browser_capability_file_upload"]),
    );
    const upload = await checker({
      action: "set_file_chooser_files",
      tab_id: 7,
      file_chooser_id: "chooser-1",
      files: ["/tmp/a.txt"],
    });
    const read = await checker({ action: "clipboard_read_text", tab_id: 7 });

    expect(upload.decision).toBe("deny");
    expect(upload.reason).toContain("file_upload capability 已在设置中禁用");
    expect(read.decision).toBe("allow");
  });

  it("hard-denies the whole batch when one effect capability is disabled", async () => {
    const checker = createBrowserRunPermissionChecker(
      async () => ({
        actionHash: "hash",
        highestRisk: "high",
        readOnly: false,
        approval: "signed-token",
        actions: [{
          index: 0,
          commandId: "playwright_file_chooser_set_files",
          category: "io",
          action: "set_file_chooser_files",
          riskLevel: "high",
          readOnly: false,
          effect: "file_upload",
          originPolicy: "target_origin",
          status: "implemented",
        }],
      }),
      new Set(["browser_capability_file_upload"]),
    );

    const result = await checker({
      actions: [{
        category: "io",
        action: "set_file_chooser_files",
        params: { tab_id: 7, file_chooser_id: "chooser-1", files: ["/tmp/a.txt"] },
      }],
    });

    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("整批未执行");
  });

  it("includes the target origin in browser_run approval summaries", async () => {
    const checker = createBrowserRunPermissionChecker(async () => ({
      actionHash: "hash",
      highestRisk: "medium",
      readOnly: false,
      approval: "signed-token",
      actions: [{
        index: 0,
        commandId: "playwright_locator_fill",
        category: "locator",
        action: "fill",
        riskLevel: "medium",
        readOnly: false,
        effect: "page_mutation",
        originPolicy: "target_origin",
        target: "#name-input",
        origin: "http://127.0.0.1:4173",
        status: "implemented",
      }],
    }));

    const result = await checker({
      actions: [{
        category: "locator",
        action: "fill",
        params: { tab_id: 7, selector: "#name-input", value: "secret" },
      }],
    });

    expect(result.decision).toBe("ask");
    expect(result.summary).toContain("locator.fill (#name-input)");
    expect(result.summary).toContain("@ http://127.0.0.1:4173");
    expect(result.summary).not.toContain("secret");
  });
});
