import { useEffect, useState } from "react";
import type { ConnectionModelView, ModelOverrides, ModelRates } from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { Button } from "../../ui/Button";
import { SettingsInput, Toggle } from "../SettingsPrimitives";
import { CommitInput, DefaultLevelSelect, EditGrid, EditItem, KeyFacts, LevelToggles, PriceFields, ratesToTexts } from "./model-fields";
import { EMPTY_RATES, canSeeImages, isWellKnown, parsePositive, parseRate, toggleLevel, withOverride } from "./model-view";

/**
 * 模型展开区。已知模型平时只给三项关键信息（上下文、默认思考、价格），其余收进「更多设置」；
 * 未知模型直接展开要补的字段，可以沿用一个已知模型。每个字段失焦即保存。
 */
export function ModelPanel({ connectionId, model, onSave, onRemove }: { connectionId: string; model: ConnectionModelView; onSave: (overrides: ModelOverrides | null) => void; onRemove: () => void }) {
  const [more, setMore] = useState(false);
  const { effective, overrides } = model;
  const known = isWellKnown(effective);
  const thinking = effective.thinking;
  const set = <K extends keyof ModelOverrides>(field: K, value: ModelOverrides[K] | undefined) => onSave(withOverride(overrides, field, value));
  const setDefault = (level: NonNullable<typeof thinking>["default"]) => thinking && set("thinking", { levels: thinking.levels, default: level });
  const moreButton = <Button variant="ghost" size="xs" onClick={() => setMore((value) => !value)}>{more ? "收起" : "更多设置"}</Button>;

  if (known && !more) {
    return (
      <div className="px-4 pb-4 pl-[50px] max-[600px]:pl-4">
        <KeyFacts effective={effective} onDefault={setDefault} actions={moreButton} />
      </div>
    );
  }

  const manualPrice = effective.sources.rates === "user" || !effective.rates;
  const commitNumber = (field: "contextWindow" | "maxOutput") => (text: string) => {
    const value = parsePositive(text);
    if (value === undefined) return false;
    set(field, value ?? undefined);
  };
  const commitRate = (field: keyof ModelRates, text: string) => {
    const value = parseRate(text);
    if (value === undefined) return false;
    const base: ModelRates = overrides?.rates ?? effective.rates ?? EMPTY_RATES;
    if ((field === "input" || field === "output") && value === null) return false;
    set("rates", { ...base, [field]: value });
  };

  const items = {
    label: <EditItem key="label" label="显示名称"><CommitInput width="md" value={effective.label} aria-label="显示名称" onCommit={(text) => set("label", text.trim() || undefined)} /></EditItem>,
    context: (
      <EditItem key="context" label="上下文">
        <CommitInput width="sm" numeric value={effective.contextWindow ? String(effective.contextWindow) : ""} placeholder="128000" aria-label="上下文" onCommit={commitNumber("contextWindow")} />
        <span className="text-act-xs text-text-faint">tokens</span>
      </EditItem>
    ),
    output: (
      <EditItem key="output" label="最大输出">
        <CommitInput width="sm" numeric value={effective.maxOutput ? String(effective.maxOutput) : ""} placeholder="32000" aria-label="最大输出" onCommit={commitNumber("maxOutput")} />
        <span className="text-act-xs text-text-faint">tokens</span>
      </EditItem>
    ),
    levels: <EditItem key="levels" label="思考档位"><LevelToggles levels={thinking?.levels ?? []} onToggle={(level) => set("thinking", toggleLevel(thinking, level))} /></EditItem>,
    defaultLevel: thinking && thinking.levels.length > 1
      ? <EditItem key="default" label="默认思考"><DefaultLevelSelect levels={thinking.levels} value={thinking.default} onChange={setDefault} /></EditItem>
      : null,
    image: <EditItem key="image" label="看图"><Toggle checked={canSeeImages(effective)} ariaLabel="看图" onChange={(next) => set("input", next ? ["text", "image"] : ["text"])} /></EditItem>,
    price: (
      <EditItem key="price" label="价格">
        <PriceFields values={ratesToTexts(effective.rates)} editable={manualPrice} onCommit={commitRate} />
        {effective.sources.rates === "user" && (effective.catalog?.exact || effective.aliased)
          ? <Button variant="ghost" size="xs" onClick={() => set("rates", undefined)}>用目录价</Button>
          : !manualPrice ? <Button variant="ghost" size="xs" onClick={() => set("rates", effective.rates!)}>手动填</Button> : null}
      </EditItem>
    ),
  };
  const fields = known || more
    ? [items.label, items.context, items.output, items.levels, items.defaultLevel, items.image, items.price]
    : [items.context, items.levels, items.defaultLevel, items.image];

  return (
    <div className="flex flex-col gap-3.5 px-4 pb-4 pl-[50px] max-[600px]:pl-4">
      {known ? null : <AliasNote connectionId={connectionId} model={model} onAlias={(canonical) => set("canonical", canonical)} />}
      <EditGrid>{fields}</EditGrid>
      <div className="-mx-2 flex flex-wrap items-center gap-1.5">
        {known && overrides ? <Button variant="ghost" size="xs" onClick={() => onSave(null)}>恢复目录值</Button> : null}
        {effective.aliased ? <Button variant="ghost" size="xs" onClick={() => set("canonical", undefined)}>取消沿用 {effective.catalog?.name}</Button> : null}
        {model.removable ? <Button variant="danger" size="xs" onClick={onRemove}>移除模型</Button> : null}
        <span className="flex-1" />
        {moreButton}
      </div>
    </div>
  );
}

/** 未知模型顶部：沿用一个已知模型就不用自己填。有日期版本的建议时给一个按钮，否则填目录模型 ID。 */
function AliasNote({ connectionId, model, onAlias }: { connectionId: string; model: ConnectionModelView; onAlias: (canonical: string) => void }) {
  const suggestion = model.effective.catalog && !model.effective.catalog.exact ? model.effective.catalog : null;
  const [text, setText] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => setMissing(null), [text]);
  const tryAlias = async () => {
    const canonical = text.trim();
    if (!canonical) return;
    const result = await modelConnectionsApi.preview({ apiModel: model.apiModel, connectionId, overrides: { canonical } }).catch(() => null);
    if (result?.effective.aliased) onAlias(canonical);
    else setMissing(canonical);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-act-xs text-text-muted">
      <span className="min-w-0 flex-1">{missing ? `模型目录里没有 ${missing}。` : "沿用一个已知模型，就不用自己填。"}</span>
      {suggestion ? <Button size="xs" onClick={() => onAlias(suggestion.apiModel)}>沿用 {suggestion.name}</Button> : null}
      <SettingsInput
        width="sm"
        mono
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void tryAlias(); }}
        placeholder="目录模型 ID"
        aria-label="沿用的目录模型 ID"
      />
      <Button size="xs" disabled={!text.trim()} onClick={() => void tryAlias()}>沿用</Button>
    </div>
  );
}
