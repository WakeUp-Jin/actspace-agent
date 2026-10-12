import { useEffect, useRef, useState } from "react";
import type { ContextState } from "@actspace/shared";
import { sessionsApi } from "../../api/sessions";

/** Light engine projection for Composer. Never requests or assembles history. */
export function useCurrentContext(sessionId: string | null, revision: number | undefined, visible: boolean) {
  const [state, setState] = useState<ContextState | null>(null);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    setState(null);
    if (!sessionId || !visible) return;
    let stopped = false, active = false, pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (stopped || document.hidden) return;
      if (active) { pending = true; return; }
      clearTimeout(timer); active = true;
      try {
        const next = await sessionsApi.describeContext({ sessionId });
        if (!stopped) setState(next?.sessionId === sessionId ? next : null);
      } catch {
        // Existing durable request projection remains a labelled fallback.
        if (!stopped) setState(null);
      } finally {
        active = false;
        if (!stopped && !document.hidden) {
          timer = setTimeout(() => void run(), pending ? 0 : 5000);
          pending = false;
        }
      }
    };
    refresh.current = () => void run();
    const visibility = () => { if (document.hidden) clearTimeout(timer); else void run(); };
    document.addEventListener("visibilitychange", visibility);
    void run();
    return () => { stopped = true; clearTimeout(timer); refresh.current = () => {}; document.removeEventListener("visibilitychange", visibility); };
  }, [sessionId, visible]);
  const priorRevision = useRef(revision);
  useEffect(() => {
    if (priorRevision.current !== revision) { priorRevision.current = revision; refresh.current(); }
  }, [revision]);
  return state?.sessionId === sessionId ? state : null;
}
