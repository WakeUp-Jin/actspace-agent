import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { ConnectionModelView, ConnectionView, PurposeBinding, ThinkingLevel } from "@actspace/shared";
import type { ModelCatalog } from "../../../target/use-model-catalog";
import { Popover, PopoverTrigger } from "../../ui/Popover";
import { Button, cx } from "../../ui/Button";
import {
  DROPDOWN_LABEL_CLASS,
  ModelPickerMenu,
  OPTION_CHOICE_CLASS,
  OPTION_CHOICE_LABEL_CLASS,
  type ModelOptionsPanel,
} from "../../composer/ModelPicker";
import {
  PURPOSES,
  findModel,
  levelName,
  pickerGroups,
  purposeSummary,
  thinkingKind,
  type PurposeMeta,
} from "./model-view";

const FOLLOW_ID = "__follow__";

/**
 * 用途选择器：和输入框的模型菜单同一套样子。点模型就选中（档位用模型默认），
 * 行上「编辑」打开思考档位，点档位选中「这个模型 + 这个档位」。
 */
export function PurposePicker({
  purpose,
  connections,
  binding,
  onChange,
  onGoToModel,
}: {
  purpose: PurposeMeta;
  connections: readonly ConnectionView[];
  binding: PurposeBinding;
  onChange: (binding: PurposeBinding) => void;
  onGoToModel: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const summary = purposeSummary(connections, binding);
  const followLabel = purpose.follow ? `跟随${PURPOSES.find((item) => item.id === purpose.follow)!.label}` : "未设置";
  const catalog: ModelCatalog = {
    source: "local-providers",
    groups: pickerGroups(connections, purpose, "").map((group) => ({
      key: group.connection.connectionId,
      label: group.connection.label,
      models: group.models.map((model) => ({ id: model.key, label: model.effective.label, detail: model.apiModel })),
    })),
  };

  const pick = (key: string) => {
    setOpen(false);
    if (key === FOLLOW_ID) {
      onChange({ model: null, thinking: binding.thinking });
      return;
    }
    const model = findModel(connections, key);
    if (!model || binding.model === model.key) return;
    const levels = model.effective.thinking?.levels ?? [];
    onChange({ model: model.key, thinking: binding.thinking && levels.includes(binding.thinking) ? binding.thinking : null });
  };

  const panel: ModelOptionsPanel = {
    editable: (key) => {
      const kind = thinkingKind(findModel(connections, key)?.effective.thinking ?? null);
      return kind !== "none" && kind !== "always";
    },
    render: (key) => {
      const model = findModel(connections, key);
      if (!model) return null;
      const level = binding.model === key ? binding.thinking ?? model.effective.thinking?.default ?? null : null;
      return (
        <ThinkingOptions
          model={model}
          level={level}
          onLevel={(next) => onChange({ model: model.key, thinking: next })}
          onGoToModel={() => { setOpen(false); onGoToModel(key); }}
        />
      );
    },
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${purpose.label}模型`}
          className={cx(
            "inline-flex h-7 max-w-[320px] items-center gap-1.5 whitespace-nowrap rounded-act-md pl-2.5 pr-2 text-act-sm transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30 data-[state=open]:bg-hover-overlay max-[600px]:max-w-full",
            summary?.missing ? "text-on-danger" : "text-text-main",
          )}
        >
          {summary ? (
            <>
              <span className="min-w-0 truncate">{summary.label}</span>
              {summary.level ? <span className="text-text-muted">· {summary.level}</span> : null}
            </>
          ) : <span className="text-text-faint">{followLabel}</span>}
          <ChevronDown size={13} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-text-subtle" />
        </button>
      </PopoverTrigger>
      {open ? (
        <ModelPickerMenu
          catalog={catalog}
          selectedModelId={binding.model ?? FOLLOW_ID}
          onSelect={pick}
          optionsPanel={panel}
          side="bottom"
          align="end"
          ariaLabel={`${purpose.label}可选模型`}
          pinned={purpose.follow ? [{ id: FOLLOW_ID, label: followLabel }] : []}
          footer={purpose.needImage ? "只列出能看图的模型" : undefined}
        />
      ) : null}
    </Popover>
  );
}

function ThinkingOptions({ model, level, onLevel, onGoToModel }: { model: ConnectionModelView; level: ThinkingLevel | null; onLevel: (level: ThinkingLevel) => void; onGoToModel: () => void }) {
  const thinking = model.effective.thinking;
  return (
    <>
      <div className={DROPDOWN_LABEL_CLASS}>思考</div>
      {thinking ? (
        <div role="group" aria-label="思考档位">
          {thinking.levels.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitemradio"
              aria-checked={level === item}
              className={OPTION_CHOICE_CLASS}
              onClick={() => onLevel(item)}
            >
              <span className={OPTION_CHOICE_LABEL_CLASS}>{levelName(thinking.levels, item)}</span>
              {thinking.default === item ? <span className="mr-2 text-act-xxs text-text-faint">默认</span> : null}
              <span className="grid w-3.5 place-items-center">{level === item ? <Check size={14} strokeWidth={2.2} aria-hidden="true" /> : null}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-2 pb-1.5">
          <p className="text-act-xs leading-relaxed text-text-muted">还没有这个模型的思考信息。</p>
          <Button variant="secondary" size="xs" className="mt-2" onClick={onGoToModel}>去补充</Button>
        </div>
      )}
    </>
  );
}
