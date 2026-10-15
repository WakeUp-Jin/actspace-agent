import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import {
  KIND_LABEL,
  T,
  cellStatus,
  requestLabel,
  rowAria,
  collapsedRowAria,
  turnLabel,
  type TrajectoryCell,
  type TrajectoryCellKind,
  type TrajectoryRequestView,
  type TrajectoryTableRow,
} from '../../trajectory';
import { KIND_ICON } from './kind-icons';

const KIND_CLASS: Record<TrajectoryCellKind, string> = {
  system: 'tj-systemNeutral',
  user: 'tj-user',
  context: 'tj-contextGreen',
  compacted: 'tj-compacted',
  message: 'tj-assistantVioletBright',
  tool: 'tj-toolAmber',
  subtool: 'tj-subtoolAmber',
};

const REQUEST_STATUS = { completed: undefined, running: 'running', failed: 'error' } as const;
const compactionRequestLabel = (request: number) => `${requestLabel(request)} · 压缩`;
const sectionLabel = (turn: number | null) => turn === null ? T.betweenTurns : turnLabel(turn);
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

type RowText = { list: string; tool?: { name: string; args: string }; toolCallOnly: boolean; result?: string };

/** DSH RecordPresentation：列表里的一行文字、工具名与参数、结果预览。 */
function rowText(cell: TrajectoryCell): RowText {
  const { record } = cell;
  if (cell.kind === 'tool' || cell.kind === 'subtool') {
    const name = record.toolName ?? '';
    const summary = oneLine(record.summary);
    const args = name !== '' && summary.startsWith(name) ? summary.slice(name.length).trim() : summary;
    const result = record.result !== null ? oneLine(record.result) : cellStatus(cell) === 'completed' ? T.noOutput : undefined;
    return { list: [name, args].filter(Boolean).join(' '), tool: { name, args }, toolCallOnly: false, result };
  }
  const text = oneLine(record.summary);
  const toolCallOnly = cell.kind === 'message' && text === '' && !record.thinkingDetail && (record.sourceBlocks ?? []).some(block => block.type === 'tool-call');
  return { list: toolCallOnly ? T.toolCallOnly : text, toolCallOnly };
}

export type TrajectoryRowProps = {
  readonly row: TrajectoryTableRow;
  readonly position: number;
  readonly request: TrajectoryRequestView | undefined;
  readonly requestRun: number;
  readonly requestSelected: boolean;
  readonly selected: boolean;
  /** Selection is in this row's turn: draws the turn rail. */
  readonly turnActive: boolean;
  /** Selection is in this row's section: highlights the turn label. */
  readonly sectionActive: boolean;
  readonly initialSystem: boolean;
  readonly terminalRequestBoundary: boolean;
  readonly timelineFocus: 'inside' | 'outside' | undefined;
  /** Double-click folds this row's turn (turn start of a multi-row turn, or any row of a folded turn). */
  readonly turnFoldable: boolean;
  /** Double-click folds this assistant's tool rows. */
  readonly assistantFoldable: boolean;
  readonly onSelect: (recordId: string) => void;
  readonly onSelectRequest: (key: string) => void;
  readonly onToggleTurn: (turn: number) => void;
  readonly onToggleAssistant: (recordId: string) => void;
  readonly measureRef?: (element: HTMLTableRowElement | null) => void;
  readonly virtualIndex?: number;
};

function TrajectoryRowView(props: TrajectoryRowProps) {
  const { row, request } = props;
  const { cell } = row;
  const collapsed = row.collapsed;
  const requestOnly = cell.requestOnly;
  const text = collapsed || requestOnly ? null : rowText(cell);
  const label = request === undefined ? undefined : request.purpose === 'compaction' ? compactionRequestLabel(request.number) : requestLabel(request.number);
  const toggleCollapsed = () => {
    if (collapsed?.kind === 'turn' && cell.turn !== null) props.onToggleTurn(cell.turn);
    else props.onToggleAssistant(cell.recordId);
  };
  const onDoubleClick = (event: MouseEvent) => {
    if (collapsed || requestOnly) return;
    if (props.assistantFoldable) { event.preventDefault(); props.onToggleAssistant(cell.recordId); return; }
    if (props.turnFoldable && cell.turn !== null) { event.preventDefault(); props.onToggleTurn(cell.turn); }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (requestOnly || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    if (collapsed) toggleCollapsed();
    else props.onSelect(cell.recordId);
  };
  const ariaLabel = collapsed
    ? collapsedRowAria(collapsed.kind, collapsed.summary)
    : requestOnly
      ? `请求 ${request?.number ?? ''}，${T.compactionPurpose}`
      : rowAria(request?.number ?? null, KIND_LABEL[cell.kind], text?.list ?? '');
  return <tr
    ref={props.measureRef}
    tabIndex={requestOnly ? -1 : 0}
    aria-rowindex={props.position + 1}
    aria-label={ariaLabel}
    aria-selected={!collapsed && !requestOnly && props.selected}
    data-index={props.virtualIndex}
    data-kind={cell.kind}
    data-record-id={collapsed ? undefined : cell.recordId}
    data-event-seq={collapsed ? undefined : cell.record.sourceSequences[0]}
    data-trajectory-row-key={row.key}
    data-record-index={!collapsed && !requestOnly ? cell.index : undefined}
    data-request-only={requestOnly || undefined}
    data-terminal-request-boundary={props.terminalRequestBoundary || undefined}
    data-group-start={row.groupStart || undefined}
    data-turn-start={row.turnStart || undefined}
    data-turn-end={row.turnEnd || undefined}
    data-error={cell.isError || undefined}
    data-running={!requestOnly && cellStatus(cell) === 'running' || undefined}
    data-collapsed-summary={collapsed?.kind}
    data-selected={!collapsed && props.selected || undefined}
    data-timeline-focus={collapsed ? undefined : props.timelineFocus}
    onClick={requestOnly ? undefined : collapsed ? toggleCollapsed : () => props.onSelect(cell.recordId)}
    onDoubleClick={onDoubleClick}
    onKeyDown={onKeyDown}
  >
    <td className="tj-event">
      {request !== undefined && label !== undefined && <button
        type="button"
        className={props.requestSelected ? 'tj-requestBoundaryControl tj-requestBoundaryControlActive' : 'tj-requestBoundaryControl'}
        aria-label={label}
        aria-pressed={props.requestSelected}
        data-label={label}
        data-request-run-index={props.requestRun}
        data-request-status={REQUEST_STATUS[request.status]}
        style={{ '--request-boundary-offset': `${props.requestRun * 8}px` } as CSSProperties}
        onClick={event => { event.stopPropagation(); props.onSelectRequest(request.key); }}
        onDoubleClick={event => event.stopPropagation()}
      />}
      {props.turnActive && !props.initialSystem && <span className="tj-turnRail" aria-hidden="true" />}
      {!collapsed && props.selected && <span className="tj-selectionRail" aria-hidden="true" />}
      {!collapsed && !requestOnly && row.turnStart && <span className={props.sectionActive ? 'tj-turnLabel tj-turnLabelActive' : 'tj-turnLabel'} aria-label={sectionLabel(cell.turn)}>
        {cell.turn === null ? sectionLabel(null) : <>
          <span className="tj-turnLabelFull" aria-hidden="true">{sectionLabel(cell.turn)}</span>
          <span className="tj-turnLabelCompact" aria-hidden="true">#{cell.turn}</span>
        </>}
      </span>}
      <div className="tj-eventInner">
        {!collapsed && !requestOnly && <span className="tj-kindSlot">
          <span className={`tj-kindTag ${KIND_CLASS[cell.kind]}`} data-role-kind={cell.kind}>
            <span className="tj-kindTagIcon" aria-hidden="true" title={KIND_LABEL[cell.kind]}>{KIND_ICON[cell.kind]()}</span>
            <span className="tj-kindTagLabel">{KIND_LABEL[cell.kind]}</span>
          </span>
        </span>}
      </div>
    </td>
    <td className="tj-content">
      {requestOnly ? null : collapsed ? <span className="tj-collapsedTurnContent" title={collapsed.summary}>
        <span className="tj-collapsedTurnEllipsis">…</span>
        <span className="tj-collapsedTurnText">{collapsed.summary}</span>
      </span> : <RowContent text={text!} isError={cell.isError} />}
    </td>
  </tr>;
}

function RowContent({ text, isError }: { text: RowText; isError: boolean }) {
  const list = text.toolCallOnly
    ? <span className="tj-toolCallOnly">{T.toolCallOnly}</span>
    : text.tool === undefined
      ? text.list || '—'
      : <>
        <span className="tj-toolCallNameTypeface">{text.tool.name || '—'}</span>
        {text.tool.args !== '' && <span className="tj-toolCallPayload">{text.tool.args}</span>}
      </>;
  if (text.result === undefined) return <span className="tj-contentText" title={text.list}>{list}</span>;
  return <span className="tj-resultPreview" title={`${text.list} → ${text.result}`}>
    <span className="tj-resultRequest">{list}</span>
    <span className={isError ? 'tj-inlineResult tj-error' : 'tj-inlineResult'}>
      <span className="tj-arrow">→</span>
      <span className={text.result === T.noOutput ? 'tj-inlineResultText tj-noOutputText' : 'tj-inlineResultText'}>{text.result}</span>
    </span>
  </span>;
}

const sameCell = (a: TrajectoryCell, b: TrajectoryCell) => a === b || (
  a.recordId === b.recordId && a.index === b.index && a.kind === b.kind && a.turn === b.turn
  && a.isError === b.isError && a.approval === b.approval && a.requestOnly === b.requestOnly
  && a.record.summary === b.record.summary && a.record.result === b.record.result && a.record.state === b.record.state
  && a.record.partial === b.record.partial && a.record.thinkingDetail === b.record.thinkingDetail
  && a.record.outputDetail === b.record.outputDetail && a.record.assistantMetrics?.completedTime === b.record.assistantMetrics?.completedTime
);

const sameRow = (a: TrajectoryTableRow, b: TrajectoryTableRow) => a === b || (
  a.key === b.key && a.groupStart === b.groupStart && a.turnStart === b.turnStart && a.turnEnd === b.turnEnd
  && a.collapsed?.summary === b.collapsed?.summary && sameCell(a.cell, b.cell)
);

const sameRequest = (a: TrajectoryRequestView | undefined, b: TrajectoryRequestView | undefined) => a === b || (
  a !== undefined && b !== undefined && a.key === b.key && a.number === b.number && a.status === b.status && a.purpose === b.purpose
);

/**
 * 行组件按显示用到的字段比较：流式时 builder 每帧都会产出新对象，
 * 但只有这一行的文字或状态变化时才重渲，行的 DOM 始终是同一个（key = recordId）。
 */
export const TrajectoryRow = memo(TrajectoryRowView, (a, b) => {
  for (const key of Object.keys(a) as (keyof TrajectoryRowProps)[]) {
    if (key === 'row') { if (!sameRow(a.row, b.row)) return false; continue; }
    if (key === 'request') { if (!sameRequest(a.request, b.request)) return false; continue; }
    if (a[key] !== b[key]) return false;
  }
  return Object.keys(a).length === Object.keys(b).length;
});
