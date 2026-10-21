import { useCallback, useEffect, useState } from "react";
import type {
  AppSettings,
  SecretProviderId,
  SetProviderKeyResult,
  SettingsUpdateInput,
  SettingsV4NamespacePatch,
  SettingsV4Snapshot,
} from "@actspace/shared";
import { providersApi } from "../../api/providers";
import { settingsApi } from "../../api/settings";

// 设置页的数据：首次加载旧版设置和 v4 快照，各 section 通过这里保存。
// 每次保存成功都把最新的旧版设置回传给 onSettingsChange（上层的 Composer 默认模型等依赖它）。

function mergeSettings(current: AppSettings, input: SettingsUpdateInput): AppSettings {
  return {
    ...current,
    defaultModelId: input.defaultModelId !== undefined ? input.defaultModelId : current.defaultModelId,
    agent: input.agent ? { ...current.agent, ...input.agent } : current.agent,
    skills: input.skills ? { ...current.skills, ...input.skills } : current.skills,
  };
}

export function useSettings(onSettingsChange?: (settings: AppSettings) => void) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsV4, setSettingsV4] = useState<SettingsV4Snapshot | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      settingsApi.get(),
      settingsApi.getV4(),
    ])
      .then(([next, nextV4]) => {
        setSettings(next);
        setSettingsV4(nextV4);
        setSettingsError(null);
      })
      .catch((error: unknown) => {
        console.error("Failed to load settings", error);
        setSettingsError("读取设置失败。");
      });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await settingsApi.get();
      setSettings(next);
      setSettingsV4(await settingsApi.getV4());
      onSettingsChange?.(next);
    } catch (error) {
      console.error("Failed to refresh settings", error);
    }
  }, [onSettingsChange]);

  const updateNamespace = useCallback(async (input: SettingsV4NamespacePatch): Promise<SettingsV4Snapshot | null> => {
    if (!settingsV4) return null;
    const result = await settingsApi.updateV4({ ...input, expectedRevision: settingsV4.revision });
    if ("latest" in result) {
      setSettingsV4(result.latest);
      throw new Error(result.message);
    }
    setSettingsV4(result.snapshot);
    const legacy = await settingsApi.get();
    setSettings(legacy);
    onSettingsChange?.(legacy);
    return result.snapshot;
  }, [onSettingsChange, settingsV4]);

  const update = useCallback(
    (input: SettingsUpdateInput) => {
      setSettings((current) => (current ? mergeSettings(current, input) : current));
      settingsApi.update(input)
        .then((next) => {
          setSettings(next);
          onSettingsChange?.(next);
        })
        .catch((error: unknown) => {
          console.error("Failed to update settings", error);
        });
    },
    [onSettingsChange],
  );

  const replaceSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    onSettingsChange?.(next);
  }, [onSettingsChange]);

  const saveProviderKey = useCallback(
    async (provider: SecretProviderId, apiKey: string): Promise<SetProviderKeyResult> => {
      const result = await providersApi.setKey({ provider, apiKey });
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const clearProviderKey = useCallback(
    async (provider: SecretProviderId) => {
      await providersApi.clearKey({ provider });
      await refresh();
    },
    [refresh],
  );

  return { settings, settingsV4, settingsError, refresh, update, updateNamespace, replaceSettings, saveProviderKey, clearProviderKey };
}
