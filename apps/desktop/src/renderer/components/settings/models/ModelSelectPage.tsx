import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { findProviderTemplate, isRelayTemplate, type ConnectionProbeResult, type ConnectionModelInput } from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { Button } from "../../ui/Button";
import { ProviderLogo } from "../ProviderLogo";
import { PageHeader, SettingGroup, SettingRow, SettingsInput } from "../SettingsPrimitives";
import { AddModelPanel, type AddedModel } from "./AddModelPanel";
import { AddModelRow, CheckBox, FamilyMark } from "./model-fields";
import { unknownNote } from "./model-view";
import { useModelsPage, type ConnectionDraft } from "./ModelsPage";

export const LIST_FRAME = "divide-y divide-line/60 overflow-hidden rounded-act-group border border-line bg-surface";

type Row = { apiModel: string; label: string; note: string | null; effective: AddedModel["effective"]; input: ConnectionModelInput };

/** 添加连接第三步：勾选要用的模型。拿不到列表时就地添加。 */
export function ModelSelectPage({ draft, probe }: { draft: ConnectionDraft; probe: ConnectionProbeResult }) {
  const { controller, go, setDraft } = useModelsPage();
  const template = findProviderTemplate(draft.templateId)!;
  const relay = isRelayTemplate(template);
  const [manual, setManual] = useState<AddedModel[]>([]);
  const [picked, setPicked] = useState<Set<string>>(() => {
    const known = probe.models.filter((model) => model.effective.catalog?.exact);
    return new Set((known.length > 0 ? known : probe.models).map((model) => model.apiModel));
  });
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(probe.models.length === 0);
  const [multiplier, setMultiplier] = useState("1");
  const [saving, setSaving] = useState(false);

  const rows = useMemo<Row[]>(() => [
    ...probe.models.map((model) => ({ apiModel: model.apiModel, label: model.effective.label, note: unknownNote(model.effective), effective: model.effective, input: { apiModel: model.apiModel, providerFacts: model.providerFacts } })),
    ...manual.map((model) => ({ apiModel: model.apiModel, label: model.overrides?.label ?? model.effective.label, note: null, effective: model.effective, input: { apiModel: model.apiModel, ...(model.overrides ? { overrides: model.overrides } : {}) } })),
  ], [probe.models, manual]);
  const q = query.trim().toLowerCase();
  const visible = rows.filter((row) => !q || row.apiModel.toLowerCase().includes(q) || row.label.toLowerCase().includes(q));
  const knownCount = probe.models.filter((model) => model.effective.catalog?.exact).length;
  const toggle = (apiModel: string, next: boolean) => setPicked((current) => {
    const copy = new Set(current);
    if (next) copy.add(apiModel);
    else copy.delete(apiModel);
    return copy;
  });

  const save = async () => {
    const factor = Number(multiplier);
    setSaving(true);
    const result = await controller.run(() => modelConnectionsApi.create({
      templateId: draft.templateId,
      apiKey: draft.apiKey,
      ...(relay ? { protocol: draft.protocol } : {}),
      baseUrl: draft.baseUrl,
      proxy: draft.proxyUrl.trim() ? { enabled: true, url: draft.proxyUrl.trim() } : { enabled: false, url: null },
      multiplier: Number.isFinite(factor) && factor > 0 ? factor : 1,
      ...(probe.resolvedAuth ? { resolvedAuth: probe.resolvedAuth } : {}),
      models: rows.filter((row) => picked.has(row.apiModel)).map((row) => row.input),
    }), "连接已保存");
    setSaving(false);
    if (result.ok && result.connectionId) {
      setDraft(null);
      go({ name: "detail", connectionId: result.connectionId });
    }
  };

  return (
    <>
      <PageHeader
        title="选择模型"
        description="勾选的模型会出现在模型选择器里，之后随时能改。"
        leading={<ProviderLogo logoKey={template.logoKey} />}
        onBack={() => go({ name: "setup" })}
        backLabel="填写 Key"
      />
      {probe.listSource === "provider" ? (
        <p className="flex items-center gap-1.5 text-act-xs text-operational"><Check size={13} strokeWidth={2.2} aria-hidden="true" />连接成功。拿到 {probe.models.length} 个模型，{knownCount} 个已从模型目录补全。</p>
      ) : (
        <p className="text-act-xs text-warning">{probe.listSource === "catalog" ? `${template.label} 的模型列表没响应，先列出模型目录里的模型。` : "这个服务没有开放模型列表，手动添加要用的模型。"}</p>
      )}
      {controller.error ? <p role="alert" className="text-act-xs text-on-danger">{controller.error}</p> : null}
      <div className={LIST_FRAME}>
        {rows.length > 0 ? (
          <div className="flex min-h-[42px] items-center gap-2 pl-4 pr-2.5">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-text-subtle">
              <Search size={14} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型" aria-label="搜索模型" className="h-8 min-w-0 flex-1 bg-transparent text-act-sm text-text-main outline-none placeholder:text-text-subtle" />
            </label>
            <Button variant="ghost" size="xs" onClick={() => setPicked(new Set(rows.map((row) => row.apiModel)))}>全选</Button>
            <Button variant="ghost" size="xs" onClick={() => setPicked(new Set())}>清空</Button>
          </div>
        ) : null}
        {visible.map((row) => (
          <div key={row.apiModel} className="flex min-h-[50px] cursor-pointer items-center gap-2.5 px-4 hover:bg-hover-overlay" onClick={() => toggle(row.apiModel, !picked.has(row.apiModel))}>
            <CheckBox checked={picked.has(row.apiModel)} label={`选择 ${row.label}`} onChange={(next) => toggle(row.apiModel, next)} />
            <FamilyMark model={row} />
            <span title={row.apiModel} className="min-w-0 truncate text-act-sm font-medium text-text-main">{row.label}</span>
            {row.note ? <span className="whitespace-nowrap text-act-xs text-warning">{row.note}</span> : null}
          </div>
        ))}
        {adding ? (
          <AddModelPanel
            target={{ kind: "draft", templateId: draft.templateId, protocol: draft.protocol, multiplier: Number(multiplier) || 1 }}
            onAdd={async (model) => {
              if (rows.some((row) => row.apiModel === model.apiModel)) {
                toggle(model.apiModel, true);
                return true;
              }
              setManual((current) => [...current, model]);
              toggle(model.apiModel, true);
              return true;
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <AddModelRow onClick={() => setAdding(true)} />
        )}
      </div>
      {relay ? (
        <SettingGroup>
          <SettingRow
            title="价格倍率"
            description="按官方价折算。中转站打几折就填几，比如 6 折填 0.6。"
            control={<><span className="text-act-xs text-text-muted">官方价 ×</span><SettingsInput width="sm" numeric value={multiplier} onChange={(event) => setMultiplier(event.target.value)} aria-label="价格倍率" /></>}
          />
        </SettingGroup>
      ) : null}
      <div className="flex items-center gap-3">
        <span className="flex-1 text-act-xs text-text-faint">已选 {picked.size} 个模型</span>
        <Button variant="primary" size="md" busy={saving} disabled={picked.size === 0 || saving} onClick={() => void save()}>保存连接</Button>
      </div>
    </>
  );
}
