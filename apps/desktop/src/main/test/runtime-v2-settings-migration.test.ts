import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsService, type SecretCrypto } from "../settings-service";

const roots: string[] = [];
const crypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain, "utf8"),
  decrypt: (cipher) => cipher.toString("utf8"),
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function rootWithSettingsV2(): Promise<{ readonly root: string; readonly rawV2: string }> {
  const root = await mkdtemp(join(tmpdir(), "actspace-settings-v3-"));
  roots.push(root);
  const initial = new SettingsService({ dataRoot: root, crypto });
  await initial.load();
  const current = initial.getV2();
  const rawV2 = `${JSON.stringify({ ...current, version: 2 }, null, 2)}\n`;
  await writeFile(join(root, "settings.json"), rawV2, "utf8");
  return { root, rawV2 };
}

async function rootWithSettingsV3(): Promise<{ readonly root: string; readonly rawV3: string }> {
  const root = await mkdtemp(join(tmpdir(), "actspace-settings-v4-"));
  roots.push(root);
  const initial = new SettingsService({ dataRoot: root, crypto });
  await initial.load();
  const current = initial.getV2();
  const rawV3 = `${JSON.stringify({ ...current, version: 3 }, null, 2)}\n`;
  await writeFile(join(root, "settings.json"), rawV3, "utf8");
  return { root, rawV3 };
}

describe("SettingsService v4 migration", () => {
  it("creates, updates, and removes a custom connection with a redacted V4 view", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-custom-connection-"));
    roots.push(root);
    const service = new SettingsService({ dataRoot: root, crypto });
    await service.load();
    const created = await service.createCustomConnection({ providerId: "openrouter", connectionId: "proxy-one", displayName: "Proxy One", apiKey: "secret-key", baseUrl: "https://proxy.example/v1", defaultModel: "gpt-4o-mini" });
    expect(created.settings.models.connections["proxy-one"]).toMatchObject({ connectionId: "proxy-one", displayName: "Proxy One", defaultModel: "gpt-4o-mini", baseUrl: "https://proxy.example/v1" });
    expect(JSON.stringify(created)).not.toContain("secret-key");
    const updated = await service.updateCustomConnection({ providerId: "openrouter", connectionId: "proxy-one", displayName: "Proxy Renamed", apiKey: "", baseUrl: "https://proxy.example/v2", defaultModel: "gpt-4.1" });
    expect(updated.settings.models.connections["proxy-one"]).toMatchObject({ displayName: "Proxy Renamed", defaultModel: "gpt-4o-mini", baseUrl: "https://proxy.example/v2" });
    const removed = await service.removeCustomConnection("proxy-one");
    expect(removed.settings.models.connections["proxy-one"]).toBeUndefined();
  });
  it("backs up a complete v2 file with a digest before atomically publishing v4", async () => {
    const { root, rawV2 } = await rootWithSettingsV2();
    await new SettingsService({ dataRoot: root, crypto }).load();

    expect(await readFile(join(root, "settings.v2.backup.json"), "utf8")).toBe(rawV2);
    expect(await readFile(join(root, "settings.v2.backup.sha256"), "utf8")).toBe(`${createHash("sha256").update(rawV2).digest("hex")}\n`);
    expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toMatchObject({ version: 4 });
  });

  it("rejects a conflicting backup and preserves the original v2 settings", async () => {
    const { root, rawV2 } = await rootWithSettingsV2();
    await writeFile(join(root, "settings.v2.backup.json"), "conflict\n", "utf8");

    await expect(new SettingsService({ dataRoot: root, crypto }).load()).rejects.toThrow("migration failed");
    expect(await readFile(join(root, "settings.json"), "utf8")).toBe(rawV2);
  });

  it("backs up a complete v3 file before publishing the v4 namespace shape", async () => {
    const { root, rawV3 } = await rootWithSettingsV3();
    await new SettingsService({ dataRoot: root, crypto }).load();

    expect(await readFile(join(root, "settings.v3.backup.json"), "utf8")).toBe(rawV3);
    expect(await readFile(join(root, "settings.v3.backup.sha256"), "utf8")).toBe(`${createHash("sha256").update(rawV3).digest("hex")}\n`);
    expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toMatchObject({ version: 4, general: {}, models: {}, tools: {} });
  });

  it("exposes a redacted v4 snapshot and rejects stale revisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-settings-v4-revision-"));
    roots.push(root);
    const service = new SettingsService({ dataRoot: root, crypto });
    await service.load();
    const initial = service.getV4();
    const next = await service.updateNamespaceV4({
      namespace: "general",
      expectedRevision: initial.revision,
      patch: { personalization: { displayName: "Jin", responseStyle: "concise" } },
    });

    expect(next.settings.general.personalization).toEqual({ displayName: "Jin", responseStyle: "concise" });
    const reloaded = new SettingsService({ dataRoot: root, crypto });
    await reloaded.load();
    expect(reloaded.getV4().settings.general.personalization).toEqual({ displayName: "Jin", responseStyle: "concise" });
    await expect(service.updateNamespaceV4({
      namespace: "general",
      expectedRevision: initial.revision,
      patch: { personalization: { displayName: "stale", responseStyle: "" } },
    })).rejects.toMatchObject({ name: "SettingsRevisionConflictError" });
    expect(JSON.stringify(next.settings)).not.toMatch(/apiKey|authorization|bearer/i);
  });

  it("blocks startup on malformed settings without replacing the source file", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-settings-invalid-"));
    roots.push(root);
    const invalid = "{ invalid-json\n";
    await writeFile(join(root, "settings.json"), invalid, "utf8");

    await expect(new SettingsService({ dataRoot: root, crypto }).load()).rejects.toThrow("invalid JSON");
    expect(await readFile(join(root, "settings.json"), "utf8")).toBe(invalid);
  });
});

it("migrates Flash aliases with bindings and credentials, with canonical configuration winning", async () => {
  const root = await mkdtemp(join(tmpdir(), "actspace-flash-migration-")); roots.push(root);
  const initial = new SettingsService({ dataRoot: root, crypto }); await initial.load();
  const settings = JSON.parse(await readFile(join(root, "settings.json"), "utf8"));
  delete settings.models.installed["deepseek:deepseek-flash"];
  settings.models.installed["deepseek:deepseek-v4-flash"] = { connectionId: "deepseek:default", enabled: false, addedAt: "2026-08-01T00:00:00Z", credentialId: "extra-key", customLabel: "My Flash" };
  settings.models.taskBindings.utility = "deepseek:deepseek-v4-flash";
  await writeFile(join(root, "settings.json"), JSON.stringify(settings));
  const migrated = new SettingsService({ dataRoot: root, crypto }); await migrated.load();
  expect(migrated.getV4().settings.models.installed["deepseek:deepseek-flash"]).toMatchObject({ enabled: false, customLabel: "My Flash", addedAt: "2026-08-01T00:00:00Z", credentialId: "extra-key" });
  expect(migrated.getV4().settings.models.taskBindings.utility).toBe("deepseek:deepseek-flash");
  const again = new SettingsService({ dataRoot: root, crypto }); await again.load();
  expect(again.getV4().settings.models).toEqual(migrated.getV4().settings.models);
  settings.models.installed = { "deepseek:deepseek-flash": { enabled: true, customLabel: "Canonical", addedAt: "2026-09-10T00:00:00Z" }, ...settings.models.installed };
  await writeFile(join(root, "settings.json"), JSON.stringify(settings));
  const preferred = new SettingsService({ dataRoot: root, crypto }); await preferred.load();
  expect(preferred.getV4().settings.models.installed["deepseek:deepseek-flash"]).toMatchObject({ enabled: true, customLabel: "Canonical" });
});

it("adds a known DeepSeek catalog model without overriding enabled state or credential bindings", async () => {
  const { ModelStoreService } = await import("../model-store-service");
  const { deepSeekModelDefinition } = await import("@actspace/shared");
  const root = await mkdtemp(join(tmpdir(), "actspace-deepseek-model-store-")); roots.push(root);
  const settings = new SettingsService({ dataRoot: root, crypto }); await settings.load();
  await settings.updateModelStorage({ installedModels: { "deepseek:deepseek-flash": { enabled: false, addedAt: "2026-08-01T00:00:00Z", customLabel: "Preserved", credentialId: "extra" } } });
  const fact = deepSeekModelDefinition("deepseek-flash")!;
  const models = new ModelStoreService({ settings, findCatalogModel: (_id, provider) => provider === "deepseek" ? { provider, apiModel: fact.apiModel, name: fact.label, contextWindow: fact.contextWindow, maxTokens: fact.maxTokens, input: fact.capabilities.input, toolUse: "declared", reasoning: true, isFree: false, added: true } : undefined });
  expect(await models.addCatalogModel("deepseek", "deepseek-flash")).toMatchObject({ ok: true, model: { definition: { source: "builtin", apiModel: "deepseek-flash" }, settings: { enabled: false, credentialId: "extra", customLabel: "Preserved" } } });
  expect(settings.getModelStorageState().customModels["deepseek:deepseek-flash"]).toBeUndefined();
  expect(models.listInstalledModels().filter((model) => model.definition.apiModel === "deepseek-flash")).toHaveLength(1);
});

it("retires Pro into Flash without retaining stale definitions, and prefers an existing Flash configuration", async () => {
  const { ModelStoreService } = await import("../model-store-service");
  const root = await mkdtemp(join(tmpdir(), "actspace-pro-migration-")); roots.push(root);
  const initial = new SettingsService({ dataRoot: root, crypto }); await initial.load();
  const settings = JSON.parse(await readFile(join(root, "settings.json"), "utf8"));
  settings.models.installed = { "deepseek:deepseek-v4-pro": { enabled: true, addedAt: "2026-08-01T00:00:00Z", credentialId: "pro-key" } };
  settings.models.definitions["deepseek:deepseek-v4-pro"] = { key: "deepseek:deepseek-v4-pro", provider: "deepseek", api: "openai-completions", apiModel: "deepseek-v4-pro", label: "DeepSeek V4 Pro", source: "provider-catalog" };
  settings.models.taskBindings.defaultChat = "deepseek:deepseek-v4-pro";
  await writeFile(join(root, "settings.json"), JSON.stringify(settings));
  const migrated = new SettingsService({ dataRoot: root, crypto }); await migrated.load();
  expect(migrated.getV4().settings.models.taskBindings.defaultChat).toBe("deepseek:deepseek-flash");
  expect(migrated.getV4().settings.models.installed["deepseek:deepseek-flash"]).toMatchObject({ enabled: true, credentialId: "pro-key" });
  const models = new ModelStoreService({ settings: migrated }).listInstalledModels();
  expect(models).toHaveLength(1);
  expect(models[0].definition).toMatchObject({ apiModel: "deepseek-flash", label: "deepseek-flash", capabilities: { input: ["text", "image"] } });
  settings.models.installed = { "deepseek:deepseek-v4-flash": { enabled: false, credentialId: "flash-key" }, ...settings.models.installed };
  await writeFile(join(root, "settings.json"), JSON.stringify(settings));
  const preferred = new SettingsService({ dataRoot: root, crypto }); await preferred.load();
  expect(preferred.getV4().settings.models.installed["deepseek:deepseek-flash"]).toMatchObject({ enabled: false, credentialId: "flash-key" });
});
