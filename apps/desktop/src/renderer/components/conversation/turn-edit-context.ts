import { createContext, useContext } from "react";
import type { ComposerSendOptions } from "../composer/composer-types";
import type { TurnPromptDraft } from "./turn-prompt-draft";

/**
 * 消息流里正在编辑的提问（agent-edit-resend-rewind.md §5.1–5.2）。由 ConversationView 提供；
 * 侧边对话等没有提供的地方，提问卡片不可编辑。
 */
export type TurnEditValue = {
  readonly sessionId: string;
  /** 正在编辑的轮次和编辑器的初始内容。 */
  readonly editing: { readonly key: number; readonly turnId: string; readonly draft: TurnPromptDraft } | null;
  readonly start: (turnId: string) => void;
  readonly cancel: () => void;
  readonly submit: (draft: TurnPromptDraft, options: ComposerSendOptions) => void;
};

export const TurnEditContext = createContext<TurnEditValue | null>(null);

export function useTurnEdit(): TurnEditValue | null {
  return useContext(TurnEditContext);
}
