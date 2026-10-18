import { ChevronDown, Plus, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { PrimaryAction } from "../../sessions/composer-state";
import type { AgentMode } from "../../sessions/use-composer";
import { IconButton } from "../../ui/IconButton";
import { Pressable } from "../../ui/Pressable";
import { SendButton } from "../../ui/SendButton";
import { cx } from "../../ui/cx";
import { MODE_ICONS, MODE_LABELS, PlusSheet } from "./PlusSheet";

export type ComposerBoxProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly textareaRef?: RefObject<HTMLTextAreaElement>;
  readonly disabled?: boolean;
  readonly enterKeyHint?: "send" | "enter";
  readonly mode: AgentMode;
  readonly onModeChange: (mode: AgentMode) => void;
  readonly modelLabel: string;
  readonly onModelClick: () => void;
  readonly modelDisabled?: boolean;
  readonly action: PrimaryAction;
  readonly onSubmit: () => void;
  /** 始终上下两层（新建会话）。 */
  readonly stacked?: boolean;
  /** 拒绝审批后等用户说明：保持聚焦样式。 */
  readonly attention?: boolean;
  /** 替换底部按钮行（例如创建中的进度）。 */
  readonly bar?: ReactNode;
};

const MAX_HEIGHT = 144;

/**
 * 玻璃输入框：短输入时单行 [＋][文本][模型][发送]；输入变长、非 Agent 模式、拒绝后说明或新建时，文本在上、按钮行在下。
 * 非 Agent 模式在 ＋ 后显示可关闭的模式芯片，发送钮跟着模式着色。
 */
export function ComposerBox({ value, onChange, onKeyDown, placeholder, ariaLabel, textareaRef, disabled = false, enterKeyHint = "enter", mode, onModeChange, modelLabel, onModelClick, modelDisabled = false, action, onSubmit, stacked = false, attention = false, bar }: ComposerBoxProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const area = textareaRef ?? own;
  const [plusOpen, setPlusOpen] = useState(false);
  // 单行放不下后切到两层；清空前不切回，避免宽度变化来回跳。
  const [grown, setGrown] = useState(false);
  const isStacked = stacked || attention || mode !== "agent" || grown;

  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    if (!value) setGrown(false);
    element.style.height = "auto";
    if (!isStacked && value && element.scrollHeight > element.clientHeight + 2) setGrown(true);
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
  }, [value, isStacked, area]);

  const ModeIcon = MODE_ICONS[mode];
  const textarea = (
    <textarea
      ref={area}
      rows={1}
      className="composer-text"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      enterKeyHint={enterKeyHint}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
  return (
    <div className="composer" data-stacked={isStacked || undefined} data-attention={attention || undefined}>
      {isStacked ? textarea : null}
      <div className="composer-bar">
        {bar ?? (
          <>
            <IconButton label="模式与添加" size="md" tone="faint" onClick={() => setPlusOpen(true)}><Plus size={18} strokeWidth={2.1} aria-hidden /></IconButton>
            {mode !== "agent" ? (
              <span className={cx("inline-flex h-[26px] flex-none items-center gap-1 rounded-act-pill pl-2 pr-0.5 text-act-sm font-medium", mode === "plan" ? "bg-warning-soft text-on-warning" : "bg-operational-soft text-operational")}>
                <ModeIcon size={14} aria-hidden />{MODE_LABELS[mode]}
                <IconButton label="回到 Agent" size="xs" className="text-current opacity-75 hover:bg-transparent" onClick={() => onModeChange("agent")}><X size={13} aria-hidden /></IconButton>
              </span>
            ) : null}
            {isStacked ? <span className="flex-1" /> : textarea}
            <Pressable onClick={onModelClick} disabled={modelDisabled} className="inline-flex h-8 w-auto max-w-[150px] flex-none items-center gap-1 rounded-act-pill px-1.5 text-act-sm font-medium text-text-muted disabled:opacity-45">
              <span className="truncate">{modelLabel}</span><ChevronDown size={12} strokeWidth={2.2} aria-hidden className="flex-none" />
            </Pressable>
            <SendButton tone={action === "stop" ? "stop" : mode} disabled={action === "disabled"} onClick={onSubmit} />
          </>
        )}
      </div>
      <PlusSheet open={plusOpen} onOpenChange={setPlusOpen} mode={mode} onPick={onModeChange} />
    </div>
  );
}
