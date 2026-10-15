import { useState } from "react";
import { SettingGroup, SettingRow, Toggle } from "../SettingsPrimitives";
import type { SectionProps } from "./shared";

export function ConversationDisplaySection({ settingsV4, onUpdateNamespace }: SectionProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = async (enabled: boolean) => {
    setSaving(true); setError(null);
    try { await onUpdateNamespace({ namespace: "general", patch: { showTurnCodeChanges: enabled } }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法保存对话显示设置"); }
    finally { setSaving(false); }
  };
  return <SettingGroup title="对话显示" headingLevel={3}>
    <SettingRow title="显示本轮代码改动" description="每轮回复结束后，在回复下方列出本轮编辑过的文件和增删行数。Agent 交付的文件卡片不受影响。"
      control={<Toggle checked={settingsV4?.settings.general.showTurnCodeChanges !== false} disabled={!settingsV4 || saving}
        onChange={change} ariaLabel="显示本轮代码改动" />} />
    {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
  </SettingGroup>;
}
