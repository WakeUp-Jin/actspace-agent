// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsV4Tools } from "@actspace/shared";
import { SettingsService } from "../settings-service";
import { SettingsStore } from "../settings/store";
import { ModelRuntimeService } from "../model-runtime-service";
import type { ModelStoreService } from "../model-store-service";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const crypto = { isAvailable: async () => true, encrypt: async (plain: string) => Buffer.from(plain), decrypt: async (cipher: Buffer) => cipher.toString() };

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "actspace-deepseek-availability-")); roots.push(root);
  const settings = new SettingsService({ dataRoot: root, crypto }); await settings.load();
  const runtime = new ModelRuntimeService(settings, {} as ModelStoreService);
  const update = (patch: Partial<SettingsV4Tools>) => settings.updateNamespaceV4({ namespace: "tools", expectedRevision: settings.getV4().revision, patch });
  return { settings, runtime, update };
}

describe("DeepSeek deep search and document availability", () => {
  it("requires both the switch and the DeepSeek key", async () => {
    const { settings, runtime, update } = await setup();
    expect([runtime.isDeepseekDeepSearchAvailable(), runtime.isDeepseekDocumentAvailable()]).toEqual([false, false]);
    await update({ deepseekDeepSearchEnabled: true, deepseekDocumentEnabled: true });
    expect([runtime.isDeepseekDeepSearchAvailable(), runtime.isDeepseekDocumentAvailable()]).toEqual([false, false]);
    await settings.setProviderKey("deepseek", "fixture-ds");
    expect([runtime.isDeepseekDeepSearchAvailable(), runtime.isDeepseekDocumentAvailable()]).toEqual([true, true]);
    expect(runtime.getDeepseekApiKey()).toBe("fixture-ds");
    await update({ deepseekDeepSearchEnabled: false, deepseekDocumentEnabled: false });
    expect([runtime.isDeepseekDeepSearchAvailable(), runtime.isDeepseekDocumentAvailable()]).toEqual([false, false]);
  });

  it("hides deep search when web_search is disabled without affecting documents, falling back to the legacy list", async () => {
    const { settings, runtime, update } = await setup();
    await settings.setProviderKey("deepseek", "fixture-ds");
    await update({ deepseekDeepSearchEnabled: true, deepseekDocumentEnabled: true, disabledTools: ["web_search"] });
    expect([runtime.isDeepseekDeepSearchAvailable(), runtime.isDeepseekDocumentAvailable()]).toEqual([false, true]);
    await update({ disabledTools: [] });
    expect(runtime.isDeepseekDeepSearchAvailable()).toBe(true);
    const store = (settings as unknown as { store: SettingsStore }).store;
    store.settings.agent.disabledTools = ["web_search"];
    expect(store.v4Metadata.tools.disabledTools).toEqual([]);
    expect(runtime.isDeepseekDeepSearchAvailable()).toBe(false);
    expect(runtime.isDeepseekDocumentAvailable()).toBe(true);
  });

  it("reflects switch and key changes on the next call", async () => {
    const { settings, runtime, update } = await setup();
    await update({ deepseekDocumentEnabled: true });
    await settings.setProviderKey("deepseek", "fixture-ds");
    expect(runtime.isDeepseekDocumentAvailable()).toBe(true);
    await settings.clearProviderKey("deepseek");
    expect(runtime.isDeepseekDocumentAvailable()).toBe(false);
    expect(runtime.getDeepseekApiKey()).toBeUndefined();
    await settings.setProviderKey("deepseek", "fixture-ds-2");
    expect(runtime.isDeepseekDocumentAvailable()).toBe(true);
    expect(runtime.getDeepseekApiKey()).toBe("fixture-ds-2");
  });

  it("answers without taking a settings snapshot", async () => {
    const { settings, runtime, update } = await setup();
    await settings.setProviderKey("deepseek", "fixture-ds");
    await update({ deepseekDeepSearchEnabled: true, deepseekDocumentEnabled: true });
    const getV4 = vi.spyOn(SettingsStore.prototype, "getV4");
    const getV2 = vi.spyOn(SettingsService.prototype, "getV2");
    const serviceGetV4 = vi.spyOn(SettingsService.prototype, "getV4");
    runtime.isDeepseekDeepSearchAvailable();
    runtime.isDeepseekDocumentAvailable();
    runtime.getDeepseekApiKey();
    expect(getV4).not.toHaveBeenCalled();
    expect(getV2).not.toHaveBeenCalled();
    expect(serviceGetV4).not.toHaveBeenCalled();
  });
});
