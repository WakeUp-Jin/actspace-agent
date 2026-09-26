
import { MODEL_REASONING_EFFORTS, REASONING_REFERENCE_MODELS, resolveCustomModelReasoning, type CustomModelReasoning } from "@actspace/shared";

const inputClass = "h-9 w-full rounded-act-md border border-line bg-surface px-3 text-act-sm text-text-main";
export function CustomModelReasoningFields({ apiModel, value, onChange }: { apiModel: string; value: CustomModelReasoning; onChange: (value: CustomModelReasoning) => void }) {
  const match = resolveCustomModelReasoning(apiModel, value);
  const manual = value.mode === "manual";
  return <fieldset className="grid gap-3 rounded-act-md border border-line p-4">
    <legend className="px-1 text-act-sm font-semibold text-text-main">模型推理能力</legend>
    <label className="grid gap-1 text-act-xs text-text-muted">能力来源<select className={inputClass} value={value.mode} onChange={(event) => onChange(event.target.value === "auto" ? { mode: "auto" } : { mode: "manual", support: match.support, efforts: match.efforts, allowOff: match.allowOff })}><option value="auto">自动匹配目录</option><option value="manual">手动配置</option></select></label>
    {!manual ? <label className="grid gap-1 text-act-xs text-text-muted">参考模型（可选）<select className={inputClass} value={value.referenceModel ?? ""} onChange={(event) => onChange({ mode: "auto", ...(event.target.value ? { referenceModel: event.target.value } : {}) })}><option value="">按 API 模型 ID 精确匹配</option>{REASONING_REFERENCE_MODELS.map((model) => <option key={model} value={model}>{model}</option>)}</select></label> : null}
    <p className="text-act-xs text-text-muted">{match.source} · {match.support === "supported" ? "支持推理" : match.support === "unsupported" ? "不支持推理" : "推理能力未知"}</p>
    {manual ? <label className="grid gap-1 text-act-xs text-text-muted">推理支持<select className={inputClass} value={value.support} onChange={(event) => onChange({ ...value, support: event.target.value as CustomModelReasoning["support"], efforts: [], defaultEffort: undefined })}><option value="unknown">未知</option><option value="supported">支持</option><option value="unsupported">不支持</option></select></label> : null}
    {match.support === "supported" ? <>
      {manual ? <><span className="text-act-xs text-text-muted">支持的强度</span><div className="flex flex-wrap gap-3">{MODEL_REASONING_EFFORTS.map((effort) => <label key={effort} className="flex items-center gap-1 text-act-xs text-text-main"><input type="checkbox" checked={value.efforts?.includes(effort) ?? false} onChange={(event) => { const efforts = event.target.checked ? [...(value.efforts ?? []), effort] : value.efforts!.filter((e) => e !== effort); onChange({ ...value, efforts, defaultEffort: value.defaultEffort && efforts.includes(value.defaultEffort) ? value.defaultEffort : undefined }); }} />{effort}</label>)}</div>
        <label className="grid gap-1 text-act-xs text-text-muted">默认强度<select className={inputClass} value={value.defaultEffort ?? ""} onChange={(event) => onChange({ ...value, defaultEffort: event.target.value ? event.target.value as NonNullable<CustomModelReasoning["defaultEffort"]> : undefined })}><option value="">自动（不指定强度）</option>{value.efforts?.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label>
        <label className="flex items-center gap-2 text-act-xs text-text-main"><input type="checkbox" checked={value.allowOff ?? false} onChange={(event) => onChange({ ...value, allowOff: event.target.checked })} />允许关闭推理</label></> : <p className="text-act-xs text-text-muted">{match.efforts.length ? `目录档位：${match.efforts.join("、")}` : "目录未声明强度档位；可切换手动配置。"}</p>}
    </> : null}
    <p className="text-act-xxs text-text-faint">中转服务可能只支持部分参数；目录匹配和请求成功均不代表内部推理已经生效。</p>
  </fieldset>;
}
