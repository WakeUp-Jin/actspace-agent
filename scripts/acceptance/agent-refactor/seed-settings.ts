import { SettingsService } from "../../../apps/desktop/src/main/settings-service";
import { buildCustomModelDefinition } from "../../../packages/shared/src/custom-model-input";

/** Creates only new synthetic data; never reads a user's settings directory. */
export async function seedSettings(dataRoot: string, baseUrl: string) {
  const settings = new SettingsService({ dataRoot, crypto: {
    isAvailable: () => true,
    encrypt: () => { throw new Error("Fixture must not create legacy encrypted credentials"); },
    decrypt: () => { throw new Error("Fixture must not read legacy encrypted credentials"); },
  } });
  await settings.load();
  const connection = { providerId: "openrouter" as const, protocol: "openai-completions" as const, connectionId: "acceptance-fixture" };
  await settings.createCustomConnection({ ...connection, displayName: "Acceptance Fixture", baseUrl, apiKey: "synthetic-acceptance-credential", defaultModel: "fixture-main" });
  const definitions = ["fixture-main", "fixture-alternate"].map(apiModel => buildCustomModelDefinition({
    apiModel, label: apiModel, enabled: true, contextWindow: 32768, maxTokens: 4096,
    input: ["text", "image"], pricing: null,
    reasoningConfig: { mode: "manual", support: "supported", efforts: ["low", "medium", "high"], defaultEffort: "medium", allowOff: true },
  }, connection));
  await settings.updateModelStorage({
    customModels: Object.fromEntries(definitions.map(model => [model.key, model])),
    installedModels: Object.fromEntries(definitions.map(model => [model.key, { enabled: true, addedAt: new Date().toISOString(), connectionId: connection.connectionId }])),
  });
  await settings.update({ taskModels: { defaultChatModel: definitions[0]!.key, utilityModel: definitions[0]!.key, exploreModel: definitions[0]!.key } });
}
