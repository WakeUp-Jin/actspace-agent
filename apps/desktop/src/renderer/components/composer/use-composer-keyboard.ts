import { useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

/** 输入法组字中：标准是 `isComposing`；Safari / 部分 Chromium 在组字结束的那次按键上只给 keyCode 229。 */
export function isImeComposing(event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

export type ComposerKeyboardSlash<Result> = {
  readonly open: boolean;
  readonly resultCount: number;
  readonly active: Result | undefined;
  readonly dismiss: () => void;
  readonly move: (direction: 1 | -1) => void;
  readonly select: (result: Result) => void;
};

export type ComposerKeyboardOptions<Result> = {
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly message: string;
  /** 换输入框文字并写回草稿。 */
  readonly setDraftText: (text: string) => void;
  readonly inputHistory: readonly string[];
  /** Chat 没有 Plan，Shift+Tab 不切模式。 */
  readonly modeShortcut: boolean;
  readonly onModeShortcut: () => void;
  readonly slash: ComposerKeyboardSlash<Result>;
  readonly onSend: () => void;
};

/**
 * 09 T26：输入框的快捷键。Shift+Tab 切 Plan；斜杠菜单打开时 ↑↓ / Enter / Esc 给菜单；
 * 输入框为空时 ↑ 翻输入历史（翻起来后 ↓ 往回）；Enter 发送，Shift+Enter 换行。
 * 输入法组字时（中文 / 日文选候选词）按键都交给输入法：Enter 是上屏、↑↓ 是翻候选、Esc 是取消组字。
 */
export function useComposerKeyboard<Result>({
  inputRef, message, setDraftText, inputHistory, modeShortcut, onModeShortcut, slash, onSend,
}: ComposerKeyboardOptions<Result>) {
  const historyIndexRef = useRef<number | null>(null);

  function moveCaretToEnd() {
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      input?.setSelectionRange(input.value.length, input.value.length);
    });
  }

  function navigateInputHistory(direction: -1 | 1): boolean {
    if (inputHistory.length === 0) return false;

    const currentIndex = historyIndexRef.current;
    if (currentIndex === null) {
      if (direction === 1 || message.length > 0) return false;
      const nextIndex = inputHistory.length - 1;
      historyIndexRef.current = nextIndex;
      setDraftText(inputHistory[nextIndex] ?? "");
      moveCaretToEnd();
      return true;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0) return true;

    if (nextIndex >= inputHistory.length) {
      historyIndexRef.current = null;
      setDraftText("");
      return true;
    }

    historyIndexRef.current = nextIndex;
    setDraftText(inputHistory[nextIndex] ?? "");
    moveCaretToEnd();
    return true;
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (isImeComposing(event)) return;
    if (modeShortcut && event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      onModeShortcut();
      return;
    }
    if (slash.open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      slash.dismiss();
      return;
    }
    if (slash.open && slash.resultCount > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      slash.move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && navigateInputHistory(event.key === "ArrowUp" ? -1 : 1)) {
      event.preventDefault();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    if (slash.open && slash.active) {
      event.preventDefault();
      slash.select(slash.active);
      return;
    }
    event.preventDefault();
    onSend();
  }

  return {
    onKeyDown,
    /** 输入框内容被别处换掉（打字、发送、恢复草稿、换会话）后，下一次 ↑ 从最新一条历史开始。 */
    resetHistory: () => {
      historyIndexRef.current = null;
    },
  };
}
