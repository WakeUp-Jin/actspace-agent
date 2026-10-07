import { useState } from "react";
import { SettingGroup, SettingRow, Toggle } from "../SettingsPrimitives";
import type { SectionProps } from "./shared";

export function PerformanceSection({ settingsV4, onUpdateNamespace }: SectionProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = async (enabled: boolean) => {
    setSaving(true); setError(null);
    try { await onUpdateNamespace({ namespace: "general", patch: { performanceMonitoring: enabled } }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法保存性能监控设置"); }
    finally { setSaving(false); }
  };
  return <SettingGroup title="性能监控" headingLevel={3}>
    <SettingRow title="显示性能面板" description="在左侧栏底部显示 CPU 和内存。每 2 秒采样，关闭后停止采集。"
      control={<Toggle checked={settingsV4?.settings.general.performanceMonitoring === true} disabled={!settingsV4 || saving}
        onChange={change} ariaLabel="显示性能面板" />} />
    {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
  </SettingGroup>;
}
