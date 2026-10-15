import { useCallback, useMemo, useRef, useState } from 'react';
import { detailTabs, pickTab, requestTabs, type DetailTab, type TrajectoryCell, type TrajectoryLayout } from '../../trajectory';
import type { DetailSelection } from './details/DetailPanel';

type Selection = { readonly kind: 'record'; readonly recordId: string } | { readonly kind: 'request'; readonly key: string } | null;

/**
 * 记录与请求的选中状态和页签历史（DSH：换选中对象时回到最近用过、且新对象也有的页签）。
 * 选中按 recordId / 请求 key 保存，流式时 layout 每帧更新也不会丢。
 * 选中正在输出的助手时，详情用流式 cell，正文实时变长。
 */
export function useTrajectorySelection(layout: TrajectoryLayout | null, streamingCells: ReadonlyMap<string, TrajectoryCell>) {
  const [selection, setSelection] = useState<Selection>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const history = useRef<DetailTab[]>(['overview']);
  const cells = useMemo(() => new Map((layout?.cells ?? []).filter(cell => !cell.requestOnly).map(cell => [cell.recordId, cell])), [layout]);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  const remember = (tab: DetailTab) => { history.current = [...history.current.filter(item => item !== tab), tab]; };
  const setTab = useCallback((tab: DetailTab) => { remember(tab); setActiveTab(tab); }, []);
  const selectRecord = useCallback((recordId: string, options: { readonly scroll?: boolean; readonly tab?: DetailTab } = {}) => {
    const cell = cellsRef.current.get(recordId);
    setSelection({ kind: 'record', recordId });
    if (options.tab) { remember(options.tab); setActiveTab(options.tab); }
    else setActiveTab(pickTab(cell ? detailTabs(cell) : [], history.current));
    if (options.scroll) setScrollToId(recordId);
  }, []);
  const selectRequest = useCallback((key: string) => {
    setSelection({ kind: 'request', key });
    remember('overview');
    setActiveTab('overview');
  }, []);
  const clear = useCallback(() => setSelection(null), []);
  const scrolled = useCallback(() => setScrollToId(null), []);

  const settled = selection?.kind === 'record' ? cells.get(selection.recordId) : undefined;
  const cell: TrajectoryCell | undefined = settled && (streamingCells.get(settled.recordId) ?? settled);
  const request = selection?.kind === 'request' ? layout?.requests.get(selection.key) : undefined;
  const detail: DetailSelection | null = cell ? { kind: 'record', cell } : request ? { kind: 'request', request } : null;
  const tabs = detail === null ? [] : detail.kind === 'request' ? requestTabs(detail.request) : detailTabs(detail.cell);
  const tab = tabs.some(item => item.id === activeTab) ? activeTab : pickTab(tabs, history.current);

  const section = useMemo(() => {
    if (!layout || (!settled && !request)) return null;
    const turn = layout.turns.find(item => item.groups.some(group => group.cells.some(candidate => settled ? candidate.recordId === settled.recordId : candidate.requestKey === request!.key)));
    return turn?.section ?? null;
  }, [layout, settled, request]);

  return {
    detail,
    tab,
    setTab,
    selectedId: cell?.recordId ?? null,
    selectedRequestKey: request?.key ?? null,
    activeTurn: request ? request.turn : cell?.turn ?? null,
    activeSection: section,
    scrollToId,
    scrolled,
    selectRecord,
    selectRequest,
    clear,
  };
}
