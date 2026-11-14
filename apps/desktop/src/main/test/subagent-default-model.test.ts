// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ModelKey } from "@actspace/shared";
import { ModelRuntimeService } from "../model-runtime-service";
import type { ModelStoreService } from "../model-store-service";
import type { SettingsService } from "../settings-service";
import { createDesktopModelsHostPort } from "../runtime-v2/model-port";
import { sanitizeTaskModels } from "../settings/sanitize";

describe("subagentDefaultModel setting", () => {
  it("sanitizes to a model key or null and defaults to null", () => {
    expect(sanitizeTaskModels({}).subagentDefaultModel).toBeNull();
    expect(
      sanitizeTaskModels({ subagentDefaultModel: "openrouter:anthropic/claude-sonnet-5" }).subagentDefaultModel,
    ).toBe("openrouter:anthropic/claude-sonnet-5");
    for (const bad of [42, true, {}, [], "", "not-a-model-key", undefined])
      expect(sanitizeTaskModels({ subagentDefaultModel: bad }).subagentDefaultModel).toBeNull();
  });

  it("drops the removed exploreModel field", () => {
    expect(sanitizeTaskModels({ exploreModel: "deepseek:deepseek-v4-flash" })).not.toHaveProperty("exploreModel");
  });

  it("is read live by the models host port through the runtime service", () => {
    let configured: ModelKey | null = null;
    const settings = {
      getModelStorageState: () => ({
        taskModels: { defaultChatModel: null, utilityModel: null, subagentDefaultModel: configured },
      }),
    } as unknown as SettingsService;
    const port = createDesktopModelsHostPort(new ModelRuntimeService(settings, {} as ModelStoreService));
    expect(port.subagentDefaultModel()).toBeNull();
    configured = "deepseek:deepseek-v4-flash" as ModelKey;
    expect(port.subagentDefaultModel()).toBe("deepseek:deepseek-v4-flash");
  });
});
