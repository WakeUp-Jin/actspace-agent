import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { ConnectionModelView, ModelOverrides } from "@actspace/shared";
import { Button, cx } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { FamilyMark, ModelFields, type FieldsChange } from "./model-fields";
import { modelMeta, unknownNote, withOverride } from "./model-view";

/** 卡片展开程度：0 收起，1 关键三项，2 显示更多。 */
export type CardLevel = 0 | 1 | 2;

export const CARD_FRAME = "rounded-act-lg border border-line bg-surface p-1.5";
export const CARD_FLASH = "animate-[settings-card-flash_1.4s_ease-out] motion-reduce:animate-none";

/**
 * 连接里的一个模型。整行可以点开；删除在行内，悬停、聚焦或展开时出现。
 * 展开区每个字段失焦就保存；认不出的模型给一句提示，有相近的目录模型时可以一键按它填。
 */
export function ModelCard({ model, level, flash, onLevel, onSave, onRemove }: {
  model: ConnectionModelView;
  level: CardLevel;
  flash: boolean;
  onLevel: (level: CardLevel) => void;
  onSave: (overrides: ModelOverrides | null) => void;
  onRemove: () => void;
}) {
  const { effective } = model;
  const tag = unknownNote(effective);
  const open = level > 0;
  const panelId = `model-card-${model.key}`;
  const change: FieldsChange = (field, value) => onSave(withOverride(model.overrides, field, value));
  const suggestion = effective.catalog && !effective.catalog.exact ? effective.catalog : null;

  return (
    <div className={cx("group/card", CARD_FRAME, flash && CARD_FLASH)}>
      <div className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-act-md pl-1.5 pr-0.5 hover:bg-hover-overlay" onClick={() => onLevel(open ? 0 : 1)}>
        <FamilyMark model={model} />
        <span className="whitespace-nowrap text-act-sm font-medium text-text-main">{effective.label}</span>
        {effective.label !== model.apiModel ? <span title={model.apiModel} className="min-w-0 truncate font-mono text-act-xxs text-text-faint">{model.apiModel}</span> : null}
        {tag ? <span className="min-w-0 shrink truncate whitespace-nowrap text-act-xxs text-warning">{tag}</span> : null}
        <span className="flex-1" />
        {open ? null : <span className="whitespace-nowrap text-act-xs text-text-faint max-[600px]:hidden">{modelMeta(effective)}</span>}
        <IconButton
          variant="danger"
          label={`移除 ${effective.label}`}
          tooltip="移除"
          className={cx("opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 max-[600px]:opacity-100", open && "opacity-100")}
          onClick={(event) => { event.stopPropagation(); onRemove(); }}
        >
          <Trash2 size={14} aria-hidden="true" />
        </IconButton>
        <IconButton
          label={`${open ? "收起" : "展开"} ${effective.label}`}
          tooltip={false}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={(event) => { event.stopPropagation(); onLevel(open ? 0 : 1); }}
        >
          <ChevronRight size={14} aria-hidden="true" className={cx("transition-transform duration-(--motion-fast)", open && "rotate-90")} />
        </IconButton>
      </div>

      {open ? (
        <div id={panelId} className="px-1.5 pb-0.5 pt-2.5">
          {tag ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-act-md bg-warning-soft px-2.5 py-2 text-act-xs text-on-warning">
              <span className="min-w-0 flex-1">没认出这个模型。填上上下文和价格，用量和费用才算得准；不填也能用。</span>
              {suggestion ? <Button size="xs" onClick={() => change("canonical", suggestion.apiModel)}>按 {suggestion.name} 填</Button> : null}
            </div>
          ) : null}
          <ModelFields effective={effective} more={level === 2} onChange={change} />
          <div className="mt-2.5 flex items-center gap-2">
            <MoreToggle more={level === 2} onClick={() => onLevel(level === 2 ? 1 : 2)} />
            <span className="flex-1" />
            {effective.aliased && effective.catalog ? (
              <Button variant="ghost" size="xs" onClick={() => change("canonical", undefined)}>不按 {effective.catalog.name} 填</Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MoreToggle({ more, onClick }: { more: boolean; onClick: () => void }) {
  return (
    <Button variant="ghost" size="xs" className="-ml-1.5" aria-expanded={more} onClick={onClick}>
      {more ? "收起" : "显示更多"}
      <ChevronDown size={13} aria-hidden="true" className={cx("transition-transform duration-(--motion-fast)", more && "rotate-180")} />
    </Button>
  );
}
