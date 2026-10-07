import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import type { ComposerMode } from "@actspace/shared";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export type ComposerLayout = "inline" | "stacked";

// Composer 输入布局对齐 Cursor（09）：单行 inline 是「+ · 模式 · 输入 · 模型 · 发送」，模型按钮贴在发送左边；
// 多行 stacked 是输入全宽在上，下面一行「+ · 模式 · 模型 · 空 · 发送」。
// 用同一个 grid 容器切换 grid-template-areas，DOM 结构不变——textarea 是同一节点，切换布局不 remount、不丢焦点光标。
// Agent 不显示模式 chip，grid 里也不留 mode 列，免得空列多出一份间距。
const COMPOSER_BODY_BASE_CLASS = "composer-body group/composer-body grid min-h-[46px] items-center gap-x-1 p-2";
const COMPOSER_BODY_INLINE_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'plus_mode_input_model_send']`;
const COMPOSER_BODY_STACKED_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} gap-y-1.5 pt-2.5 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'input_input_input_input_input'_'plus_mode_model_._send']`;
const COMPOSER_BODY_AGENT_INLINE_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} grid-cols-[auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'plus_input_model_send']`;
const COMPOSER_BODY_AGENT_STACKED_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} gap-y-1.5 pt-2.5 grid-cols-[auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'input_input_input_input'_'plus_model_._send']`;
// 输入区最高 200px，超出后在内部滚动；新建页最少 2 行。
const COMPOSER_INPUT_CLASS =
  "composer-input block w-full min-h-[34px] max-h-[200px] [grid-area:input] resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-[7px] text-act-lg leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
const COMPOSER_INITIAL_INPUT_CLASS =
  "composer-input block w-full min-h-[54px] max-h-[200px] [grid-area:input] resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-[7px] text-act-lg leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
/** 窄窗始终多行（沿用原来的 600px 断点）。 */
const COMPOSER_NARROW_QUERY = "(max-width: 600px)";
// 单行高度 = 20px line-height + 7px*2 padding = 34px；超过它说明内容折行（显式换行或自动 wrap）。
const COMPOSER_SINGLE_LINE_MAX_PX = 40;

export type ComposerLayoutOptions = {
  readonly surface: "followup" | "initial";
  readonly mode: ComposerMode;
  readonly message: string;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  /** 附件、Skill 或回复引用：有就进入多行。 */
  readonly hasExtras: boolean;
  /** 变化时重新量一次（模型按钮的文字宽度会变）。 */
  readonly remeasureKey: string;
};

/**
 * 09 T27：输入框是单行胶囊还是多行。
 * 进入多行看内容：按单行宽度测出来会折行、有换行、有附件 / Skill / 回复引用。新建页和窄窗始终多行。
 * 回到单行只看清空：进入多行后 stuckStacked 记住，直到输入框完全清空、也没有附件、Skill 和引用（09，Cursor 同款）。
 * 测量只负责「要不要进入多行」，退出只看清空条件，两边不对同一状态双向写，避免来回闪。
 */
export function useComposerLayout({ surface, mode, message, inputRef, hasExtras, remeasureKey }: ComposerLayoutOptions) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [isInputMultiline, setIsInputMultiline] = useState(false);
  const narrowWindow = useMediaQuery(COMPOSER_NARROW_QUERY);
  const contentEmpty = message.length === 0 && !hasExtras;
  const contentNeedsStacked = hasExtras || isInputMultiline || message.includes("\n");
  const [stuckStacked, setStuckStacked] = useState(false);
  if (contentEmpty ? stuckStacked : contentNeedsStacked && !stuckStacked) setStuckStacked(!contentEmpty);
  const layout: ComposerLayout =
    surface === "initial" || narrowWindow || contentNeedsStacked || (stuckStacked && !contentEmpty) ? "stacked" : "inline";
  const inlineBodyClass = mode === "agent" ? COMPOSER_BODY_AGENT_INLINE_CLASS : COMPOSER_BODY_INLINE_CLASS;
  const stackedBodyClass = mode === "agent" ? COMPOSER_BODY_AGENT_STACKED_CLASS : COMPOSER_BODY_STACKED_CLASS;

  // 原生 textarea 不会随内容自动长高（粘贴大段文本时只会内部滚动）。
  // 多行判定必须始终按 inline 布局的可用宽度测量：如果在 stacked 的全宽输入框中测量，
  // 长文本可能被误判为单行，切回更窄的 inline 后又发生折行，反复更新直到 React 卸载页面。
  // 判定完成后再按当前布局宽度设置实际高度；布局切换和容器宽度变化都会安全重测。
  useLayoutEffect(() => {
    const input = inputRef.current;
    const body = bodyRef.current;
    if (!input || !body) return;

    function measureInput() {
      // 测量必须使用独立 DOM：改变正在编辑的 textarea 的网格宽度或把高度
      // 暂时归零，会改变其 scrollTop，IME 提交后浏览器不一定重新展示光标。
      // 复制完整网格以复用控件宽度、gap 和响应式断点，避免布局判定反馈循环。
      const measurement = body.cloneNode(true) as HTMLDivElement;
      measurement.setAttribute("aria-hidden", "true");
      measurement.setAttribute("inert", "");
      measurement.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      Object.assign(measurement.style, {
        position: "fixed",
        visibility: "hidden",
        pointerEvents: "none",
        left: "0",
        top: "0",
        width: `${body.clientWidth}px`,
        boxSizing: "border-box",
      });
      const measuredInput = measurement.querySelector("textarea")!;
      measuredInput.value = input.value;
      measuredInput.style.height = "auto";
      measuredInput.style.maxHeight = "none";
      body.parentElement!.appendChild(measurement);
      let inlineContentHeight: number;
      let contentHeight: number;
      try {
        measurement.className = inlineBodyClass;
        measurement.dataset.layout = "inline";
        inlineContentHeight = measuredInput.scrollHeight;
        measurement.className = body.className;
        measurement.dataset.layout = body.dataset.layout;
        contentHeight = measuredInput.scrollHeight;
      } finally {
        measurement.remove();
      }

      const height = `${contentHeight}px`;
      if (input.style.height !== height) input.style.height = height;
      setIsInputMultiline(inlineContentHeight > COMPOSER_SINGLE_LINE_MAX_PX);
    }

    measureInput();

    if (typeof ResizeObserver === "undefined") return;
    let observedWidth = body.clientWidth;
    const resizeObserver = new ResizeObserver(() => {
      if (body.clientWidth === observedWidth) return;
      observedWidth = body.clientWidth;
      measureInput();
    });
    resizeObserver.observe(body);
    return () => resizeObserver.disconnect();
  }, [message, inlineBodyClass, layout, remeasureKey, surface]);

  return {
    bodyRef,
    layout,
    bodyClass: layout === "inline" ? inlineBodyClass : stackedBodyClass,
    /** 换会话不带上一个会话的「已进入多行」；新会话的草稿自己会量。 */
    resetStuck: () => setStuckStacked(false),
  };
}

/** 定稿文案（09 决策 3）：Plan / Chat 不分新建页和对话中；运行中且开了队列时提示会进队列。 */
export function composerPlaceholder(mode: ComposerMode, surface: "followup" | "initial", queueing: boolean): string {
  if (queueing) return "继续追问，运行中发送会进入队列…";
  if (mode === "chat") return "问点什么…";
  if (mode === "plan") return "描述要规划的改动…";
  return surface === "initial" ? "描述你要做的事，@ 引用文件，/ 调用命令" : "继续追问…";
}

export type ComposerInputProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  surface: "followup" | "initial";
  placeholder: string;
  value: string;
  disabled: boolean;
  /** 斜杠菜单的 combobox 关系：打开时指向菜单和当前高亮项。 */
  slash: { open: boolean; menuId: string; activeOptionId?: string };
  onChange: (text: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
};

/** 输入框本体。单行 / 多行切换时是同一个节点（只换外层 grid 的 class），不 remount。 */
export function ComposerInput({ inputRef, surface, placeholder, value, disabled, slash, onChange, onPaste, onKeyDown }: ComposerInputProps) {
  return (
    <textarea
      className={surface === "initial" ? COMPOSER_INITIAL_INPUT_CLASS : COMPOSER_INPUT_CLASS}
      aria-label="消息输入框"
      aria-autocomplete={slash.open ? "list" : undefined}
      aria-controls={slash.open ? slash.menuId : undefined}
      aria-expanded={slash.open}
      aria-activedescendant={slash.open ? slash.activeOptionId : undefined}
      aria-haspopup="listbox"
      placeholder={placeholder}
      rows={1}
      ref={inputRef}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onPaste={onPaste}
      onKeyDown={onKeyDown}
    />
  );
}
