/**
 * 实时底稿：当前运行里还没定稿的正文与思考（规范 agent-spec-live-assistant-stream §5）。
 *
 * - 每接受一段增量，`revision` 加一（全局单调，跨会话、跨运行都不回退）；
 * - 某条消息的 `assistant/message` 写入日志后 `settle` 删掉它；运行结束 `clear` 整份删除；
 * - 实时帧带上它包含的最后一个 revision，界面拿到底稿后丢掉 revision 不大于底稿的帧。
 *
 * 桌面主进程与远程 Host 共用；只存文本，不存工具参数（工具由日志和实时工具事件恢复）。
 */
export type LiveOutputKind = "assistant-delta" | "reasoning-delta";
/** `requestId`：产生这段输出的模型请求（轨迹按它把正文放进占位行）；旧版远程 Host 不带。 */
export type LiveOutputPiece = {
  readonly kind: LiveOutputKind;
  readonly messageId: string;
  readonly requestId?: string;
  readonly text: string;
  readonly revision: number;
};
export type LiveOutputSegment = {
  readonly kind: "text" | "thinking";
  readonly messageId: string;
  readonly requestId?: string;
  readonly text: string;
};
export type LiveOutputBaseline = {
  /** 底稿所属运行；没有未定稿输出时为 null，revision 仍然有效（用于截断之前的帧）。 */
  readonly runId: string | null;
  readonly revision: number;
  readonly segments: readonly LiveOutputSegment[];
};
export type LiveOutputPage = {
  readonly runId: string;
  readonly revision: number;
  readonly next: number;
  readonly chunks: readonly LiveOutputPiece[];
};

/** 单段上限：远程分页时一段不会超过帧大小，超长的单个增量拆成多段，每段一个 revision。 */
const PIECE_CHARS = 8192;
const PAGE_PIECES = 4;

export class LiveOutputBuffer {
  #revision = 0;
  readonly #sessions = new Map<string, { runId: string; pieces: LiveOutputPiece[] }>();

  get revision(): number {
    return this.#revision;
  }

  /** 收下一个实时事件。是正文或思考增量时返回它的 revision，其余事件返回 null。 */
  accept(event: unknown): number | null {
    if (!isRecord(event) || typeof event.sessionId !== "string" || typeof event.agentRunId !== "string") return null;
    if (event.kind !== "assistant-delta" && event.kind !== "reasoning-delta") return null;
    if (typeof event.message !== "string" || typeof event.messageId !== "string" || event.message.length === 0)
      return null;
    let state = this.#sessions.get(event.sessionId);
    if (!state || state.runId !== event.agentRunId) {
      state = { runId: event.agentRunId, pieces: [] };
      this.#sessions.set(event.sessionId, state);
    }
    const request = typeof event.requestId === "string" ? { requestId: event.requestId } : {};
    for (let offset = 0; offset < event.message.length; offset += PIECE_CHARS) {
      state.pieces.push({
        kind: event.kind,
        messageId: event.messageId,
        ...request,
        text: event.message.slice(offset, offset + PIECE_CHARS),
        revision: ++this.#revision,
      });
    }
    return this.#revision;
  }

  /** 这条消息已经写进日志：从底稿里删掉。 */
  settle(sessionId: string, messageId: string): void {
    const state = this.#sessions.get(sessionId);
    if (!state) return;
    state.pieces = state.pieces.filter((piece) => piece.messageId !== messageId);
  }

  /** 运行结束：删掉整份底稿。给了 runId 时只在仍是这个运行时删除。 */
  clear(sessionId: string, runId?: string): void {
    if (runId === undefined || this.#sessions.get(sessionId)?.runId === runId) this.#sessions.delete(sessionId);
  }

  /** 当前底稿：相邻的同一消息、同一类型的片段合并成一段。 */
  baseline(sessionId: string): LiveOutputBaseline {
    const state = this.#sessions.get(sessionId);
    if (!state) return { runId: null, revision: this.#revision, segments: [] };
    return { runId: state.runId, revision: this.#revision, segments: mergePieces(state.pieces) };
  }

  /** 远程观察快照里的摘要：页从 revision 0 往后取，取到这个 revision 为止。 */
  describe(sessionId: string): { readonly runId: string; readonly revision: number } | null {
    const state = this.#sessions.get(sessionId);
    return state ? { runId: state.runId, revision: this.#revision } : null;
  }

  /** 远程分页：revision 大于 `afterRevision` 的片段，最多四段。运行已经换了返回 null。 */
  page(sessionId: string, runId: string, afterRevision: number): LiveOutputPage | null {
    const state = this.#sessions.get(sessionId);
    if (!state || state.runId !== runId) return null;
    const chunks = state.pieces.filter((piece) => piece.revision > afterRevision).slice(0, PAGE_PIECES);
    return { runId, revision: this.#revision, next: chunks.at(-1)?.revision ?? afterRevision, chunks };
  }
}

export function mergePieces(
  pieces: readonly Pick<LiveOutputPiece, "kind" | "messageId" | "requestId" | "text">[],
): LiveOutputSegment[] {
  const segments: { kind: "text" | "thinking"; messageId: string; requestId?: string; text: string }[] = [];
  for (const piece of pieces) {
    const kind = piece.kind === "reasoning-delta" ? "thinking" : "text";
    const last = segments.at(-1);
    if (last && last.kind === kind && last.messageId === piece.messageId) last.text += piece.text;
    else
      segments.push({
        kind,
        messageId: piece.messageId,
        ...(piece.requestId === undefined ? {} : { requestId: piece.requestId }),
        text: piece.text,
      });
  }
  return segments;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
