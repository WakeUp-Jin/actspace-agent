import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, Square } from "lucide-react";
import type { EnglishLearningState, SessionListItem } from "@actspace/shared";
import { Toggle } from "../settings/SettingsPrimitives";

export const SPEECH_STATUS_LABELS: Record<EnglishLearningState["speechStatus"], string> = {
  idle: "等待新回答", unconfigured: "未配置语音", unsupported: "当前平台暂不支持语音播放",
  synthesizing: "正在合成英文语音", playing: "正在朗读英文", error: "语音暂不可用",
};
const button = "inline-flex h-8 items-center gap-1.5 rounded-act-md border border-line bg-surface px-3 text-act-xs text-text-main hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50";

export function EnglishLearningCapability({ onConfigure }: { onConfigure?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<EnglishLearningState | null>(null);
  const latest = useRef<EnglishLearningState | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const available = Boolean(window.actspace?.getEnglishLearningState);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const accept = (next: EnglishLearningState) => {
      if (cancelled || (latest.current && next.revision < latest.current.revision)) return;
      latest.current = next;
      setState(next);
      if (next.targetSessionId) setSelected(next.targetSessionId);
    };
    const remove = window.actspace.onEnglishLearningStateChanged?.(accept);
    setError(null);
    void Promise.all([window.actspace.getEnglishLearningState!(), window.actspace.listSessions(), window.actspace.getSettingsV4?.()]).then(([next, list, settings]) => {
      if (cancelled) return;
      const sorted = list.filter((item) => !item.archived && !item.isChildSession && (!item.accessState || ["read-write", "degraded"].includes(item.accessState))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      setSessions(sorted);
      const last = (latest.current && latest.current.revision > next.revision ? latest.current : next).targetSessionId ?? settings?.settings.general.englishLearning?.lastSessionId;
      setSelected(sorted.some((item) => item.id === last) ? last! : sorted[0]?.id ?? "");
      accept(next);
    }).catch(() => { if (!cancelled) setError("读取英语辅助学习失败，请重试。"); });
    return () => { cancelled = true; remove?.(); };
  }, [available, reload]);

  const change = async (enabled: boolean, sessionId = selected) => {
    setBusy(true); setError(null);
    try {
      const next = await window.actspace.setEnglishLearningTarget!({ enabled, sessionId: sessionId || null });
      if (!latest.current || next.revision >= latest.current.revision) {
        latest.current = next;
        setState(next);
        setSelected(next.targetSessionId ?? sessionId);
      }
    } catch { setError("无法更改目标会话，请刷新列表后重试。"); }
    finally { setBusy(false); }
  };

  return (
    <section aria-label="英语辅助学习" className="overflow-hidden rounded-act-lg bg-surface-subtle">
      <div className="flex items-center gap-3 px-4 py-4">
        <button type="button" aria-expanded={expanded} aria-controls="english-learning-details" onClick={() => setExpanded(!expanded)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-act-md bg-surface text-text-muted"><BookOpen size={19} /></span>
          <span className="min-w-0 flex-1"><span className="block text-act-sm font-medium text-text-main">英语辅助学习</span><span className="mt-0.5 block text-act-xs text-text-faint">让选定会话按英文、中文对照回答，并朗读英文。</span></span>
          <ChevronDown size={15} className={`shrink-0 text-text-faint ${expanded ? "" : "-rotate-90"}`} />
        </button>
        <Toggle ariaLabel="开启英语辅助学习" checked={state?.enabled ?? false} disabled={!available || !state || !selected || busy} onChange={(enabled) => { setExpanded(true); void change(enabled); }} />
      </div>
      {(expanded || error) && <div id="english-learning-details" className="flex flex-col gap-4 border-t border-line px-4 py-4">
        {!available ? <p className="text-act-xs text-text-faint">英语辅助学习仅在桌面端可用。</p> : <>
          <label className="flex flex-col gap-2 text-act-xs text-text-muted">目标会话
            <select aria-label="英语学习目标会话" value={selected} disabled={busy || !state} onChange={(event) => void change(state?.enabled ?? false, event.target.value)} className="h-9 min-w-0 rounded-act-md border border-line bg-surface px-3 text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
              {!sessions.length && <option value="">请先创建会话</option>}
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.title || "未命名会话"}</option>)}
            </select>
          </label>
          <p role="status" className="text-act-xs text-text-faint">{!state ? "加载中…" : state.enabled ? `双语已开启 · ${SPEECH_STATUS_LABELS[state.speechStatus]}` : "已关闭 · 开启后从下一次模型请求生效"}{state && state.queuedSegments > 0 ? ` · 待播 ${state.queuedSegments} 段` : ""}</p>
          {state?.notice && <p className="text-act-xs text-text-faint">{state.notice}</p>}
          {state?.error && <p role="alert" className="text-act-xs text-on-danger">{state.error.message}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || !state || (!state.queuedSegments && !["playing", "synthesizing"].includes(state.speechStatus))} onClick={() => { void window.actspace.stopEnglishLearningSpeech?.().catch(() => setError("停止语音失败，请重试。")); }}><Square size={12} />停止播放</button>
            <button type="button" className={button} onClick={() => setReload((value) => value + 1)} disabled={busy}>刷新会话</button>
            {onConfigure && <button type="button" className={button} onClick={onConfigure}>语音配置</button>}
          </div>
          <p className="text-act-xxs leading-relaxed text-text-faint">只影响选定会话。停止播放会保留双语模式，历史回答不会补播。</p>
        </>}
        {error && <p role="alert" className="text-act-xs text-on-danger">{error}</p>}
      </div>}
    </section>
  );
}
