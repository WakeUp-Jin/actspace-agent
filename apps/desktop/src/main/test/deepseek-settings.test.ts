// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsService } from "../settings-service";
import { ModelRuntimeService } from "../model-runtime-service";
import type { ModelStoreService } from "../model-store-service";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const crypto = { isAvailable: () => true, encrypt: (plain: string) => Buffer.from(plain), decrypt: (cipher: Buffer) => cipher.toString() };

describe("DeepSeek settings and runtime authorization", () => {
  it("requires separate opt-ins, keeps other sources enabled, persists choices and observes live changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-deepseek-test-")); roots.push(root);
    const settings = new SettingsService({ dataRoot: root, crypto }); await settings.load();
    await settings.setProviderKey("deepseek", "fixture-ds");
    await settings.setProviderKey("zhipu", "fixture-zp");
    await settings.setProviderKey("tavily", "fixture-tv");
    const runtime = new ModelRuntimeService(settings, {} as ModelStoreService);
    expect(runtime.getToolEnvironment().searchCredentials).toEqual({ zhipu: "fixture-zp", tavily: "fixture-tv" });
    expect(runtime.getToolEnvironment().deepseekFetchApiKey).toBeUndefined();
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
    const update = (patch: Partial<import("@actspace/shared").SettingsV4Tools>) => settings.updateNamespaceV4({ namespace: "tools", expectedRevision: settings.getV4().revision, patch });
    await update({ searchProviders: { deepseek: { enabled: true } } });
    expect(runtime.getToolEnvironment().searchCredentials).toEqual({ deepseek: "fixture-ds", zhipu: "fixture-zp", tavily: "fixture-tv" });
    await update({ searchProviders: { zhipu: { enabled: false } }, deepseekFetchEnabled: true });
    expect(runtime.getToolEnvironment().searchCredentials).toEqual({ deepseek: "fixture-ds", tavily: "fixture-tv" });
    expect(runtime.getToolEnvironment().deepseekFetchApiKey).toBe("fixture-ds");
    await update({ searchProviders: { deepseek: { enabled: false } } });
    expect(runtime.getToolEnvironment().searchCredentials).toEqual({ tavily: "fixture-tv" });
    expect(runtime.getToolEnvironment().deepseekFetchApiKey).toBe("fixture-ds");
    const reloaded = new SettingsService({ dataRoot: root, crypto }); await reloaded.load();
    expect(reloaded.getV4().settings.tools).toMatchObject({ searchProviders: { deepseek: { enabled: false }, zhipu: { enabled: false }, tavily: { enabled: true } }, deepseekFetchEnabled: true });
    expect(JSON.stringify(reloaded.get())).not.toContain("fixture-ds");
    await update({ disabledTools: ["web_search"] });
    expect(runtime.getToolEnvironment().searchCredentials).toEqual({});
    expect(runtime.getToolEnvironment().deepseekFetchApiKey).toBe("fixture-ds");
    await update({ deepseekFetchEnabled: false });
    expect(runtime.getToolEnvironment().deepseekFetchApiKey).toBeUndefined();
  });
});
