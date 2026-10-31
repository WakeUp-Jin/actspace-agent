import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { ConnectionModelInput, ModelOverrides, ModelPreviewResult } from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { Button, cx } from "../../ui/Button";
import { SettingsInput } from "../SettingsPrimitives";
import { ModelFields, type FieldsChange } from "./model-fields";
import { CARD_FRAME, MoreToggle } from "./ModelCard";
import { withOverride } from "./model-view";

/**
 * 手动添加：一张草稿卡片。填模型 ID（显示名称可选），边输入边预览：
 * 目录里能精确认出的直接填好；只是变体的按最接近的目录模型填（自动沿用，不对可以改）；认不出的留空让用户填。
 * 字段和模型卡片是同一套，改动只留在草稿里，点「添加」才写进连接。回车添加，Esc 取消。
 */
export function AddModelPanel({ connectionId, onAdd, onCancel }: { connectionId: string; onAdd: (model: ConnectionModelInput) => Promise<boolean>; onCancel: () => void }) {
  const [apiModel, setApiModel] = useState("");
  const [label, setLabel] = useState("");
  const [overrides, setOverrides] = useState<ModelOverrides | null>(null);
  // 用户点了「不是它」：这个 ID 不再自动沿用相近的目录模型。
  const [noAlias, setNoAlias] = useState(false);
  const [preview, setPreview] = useState<ModelPreviewResult | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const id = apiModel.trim();
  const draft: ModelOverrides = { ...(overrides ?? {}), ...(label.trim() ? { label: label.trim() } : {}) };
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    if (!id) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const scoped = JSON.parse(draftKey) as ModelOverrides;
      void modelConnectionsApi.preview({ apiModel: id, connectionId, ...(Object.keys(scoped).length > 0 ? { overrides: scoped } : {}) })
        .then((result) => { if (!cancelled) setPreview(result); })
        .catch(() => { if (!cancelled) setPreview(null); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [id, connectionId, draftKey]);

  // 变体（例如带日期后缀）：自动按最接近的目录模型填。
  const near = preview && !preview.effective.aliased && preview.effective.catalog && !preview.effective.catalog.exact ? preview.effective.catalog : null;
  useEffect(() => {
    if (near && !noAlias && !overrides?.canonical) setOverrides((current) => ({ ...(current ?? {}), canonical: near.apiModel }));
  }, [near?.apiModel, noAlias, overrides?.canonical]);

  const changeId = (next: string) => {
    setApiModel(next);
    setNoAlias(false);
    setOverrides((current) => withOverride(current, "canonical", undefined));
  };
  const change: FieldsChange = (field, value) => setOverrides((current) => withOverride(current, field, value));
  const effective = preview?.effective ?? null;
  const duplicate = Boolean(preview?.added);
  const ready = Boolean(id && effective && !duplicate);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const ok = await onAdd({ apiModel: id, ...(Object.keys(draft).length > 0 ? { overrides: draft } : {}) });
    setBusy(false);
    if (ok) onCancel();
  };
  const enter = (event: KeyboardEvent) => { if (event.key === "Enter") void submit(); };

  let fill: ReactNode = null;
  if (id && effective) {
    if (duplicate) fill = <p className="text-warning">这个模型已经在列表里了。</p>;
    else if (effective.aliased && effective.catalog) {
      fill = (
        <p className="flex flex-wrap items-center gap-1.5 text-operational">
          <Check size={13} strokeWidth={2.2} aria-hidden="true" />
          按 {effective.catalog.name} 填好了，不对可以改
          <Button variant="ghost" size="xs" onClick={() => { setNoAlias(true); change("canonical", undefined); }}>不是它</Button>
        </p>
      );
    } else if (effective.catalog?.exact) {
      fill = <p className="flex items-center gap-1.5 text-operational"><Check size={13} strokeWidth={2.2} aria-hidden="true" />认出来了，是 {effective.catalog.name}，下面已经帮你填好</p>;
    } else fill = <p>没认出来。填上上下文和价格，用量和费用才算得准；不填也能添加。</p>;
  }

  return (
    <div className={cx(CARD_FRAME, "border-line-strong")} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
      <div className="flex gap-1.5 max-[600px]:flex-col">
        <SettingsInput width="full" mono autoFocus value={apiModel} onChange={(event) => changeId(event.target.value)} onKeyDown={enter} placeholder="模型 ID，和服务商文档里写的一致" aria-label="模型 ID" className="h-[34px] flex-[1.4]" />
        <SettingsInput width="full" value={label} onChange={(event) => setLabel(event.target.value)} onKeyDown={enter} placeholder="显示名称（可选）" aria-label="显示名称" className="h-[34px] flex-1" />
      </div>
      {fill ? <div className="px-1 pt-2 text-act-xs text-text-faint">{fill}</div> : null}
      {ready && effective ? (
        <div className="px-1.5 pt-2.5">
          <ModelFields effective={effective} more={more} hideLabel onChange={change} />
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2 px-1.5 pb-0.5">
        {ready ? <MoreToggle more={more} onClick={() => setMore((value) => !value)} /> : null}
        <span className="flex-1" />
        <Button variant="ghost" size="xs" onClick={onCancel}>取消</Button>
        <Button variant="primary" size="xs" busy={busy} disabled={!ready || busy} onClick={() => void submit()}>添加</Button>
      </div>
    </div>
  );
}
