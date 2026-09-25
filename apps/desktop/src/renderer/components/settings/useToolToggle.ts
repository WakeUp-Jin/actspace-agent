import { useCallback } from "react";
import type { AppSettings, SettingsUpdateInput, SettingsV4NamespacePatch, SettingsV4Snapshot } from "@actspace/shared";
import { useSettingsSaveNotice } from "./SettingsPrimitives";

function settingsV4Writable(settingsV4?: SettingsV4Snapshot | null): boolean {
  return Boolean(settingsV4 && typeof window !== "undefined" && window.actspace?.getSettingsV4 && window.actspace?.updateSettingsV4);
}

/**
 * 工具启用状态的读写。v4 可用时写 tools namespace，否则回落到旧 agent.disabledTools。
 * 工具页与搜索页共用，保证 web_search 开关只有一份写入逻辑。
 */
export function useToolToggle({
  settings,
  settingsV4,
  onUpdate,
  onUpdateNamespace,
}: {
  settings: AppSettings;
  settingsV4?: SettingsV4Snapshot | null;
  onUpdate: (input: SettingsUpdateInput) => void;
  onUpdateNamespace: (input: SettingsV4NamespacePatch) => Promise<SettingsV4Snapshot | null>;
}) {
  const notifySaved = useSettingsSaveNotice();
  const disabled = settingsV4?.settings.tools.disabledTools ?? settings.agent.disabledTools;
  const v4Writable = settingsV4Writable(settingsV4);

  const writeDisabled = useCallback((nextDisabledTools: string[]) => {
    if (v4Writable) {
      void onUpdateNamespace({ namespace: "tools", patch: { disabledTools: nextDisabledTools } })
        .then(() => notifySaved())
        .catch((error: unknown) => {
          console.error("Failed to update tool settings", error);
        });
    } else {
      onUpdate({ agent: { disabledTools: nextDisabledTools } });
      notifySaved();
    }
  }, [notifySaved, onUpdate, onUpdateNamespace, v4Writable]);

  const setToolEnabled = useCallback((names: string | string[], enabled: boolean) => {
    const set = new Set(disabled);
    for (const name of Array.isArray(names) ? names : [names]) {
      if (enabled) set.delete(name);
      else set.add(name);
    }
    writeDisabled([...set]);
  }, [disabled, writeDisabled]);

  const isEnabled = useCallback((name: string) => !disabled.includes(name), [disabled]);

  return { disabled, isEnabled, setToolEnabled, writeDisabled, v4Writable };
}
