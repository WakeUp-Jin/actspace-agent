import { useMemo, useState, type RefObject } from "react";
import { Search } from "lucide-react";
import type { ConnectionProbeResult, ProbedModel } from "@actspace/shared";
import { Button, cx } from "../../ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../ui/Dialog";
import { SettingsInput } from "../SettingsPrimitives";
import { CheckMark, FamilyMark } from "./model-fields";
import { formatPrice, formatTokens } from "./model-view";

/**
 * 「获取可用模型」：连接返回的模型列表，用户自己勾。默认一个都不勾；已经在连接里的打勾置灰、标「已添加」。
 * 列表来自模型目录（连接的 /models 没响应）时，描述里说清楚。拿不到列表的情况由调用方处理，不会打开这个弹窗。
 */
export function FetchModelsDialog({ label, fresh, probe, onClose, onAdd, returnFocus }: {
  label: string;
  /** 连接里还没有模型（刚建好）：描述换成「连接好了」。 */
  fresh: boolean;
  probe: ConnectionProbeResult;
  onClose: () => void;
  onAdd: (models: ProbedModel[]) => Promise<boolean>;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => probe.models.filter((model) => !q || model.apiModel.toLowerCase().includes(q) || model.effective.label.toLowerCase().includes(q)),
    [probe.models, q],
  );
  const pickable = visible.filter((model) => !model.added);
  const allOn = pickable.length > 0 && pickable.every((model) => picked.has(model.apiModel));
  const count = picked.size;
  const total = probe.models.length;

  const toggle = (apiModel: string) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(apiModel)) next.delete(apiModel);
    else next.add(apiModel);
    return next;
  });
  const toggleAll = () => setPicked((current) => {
    const next = new Set(current);
    for (const model of pickable) {
      if (allOn) next.delete(model.apiModel);
      else next.add(model.apiModel);
    }
    return next;
  });
  const add = async () => {
    setBusy(true);
    const ok = await onAdd(probe.models.filter((model) => picked.has(model.apiModel)));
    setBusy(false);
    if (ok) onClose();
  };

  const description = probe.listSource === "catalog"
    ? `${fresh ? "连接好了。" : ""}${label} 没有返回模型列表，下面是模型目录里它的 ${total} 个模型，${fresh ? "勾选你要用的。" : "已添加的不会重复添加。"}`
    : fresh ? `连接好了。${label} 一共有 ${total} 个模型，勾选你要用的。` : `以下是 ${label} 的可用模型，已添加的不会重复添加。`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="lg" withDescription returnFocus={returnFocus} className="flex max-h-[min(640px,86vh)] flex-col overflow-hidden">
        <div className="px-5 pb-1.5 pt-[18px]">
          <DialogTitle className="text-act-lg font-semibold text-text-main">选择要添加的模型</DialogTitle>
          <DialogDescription className="mt-1 text-act-xs text-text-muted">{description}</DialogDescription>
        </div>
        <div className="flex items-center gap-2 px-5 py-2.5">
          <span className="relative min-w-0 flex-1">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <SettingsInput width="full" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型名称或 ID" aria-label="搜索模型" className="pl-8" />
          </span>
          <Button variant="ghost" disabled={pickable.length === 0} onClick={toggleAll}>{allOn ? "取消全选" : "全选"}</Button>
        </div>
        <div className="min-h-[120px] flex-1 overflow-y-auto border-t border-line/60 px-3 pb-2 pt-0.5">
          {visible.length > 0 ? visible.map((model) => {
            const on = model.added || picked.has(model.apiModel);
            const meta = [
              model.effective.contextWindow ? formatTokens(model.effective.contextWindow) : "",
              model.effective.rates ? `${formatPrice(model.effective.rates.input)} / ${formatPrice(model.effective.rates.output)}` : "",
            ].filter(Boolean).join(" · ");
            // 整行是一个勾选框（和用途选择器的行一样），Button 的尺寸和内边距放不下 mark、名称、ID 和摘要，所以用原生按钮。
            return (
              <button
                key={model.apiModel}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={model.added || undefined}
                aria-label={model.effective.label}
                onClick={() => { if (!model.added) toggle(model.apiModel); }}
                className={cx(
                  "flex min-h-[42px] w-full items-center gap-2.5 rounded-act-md px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/30",
                  model.added ? "cursor-default" : "hover:bg-hover-overlay",
                )}
              >
                <CheckMark checked={on} muted={model.added} />
                <FamilyMark model={model} />
                <span className={cx("whitespace-nowrap text-act-sm font-medium", model.added ? "text-text-faint" : "text-text-main")}>{model.effective.label}</span>
                {model.effective.label !== model.apiModel ? <span className="min-w-0 truncate font-mono text-act-xxs text-text-faint">{model.apiModel}</span> : null}
                <span className="flex-1" />
                {model.added
                  ? <span className="whitespace-nowrap text-act-xxs text-text-faint">已添加</span>
                  : <span className="whitespace-nowrap text-act-xs text-text-faint max-[600px]:hidden">{meta}</span>}
              </button>
            );
          }) : (
            <p className="px-2.5 py-7 text-center text-act-xs text-text-faint">没有匹配「{query.trim()}」的模型。也可以关掉窗口，用「手动添加」按 ID 添加。</p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-line/60 px-5 py-3">
          <span className="flex-1 text-act-xs text-text-faint">{count > 0 ? `已选 ${count} 个` : "还没选"}</span>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="primary" busy={busy} disabled={count === 0 || busy} onClick={() => void add()}>{count > 0 ? `添加 ${count} 个` : "添加所选"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
