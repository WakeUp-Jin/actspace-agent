import { ChevronDown } from "lucide-react";
import type { ConnectionModelView, ModelOverrides } from "@actspace/shared";
import { cx } from "../../ui/Button";
import { Toggle } from "../SettingsPrimitives";
import { FamilyMark } from "./model-fields";
import { unknownNote } from "./model-view";
import { ModelPanel } from "./ModelPanel";

/** 连接详情里的模型：一行只有 mark、名称和开关；点开就地展开详情。 */
export function ModelList({
  connectionId,
  models,
  expanded,
  onExpand,
  onToggle,
  onSave,
  onRemove,
}: {
  connectionId: string;
  models: readonly ConnectionModelView[];
  expanded: string | null;
  onExpand: (key: string | null) => void;
  onToggle: (model: ConnectionModelView, enabled: boolean) => void;
  onSave: (model: ConnectionModelView, overrides: ModelOverrides | null) => void;
  onRemove: (model: ConnectionModelView) => void;
}) {
  return (
    <>
      {models.map((model) => {
        const open = expanded === model.key;
        const note = unknownNote(model.effective);
        const panelId = `model-panel-${model.key}`;
        return (
          <div key={model.key}>
            <div className="flex min-h-[50px] items-center gap-2.5 pr-4 hover:bg-hover-overlay">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                onClick={() => onExpand(open ? null : model.key)}
                className="flex min-h-[50px] min-w-0 flex-1 items-center gap-2.5 pl-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/30"
              >
                <span className={cx("contents", !model.enabled && "[&>*]:opacity-50")}>
                  <FamilyMark model={model} />
                  <span title={model.apiModel} className="min-w-0 truncate text-act-sm font-medium text-text-main">{model.effective.label}</span>
                </span>
                {model.overrides ? <span aria-label="已手动修改" title="已手动修改" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> : null}
                {note ? <span className="whitespace-nowrap text-act-xs text-warning max-[600px]:hidden">{note}</span> : null}
                <span className="flex-1" />
                <ChevronDown size={14} aria-hidden="true" className={cx("shrink-0 text-text-subtle transition-transform", open && "rotate-180")} />
              </button>
              <Toggle checked={model.enabled} ariaLabel={`启用 ${model.effective.label}`} onChange={(next) => onToggle(model, next)} />
            </div>
            {open ? (
              <div id={panelId}>
                <ModelPanel connectionId={connectionId} model={model} onSave={(overrides) => onSave(model, overrides)} onRemove={() => onRemove(model)} />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
