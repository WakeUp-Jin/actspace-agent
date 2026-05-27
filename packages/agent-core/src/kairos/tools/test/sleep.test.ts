import { describe, expect, it } from "vitest";
import { sleepDefinition, sleepExecutor } from "../sleep";

describe("sleep tool", () => {
  it("declares no path access", () => {
    expect(sleepDefinition.extractPaths!({ seconds: 60 })).toEqual([]);
  });

  it("rejects non-positive / non-finite seconds", async () => {
    expect(await sleepExecutor({ seconds: 0 }, "/")).toMatchObject({ success: false });
    expect(await sleepExecutor({ seconds: -5 }, "/")).toMatchObject({ success: false });
    expect(await sleepExecutor({ seconds: NaN }, "/")).toMatchObject({ success: false });
    expect(await sleepExecutor({}, "/")).toMatchObject({ success: false });
  });

  it("returns plannedSeconds as integer and preserves reason", async () => {
    const ok = await sleepExecutor({ seconds: 119.7, reason: "wait for compaction" }, "/");
    expect(ok.success).toBe(true);
    expect(ok.data).toEqual({ plannedSeconds: 119, reason: "wait for compaction" });
  });

  it("treats empty reason as null", async () => {
    const ok = await sleepExecutor({ seconds: 60, reason: "" }, "/");
    expect((ok.data as { reason: unknown }).reason).toBeNull();
  });
});
