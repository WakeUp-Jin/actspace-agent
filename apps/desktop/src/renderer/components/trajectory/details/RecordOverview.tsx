import { ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  APPROVAL_LABEL, STATUS_LABEL, T, TAB_LABEL, cellStatus, formatDurationMs, formatTokens, requestLabel, toolInput, toolOutput,
  type DetailTab, type TrajectoryCell,
} from '../../../trajectory';
import { MarkdownRecordContent, markdownSource } from './MessageBody';
import { MarkdownFragment, findToolCell, type RecordBodyProps } from './shared';
import { RecordPayload, RecordSchema } from './ToolBody';
import { RecordTiming } from './TimingFields';

/** 概述里的跳转链接：文字加一个小箭头。 */
export function NavLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="tj-overviewHierarchyNavLink" onClick={onClick}>
      <span>{label}</span>
      <ChevronRight className="tj-overviewHierarchyJumpIconTight" size={11} aria-hidden="true" />
    </button>
  );
}

/** 可跳转的小节：标题点击打开对应页签，内容溢出时底部渐隐。 */
export function OverviewSection({ label, onOpen, children }: { label: string; onOpen: () => void; children: ReactNode }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const measure = () => { setHasMore(preview.scrollHeight - preview.clientHeight - preview.scrollTop > 1); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(preview);
    Array.from(preview.children).forEach(child => { observer.observe(child); });
    return () => { observer.disconnect(); };
  }, [children]);
  return (
    <section className="tj-overviewSection">
      <h3 className="tj-overviewHeading">
        <button type="button" className="tj-overviewTitle" onClick={onOpen}>
          <span>{label}</span>
          <ChevronRight className="tj-overviewTitleIcon" size={12} aria-hidden="true" />
        </button>
      </h3>
      <div
        ref={previewRef}
        className="tj-overviewPreview tj-summaryScrollRegion"
        data-summary-scroll-region=""
        data-scroll-more={hasMore || undefined}
        onScroll={(event) => {
          const el = event.currentTarget;
          setHasMore(el.scrollHeight - el.clientHeight - el.scrollTop > 1);
        }}
      >
        {children}
      </div>
    </section>
  );
}

export const OverviewRow = ({ label, children, error }: { label: string; children: ReactNode; error?: boolean }) => (
  <div><dt>{label}</dt><dd className={error ? 'error' : undefined}>{children}</dd></div>
);

function messageSourceLabel(source: unknown): string {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return T.sourceUnknown;
  const { kind, round } = source as Record<string, unknown>;
  if (kind === 'user') return T.sourceUser;
  if (kind === 'goal') return typeof round === 'number' && round > 0 ? `${T.sourceGoal} · Round ${round}` : T.sourceGoal;
  return typeof kind === 'string' && kind !== '' ? `${kind[0]!.toUpperCase()}${kind.slice(1)}` : T.sourceUnknown;
}

function TokenRows({ cell }: { cell: TrajectoryCell }) {
  const output = cell.record.usage?.outputTokens ?? null;
  const think = cell.record.usage?.reasoningTokens ?? null;
  return (
    <>
      <OverviewRow label={T.tokens}>{output === null ? '—' : formatTokens(output)}</OverviewRow>
      {think !== null && <div className="tj-requestTokenDetail"><dt>{T.reasoning}</dt><dd>{formatTokens(think)}</dd></div>}
      {output !== null && think !== null && <div className="tj-requestTokenDetail"><dt>{T.content}</dt><dd>{formatTokens(Math.max(0, output - think))}</dd></div>}
    </>
  );
}

type OverviewProps = RecordBodyProps & {
  readonly thinkingExpanded: boolean;
  readonly onThinkingExpanded: (expanded: boolean) => void;
  readonly onTab: (tab: DetailTab) => void;
  readonly onSelectRequest: (requestKey: string) => void;
};

/** 记录概述：标签列表加可跳转的预览小节（照 DSH 概述页签）。 */
export function RecordOverview(props: OverviewProps) {
  const { cell, layout, onTab, onSelectRecord, onSelectRequest } = props;
  const { record } = cell;
  const status = cellStatus(cell);
  const failed = status === 'failed';
  if (cell.kind === 'compacted') {
    const summary = markdownSource(cell);
    return (
      <>
        <dl className="tj-overview tj-summaryScrollRegion" data-summary-scroll-region="">
          <OverviewRow label={T.status} error={failed}>{STATUS_LABEL[status]}</OverviewRow>
          <OverviewRow label={T.duration}>{formatDurationMs(cell.durationMs)}</OverviewRow>
          <OverviewRow label={T.tokens}>—</OverviewRow>
        </dl>
        {summary !== '' && <div className="tj-compactedSummary tj-summaryScrollRegion" data-summary-scroll-region=""><MarkdownFragment text={summary} /></div>}
      </>
    );
  }
  const isTool = cell.kind === 'tool' || cell.kind === 'subtool';
  const markdown = cell.kind === 'user' || cell.kind === 'context' || cell.kind === 'message';
  const request = cell.kind === 'message' && cell.requestKey ? layout.requests.get(cell.requestKey) : undefined;
  const parentMessage = isTool && record.assistantRecordId ? layout.cells.find(item => item.recordId === record.assistantRecordId) : undefined;
  const parentTool = cell.kind === 'subtool' ? findToolCell(layout, record.parentCallId) : undefined;
  const hasHierarchy = request !== undefined || parentMessage !== undefined || parentTool !== undefined;
  return (
    <>
      <dl className="tj-overview tj-summaryScrollRegion" data-summary-scroll-region="">
        {record.messageSource != null && (
          <div><dt>{T.source}</dt><dd className="tj-overviewParentLinks"><NavLink label={messageSourceLabel(record.messageSource)} onClick={() => { onTab('source'); }} /></dd></div>
        )}
        {hasHierarchy && (
          <div>
            <dt>{request ? T.source : T.hierarchy}</dt>
            <dd className="tj-overviewParentLinks">
              {request && cell.requestKey && <NavLink label={requestLabel(request.number)} onClick={() => { onSelectRequest(cell.requestKey!); }} />}
              {parentMessage && <NavLink label={T.assistantMessage} onClick={() => { onSelectRecord(parentMessage.recordId); }} />}
              {parentTool && <NavLink label={T.toolCall} onClick={() => { onSelectRecord(parentTool.recordId); }} />}
            </dd>
          </div>
        )}
        <OverviewRow label={T.status} error={failed}>{STATUS_LABEL[status]}</OverviewRow>
        {cell.approval && <OverviewRow label={T.approval}>{APPROVAL_LABEL[cell.approval]}</OverviewRow>}
        {cell.kind === 'message' && <TokenRows cell={cell} />}
        {(cell.kind === 'user' || cell.kind === 'context') && <OverviewRow label={T.duration}>{formatDurationMs(cell.durationMs)}</OverviewRow>}
      </dl>
      <div className="tj-overviewSections">
        {markdown && (
          <OverviewSection label={TAB_LABEL.preview} onOpen={() => { onTab('preview'); }}>
            <MarkdownRecordContent {...props} rendered preview />
          </OverviewSection>
        )}
        {isTool && (
          <>
            {toolInput(cell) != null ? (
              <OverviewSection label={TAB_LABEL.payload} onOpen={() => { onTab('payload'); }}><RecordPayload cell={cell} direction="input" preview /></OverviewSection>
            ) : null}
            {toolOutput(cell) != null ? (
              <OverviewSection label={TAB_LABEL.result} onOpen={() => { onTab('result'); }}><RecordPayload cell={cell} direction="output" preview /></OverviewSection>
            ) : null}
            <OverviewSection label={TAB_LABEL.schema} onOpen={() => { onTab('schema'); }}><RecordSchema cell={cell} preview /></OverviewSection>
          </>
        )}
        {request && cell.requestKey && (
          <OverviewSection label={T.requestTiming} onOpen={() => { onTab('timing'); onSelectRequest(cell.requestKey!); }}>
            <RecordTiming cell={cell} preview />
          </OverviewSection>
        )}
        {isTool && <OverviewSection label={TAB_LABEL.timing} onOpen={() => { onTab('timing'); }}><RecordTiming cell={cell} preview /></OverviewSection>}
      </div>
    </>
  );
}
