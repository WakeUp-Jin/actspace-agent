import { createContext, useContext, useEffect, useRef, useState } from "react";
import { sessionsApi } from "../../../api/sessions";
import { Button } from "../../ui/Button";

export const ContextEntryTextScope = createContext<{ sessionId: string; revision?: string } | null>(null);
/** Full text is an explicit, version-bound action; conversation stays in trace. */
export function ContextEntryText({ entryKey }: { entryKey: string }) {
  const scope = useContext(ContextEntryTextScope);
  const [result, setResult] = useState<{ revision: string; text: string; nextOffset?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = `${scope?.sessionId}:${scope?.revision}:${entryKey}`;
  const active = useRef(identity); active.current = identity;
  useEffect(() => { active.current = identity; setError(null); setLoading(false); return () => { active.current = "disposed"; }; }, [identity]);
  if (!scope?.revision) return null;
  const current = result?.revision === scope.revision ? result : null;
  const read = async () => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const page = await sessionsApi.readContextEntry({ sessionId: scope.sessionId, revision: scope.revision!, key: entryKey, offset: current?.nextOffset ?? 0 });
      // Show one bounded page at a time, including for exceptionally large tools.
      if (active.current === identity) setResult(page);
    } catch (reason) { if (active.current === identity) setError(reason instanceof Error ? reason.message : "读取全文失败"); }
    finally { if (active.current === identity) setLoading(false); }
  };
  return <div className="mt-2">
    {current ? <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words font-mono text-act-xxs text-text-main">{current.text}</pre> : null}
    {error ? <p role="alert" className="text-act-xxs text-danger">{error}</p> : null}
    {!current || current.nextOffset !== undefined || error ? <Button variant="secondary" size="xs" disabled={loading} onClick={() => void read()}>{loading ? "正在读取…" : current ? "下一页原文" : "读取原文"}</Button> : null}
    {current?.nextOffset !== undefined ? <p className="text-act-xxs text-text-faint">原文分段展示，每段最多 64 KiB。</p> : null}
  </div>;
}
