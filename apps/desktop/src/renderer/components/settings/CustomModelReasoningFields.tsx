
import { MODEL_REASONING_EFFORTS, REASONING_REFERENCE_MODELS, resolveCustomModelReasoning, type CustomModelReasoning } from "@actspace/shared";
import { Select } from "../ui/Select";

export function CustomModelReasoningFields({ apiModel, value, onChange }: { apiModel: string; value: CustomModelReasoning; onChange: (value: CustomModelReasoning) => void }) {
  const match = resolveCustomModelReasoning(apiModel, value);
  const manual = value.mode === "manual";
  return <fieldset className="grid gap-3 rounded-act-md border border-line p-4">
    <legend className="px-1 text-act-sm font-semibold text-text-main">模型推理能力</legend>
    <div className="grid gap-1 text-act-xs text-text-muted"><span>能力来源</span><Select ariaLabel="能力来源" className="w-full" value={value.mode} onValueChange={(next) => onChange(next === "auto" ? { mode: "auto" } : { mode: "manual", support: match.support, efforts: match.efforts, allowOff: match.allowOff })} options={[{ value: "auto", label: "自动匹配目录" }, { value: "manual", label: "手动配置" }]} /></div>
    {!manual ? <div className="grid gap-1 text-act-xs text-text-muted"><span>参考模型（可选）</span><Select ariaLabel="参考模型（可选）" className="w-full" value={value.referenceModel ?? ""} onValueChange={(next) => onChange({ mode: "auto", ...(next ? { referenceModel: next } : {}) })} options={[{ value: "", label: "按 API 模型 ID 精确匹配" }, ...REASONING_REFERENCE_MODELS.map((model) => ({ value: model, label: model }))]} /></div> : null}
    <p className="text-act-xs text-text-muted">{match.source} · {match.support === "supported" ? "支持推理" : match.support === "unsupported" ? "不支持推理" : "推理能力未知"}</p>
    {manual ? <div className="grid gap-1 text-act-xs text-text-muted"><span>推理支持</span><Select ariaLabel="推理支持" className="w-full" value={value.support ?? "unknown"} onValueChange={(next) => onChange({ ...value, support: next as CustomModelReasoning["support"], efforts: [], defaultEffort: undefined })} options={[{ value: "unknown", label: "未知" }, { value: "supported", label: "支持" }, { value: "unsupported", label: "不支持" }]} /></div> : null}
    {match.support === "supported" ? <>
      {manual ? <><span className="text-act-xs text-text-muted">支持的强度</span><div className="flex flex-wrap gap-3">{MODEL_REASONING_EFFORTS.map((effort) => <label key={effort} className="flex items-center gap-1 text-act-xs text-text-main"><input type="checkbox" checked={value.efforts?.includes(effort) ?? false} onChange={(event) => { const efforts = event.target.checked ? [...(value.efforts ?? []), effort] : value.efforts!.filter((e) => e !== effort); onChange({ ...value, efforts, defaultEffort: value.defaultEffort && efforts.includes(value.defaultEffort) ? value.defaultEffort : undefined }); }} />{effort}</label>)}</div>
        <div className="grid gap-1 text-act-xs text-text-muted"><span>默认强度</span><Select ariaLabel="默认强度" className="w-full" value={value.defaultEffort ?? ""} onValueChange={(next) => onChange({ ...value, defaultEffort: next ? next as NonNullable<CustomModelReasoning["defaultEffort"]> : undefined })} options={[{ value: "", label: "自动（不指定强度）" }, ...(value.efforts ?? []).map((effort) => ({ value: effort, label: effort }))]} /></div>
        <label className="flex items-center gap-2 text-act-xs text-text-main"><input type="checkbox" checked={value.allowOff ?? false} onChange={(event) => onChange({ ...value, allowOff: event.target.checked })} />允许关闭推理</label></> : <p className="text-act-xs text-text-muted">{match.efforts.length ? `目录档位：${match.efforts.join("、")}` : "目录未声明强度档位；可切换手动配置。"}</p>}
    </> : null}
    <p className="text-act-xxs text-text-faint">中转服务可能只支持部分参数；目录匹配和请求成功均不代表内部推理已经生效。</p>
  </fieldset>;
}
