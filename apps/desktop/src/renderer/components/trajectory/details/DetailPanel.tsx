import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  KIND_LABEL, T, compactionSection, detailTabs, requestLabel, requestTabs, turnLabel,
  type DetailTab, type TrajectoryCell, type TrajectoryCellKind, type TrajectoryLayout, type TrajectoryRequestView,
} from '../../../trajectory';
import { MarkdownRecordContent, MessageSource, markdownSource } from './MessageBody';
import { RecordOverview } from './RecordOverview';
import { RequestBody } from './RequestBody';
import { SystemPromptDiff, SystemPromptView, ToolCatalog } from './SystemBody';
import { RecordTiming } from './TimingFields';
import { RecordPayload, RecordSchema } from './ToolBody';
import { RawFragment } from './shared';

export type DetailSelection =
  | { readonly kind: 'record'; readonly cell: TrajectoryCell }
  | { readonly kind: 'request'; readonly request: TrajectoryRequestView };

export type DetailPanelProps = {
  layout: TrajectoryLayout;
  selection: DetailSelection;
  /** 父组件已用 `pickTab(tabs, history)` 选好。 */
  tab: DetailTab;
  onTab(tab: DetailTab): void;
  onSelectRecord(recordId: string): void;
  onSelectRequest(requestKey: string): void;
  onClose(): void;
};

const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const KEY_STEP = 16;
/** 表格至少留给自己的宽度。 */
const TABLE_RESERVE = 280;

const KIND_CLASS: Record<TrajectoryCellKind, string> = {
  system: 'tj-systemNeutral',
  user: 'tj-user',
  context: 'tj-contextGreen',
  compacted: 'tj-compacted',
  message: 'tj-assistantVioletBright',
  tool: 'tj-toolAmber',
  subtool: 'tj-subtoolAmber',
};

const sectionLabel = (turn: number | null) => turn === null ? T.betweenTurns : turnLabel(turn);
const clampWidth = (width: number, splitWidth: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.min(width, splitWidth - TABLE_RESERVE)));

function groupTitle(layout: TrajectoryLayout, cell: TrajectoryCell): string {
  for (const turn of layout.turns) for (const group of turn.groups) if (group.key === cell.group && group.cells.some(item => item.recordId === cell.recordId)) return group.title;
  return T.messageGroup;
}

function Header({ layout, selection, onClose }: Pick<DetailPanelProps, 'layout' | 'selection' | 'onClose'>) {
  let title;
  if (selection.kind === 'request') {
    const { request } = selection;
    title = (
      <>
        <span className="tj-requestDetailsDot" aria-hidden="true" />
        <span className="tj-requestDetailsName">{requestLabel(request.number)}</span>
        <span className="tj-detailsLocation">{request.purpose === 'compaction' ? compactionSection(sectionLabel(request.turn)) : sectionLabel(request.turn)}</span>
      </>
    );
  } else {
    const { cell } = selection;
    const location = cell.kind === 'system' ? cell.record.summary : cell.kind === 'compacted' ? sectionLabel(cell.turn) : `${sectionLabel(cell.turn)} · ${groupTitle(layout, cell)}`;
    title = (
      <>
        <span className={`tj-kindTag ${KIND_CLASS[cell.kind]}`}>{KIND_LABEL[cell.kind]}</span>
        <span className="tj-detailsLocation">{location}</span>
      </>
    );
  }
  return (
    <div className="tj-detailsHeader">
      <div className="tj-detailsTitle">{title}</div>
      <button type="button" className="tj-close" aria-label={T.close} onClick={onClose}><span aria-hidden="true">×</span></button>
    </div>
  );
}

/** 事件详情：头部、页签栏、可拖拽宽度；内容按选中对象和页签分派。 */
export function DetailPanel(props: DetailPanelProps) {
  const { layout, selection, tab, onTab, onSelectRecord, onSelectRequest, onClose } = props;
  const [width, setWidth] = useState<number | null>(null);
  // DSH: a message with thinking opens expanded; a toggle holds only for the record it was made on.
  const [thinkingDisclosure, setThinkingDisclosure] = useState<{ recordId: string; expanded: boolean } | null>(null);
  const recordId = selection.kind === 'request' ? null : selection.cell.recordId;
  const thinkingExpanded = thinkingDisclosure !== null && thinkingDisclosure.recordId === recordId
    ? thinkingDisclosure.expanded
    : selection.kind !== 'request' && selection.cell.kind === 'message' && Boolean(selection.cell.record.thinkingDetail?.trim());
  const setThinkingExpanded = (expanded: boolean) => { if (recordId !== null) setThinkingDisclosure({ recordId, expanded }); };
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number; splitWidth: number } | null>(null);
  const tabs = selection.kind === 'request' ? requestTabs(selection.request) : detailTabs(selection.cell);

  const measure = (handle: HTMLElement) => {
    const details = handle.parentElement;
    return { current: details?.getBoundingClientRect().width ?? 0, split: details?.parentElement?.getBoundingClientRect().width ?? Infinity };
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const { current, split } = measure(event.currentTarget);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: current, splitWidth: split };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (state?.pointerId !== event.pointerId) return;
    setWidth(clampWidth(state.startWidth + state.startX - event.clientX, state.splitWidth));
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const { current, split } = measure(event.currentTarget);
    setWidth(clampWidth(current + (event.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP), split));
    event.preventDefault();
  };

  const body = selection.kind === 'request'
    ? <RequestBody layout={layout} request={selection.request} tab={tab} onTab={onTab} onSelectRecord={onSelectRecord} />
    : <RecordBody {...{ layout, cell: selection.cell, tab, onTab, onSelectRecord, onSelectRequest, thinkingExpanded, onThinkingExpanded: setThinkingExpanded }} />;

  return (
    <aside className="tj-details" aria-label={T.details} style={width === null ? undefined : { width }}>
      <div
        className="tj-detailsResizeHandle"
        role="separator"
        aria-label={T.resize}
        aria-controls="trajectory-detail-panel"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        title={T.resizeTitle}
        onDoubleClick={() => { setWidth(null); }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={onKeyDown}
      />
      <Header layout={layout} selection={selection} onClose={onClose} />
      <div className="tj-detailTabs" role="tablist" aria-label={T.details}>
        {tabs.map(item => (
          <button
            key={item.id}
            id={`trajectory-detail-${item.id}`}
            type="button"
            role="tab"
            aria-controls="trajectory-detail-panel"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'tj-detailTab tj-detailTabActive' : 'tj-detailTab'}
            onClick={() => { onTab(item.id); }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="trajectory-detail-panel"
        className={tab === 'overview' ? 'tj-detailBody tj-detailBodySummary' : 'tj-detailBody'}
        role="tabpanel"
        aria-labelledby={`trajectory-detail-${tab}`}
      >
        {body}
      </div>
    </aside>
  );
}

type RecordBodyInputs = {
  layout: TrajectoryLayout;
  cell: TrajectoryCell;
  tab: DetailTab;
  thinkingExpanded: boolean;
  onThinkingExpanded(expanded: boolean): void;
} & Pick<DetailPanelProps, 'onTab' | 'onSelectRecord' | 'onSelectRequest'>;

function RecordBody(props: RecordBodyInputs) {
  const { layout, cell, tab, onSelectRecord } = props;
  if (cell.kind === 'system') {
    if (tab === 'diff') return <SystemPromptDiff cell={cell} />;
    if (tab === 'tools') return <ToolCatalog cell={cell} />;
    return <SystemPromptView cell={cell} />;
  }
  if (tab === 'overview') return <RecordOverview {...props} />;
  const content = { cell, layout, onSelectRecord, thinkingExpanded: props.thinkingExpanded, onThinkingExpanded: props.onThinkingExpanded };
  if (tab === 'preview') return <MarkdownRecordContent {...content} rendered />;
  if (tab === 'raw') return cell.kind === 'compacted' ? <RawFragment text={markdownSource(cell)} /> : <MarkdownRecordContent {...content} rendered={false} />;
  if (tab === 'source') return <MessageSource cell={cell} />;
  if (tab === 'payload') return <RecordPayload cell={cell} direction="input" />;
  if (tab === 'result') return <RecordPayload cell={cell} direction="output" />;
  if (tab === 'schema') return <RecordSchema cell={cell} />;
  return <RecordTiming cell={cell} />;
}
