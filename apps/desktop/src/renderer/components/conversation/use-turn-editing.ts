import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inheritedThroughSeq } from "@actspace/shared/session-list-page";
import type { TaskSnapshot } from "@actspace/shared/runtime-v2";
import type { TurnResend } from "../../session/active-session-context";
import type { ComposerSendOptions } from "../composer/composer-types";
import type { TurnDim } from "./TurnView";
import type { TurnEditValue } from "./turn-edit-context";
import { turnPromptDraft, type TurnPromptDraft } from "./turn-prompt-draft";
import type { ConversationTurn } from "./turns";

// 发送后变淡部分淡出的时长，和 TurnView 的变淡过渡一致（--motion-slow）。
const LEAVE_MS = 240;

/** `key`：每次打开编辑器都换一个，重新打开（发送失败时）一定用新内容重建编辑器。 */
type Editing = { readonly key: number; readonly turnId: string; readonly draft: TurnPromptDraft };

/**
 * 消息流里的提问编辑（agent-edit-resend-rewind.md §5.1–5.2）：哪些提问可以编辑、正在编辑哪一轮、编辑时哪些部分变淡，
 * 以及发送（淡出后交给 App 的重发，失败时用刚才的内容重新打开编辑器）。
 */
export function useTurnEditing({
  sessionId,
  turns,
  busy,
  lineage,
  onResendTurn,
  readTaskSnapshot,
}: {
  readonly sessionId: string | null;
  readonly turns: readonly ConversationTurn[];
  /** 正在运行、有排队消息或发送在途：不能编辑，已打开的编辑器自动取消。 */
  readonly busy: boolean;
  readonly lineage: unknown;
  readonly onResendTurn?: (edit: TurnResend) => Promise<void>;
  readonly readTaskSnapshot?: (sessionId: string) => TaskSnapshot | undefined;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [leaving, setLeaving] = useState(false);
  const openings = useRef(0);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const inherited = inheritedThroughSeq(lineage);

  const editableTurnIds = useMemo(() => {
    const ids = new Set<string>();
    if (busy || !sessionId || !onResendTurn) return ids;
    for (const turn of turns) {
      const user = turn.user;
      // 只有已落盘的提问能编辑：乐观显示的提问还没有 durable 序号；继承自父会话的轮次不属于这个会话的日志。
      if (user?.runId && user.sourceSeq !== undefined && user.sourceSeq > inherited) ids.add(turn.id);
    }
    return ids;
  }, [busy, inherited, onResendTurn, sessionId, turns]);
  const editableRef = useRef(editableTurnIds);
  editableRef.current = editableTurnIds;

  const start = useCallback(
    (turnId: string) => {
      const turn = turnsRef.current.find((item) => item.id === turnId);
      if (!sessionId || !turn?.user || !editableRef.current.has(turnId)) return;
      setEditing({
        key: ++openings.current,
        turnId,
        draft: turnPromptDraft(sessionId, turn.user, readTaskSnapshot?.(sessionId)),
      });
    },
    [readTaskSnapshot, sessionId],
  );

  const cancel = useCallback(() => {
    setEditing(null);
    setLeaving(false);
  }, []);

  const submit = useCallback(
    (draft: TurnPromptDraft, options: ComposerSendOptions) => {
      const turn = editing && turnsRef.current.find((item) => item.id === editing.turnId);
      const user = turn?.user;
      if (!sessionId || !onResendTurn || !editing || !user?.runId || user.sourceSeq === undefined) return;
      const { turnId } = editing;
      const edit: TurnResend = { sessionId, runId: user.runId, fromSeq: user.sourceSeq, text: draft.text, options };
      setLeaving(true);
      window.setTimeout(() => {
        setEditing(null);
        setLeaving(false);
        // 失败时 App 已经把原因放到 Composer 的提示行；消息流恢复原样，编辑器带着刚才的内容重新打开。
        // 重发会同步更新外部 store，上面的清空可能还没生效、旧编辑器还挂着：换 key 让它按新内容重建。
        void onResendTurn(edit).catch(() => setEditing({ key: ++openings.current, turnId, draft }));
      }, LEAVE_MS);
    },
    [editing, onResendTurn, sessionId],
  );

  // 换会话、这一轮不见了、会话变忙：取消编辑。淡出期间不算（发送本身会让会话变忙）。
  useEffect(() => {
    setEditing(null);
    setLeaving(false);
  }, [sessionId]);
  useEffect(() => {
    if (!editing || leaving) return;
    if (busy || !turns.some((turn) => turn.id === editing.turnId)) setEditing(null);
  }, [busy, editing, leaving, turns]);

  const editIndex = editing ? turns.findIndex((turn) => turn.id === editing.turnId) : -1;
  const dimOf = useCallback(
    (index: number): TurnDim | undefined => {
      if (editIndex < 0 || index < editIndex) return undefined;
      return index === editIndex ? "body" : "all";
    },
    [editIndex],
  );

  const value = useMemo<TurnEditValue | null>(
    () => (sessionId ? { sessionId, editing, start, cancel, submit } : null),
    [sessionId, editing, start, cancel, submit],
  );
  return { value, editableTurnIds, editing: editing !== null, leaving, dimOf, start };
}
