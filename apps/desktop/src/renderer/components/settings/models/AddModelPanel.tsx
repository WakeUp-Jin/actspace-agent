import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { EffectiveModel, ModelApi, ModelOverrides, ModelRates, ThinkingLevel } from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { Button } from "../../ui/Button";
import { SettingsInput, Toggle } from "../SettingsPrimitives";
import { DefaultLevelSelect, EditGrid, EditItem, KeyFacts, LevelToggles, PriceFields, type RateTexts } from "./model-fields";
import { parsePositive, parseRate, toggleLevel } from "./model-view";

export type AddModelTarget =
  | { kind: "draft"; templateId: string; protocol: ModelApi; multiplier: number }
  | { kind: "connection"; connectionId: string };

export type AddedModel = { apiModel: string; overrides?: ModelOverrides; effective: EffectiveModel };

const EMPTY_RATES: RateTexts = { input: "", output: "", cacheRead: "", cacheWrite: "" };

/**
 * 就地添加模型：先填 ID，边输入边预览。目录里有的只给三项关键信息；没有的可以沿用一个已知模型，
 * 或者自己填上下文、思考档位、看图，其余收进「更多设置」。
 */
export function AddModelPanel({ target, onAdd, onCancel }: { target: AddModelTarget; onAdd: (model: AddedModel) => Promise<boolean>; onCancel: () => void }) {
  const [apiModel, setApiModel] = useState("");
  const [label, setLabel] = useState("");
  const [canonical, setCanonical] = useState("");
  const [aliasText, setAliasText] = useState("");
  const [preview, setPreview] = useState<EffectiveModel | null>(null);
  const [defaultLevel, setDefaultLevel] = useState<ThinkingLevel | undefined>(undefined);
  const [context, setContext] = useState("");
  const [maxOutput, setMaxOutput] = useState("");
  const [levels, setLevels] = useState<ThinkingLevel[]>([]);
  const [image, setImage] = useState(false);
  const [rates, setRates] = useState<RateTexts>(EMPTY_RATES);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const id = apiModel.trim();
  // 父组件每次渲染都会新建 target，按内容比较，避免预览反复请求。
  const scopeKey = JSON.stringify(target);
  useEffect(() => {
    if (!id) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const scoped = JSON.parse(scopeKey) as AddModelTarget;
      const scope = scoped.kind === "connection"
        ? { connectionId: scoped.connectionId }
        : { templateId: scoped.templateId, protocol: scoped.protocol, multiplier: scoped.multiplier };
      void modelConnectionsApi.preview({ apiModel: id, ...scope, ...(canonical ? { overrides: { canonical } } : {}) })
        .then((result) => { if (!cancelled) setPreview(result.effective); })
        .catch(() => { if (!cancelled) setPreview(null); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [id, canonical, scopeKey]);
  useEffect(() => setDefaultLevel(undefined), [preview?.catalog?.apiModel]);

  const hit = Boolean(preview && (preview.aliased || preview.catalog?.exact));
  const near = preview && !preview.catalog?.exact && !preview.aliased ? preview.catalog : null;
  const aliasMissing = Boolean(canonical && preview && !preview.aliased);
  const shown: EffectiveModel | null = preview && hit && defaultLevel && preview.thinking ? { ...preview, thinking: { ...preview.thinking, default: defaultLevel } } : preview;

  const overrides = (): ModelOverrides => {
    const result: ModelOverrides = {};
    if (label.trim()) result.label = label.trim();
    if (hit) {
      if (canonical) result.canonical = canonical;
      if (defaultLevel && preview?.thinking) result.thinking = { levels: preview.thinking.levels, default: defaultLevel };
      return result;
    }
    const ctx = parsePositive(context);
    if (ctx) result.contextWindow = ctx;
    const out = parsePositive(maxOutput);
    if (out) result.maxOutput = out;
    result.thinking = defaultLevel && levels.includes(defaultLevel) ? { levels, default: defaultLevel } : { levels };
    result.input = image ? ["text", "image"] : ["text"];
    const input = parseRate(rates.input);
    const output = parseRate(rates.output);
    if (typeof input === "number" && typeof output === "number") {
      const cache = (text: string) => { const value = parseRate(text); return typeof value === "number" ? value : null; };
      result.rates = { input, output, cacheRead: cache(rates.cacheRead), cacheWrite: cache(rates.cacheWrite) };
    }
    return result;
  };

  const submit = async () => {
    if (!id || !preview) return;
    setBusy(true);
    const added = overrides();
    const ok = await onAdd({ apiModel: id, ...(Object.keys(added).length > 0 ? { overrides: added } : {}), effective: shown ?? preview });
    setBusy(false);
    if (ok) onCancel();
  };

  const useAlias = (value: string) => {
    setCanonical(value.trim());
    setAliasText(value.trim());
  };

  return (
    <div className="flex flex-col gap-3.5 px-4 pb-4 pt-3.5" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
      <div className="grid grid-cols-[1.3fr_1fr] gap-2 max-[600px]:grid-cols-1">
        <SettingsInput width="full" mono autoFocus value={apiModel} onChange={(event) => setApiModel(event.target.value)} placeholder="模型 ID，例如 glm-5" aria-label="模型 ID" />
        <SettingsInput width="full" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="显示名称（可选）" aria-label="显示名称" />
      </div>

      {!id ? (
        <p className="text-act-xs text-text-muted">填服务商文档里的模型 ID。在模型目录里的，会自动补全上下文、思考和价格。</p>
      ) : hit && shown ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-act-xs text-operational">
            <Check size={13} strokeWidth={2.2} aria-hidden="true" />
            <span className="min-w-0 flex-1">{canonical ? `沿用 ${preview!.catalog?.name ?? canonical}` : `在模型目录中找到 ${preview!.catalog?.name}`}</span>
            {canonical ? <Button variant="ghost" size="xs" onClick={() => useAlias("")}>改为自己填</Button> : null}
          </div>
          <KeyFacts effective={shown} onDefault={setDefaultLevel} />
        </>
      ) : preview ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-act-xs text-text-muted">
            <span className="min-w-0 flex-1">{aliasMissing ? `模型目录里没有 ${canonical}。` : "不在模型目录中。沿用一个已知模型，或者自己填下面几项。"}</span>
            {near ? <Button size="xs" onClick={() => useAlias(near.apiModel)}>沿用 {near.name}</Button> : null}
            <SettingsInput
              width="sm"
              mono
              value={aliasText}
              onChange={(event) => setAliasText(event.target.value)}
              onBlur={() => { if (aliasText.trim() !== canonical) useAlias(aliasText); }}
              onKeyDown={(event) => { if (event.key === "Enter") useAlias(aliasText); }}
              placeholder="目录模型 ID"
              aria-label="沿用的目录模型 ID"
            />
          </div>
          <EditGrid>
            <EditItem label="上下文">
              <SettingsInput width="sm" numeric value={context} onChange={(event) => setContext(event.target.value)} placeholder="128000" aria-label="上下文" />
              <span className="text-act-xs text-text-faint">tokens</span>
            </EditItem>
            <EditItem label="思考档位"><LevelToggles levels={levels} onToggle={(level) => setLevels(toggleLevel({ levels }, level).levels)} /></EditItem>
            {levels.length > 1 ? <EditItem label="默认思考"><DefaultLevelSelect levels={levels} value={defaultLevel && levels.includes(defaultLevel) ? defaultLevel : undefined} onChange={setDefaultLevel} /></EditItem> : null}
            <EditItem label="看图"><Toggle checked={image} onChange={setImage} ariaLabel="看图" /></EditItem>
            {more ? (
              <>
                <EditItem label="最大输出">
                  <SettingsInput width="sm" numeric value={maxOutput} onChange={(event) => setMaxOutput(event.target.value)} placeholder="32000" aria-label="最大输出" />
                  <span className="text-act-xs text-text-faint">tokens</span>
                </EditItem>
                <EditItem label="价格">
                  <PriceFields values={rates} editable onCommit={(field: keyof ModelRates, text) => setRates((current) => ({ ...current, [field]: text }))} />
                </EditItem>
              </>
            ) : null}
          </EditGrid>
        </>
      ) : null}

      <div className="-mx-2 flex items-center gap-1.5">
        {id && preview && !hit ? <Button variant="ghost" size="xs" onClick={() => setMore((value) => !value)}>{more ? "收起" : "更多设置"}</Button> : null}
        <span className="flex-1" />
        <Button variant="ghost" size="xs" onClick={onCancel}>取消</Button>
        <Button variant="primary" size="xs" disabled={!id || !preview || busy} busy={busy} onClick={() => void submit()}>添加</Button>
      </div>
    </div>
  );
}
