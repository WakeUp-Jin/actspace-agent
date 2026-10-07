/** 图片生成和语音的设置：图片生成配置和运行时配置、语音设置和语音 key。 */
import type { ImageGenerationSettingsView, SpeechSettings, UpdateImageGenerationSettingsInput } from "@actspace/shared";
import { normalizeImageGenerationBaseUrl, normalizeImageGenerationModel } from "../sanitize";
import type { SettingsStore } from "../store";
import { type ImageGenerationRuntimeConfig, ProviderSettingsError } from "../types";
import { cloneJson } from "../utils";

export function getImageGenerationRuntimeConfig(store: SettingsStore): ImageGenerationRuntimeConfig | undefined {
  const apiKey = store.getStoredKey("image-generation");
  if (!apiKey) return undefined;
  return {
    apiKey,
    baseUrl: store.settings.imageGeneration.baseUrl,
    model: store.settings.imageGeneration.model,
  };
}

export async function updateImageGeneration(
  store: SettingsStore,
  input: UpdateImageGenerationSettingsInput,
): Promise<ImageGenerationSettingsView> {
  return store.enqueueMutation(async () => {
    const previousSettings = cloneJson(store.settings);
    const previousSecrets = cloneJson(store.secrets);
    let secretsWritten = false;
    try {
      const baseUrl = normalizeImageGenerationBaseUrl(input.baseUrl);
      const model = normalizeImageGenerationModel(input.model);
      if (input.apiKey !== undefined) {
        store.assertCredentialStorageWritable();
        const trimmed = input.apiKey.trim();
        if (!trimmed) throw new ProviderSettingsError("API Key 不能为空。", "invalid_api_key");
        store.secrets["image-generation"] = trimmed;
        await store.writeSecretsFile();
        secretsWritten = true;
      }
      store.settings.imageGeneration = { baseUrl, model };
      await store.writeSettingsFile();
      store.applyToEnv();
      return getImageGenerationSettingsView(store);
    } catch (error) {
      store.settings = previousSettings;
      store.secrets = previousSecrets;
      if (secretsWritten) await store.restoreFilesBestEffort(previousSettings, previousSecrets);
      if (error instanceof ProviderSettingsError) throw error;
      throw new ProviderSettingsError("图片生成配置写入失败。", "write_failed");
    }
  });
}

export function getImageGenerationSettingsView(store: SettingsStore): ImageGenerationSettingsView {
  return {
    hasApiKey: Boolean(store.getStoredKey("image-generation")),
    baseUrl: store.settings.imageGeneration.baseUrl,
    model: store.settings.imageGeneration.model,
  };
}

export function getSpeechSettings(store: SettingsStore): SpeechSettings { return { ...store.v4Metadata.speech }; }

export async function setSpeechKey(store: SettingsStore, apiKey: string | null): Promise<{ ok: boolean; error?: string }> {
  return store.enqueueMutation(async () => {
    const previous = { ...store.secrets };
    try {
      store.assertCredentialStorageWritable();
      if (apiKey?.trim()) store.secrets["speech-minimax"] = apiKey.trim();
      else delete store.secrets["speech-minimax"];
      await store.writeSecretsFile();
    } catch {
      store.secrets = previous;
      return { ok: false, error: "语音 Key 保存失败，请检查凭据存储。" };
    }
    const notification = { revision: store.getV4().revision, changedNamespaces: ["media" as const] };
    for (const listener of store.v4ChangeListeners) { try { listener(notification); } catch { /* Storage already committed. */ } }
    return { ok: true };
  });
}
