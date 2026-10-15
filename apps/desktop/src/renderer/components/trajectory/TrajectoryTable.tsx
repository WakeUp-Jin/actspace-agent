import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { T, requestBoundaries, requestBoundaryRuns, type TrajectoryCell, type TrajectoryLayout, type TrajectoryTableRow } from '../../trajectory';
import { TrajectoryRow } from './TrajectoryRow';

const VIRTUALIZATION_THRESHOLD = 100;
const OVERSCAN_ROWS = 12;
const BOTTOM_FOLLOW_THRESHOLD_PX = 2;
// jsdom has no layout, so tests always render every row.
const VIRTUALIZE = import.meta.env.MODE !== 'test';

export type TrajectoryTableProps = {
  readonly rows: readonly TrajectoryTableRow[];
  readonly layout: TrajectoryLayout;
  /** Live cells by record id; they replace the placeholder cell of the assistant still streaming (DSH currentRecord). */
  readonly streamingCells: ReadonlyMap<string, TrajectoryCell>;
  readonly selectedId: string | null;
  readonly selectedRequestKey: string | null;
  /** Turn (or section, for rows outside a turn) of the current selection; draws the turn rail. */
  readonly activeTurn: number | null;
  readonly activeSection: number | null;
  readonly focusIds: ReadonlySet<string> | null;
  readonly collapsedTurns: ReadonlySet<number>;
  readonly foldableTurns: ReadonlySet<number>;
  readonly foldableAssistants: ReadonlySet<string>;
  readonly hasEarlier: boolean;
  readonly loadingEarlier: boolean;
  readonly onLoadEarlier: (anchorRecordId: string | null) => void;
  /** Scroll this record into view once, then call `onScrolled`. */
  readonly scrollToId: string | null;
  readonly onScrolled: () => void;
  readonly onSelect: (recordId: string) => void;
  readonly onSelectRequest: (key: string) => void;
  readonly onToggleTurn: (turn: number) => void;
  readonly onToggleAssistant: (recordId: string) => void;
  readonly onClearSelection: () => void;
};

/** DSH 轨迹表格：固定列宽的 `<table>`，超过 100 行时虚拟化，新内容到达时贴住底部。 */
export const TrajectoryTable = memo(function TrajectoryTable(props: TrajectoryTableProps) {
  const { rows, layout, collapsedTurns } = props;
  const paneRef = useRef<HTMLDivElement>(null);
  const followsTail = useRef(true);
  const [scrollReady, setScrollReady] = useState(false);
  const boundaries = useMemo(() => requestBoundaries(rows, layout), [rows, layout]);
  const runs = useMemo(() => requestBoundaryRuns(rows, layout), [rows, layout]);
  const firstIndex = layout.cells[0]?.index;
  const virtualized = VIRTUALIZE && (rows.length > VIRTUALIZATION_THRESHOLD || props.hasEarlier);
  const scrollMargin = props.hasEarlier ? 30 : 0;
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: virtualized ? rows.length : 0,
    enabled: virtualized,
    estimateSize: index => rows[index]?.cell.requestOnly ? 0 : 30,
    getItemKey: index => rows[index]?.key ?? index,
    getScrollElement: () => paneRef.current,
    overscan: OVERSCAN_ROWS,
    scrollMargin,
  });
  const items = virtualized ? virtualizer.getVirtualItems() : [];
  const rendered = virtualized ? items.map(item => ({ position: item.index, row: rows[item.index]! })) : rows.map((row, position) => ({ position, row }));
  const virtualTop = virtualized ? Math.max(0, (items[0]?.start ?? 0) - scrollMargin) : 0;
  const virtualBottom = virtualized && items.length > 0 ? Math.max(0, virtualizer.getTotalSize() + scrollMargin - items.at(-1)!.end) : 0;

  const scrollToBottom = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;
    if (virtualized && rows.length > 0) virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    pane.scrollTop = pane.scrollHeight;
  }, [virtualized, rows.length, virtualizer]);

  // 首次有内容时滚到底部再显示表格（CSS 在 data-scroll-ready 之前隐藏表格）；之后贴底跟随新内容。
  useLayoutEffect(() => {
    if (rows.length === 0) return;
    if (!scrollReady) { scrollToBottom(); setScrollReady(true); return; }
    if (followsTail.current && props.scrollToId === null) scrollToBottom();
  }, [rows, scrollReady, scrollToBottom, props.scrollToId]);

  useEffect(() => {
    const id = props.scrollToId;
    if (id === null) return;
    const index = rows.findIndex(row => !row.collapsed && row.cell.recordId === id);
    if (index < 0) return;
    followsTail.current = false;
    if (virtualized) virtualizer.scrollToIndex(index, { align: 'auto' });
    else paneRef.current?.querySelector<HTMLElement>(`tr[data-trajectory-row-key="${CSS.escape(rows[index]!.key)}"]`)?.scrollIntoView?.({ block: 'nearest' });
    props.onScrolled();
  }, [props.scrollToId, rows, virtualized, virtualizer, props.onScrolled]);

  const loadEarlier = () => {
    const top = paneRef.current?.scrollTop ?? 0;
    const anchor = virtualized ? items.find(item => item.start >= top) : undefined;
    const row = rows[anchor?.index ?? 0];
    props.onLoadEarlier(row && !row.collapsed ? row.cell.recordId : null);
  };

  return <div
    ref={paneRef}
    className="tj-tablePane"
    data-trajectory-scroll=""
    onScroll={event => {
      const pane = event.currentTarget;
      followsTail.current = pane.scrollHeight - pane.clientHeight - pane.scrollTop <= BOTTOM_FOLLOW_THRESHOLD_PX;
    }}
    onClick={event => { if (event.target === event.currentTarget) props.onClearSelection(); }}
  >
    <table className="tj-table" data-scroll-ready={scrollReady || undefined} aria-rowcount={rows.length + (props.hasEarlier ? 1 : 0)}>
      <colgroup>
        <col className="tj-eventColumn" />
        <col className="tj-contentColumn" />
      </colgroup>
      <tbody>
        {props.hasEarlier && <tr className="tj-historyLoadRow" data-history-load="" aria-rowindex={1}>
          <td colSpan={2}>
            <button type="button" className="tj-historyLoadButton" disabled={props.loadingEarlier} aria-label={props.loadingEarlier ? T.loadingEarlier : T.loadEarlier} onClick={loadEarlier}>
              <span aria-hidden="true">{props.loadingEarlier ? T.loadingEarlier : T.loadEarlier}</span>
              <span className="tj-visuallyHidden" role="status" aria-live="polite">{props.loadingEarlier ? T.loadingEarlier : ''}</span>
            </button>
          </td>
        </tr>}
        {virtualTop > 0 && <tr className="tj-virtualSpacer" data-virtual-spacer="top" aria-hidden="true">
          <td colSpan={2} style={{ '--trajectory-virtual-spacer-height': `${virtualTop}px` } as CSSProperties} />
        </tr>}
        {rendered.map(({ row: settled, position }) => {
          const live = settled.collapsed ? undefined : props.streamingCells.get(settled.cell.recordId);
          const row = live === undefined ? settled : { ...settled, cell: live };
          const { cell } = row;
          const requestKey = !row.collapsed && boundaries.get(cell.index) === cell.requestKey && (cell.turn === null || !collapsedTurns.has(cell.turn)) ? cell.requestKey : null;
          const turnActive = cell.turn !== null && props.activeTurn === cell.turn;
          const sectionActive = cell.turn === null ? props.activeSection === row.section : turnActive;
          const turnFoldable = cell.turn !== null && (collapsedTurns.has(cell.turn) || (row.turnStart && props.foldableTurns.has(cell.turn)));
          return <TrajectoryRow
            key={row.key}
            row={row}
            position={position + (props.hasEarlier ? 1 : 0)}
            request={requestKey === null ? undefined : layout.requests.get(requestKey)}
            requestRun={runs.get(cell.index) ?? 0}
            requestSelected={requestKey !== null && requestKey === props.selectedRequestKey}
            selected={!row.collapsed && cell.recordId === props.selectedId}
            turnActive={turnActive}
            sectionActive={sectionActive}
            initialSystem={cell.kind === 'system' && cell.index === firstIndex}
            terminalRequestBoundary={cell.requestOnly && position === rows.length - 1}
            timelineFocus={props.focusIds === null ? undefined : props.focusIds.has(cell.recordId) ? 'inside' : 'outside'}
            turnFoldable={turnFoldable}
            assistantFoldable={cell.kind === 'message' && props.foldableAssistants.has(cell.recordId)}
            onSelect={props.onSelect}
            onSelectRequest={props.onSelectRequest}
            onToggleTurn={props.onToggleTurn}
            onToggleAssistant={props.onToggleAssistant}
            measureRef={virtualized ? virtualizer.measureElement : undefined}
            virtualIndex={virtualized ? position : undefined}
          />;
        })}
        {virtualBottom > 0 && <tr className="tj-virtualSpacer" data-virtual-spacer="bottom" aria-hidden="true">
          <td colSpan={2} style={{ '--trajectory-virtual-spacer-height': `${virtualBottom}px` } as CSSProperties} />
        </tr>}
      </tbody>
    </table>
  </div>;
});
