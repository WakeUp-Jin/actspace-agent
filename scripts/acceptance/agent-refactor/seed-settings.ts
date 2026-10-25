import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SettingsService } from "../../../apps/desktop/src/main/settings-service";
import { ModelStoreService } from "../../../apps/desktop/src/main/model-store-service";
import { ModelConnectionsService } from "../../../apps/desktop/src/main/model-connections-service";
import { ProviderNetworkService } from "../../../apps/desktop/src/main/runtime-v2/provider-network-service";

const MARKER = "actspace-acceptance-fixture-v1";
const LABEL = "Acceptance Fixture";

/** Refuses an existing non-fixture profile before loading any settings or secrets. */
export async function seedSettings(dataRoot: string, baseUrl: string) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)) throw new Error("Fixture provider must be local");
  await mkdir(dataRoot, { recursive: true });
  const marker = join(dataRoot, ".acceptance-fixture");
  const marked = await readFile(marker, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (marked !== MARKER) {
    for (const file of ["settings.json", "secrets.json"]) {
      const exists = await access(join(dataRoot, file)).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; });
      if (exists) throw new Error("Refusing to seed an existing non-fixture profile");
    }
    await writeFile(marker, MARKER, { flag: "wx", mode: 0o600 });
  }
  const settings = new SettingsService({ dataRoot, crypto: {
    isAvailable: () => true,
    encrypt: () => { throw new Error("Fixture must not create legacy encrypted credentials"); },
    decrypt: () => { throw new Error("Fixture must not read legacy encrypted credentials"); },
  } });
  await settings.load();
  const network = new ProviderNetworkService();
  try {
    const service = new ModelConnectionsService(settings, new ModelStoreService({ settings }), network);
    let connection = service.list().connections.find(item => item.label === LABEL);
    if (!connection) {
      const created = await service.create({ templateId: "custom", label: LABEL, protocol: "openai-completions", baseUrl,
        apiKey: "synthetic-acceptance-credential", models: ["fixture-main", "fixture-alternate"].map(apiModel => ({
          apiModel, providerFacts: { label: apiModel, contextWindow: 32768, maxOutput: 4096, input: ["text", "image"],
            thinking: { levels: ["off", "low", "medium", "high"], default: "medium" } },
        })),
      });
      if (!created.ok) throw new Error(created.error.message);
      connection = created.view.connections.find(item => item.connectionId === created.connectionId);
    } else {
      const updated = await service.update({ connectionId: connection.connectionId, baseUrl });
      if (!updated.ok) throw new Error(updated.error.message);
    }
    const model = connection?.models.find(item => item.apiModel === "fixture-main")?.key;
    if (!model || connection?.models.length !== 2) throw new Error("Fixture model configuration is incomplete");
    const binding = { model, thinking: null };
    const result = await service.updatePurposes({ chat: binding, utility: binding, explore: binding });
    if (!result.ok) throw new Error(result.error.message);
    return result.view;
  } finally { await network.dispose(); }
}
