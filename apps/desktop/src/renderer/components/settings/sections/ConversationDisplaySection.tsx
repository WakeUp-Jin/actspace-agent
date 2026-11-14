import { useState } from "react";
import { SettingGroup, SettingRow, Toggle } from "../SettingsPrimitives";
import type { SectionProps } from "./shared";

type DisplayToggle = "showTurnCodeChanges" | "simplifyThinking";

export function ConversationDisplaySection({ settingsV4, onUpdateNamespace }: SectionProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const general = settingsV4?.settings.general;
  const change = async (key: DisplayToggle, enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await onUpdateNamespace({ namespace: "general", patch: { [key]: enabled } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存对话显示设置");
    } finally {
      setSaving(false);
    }
  };
  return (
    <SettingGroup title="对话显示" headingLevel={3}>
      <SettingRow
        title="显示本轮代码改动"
        control={
          <Toggle
            checked={general?.showTurnCodeChanges !== false}
            disabled={!settingsV4 || saving}
            onChange={(enabled) => change("showTurnCodeChanges", enabled)}
            ariaLabel="显示本轮代码改动"
          />
        }
      />
      <SettingRow
        title="简化思考过程"
        description="思考进行时只显示状态和用时，不展开正文。点击标题仍可查看全文。"
        control={
          <Toggle
            checked={general?.simplifyThinking !== false}
            disabled={!settingsV4 || saving}
            onChange={(enabled) => change("simplifyThinking", enabled)}
            ariaLabel="简化思考过程"
          />
        }
      />
      {error ? (
        <p role="alert" className="text-act-xs text-on-danger">
          {error}
        </p>
      ) : null}
    </SettingGroup>
  );
}
