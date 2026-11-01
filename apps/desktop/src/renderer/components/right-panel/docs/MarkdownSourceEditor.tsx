import { useRef, type ChangeEvent, type KeyboardEvent } from "react";

/**
 * Markdown 源码编辑器：原生 `<textarea>`（见 `front-文档面板规范.md`「预览、源码与编辑」）。
 *
 * 等宽、自动换行；Tab 插入两个空格；⌘S / Ctrl+S 调用 `onSave`；撤销、选择、输入法全部用系统自带能力。
 * 刻意只接收「内容、变更、保存、只读」四个 props：以后单独优化 Markdown 编辑体验时，整体替换这个组件即可。
 */

const INDENT = "  ";

const EDITOR_CLASS =
  "docs-source-editor block h-full min-h-0 w-full flex-1 resize-none border-0 bg-surface p-[18px] font-mono text-act-xs leading-[1.7] text-text-main outline-none [tab-size:2] placeholder:text-text-faint read-only:text-text-muted";

export function MarkdownSourceEditor({
  value,
  onChange,
  onSave,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 输入法组字过程中的按键不处理，免得 Tab / 保存键打断候选。
    if (event.nativeEvent.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!readOnly) onSave();
      return;
    }
    if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || readOnly) return;
    event.preventDefault();
    const target = event.currentTarget;
    const { selectionStart, selectionEnd } = target;
    const next = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`;
    onChange(next);
    const caret = selectionStart + INDENT.length;
    // 受控 textarea 在重渲染后会把光标放到末尾，下一帧再恢复。
    requestAnimationFrame(() => {
      const node = ref.current;
      if (node) node.setSelectionRange(caret, caret);
    });
  };

  return (
    <textarea
      ref={ref}
      className={EDITOR_CLASS}
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      aria-label="Markdown 源码"
      aria-readonly={readOnly || undefined}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
}
