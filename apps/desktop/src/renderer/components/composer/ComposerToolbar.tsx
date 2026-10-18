import { ArrowUp, ListTodo, MessageCircle, Plus, Square, X, type LucideIcon } from "lucide-react";
import type { ComposerMode } from "@actspace/shared";
import type { ReadinessCopy } from "../../target/readiness";
import { IconButton } from "../ui/IconButton";
import { ModelPicker, type ModelPickerProps } from "./ModelPicker";

const CONTROL_GROUP_CLASS = "control-group relative";
// 模式 chip（Agent 不显示）：名称区只是标签，退出靠独立的 × 按钮；chip 内按 Backspace 也回到 Agent。
const MODE_CHIP_BASE_CLASS =
  "mode-chip inline-flex h-6 shrink-0 items-center gap-1 rounded-act-pill pl-2 pr-px text-act-sm leading-5 font-medium";
const MODE_CHIP_CLASS: Record<Exclude<ComposerMode, "agent">, string> = {
  chat: "bg-operational-soft text-operational",
  plan: "bg-warning-soft text-on-warning",
};
// 发送按钮按模式着色（Agent 强调色、Plan 黄、Chat 绿），停止统一用 primary。
const SEND_BUTTON_VARIANT: Record<ComposerMode, "accent" | "warning" | "operational"> = {
  agent: "accent",
  plan: "warning",
  chat: "operational",
};
const MODE_META: Record<Exclude<ComposerMode, "agent">, { label: string; icon: LucideIcon }> = {
  plan: { label: "Plan", icon: ListTodo },
  chat: { label: "Chat", icon: MessageCircle },
};

export type ComposerSendState = {
  readonly isStreaming: boolean;
  readonly isAborting: boolean;
  readonly isCompacting: boolean;
  /** 独立操作没有 Agent run 可取消时为 false。 */
  readonly canAbort?: boolean;
  /** 调用方接了消息队列：运行中有内容时发送即入队。 */
  readonly queueEnabled: boolean;
  /** 有内容、模型可用、不在提交中。 */
  readonly canSend: boolean;
  readonly modelAvailable: boolean;
  /** 远端没就绪时的文案；本机或已就绪时为 null。 */
  readonly notReady: ReadinessCopy | null;
  /** Host 还连着：远端没就绪时停止也要求它连着（09 T16）。 */
  readonly hostReachable: boolean;
};

/**
 * 发送 / 停止按钮的样子和文案。只有两种样子：输入框有内容是 ↑ 发送（运行中即加入队列），
 * 运行中且输入框为空是 ■ 停止。发送看 readiness 是否 ready（canSend 已包含）；停止只要求 Host 连着。
 */
export function composerSendButtonState(state: ComposerSendState) {
  const showStop = state.isStreaming && !(state.queueEnabled && state.canSend);
  const queueing = state.isStreaming && !showStop;
  const stopBlockedByCompaction = showStop && state.isCompacting && state.canAbort === false;
  const stopUnreachable = showStop && state.notReady && !state.hostReachable ? state.notReady : null;
  const disabled = showStop ? state.isAborting || state.canAbort === false || stopUnreachable !== null : !state.canSend;
  const modelUnavailable = !state.modelAvailable;
  const tooltip = stopBlockedByCompaction
    ? "压缩完成后可继续"
    : stopUnreachable
      ? stopUnreachable.reason
    : showStop
      ? "停止 Agent"
      : queueing
        ? "加入队列，当前运行结束后发送"
        : state.notReady
          ? state.notReady.reason
        : modelUnavailable
          ? "请先在设置中连接模型服务"
          : state.canSend
            ? "发送消息"
            : "输入消息后发送";
  const ariaLabel = stopBlockedByCompaction
    ? "正在压缩上下文，压缩完成后可继续"
    : stopUnreachable
      ? stopUnreachable.reason
    : showStop
      ? "停止 Agent"
      : queueing
        ? "加入队列"
        : state.notReady
          ? state.notReady.reason
        : modelUnavailable
          ? "暂无可用模型，请在设置中连接服务商"
          : state.canSend
            ? "发送消息"
            : "输入消息后发送";
  return { showStop, disabled, tooltip, ariaLabel };
}

export type ComposerToolbarProps = {
  mode: ComposerMode;
  /** 运行中不能退出模式。 */
  isStreaming: boolean;
  paletteOpen: boolean;
  onTogglePalette: () => void;
  onExitMode: () => void;
  model: ModelPickerProps;
  send: ComposerSendState;
  onSend: () => void;
  onAbort?: () => void;
};

/**
 * 09 T29：输入框工具栏。display:contents 让 toolbar 保留分组语义（aria / 测试定位），
 * 同时让 + / 模式 / 模型 / 发送直接参与外层 grid 的 grid-template-areas 排布。
 */
export function ComposerToolbar({ mode, isStreaming, paletteOpen, onTogglePalette, onExitMode, model, send, onSend, onAbort }: ComposerToolbarProps) {
  const sendButton = composerSendButtonState({ ...send, canAbort: Boolean(onAbort) });
  const modeMeta = mode === "agent" ? null : MODE_META[mode];
  const ModeIcon = modeMeta?.icon;

  return (
    <div className="composer-bar contents" aria-label="输入框工具栏">
      <div className={`${CONTROL_GROUP_CLASS} [grid-area:plus]`}>
        <IconButton
          className="command-button"
          label="添加 Agent、上下文或工具"
          tooltip="添加上下文、工具或附件"
          variant="ghost"
          size="sm"
          shape="round"
          aria-expanded={paletteOpen}
          aria-haspopup="dialog"
          onClick={onTogglePalette}
        >
          <Plus size={17} strokeWidth={2.1} aria-hidden="true" />
        </IconButton>
      </div>
      {mode !== "agent" && modeMeta && ModeIcon ? (
        <span
          className={`${MODE_CHIP_BASE_CLASS} ${MODE_CHIP_CLASS[mode]} [grid-area:mode]`}
          onKeyDown={(event) => {
            if (event.key !== "Backspace" || isStreaming) return;
            event.preventDefault();
            onExitMode();
          }}
        >
          <ModeIcon size={14} strokeWidth={2} aria-hidden="true" />
          <span>{modeMeta.label}</span>
          <IconButton
            className="mode-chip-exit"
            label={`退出 ${modeMeta.label} 模式`}
            tooltip="回到 Agent"
            variant="inherit"
            size="xs"
            shape="round"
            disabled={isStreaming}
            onClick={onExitMode}
          >
            <X size={13} strokeWidth={2.2} aria-hidden="true" />
          </IconButton>
        </span>
      ) : null}
      <div className={`${CONTROL_GROUP_CLASS} [grid-area:model]`}>
        <ModelPicker {...model} />
      </div>
      <div className="[grid-area:send] grid">
        <IconButton
          className={`send-button${sendButton.showStop ? " is-stop" : ""}${sendButton.showStop && send.isAborting ? " is-aborting" : ""}`}
          label={sendButton.ariaLabel}
          tooltip={sendButton.tooltip}
          variant={sendButton.showStop ? "primary" : SEND_BUTTON_VARIANT[mode]}
          size="sm"
          shape="round"
          data-mode={mode}
          aria-disabled={sendButton.disabled}
          onClick={() => {
            if (sendButton.disabled) return;
            if (sendButton.showStop) {
              onAbort?.();
              return;
            }
            onSend();
          }}
        >
          {sendButton.showStop ? (
            <Square size={10} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />
          ) : (
            <ArrowUp size={15} strokeWidth={2.4} aria-hidden="true" />
          )}
        </IconButton>
      </div>
    </div>
  );
}
