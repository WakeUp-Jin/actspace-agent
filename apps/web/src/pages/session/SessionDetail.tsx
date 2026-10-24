import type { ApprovalRequest } from "@actspace/shared/runtime-v2";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { queuedMessages } from "../../sessions/composer-state";
import { approvalAnchorIndex, toolBlockForCall } from "../../sessions/transcript-model";
import { buildTurns } from "../../sessions/turn-model";
import { useComposer } from "../../sessions/use-composer";
import { useSessionObservation } from "../../sessions/use-session-observation";
import { Button } from "../../ui/Button";
import { ApprovalCard } from "./ApprovalCard";
import { ThinkingWait } from "./blocks/EventRow";
import { Composer } from "./Composer";
import { DetailHeader } from "./DetailHeader";
import { TurnView } from "./TurnView";
import { useVisualViewportOffset } from "./use-visual-viewport-offset";

const STICK_THRESHOLD = 80;

/** 会话详情：顶栏 + 按轮次的时间线（流式、审批卡就地插入）+ 悬浮输入坞。 */
export function SessionDetail({ sessionId }: { readonly sessionId: string }) {
  const observation = useSessionObservation(sessionId);
  const composer = useComposer(sessionId, observation);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [denied, setDenied] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const offset = useVisualViewportOffset();
  const { items, approvals } = observation;
  const queued = useMemo(() => queuedMessages(observation.tasks), [observation.tasks]);
  const turns = useMemo(() => buildTurns(items), [items]);

  // 审批卡挂在对应工具条目之后（按条目 key）；找不到的放在最后一轮末尾
  const { after, trailing } = useMemo(() => {
    const byKey = new Map<string, ApprovalRequest[]>();
    const rest: ApprovalRequest[] = [];
    for (const request of approvals) {
      const index = approvalAnchorIndex(items, request.callId);
      const key = index < 0 ? null : items[index]!.key;
      if (key === null) rest.push(request); else byKey.set(key, [...(byKey.get(key) ?? []), request]);
    }
    return { after: byKey, trailing: rest };
  }, [items, approvals]);

  const onDecided = useCallback((kind: string) => { if (kind === "deny") { setDenied(true); setFocusSignal(value => value + 1); } }, []);
  const renderApproval = useCallback((request: ApprovalRequest) => {
    const block = toolBlockForCall(items, request.callId);
    const bash = block && block.kind === "bash" ? block : null;
    return <ApprovalCard request={request} {...(bash ? { command: bash.command, ...(bash.sandboxed !== undefined ? { sandboxed: bash.sandboxed } : {}) } : {})} onDecided={onDecided} onStale={observation.refresh} />;
  }, [items, onDecided, observation.refresh]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, approvals, queued.length, observation.running]);
  useEffect(() => { stick.current = true; }, [sessionId]);
  useEffect(() => { if (composer.sending) setDenied(false); }, [composer.sending]);

  const loadOlder = async () => {
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    stick.current = false;
    await observation.loadOlder();
    requestAnimationFrame(() => { if (el) el.scrollTop += el.scrollHeight - before; });
  };

  const awaitingApproval = approvals.length > 0;
  const last = items[items.length - 1];
  const waiting = observation.running && (!last || (last.type === "block" && last.block.kind === "user"));
  const lastTurn = turns[turns.length - 1];
  const tailExtras = waiting || trailing.length > 0 ? (
    <>
      {waiting ? <div className="tl-proc"><ThinkingWait /></div> : null}
      {trailing.map(request => <div key={request.requestId}>{renderApproval(request)}</div>)}
    </>
  ) : null;

  return (
    <div className="relative h-full overflow-hidden">
      <DetailHeader sessionId={sessionId} title={observation.title} />
      <div ref={scroller} onScroll={onScroll} className="no-scrollbar h-full overflow-y-auto pb-[calc(190px+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+66px)]">
        <div className="timeline mx-auto max-w-[760px] px-4">
          {observation.status === "error" && items.length === 0 ? (
            <div className="grid justify-items-center gap-3 py-16 text-center text-act-md text-text-muted">
              <p className="m-0">无法加载会话</p>
              <Button onClick={() => void observation.refresh()}>重试</Button>
            </div>
          ) : observation.status === "loading" && items.length === 0 ? (
            <p className="m-0 py-16 text-center text-act-md text-text-faint">加载中…</p>
          ) : null}
          {observation.hasMore ? <Button variant="ghost" busy={observation.loadingOlder} onClick={() => void loadOlder()}>加载更早的消息</Button> : null}
          {turns.map(turn => (
            <TurnView
              key={turn.key}
              turn={turn}
              sessionId={sessionId}
              active={turn === lastTurn && (observation.running || awaitingApproval)}
              approvalsAfter={after}
              renderApproval={renderApproval}
              trailing={turn === lastTurn ? tailExtras : undefined}
            />
          ))}
          {turns.length === 0 ? tailExtras : null}
        </div>
      </div>
      <div aria-hidden className="fade-bottom pointer-events-none absolute inset-x-0 bottom-0 z-1 h-[calc(env(safe-area-inset-bottom)+130px)]" style={{ transform: `translateY(-${offset}px)` }} />
      <div className="dock-wrap absolute inset-x-0 bottom-0 z-2 px-3 pb-[max(10px,env(safe-area-inset-bottom))]" style={{ transform: `translateY(-${offset}px)` }}>
        <div className="mx-auto max-w-[760px]">
          <Composer observation={observation} composer={composer} awaitingApproval={awaitingApproval} queued={queued} denied={denied} focusSignal={focusSignal} />
        </div>
      </div>
    </div>
  );
}
