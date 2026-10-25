import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RuntimeV2TrajectorySnapshot } from '@actspace/shared/runtime-v2';
import {
  T,
  TrajectorySearchIndex,
  assistantCalls,
  buildTrajectorySnapshot,
  collapseAssistants,
  collapseTurns,
  createLiveAccumulator,
  deriveLayout,
  deriveTimeline,
  filterRows,
  findRevealRecord,
  flattenLayout,
  splitLiveChunks,
  streamingCells as liveCells,
  timelineFocusIds,
  type DetailTab,
  type TrajectoryCell,
  type TrajectoryTimeRange,
} from '../trajectory';
import { TrajectoryTimeline } from './trajectory/TrajectoryTimeline';
import { TrajectoryToolbar } from './trajectory/TrajectoryToolbar';
import { TrajectoryTable } from './trajectory/TrajectoryTable';
import { DetailPanel } from './trajectory/details/DetailPanel';
import { trajectoryDelegations } from '../trajectory/subagents';
import { useTrajectoryNavigation } from './trajectory/TrajectoryNavigation';
import { useTrajectorySource } from './trajectory/use-trajectory-source';
import { useTrajectorySelection } from './trajectory/use-trajectory-selection';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

const HISTORY_PAGE = 120;
/** DSH SEARCH_INDEX_THROTTLE_MS: streaming text becomes searchable at most this late. */
export const SEARCH_INDEX_THROTTLE_MS = 3000;
const NO_STREAMING: ReadonlyMap<string, TrajectoryCell> = new Map();
const toggled = <T,>(set: ReadonlySet<T>, value: T) => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};
const without = <T,>(set: ReadonlySet<T>, value: T) => set.has(value) ? new Set([...set].filter(item => item !== value)) : set;

export type TrajectoryViewProps = {
  readonly snapshot?: RuntimeV2TrajectorySnapshot | null;
  /** Present while the session runs; the toolbar shows 停止 at its right edge. */
  readonly onAbort?: () => void;
  readonly isAborting?: boolean;
  /** Show this Session instead of the selected one (a child agent in the right panel). */
  readonly sessionId?: string;
  /** `panel`: right-panel layout, details stacked below the table; Context-panel jumps stay with the main view. */
  readonly variant?: 'main' | 'panel';
  /** Opens a delegated child agent's own trajectory (the right panel); the parent trajectory keeps only the `agent` row. */
  readonly onOpenSubagent?: (childSessionId: string) => void;
};

/** 轨迹视图：只做装配 —— 数据源、搜索、折叠、时间轴范围、选中与跳转。 */
export function TrajectoryView({ snapshot, onAbort, isAborting, sessionId: watchedSessionId, variant = 'main', onOpenSubagent }: TrajectoryViewProps) {
  const source = useTrajectorySource(snapshot, watchedSessionId);
  const bridge = source.projection?.bridge;
  const projectionCell = source.projection?.cell;
  // 定稿层（DSH finalized）：正在输出的助手只留空占位。流式时只有 chunk 在长，定稿键不变，builder 和布局都不重算。
  const split = useMemo(() => source.snapshot ? splitLiveChunks(source.snapshot) : null, [source.snapshot]);
  const splitRef = useRef(split);
  splitRef.current = split;
  const runtime = useMemo(() => {
    const current = splitRef.current;
    return current ? buildTrajectorySnapshot(current.settled(), { placeholders: new Set(current.live.keys()) }) : null;
  }, [split?.settledKey]);
  const layout = useMemo(() => runtime ? deriveLayout(runtime) : null, [runtime]);
  const delegations = useMemo(() => new Map(trajectoryDelegations(source.snapshot ?? null).map(item => [item.parentCallId, item])), [source.snapshot]);
  const subagentFor = useCallback((callId: string) => delegations.get(callId) ?? null, [delegations]);
  const cellsById = useMemo(() => new Map((layout?.cells ?? []).map(cell => [cell.recordId, cell])), [layout]);
  // 流式层（DSH streamingCells）：累加器只折叠新到的 chunk，表格和详情按 recordId 把占位换成流式 cell。
  const accumulator = useRef(createLiveAccumulator()).current;
  const streamingCells = useMemo(() => {
    if (!split || split.live.size === 0) return NO_STREAMING;
    return liveCells(cellsById, accumulator.update(split.live));
  }, [split, cellsById, accumulator]);
  const remoteHistory = !source.isFixture ? source.snapshot?.history : undefined;

  const [actualDuration, setActualDuration] = useState(false);
  const mode = actualDuration ? 'duration' : 'sequence';
  // 占位行已带首 token 时间，时间轴只跟定稿布局走，流式时不重算。
  const model = useMemo(() => layout ? deriveTimeline(layout.turns, mode) : null, [layout, mode]);

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<TrajectoryTimeRange | null>(null);
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<number>>(new Set());
  const [collapsedAssistants, setCollapsedAssistants] = useState<ReadonlySet<string>>(new Set());
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [revealMissed, setRevealMissed] = useState(false);
  const selection = useTrajectorySelection(layout, streamingCells);

  // 搜索索引（DSH TrajectorySearchIndex）：首次立即建立，之后最多每 3 秒更新一次；输入查询时立即用当前索引。
  const searchIndex = useRef(new TrajectorySearchIndex()).current;
  const indexed = useRef({ sessionId: null as string | null, at: -Infinity });
  const [searchRevision, setSearchRevision] = useState(0);
  const sessionId = runtime?.sessionId ?? null;
  useEffect(() => {
    if (!layout) return;
    const update = () => {
      indexed.current = { sessionId, at: Date.now() };
      if (searchIndex.update(layout.cells.map(cell => streamingCells.get(cell.recordId) ?? cell))) setSearchRevision(revision => revision + 1);
    };
    const wait = indexed.current.sessionId === sessionId ? indexed.current.at + SEARCH_INDEX_THROTTLE_MS - Date.now() : 0;
    if (wait <= 0) { update(); return; }
    const timer = setTimeout(update, wait);
    return () => clearTimeout(timer);
  }, [layout, streamingCells, searchIndex, sessionId]);
  const matches = useMemo(() => searchIndex.search(query), [searchIndex, searchRevision, query]);
  const focusIds = useMemo(() => timelineFocusIds(model, range), [model, range]);
  const allRows = useMemo(() => layout ? flattenLayout(layout.turns) : [], [layout]);
  // 本地分页：只显示最后 historyLimit 行，起点退到所在轮次的第一行。
  const historyStart = useMemo(() => {
    if (remoteHistory || allRows.length <= historyLimit) return 0;
    const section = allRows[allRows.length - historyLimit]!.section;
    return allRows.findIndex(row => row.section === section);
  }, [allRows, historyLimit, remoteHistory]);
  const windowRows = useMemo(() => historyStart === 0 ? allRows : allRows.slice(historyStart), [allRows, historyStart]);
  const foldableTurns = useMemo(() => {
    const counts = new Map<number, number>();
    for (const { cell } of windowRows) if (cell.turn !== null && !cell.requestOnly && cell.kind !== 'system') counts.set(cell.turn, (counts.get(cell.turn) ?? 0) + 1);
    return new Set([...counts].filter(([, count]) => count > 1).map(([turn]) => turn));
  }, [windowRows]);
  const foldableAssistants = useMemo(() => new Set(windowRows.flatMap((row, index) => row.cell.kind === 'message' && !row.cell.requestOnly && assistantCalls(windowRows, index).length > 0 ? [row.cell.recordId] : [])), [windowRows]);
  const rows = useMemo(() => {
    if (!layout) return [];
    if (matches) return filterRows(windowRows, matches);
    return collapseAssistants(collapseTurns(windowRows, collapsedTurns, layout), collapsedAssistants);
  }, [layout, windowRows, matches, collapsedTurns, collapsedAssistants]);

  useEffect(() => {
    setQuery(''); setRange(null); setHistoryLimit(HISTORY_PAGE); setHistoryError(null); setLoadingHistory(false);
    setCollapsedTurns(new Set()); setCollapsedAssistants(new Set()); selection.clear();
  }, [runtime?.sessionId, selection.clear]);

  const state = useRef({ matches, focusIds, allRows, historyStart });
  state.current = { matches, focusIds, allRows, historyStart };
  /** 跳到一条记录：清掉挡住它的搜索和时间轴范围，展开所在轮次和助手，必要时多加载本地历史。 */
  const reveal = useCallback((recordId: string, tab?: DetailTab) => {
    const current = state.current;
    const index = current.allRows.findIndex(row => row.cell.recordId === recordId);
    const cell = current.allRows[index]?.cell;
    if (!cell) return false;
    if (current.matches && !current.matches.has(recordId)) setQuery('');
    if (current.focusIds && !current.focusIds.has(recordId)) setRange(null);
    if (cell.turn !== null) setCollapsedTurns(set => without(set, cell.turn!));
    if (cell.kind === 'tool' || cell.kind === 'subtool') {
      const owner = current.allRows.slice(0, index).reverse().find(row => row.cell.kind === 'message' && row.cell.turn === cell.turn);
      if (owner) setCollapsedAssistants(set => without(set, owner.cell.recordId));
    }
    if (index < current.historyStart) setHistoryLimit(current.allRows.length - index);
    selection.selectRecord(recordId, { scroll: true, tab });
    return true;
  }, [selection.selectRecord]);
  const openRelated = useCallback((recordId: string) => { reveal(recordId, 'overview'); }, [reveal]);
  const onTimelineSelect = useCallback((recordId: string) => { reveal(recordId); }, [reveal]);
  // 面板里详情从下半部分弹出、表格变矮，点中的行可能被挡住，要滚回可见区域。
  const onTableSelect = useCallback((recordId: string) => selection.selectRecord(recordId, { scroll: variant === 'panel' }), [selection.selectRecord, variant]);
  const onToggleTurn = useCallback((turn: number) => setCollapsedTurns(set => toggled(set, turn)), []);
  const onToggleAssistant = useCallback((recordId: string) => setCollapsedAssistants(set => toggled(set, recordId)), []);

  // 从 Context 面板等处跳进来：记录就绪后定位并选中；找不到时在顶部留一行说明。
  const navigation = useTrajectoryNavigation();
  const pendingReveal = variant === 'main' ? navigation?.pending ?? null : null;
  useEffect(() => {
    if (!pendingReveal || !runtime) return;
    const record = findRevealRecord(runtime.records, pendingReveal.target);
    setRevealMissed(!(record && reveal(record.id)));
    navigation?.consume(pendingReveal.seq);
  }, [pendingReveal, runtime, navigation, reveal]);

  const hasEarlier = historyStart > 0 || remoteHistory?.previousFromSeq != null;
  // 加载返回时视图可能已换到别的会话（切换会话、右侧换了子智能体），只给发起时的那个会话写状态。
  const shownSession = useRef<string | null>(null);
  shownSession.current = runtime?.sessionId ?? null;
  const loadEarlier = useCallback(async (anchor: string | null) => {
    if (!remoteHistory) {
      setHistoryLimit(limit => limit + HISTORY_PAGE);
      if (anchor) selection.selectRecord(anchor, { scroll: true });
      return;
    }
    const sessionId = runtime?.sessionId;
    if (!bridge || !sessionId) { setHistoryError('历史记录通道不可用。'); return; }
    setLoadingHistory(true); setHistoryError(null);
    try {
      await bridge.loadEarlierHistory(sessionId);
    } catch (error) {
      if (shownSession.current === sessionId) setHistoryError(error instanceof Error ? error.message : '无法加载历史记录。');
    } finally {
      if (shownSession.current === sessionId) setLoadingHistory(false);
    }
  }, [remoteHistory, runtime?.sessionId, bridge, selection.selectRecord]);
  const onLoadEarlier = useCallback((anchor: string | null) => { void loadEarlier(anchor); }, [loadEarlier]);

  const allTurnsCollapsed = foldableTurns.size > 0 && [...foldableTurns].every(turn => collapsedTurns.has(turn));
  const allAssistantsCollapsed = foldableAssistants.size > 0 && [...foldableAssistants].every(id => collapsedAssistants.has(id));
  const empty = !runtime
    ? projectionCell?.status === 'loading' || (watchedSessionId !== undefined && !projectionCell) ? T.loadingTrajectory : projectionCell?.error ? null : '当前会话暂无可展示的 Agent 轨迹。'
    : runtime.records.length === 0 ? '当前会话尚未产生可展示的 Agent Loop 事件。' : null;

  return <section className="tjv-root" data-variant={variant} data-testid="trajectory-view" data-trajectory-source={source.isFixture ? 'mock' : 'projection'} aria-label="会话轨迹">
    <TrajectoryToolbar
      actualDuration={actualDuration}
      onActualDurationChange={actual => { setActualDuration(actual); setRange(null); }}
      allTurnsCollapsed={allTurnsCollapsed}
      onToggleAllTurns={() => setCollapsedTurns(allTurnsCollapsed ? new Set() : new Set(foldableTurns))}
      allAssistantsCollapsed={allAssistantsCollapsed}
      onToggleAllAssistants={() => setCollapsedAssistants(allAssistantsCollapsed ? new Set() : new Set(foldableAssistants))}
      query={query}
      onQueryChange={setQuery}
      onAbort={onAbort}
      isAborting={isAborting}
    />
    {projectionCell?.error && <div role="alert" className="tjv-notice">
      <span className="tjv-noticeText">{projectionCell.error}</span>
      <Button size="xs" onClick={() => { if (bridge) void (variant === 'panel' ? bridge.refreshRelated(projectionCell.sessionId) : bridge.open(projectionCell.sessionId)).catch(() => undefined); }}>重试</Button>
    </div>}
    {revealMissed && <div role="status" className="tjv-notice">
      <span className="tjv-noticeText">没有在已加载的轨迹里找到这条记录。{hasEarlier ? `它可能在更早的历史里，可以点「${T.loadEarlier}」后再试。` : ''}</span>
      <IconButton label="关闭说明" size="xs" onClick={() => setRevealMissed(false)}><X size={12} /></IconButton>
    </div>}
    {historyError && <p role="alert" className="tjv-notice">{historyError} 可以再点一次「{T.loadEarlier}」重试。</p>}
    {empty !== null || !layout ? <p role={projectionCell?.status === 'loading' ? 'status' : undefined} className="tjv-empty">{empty}</p> : <>
      <TrajectoryTimeline
        model={model}
        mode={mode}
        selectedId={selection.selectedId}
        matches={matches}
        range={range}
        onRange={setRange}
        onSelect={onTimelineSelect}
        hasEarlier={hasEarlier}
        loadingEarlier={loadingHistory}
        onLoadEarlier={() => onLoadEarlier(null)}
      />
      <div className="tjv-ledger">
        <div className="tj-split">
          <TrajectoryTable
            rows={rows}
            layout={layout}
            streamingCells={streamingCells}
            selectedId={selection.selectedId}
            selectedRequestKey={selection.selectedRequestKey}
            activeTurn={selection.activeTurn}
            activeSection={selection.activeSection}
            focusIds={focusIds}
            collapsedTurns={collapsedTurns}
            foldableTurns={foldableTurns}
            foldableAssistants={foldableAssistants}
            hasEarlier={hasEarlier}
            loadingEarlier={loadingHistory}
            onLoadEarlier={onLoadEarlier}
            scrollToId={selection.scrollToId}
            onScrolled={selection.scrolled}
            onSelect={onTableSelect}
            onSelectRequest={selection.selectRequest}
            onToggleTurn={onToggleTurn}
            onToggleAssistant={onToggleAssistant}
            onClearSelection={selection.clear}
          />
          {selection.detail && <DetailPanel
            layout={layout}
            selection={selection.detail}
            tab={selection.tab}
            onTab={selection.setTab}
            onSelectRecord={openRelated}
            onSelectRequest={selection.selectRequest}
            onClose={selection.clear}
            subagentFor={subagentFor}
            onOpenSubagent={onOpenSubagent}
          />}
        </div>
      </div>
    </>}
  </section>;
}
