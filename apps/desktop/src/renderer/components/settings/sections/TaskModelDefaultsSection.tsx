import { useEffect, useState } from "react";
import type { SettingsV4NamespacePatch, SettingsV4Snapshot } from "@actspace/shared";
import type { SettingsSectionId } from "../SettingsNav";
import { SettingGroup, SettingLinkRow, SettingsInput, useSettingsSaveNotice, SettingRow, Stepper } from "../SettingsPrimitives";

type GenerationDefaults = { temperature: string; maxOutputTokens: string; compactionPercent: number };

function parseTemperature(raw: string): number | null | "invalid" {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 2 ? value : "invalid";
}

function parseMaxOutputTokens(raw: string): number | null | "invalid" {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : "invalid";
}

/** 生成参数。各用途用哪个模型在「模型」页设置，这里只留入口。 */
export function TaskModelDefaultsSection({
  settingsV4,
  onUpdateNamespace,
  onNavigate,
}: {
  settingsV4?: SettingsV4Snapshot | null;
  onUpdateNamespace?: (input: SettingsV4NamespacePatch) => Promise<SettingsV4Snapshot | null>;
  onNavigate?: (section: SettingsSectionId) => void;
}) {
  const notifySaved = useSettingsSaveNotice();
  const [draft, setDraft] = useState<GenerationDefaults>({ temperature: "", maxOutputTokens: "", compactionPercent: 80 });
  const [fieldError, setFieldError] = useState<{ temperature?: string; maxOutputTokens?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const v4Ready = Boolean(settingsV4 && onUpdateNamespace);
  const savedDefaults = settingsV4?.settings.general.taskDefaults;

  useEffect(() => {
    if (!savedDefaults) return;
    setDraft({
      temperature: savedDefaults.temperature === null ? "" : String(savedDefaults.temperature),
      maxOutputTokens: savedDefaults.maxOutputTokens === null ? "" : String(savedDefaults.maxOutputTokens),
      compactionPercent: Math.round((savedDefaults.chatCompactionTriggerRatio ?? 0.8) * 100),
    });
  }, [savedDefaults]);

  /** 失焦或步进时保存；只提交合法且与已保存值不同的生成参数。 */
  const commitDefaults = async (next: GenerationDefaults) => {
    const temperature = parseTemperature(next.temperature);
    const maxOutputTokens = parseMaxOutputTokens(next.maxOutputTokens);
    const errors = {
      temperature: temperature === "invalid" ? "温度需在 0–2 之间；留空使用模型默认值。" : undefined,
      maxOutputTokens: maxOutputTokens === "invalid" ? "需为 1–1,000,000 的整数；留空使用模型默认值。" : undefined,
    };
    setFieldError(errors);
    if (temperature === "invalid" || maxOutputTokens === "invalid" || !onUpdateNamespace) return;
    const chatCompactionTriggerRatio = next.compactionPercent / 100;
    if (savedDefaults
      && savedDefaults.temperature === temperature
      && savedDefaults.maxOutputTokens === maxOutputTokens
      && Math.abs((savedDefaults.chatCompactionTriggerRatio ?? 0.8) - chatCompactionTriggerRatio) < 1e-9) return;
    setError(null);
    try {
      await onUpdateNamespace({
        namespace: "general",
        patch: { taskDefaults: { temperature, maxOutputTokens, chatCompactionTriggerRatio } },
      });
      notifySaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成参数保存失败，请重试。");
    }
  };

  const fieldDescription = (message: string | undefined, fallback?: string) =>
    message ? <span className="text-on-danger">{message}</span> : fallback;

  return (
    <SettingGroup title="模型与生成" headingLevel={3} description="新请求使用的模型和生成参数，只影响之后的请求。">
      <SettingLinkRow
        title="用途模型"
        description="会话默认、轻量任务、自动审批、子 Agent 探索和看图，在「模型」中设置。"
        ariaLabel="前往模型设置用途模型"
        disabled={!onNavigate}
        onClick={() => onNavigate?.("model")}
      />
      <SettingRow
        title="温度"
        description={fieldDescription(fieldError.temperature)}
        control={
          <SettingsInput
            aria-label="默认温度"
            type="number"
            min="0"
            max="2"
            step="0.1"
            width="sm"
            numeric
            invalid={Boolean(fieldError.temperature)}
            value={draft.temperature}
            placeholder="模型默认"
            disabled={!v4Ready}
            onChange={(event) => setDraft((current) => ({ ...current, temperature: event.target.value }))}
            onBlur={() => void commitDefaults(draft)}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        }
      />
      <SettingRow
        title="最大输出 Token"
        description={fieldDescription(fieldError.maxOutputTokens)}
        control={
          <SettingsInput
            aria-label="默认最大输出 Token"
            type="number"
            min="1"
            max="1000000"
            step="1"
            width="sm"
            numeric
            invalid={Boolean(fieldError.maxOutputTokens)}
            value={draft.maxOutputTokens}
            placeholder="模型默认"
            disabled={!v4Ready}
            onChange={(event) => setDraft((current) => ({ ...current, maxOutputTokens: event.target.value }))}
            onBlur={() => void commitDefaults(draft)}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        }
      />
      <SettingRow
        title="自动压缩阈值"
        description={fieldDescription(error ?? undefined, "仅 Chat 模式：上下文占用达到该比例时压缩历史。")}
        control={
          <Stepper
            ariaLabel="自动压缩阈值"
            value={draft.compactionPercent}
            min={50}
            max={95}
            step={5}
            defaultValue={80}
            disabled={!v4Ready}
            format={(value) => `${value}%`}
            onChange={(compactionPercent) => {
              const next = { ...draft, compactionPercent };
              setDraft(next);
              void commitDefaults(next);
            }}
          />
        }
      />
    </SettingGroup>
  );
}
