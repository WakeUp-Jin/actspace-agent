import { ChevronDown, ChevronRight, Clock3, Search, SquareMinus, SquarePlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { selectTrajectory } from '@actspace/client/sessions';
import type { RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useOptionalSessionProjection } from '../session';
import { buildTrajectorySnapshot, groupVirtualRows, searchTrajectory, type TrajectoryRecord, type TrajectoryTimeRange, type TrajectoryTimelineMode } from '../trajectory';
import { loadTrajectoryFixtureFromUrl } from '../trajectory/fixtures';
import { TrajectoryTimeline } from './trajectory/TrajectoryTimeline';
import { TrajectoryDetails } from './trajectory/TrajectoryDetails';
import { RoleBadge, roleOf } from './trajectory/presentation';

function useTrajectorySource(input: RuntimeV2TrajectorySnapshot | null | undefined) {
  const projection = useOptionalSessionProjection();
  const projected = projection?.cell ? selectTrajectory(projection.cell) : null;
  const [fixture, setFixture] = useState<RuntimeV2TrajectorySnapshot | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return;
    const loaded = loadTrajectoryFixtureFromUrl();
    setFixture(loaded);
    // A fixture-only theme override makes both themes reviewable without IPC.
    const theme = new URLSearchParams(window.location.search).get('trajectoryTheme');
    if (!loaded || (theme !== 'light' && theme !== 'dark')) return;
    const previous = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);
    return () => { if (previous === null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', previous); };
  }, []);
  return { snapshot: fixture ?? (input !== undefined ? input : projected), isFixture: fixture !== null, projection };
}

export function TrajectoryView({ snapshot }: { snapshot?: RuntimeV2TrajectorySnapshot | null }) {
  const source = useTrajectorySource(snapshot);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const bridge = source.projection?.bridge;
  const selectedSession = source.projection?.sessionId;
  useEffect(() => {
    if (!bridge || !selectedSession || source.isFixture) return;
    let disposed = false;
    setInitialLoading(true); setInitialError(null);
    void bridge.setTrajectoryVisible(selectedSession, true).catch(error => {
      if (!disposed) setInitialError(error instanceof Error ? error.message : '轨迹加载失败');
    }).finally(() => { if (!disposed) setInitialLoading(false); });
    return () => { disposed = true; void bridge.setTrajectoryVisible(selectedSession, false); };
  }, [bridge, selectedSession, source.isFixture, retry]);
  const [mode, setMode] = useState<TrajectoryTimelineMode>('sequence');
  const runtime = useMemo(() => source.snapshot ? buildTrajectorySnapshot(source.snapshot, mode) : null, [source.snapshot, mode]);
  const [query, setQuery] = useState('');
  const [historyLimit, setHistoryLimit] = useState(120);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const remoteHistory = !source.isFixture ? source.snapshot?.history : undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<TrajectoryTimeRange | null>(null);
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<string>>(new Set());
  const [collapsedSubtools, setCollapsedSubtools] = useState<ReadonlySet<string>>(new Set());
  const [collapsedCalls, setCollapsedCalls] = useState<ReadonlySet<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => runtime ? searchTrajectory(runtime, query) : null, [runtime, query]);
  const focusIds = useMemo(() => !runtime?.timeline || !range ? null : new Set(runtime.timeline.spans.filter(span => span.end >= range.start && span.start <= range.end).map(span => span.recordId)), [runtime, range]);
  const historyStart = useMemo(() => {
    if (remoteHistory) return 0;
    const index = Math.max(0, (runtime?.records.length ?? 0) - historyLimit);
    const turnId = runtime?.records[index]?.turnId;
    return turnId ? runtime!.records.findIndex(record => record.turnId === turnId) : index;
  }, [runtime, historyLimit, remoteHistory]);
  const ancestors = useMemo(() => {
    const byCall = new Map(runtime?.records.filter(record => record.callId).map(record => [record.callId, record]) ?? []);
    return new Map(runtime?.records.map(record => {
      const parents = new Set<string>();
      let id = record.parentCallId;
      while (id && !parents.has(id) && id !== record.callId) { parents.add(id); id = byCall.get(id)?.parentCallId; }
      return [record.id, parents] as const;
    }) ?? []);
  }, [runtime]);
  const parentCalls = useMemo(() => new Set(runtime?.records.map(record => record.parentCallId).filter(Boolean) ?? []), [runtime]);
  const rows = useMemo(() => runtime ? groupVirtualRows(runtime.records.slice(historyStart).filter(record => ![...(ancestors.get(record.id) ?? [])].some(id => collapsedSubtools.has(id))), collapsedTurns, collapsedCalls) : [], [runtime, historyStart, ancestors, collapsedSubtools, collapsedTurns, collapsedCalls]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: index => rows[index]?.height ?? 36, getItemKey: index => rows[index]!.key, overscan: 8 });
  const virtualItems = virtualizer.getVirtualItems();
  const fallback = useMemo(() => { let offset = 0; return rows.map((row, index) => { const start = offset; offset += row.height; return { index, key: row.key, start, size: row.height }; }); }, [rows]);
  const renderItems = import.meta.env.MODE === 'test' ? fallback : virtualItems;
  const selected = runtime?.records.find(record => record.id === selectedId);
  const collapsibleTurns = runtime?.turns.filter(turn => turn.records.length > 1) ?? [];
  const allTurnsCollapsed = collapsibleTurns.length > 0 && collapsibleTurns.every(turn => collapsedTurns.has(turn.id));
  const callIds = runtime?.records.flatMap(record => record.kind === 'tool' && record.callId ? [record.callId] : []) ?? [];
  const allCallsCollapsed = callIds.length > 0 && callIds.every(id => collapsedCalls.has(id));
  useEffect(() => { setSelectedId(null); setHistoryLimit(120); setHistoryError(null); setLoadingHistory(false); setRange(null); setCollapsedTurns(new Set()); setCollapsedCalls(new Set()); setCollapsedSubtools(new Set()); }, [runtime?.sessionId]);
  useEffect(() => {
    if (!focusId) return;
    const index = rows.findIndex(row => row.entries.some(entry => entry.record.id === focusId));
    if (index >= 0) { virtualizer.scrollToIndex(index, { align: 'auto' }); setFocusId(null); }
  }, [focusId, rows, virtualizer]);
  const focus = (record: TrajectoryRecord) => {
    setCollapsedSubtools(current => new Set([...current].filter(id => !ancestors.get(record.id)?.has(id))));
    const logical = runtime?.records.findIndex(item => item.id === record.id) ?? -1;
    if (runtime && logical >= 0 && logical < historyStart) setHistoryLimit(runtime.records.length - logical);
    setCollapsedTurns(current => { const next = new Set(current); if (record.turnId) next.delete(record.turnId); return next; });
    if (record.kind === 'tool') {
      const peers = runtime?.records.filter(item => item.turnId === record.turnId && item.stepId === record.stepId);
      setCollapsedCalls(current => { const next = new Set(current); peers?.forEach(item => { if (item.callId) next.delete(item.callId); }); return next; });
    }
    setFocusId(record.id);
  };
  const select = (record: TrajectoryRecord) => { setSelectedId(record.id); focus(record); };
  const navigateRelated = (record: TrajectoryRecord) => {
    if (matches && !matches.has(record.id)) setQuery('');
    if (focusIds && !focusIds.has(record.id)) setRange(null);
    select(record);
  };
  const control = 'inline-flex h-6 shrink-0 items-center gap-1 rounded-act-xs px-1.5 text-[12px] text-text-muted hover:bg-hover-overlay hover:text-text-main focus-visible:outline-1 focus-visible:outline-focus-ring';
  return <section className="flex h-full min-h-0 flex-col bg-surface text-text-main" data-testid="trajectory-view" data-trajectory-source={source.isFixture ? 'mock' : 'projection'} aria-label="Session trajectory">
    <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line px-2" role="toolbar" aria-label="Trajectory toolbar">
      <button type="button" className={`${control} ${mode === 'duration' ? 'bg-hover-overlay text-text-main' : ''}`} aria-label="Use actual duration" aria-pressed={mode === 'duration'} title={mode === 'duration' ? 'Use equal-width operations' : 'Use actual duration'} onClick={() => { setMode(mode === 'duration' ? 'sequence' : 'duration'); setRange(null); }}><Clock3 size={12} />Duration</button>
      <button type="button" className={`${control} ${allTurnsCollapsed ? 'bg-hover-overlay' : ''}`} aria-label={allTurnsCollapsed ? 'Expand turns' : 'Collapse turns'} aria-pressed={allTurnsCollapsed} onClick={() => setCollapsedTurns(allTurnsCollapsed ? new Set() : new Set(collapsibleTurns.map(turn => turn.id)))}>{allTurnsCollapsed ? <SquarePlus size={12} /> : <SquareMinus size={12} />}Turns</button>
      <button type="button" className={`${control} ${allCallsCollapsed ? 'bg-hover-overlay' : ''}`} aria-label={allCallsCollapsed ? 'Expand calls' : 'Collapse calls'} aria-pressed={allCallsCollapsed} onClick={() => setCollapsedCalls(allCallsCollapsed ? new Set() : new Set(callIds))}>{allCallsCollapsed ? <SquarePlus size={12} /> : <SquareMinus size={12} />}Calls</button>
      <div className="ml-auto flex h-6 min-w-[72px] max-w-[200px] flex-1 items-center gap-1 rounded-act-xs border border-line bg-surface px-1.5 text-text-faint focus-within:border-info">
        <Search size={12} className="shrink-0" /><input type="search" className="min-w-0 w-full bg-transparent text-[12px] text-text-main outline-none placeholder:text-text-faint" aria-label="Search trajectory" placeholder="Search" value={query} onChange={event => { setQuery(event.currentTarget.value); }} />
        {query && <button type="button" aria-label="Clear trajectory search" onClick={() => setQuery('')}><X size={12} /></button>}
      </div>
    </div>
    {initialError && <p role="alert" className="px-4 text-xs text-text-muted">{initialError} <button onClick={() => setRetry(n => n + 1)}>重试</button></p>}
    {initialLoading && !runtime && <p role="status" className="px-4 text-xs text-text-muted">正在加载轨迹…</p>}
    {!runtime || !runtime.records.length ? <p className="m-0 px-4 py-4 text-[12px] text-text-muted">{!runtime ? source.projection?.cell?.status === 'loading' ? '正在加载轨迹…' : source.projection?.cell?.error ?? '当前 Session 暂无可展示的 Agent 轨迹。' : '当前 Session 尚未产生可展示的 Agent Loop 事件。'}</p> : <>
      <TrajectoryTimeline runtime={runtime} selectedId={selectedId} matches={matches} range={range} onRange={setRange} onSelect={select} onFocus={focus} />
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {(historyStart > 0 || remoteHistory?.previousFromSeq != null) && <button type="button" disabled={loadingHistory} className="h-7 shrink-0 border-b border-line text-[11px] text-text-muted hover:bg-hover-overlay" onClick={async () => {
          const anchor = virtualItems.find(item => item.start >= (scrollRef.current?.scrollTop ?? 0));
          const record = rows[anchor?.index ?? 0]?.entries[0]?.record;
          if (remoteHistory && runtime) {
            const bridge = source.projection?.bridge;
            if (!bridge) { setHistoryError('History transport unavailable.'); return; }
            const sessionId = runtime.sessionId;
            setLoadingHistory(true); setHistoryError(null);
            try {
              await bridge.loadEarlierHistory(sessionId);
              if (bridge.store.selectedSessionId === sessionId && record) setFocusId(record.id);
            } catch (error) {
              if (bridge.store.selectedSessionId === sessionId) setHistoryError(error instanceof Error ? error.message : 'Unable to load history.');
            } finally { if (bridge.store.selectedSessionId === sessionId) setLoadingHistory(false); }
          } else {
            setHistoryLimit(current => current + 120);
            if (record) setFocusId(record.id);
          }
        }}>{loadingHistory ? 'Loading earlier history…' : 'Load earlier history'}</button>}
        {historyError && <p role="alert" className="m-0 px-3 py-2 text-[12px] text-text-muted">{historyError} Retry using Load earlier history.</p>}
        <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto" role="table" aria-label="Trajectory events">
          <div style={{ height: import.meta.env.MODE === 'test' ? fallback.reduce((sum, row) => sum + row.size, 0) : virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {renderItems.map(item => {
              const row = rows[item.index]!; const record = row.entries[0]!.record;
              const previous = rows[item.index - 1]?.entries[0]?.record;
              const depth = ancestors.get(record.id)?.size ?? 0;
              const showTurn = record.turnNumber != null && record.turnId !== previous?.turnId && record.kind !== 'system';
              const matched = row.entries.some(entry => (!matches || matches.has(entry.record.id)) && (!focusIds || focusIds.has(entry.record.id)));
              const selectedRow = row.entries.some(entry => entry.record.id === selectedId);
              const summary = row.rowType === 'turn-summary' || row.rowType === 'call-summary';
              return <div key={row.key} data-index={item.index} ref={virtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}>
                {summary ? <button type="button" className={`flex h-7 w-full items-center border-b border-line pl-[138px] pr-3 text-left text-[12px] text-text-muted hover:bg-hover-overlay max-[480px]:pl-[104px] ${matched ? '' : 'opacity-35'}`} aria-label={row.rowType === 'turn-summary' ? `Expand Turn ${record.turnNumber}` : 'Expand tool call'} onClick={() => {
                  if (row.rowType === 'turn-summary') setCollapsedTurns(current => { const next = new Set(current); if (record.turnId) next.delete(record.turnId); return next; });
                  else setCollapsedCalls(current => { const next = new Set(current); row.entries.forEach(entry => { if (entry.record.callId) next.delete(entry.record.callId); }); return next; });
                }}>{row.summary}</button> : <div role="row" data-event-seq={record.sourceSequences[0]} data-record-id={record.id} data-selected={selectedRow || undefined} data-focused={matched} className={`relative border-b border-line ${selectedRow ? 'bg-selected' : 'bg-surface hover:bg-hover-overlay'} ${matched ? '' : 'opacity-35'}`}>
                  {record.callId && parentCalls.has(record.callId) && <button type="button" aria-label={collapsedSubtools.has(record.callId) ? 'Expand nested tools' : 'Collapse nested tools'} aria-expanded={!collapsedSubtools.has(record.callId)} className="absolute left-7 top-3 z-10 text-text-muted" onClick={() => setCollapsedSubtools(current => { const next = new Set(current); if (next.has(record.callId!)) next.delete(record.callId!); else next.add(record.callId!); return next; })}>{collapsedSubtools.has(record.callId) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>}
                  {showTurn && <span className="pointer-events-none absolute left-0 top-0 rounded-br-act-xs bg-surface-subtle px-1 font-mono text-[9px] leading-3 text-text-faint">Turn {record.turnNumber}</span>}
                  <button type="button" aria-label={`${roleOf(record)} ${record.eventType}, ${record.summary}`} aria-pressed={selectedRow} className="grid min-h-9 w-full grid-cols-[78px_minmax(0,1fr)] items-center gap-3 py-2 pl-12 pr-3 text-left focus-visible:outline-1 focus-visible:outline-focus-ring max-[480px]:grid-cols-[68px_minmax(0,1fr)] max-[480px]:gap-2 max-[480px]:pl-7" onClick={() => select(record)}>
                    <RoleBadge record={record} /><span style={depth ? { paddingLeft: depth * 16 } : undefined} className="min-w-0 truncate text-[12px] leading-5" title={record.summary}>{record.partial ? 'Assistant responding…' : record.summary}{record.result ? <span className="text-text-muted"> → {record.result}</span> : null}</span>
                  </button>
                </div>}
              </div>;
            })}
          </div>
        </div>
        </div>
        {selected && <TrajectoryDetails key={selected.id} runtime={runtime} record={selected} onSelect={navigateRelated} onClose={() => setSelectedId(null)} />}
      </div>
    </>}
  </section>;
}
export { buildTrajectorySnapshot, groupVirtualRows };
