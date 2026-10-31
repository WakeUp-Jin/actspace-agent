import {
  STATUS_LABEL, T, TAB_LABEL, formatDurationMs, formatTokens, type DetailTab, type TrajectoryLayout, type TrajectoryRequestView, type TrajectoryUsage,
} from '../../../trajectory';
import { NavLink, OverviewRow, OverviewSection } from './RecordOverview';
import { JsonPayload, NoPayload } from './shared';
import { RequestTiming } from './TimingFields';

const hasUsage = (usage: TrajectoryUsage | null | undefined): usage is TrajectoryUsage =>
  !!usage && Object.values(usage).some(value => value !== null);

/** DSH `UsageRows`：输入总数 = 非缓存输入 + 缓存读取 + 缓存写入。 */
export function UsageRows({ usage }: { usage: TrajectoryUsage | null | undefined }) {
  if (!hasUsage(usage)) return <NoPayload>{T.usageNotReported}</NoPayload>;
  const { inputTokens: input, outputTokens: output, reasoningTokens: reasoning, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite } = usage;
  const totalInput = input === null && cacheRead === null && cacheWrite === null ? null : (input ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0);
  const detail = (label: string, value: number | null) => value === null ? null : <div className="tj-requestTokenDetail"><dt>{label}</dt><dd>{formatTokens(value)}</dd></div>;
  return (
    <dl className="tj-overview">
      {totalInput !== null && <OverviewRow label={T.usageInput}>{formatTokens(totalInput)}</OverviewRow>}
      {detail(T.usageCached, cacheRead)}
      {detail(T.usageCacheCreated, cacheWrite)}
      {detail(T.usageOther, input)}
      {output !== null && <OverviewRow label={T.usageOutput}>{formatTokens(output)}</OverviewRow>}
      {detail(T.reasoning, reasoning)}
      {output !== null && reasoning !== null && detail(T.content, output - reasoning)}
    </dl>
  );
}

/** 会话累计：把到本请求为止（含）每个请求的用量逐项相加。 */
function cumulativeUsage(layout: TrajectoryLayout, request: TrajectoryRequestView): TrajectoryUsage | null {
  const fields = ['inputTokens', 'outputTokens', 'reasoningTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const;
  const total: Record<(typeof fields)[number], number | null> = { inputTokens: null, outputTokens: null, reasoningTokens: null, cacheReadTokens: null, cacheWriteTokens: null };
  for (const item of layout.requests.values()) {
    if (item.number > request.number || !item.usage) continue;
    for (const field of fields) {
      const value = item.usage[field];
      if (value !== null) total[field] = (total[field] ?? 0) + value;
    }
  }
  return hasUsage(total) ? total : null;
}

function RequestUsagePanel({ layout, request }: { layout: TrajectoryLayout; request: TrajectoryRequestView }) {
  return (
    <div className="tj-usagePanel">
      <section className="tj-usageGroup"><h4 className="tj-usageHeading">{T.usageThisRequest}</h4><UsageRows usage={request.usage} /></section>
      <section className="tj-usageGroup"><h4 className="tj-usageHeading">{T.usageSessionCumulative}</h4><UsageRows usage={cumulativeUsage(layout, request)} /></section>
    </div>
  );
}

function RequestOptions({ options, preview = false }: { options: TrajectoryRequestView['options']; preview?: boolean }) {
  if (options === null || options === undefined) return <NoPayload>{T.optionsNotRecorded}</NoPayload>;
  return <JsonPayload data={options} label={T.optionsJson} preview={preview} />;
}

type RequestBodyProps = {
  readonly layout: TrajectoryLayout;
  readonly request: TrajectoryRequestView;
  readonly tab: DetailTab;
  readonly onTab: (tab: DetailTab) => void;
  readonly onSelectRecord: (recordId: string) => void;
};

function RequestOverview({ layout, request, onTab, onSelectRecord }: Omit<RequestBodyProps, 'tab'>) {
  const failed = request.status === 'failed';
  return (
    <>
      <dl className="tj-overview tj-summaryScrollRegion" data-summary-scroll-region="">
        <OverviewRow label={T.status} error={failed}>{request.terminalStatus === 'aborted' ? T.cancelled : STATUS_LABEL[request.status]}</OverviewRow>
        {request.purpose === 'compaction' && <OverviewRow label={T.purpose}>{T.compactionPurpose}</OverviewRow>}
        {request.purpose === 'image-inspection' && <OverviewRow label={T.purpose}>{T.imageInspectionPurpose}</OverviewRow>}
        {request.purpose === 'session-title' && <OverviewRow label={T.purpose}>{T.sessionTitlePurpose}</OverviewRow>}
        {request.purpose === 'auto-review' && <OverviewRow label={T.purpose}>{T.autoReviewPurpose}</OverviewRow>}
        {request.attempt !== undefined && <OverviewRow label={T.attempt}>{request.attempt}</OverviewRow>}
        {request.parentRecordId && <OverviewRow label={T.parentTool}>
          <NavLink label={layout.cells.find(cell => cell.recordId === request.parentRecordId)?.record.toolName ?? T.toolCall} onClick={() => { onSelectRecord(request.parentRecordId!); }} />
        </OverviewRow>}
        {request.provider && <OverviewRow label={T.provider}>{request.provider}</OverviewRow>}
        {request.model && <OverviewRow label={T.model}>{request.model}</OverviewRow>}
        <OverviewRow label={T.toolCalls}>{request.toolCalls}</OverviewRow>
        {request.subtoolCalls > 0 && <OverviewRow label={T.subtoolCalls}>{request.subtoolCalls}</OverviewRow>}
        {request.error && <OverviewRow label={T.error} error={failed}>{request.error}</OverviewRow>}
        {request.lastAttemptError && <OverviewRow label={T.lastAttemptError}>{request.lastAttemptError}</OverviewRow>}
        {request.retries > 0 && <OverviewRow label={T.retry}>{request.retries}</OverviewRow>}
        {request.retryDelayMs !== null && <OverviewRow label={T.retryDelay}>{formatDurationMs(request.retryDelayMs)}</OverviewRow>}
        {request.resultRecordId !== null && (
          <div>
            <dt>{T.result}</dt>
            <dd className="tj-overviewParentLinks">
              <NavLink label={request.purpose === 'compaction' ? T.compacted : T.assistantMessage} onClick={() => { onSelectRecord(request.resultRecordId!); }} />
            </dd>
          </div>
        )}
      </dl>
      <div className="tj-overviewSections">
        {request.options != null && <OverviewSection label={TAB_LABEL.options} onOpen={() => { onTab('options'); }}><RequestOptions options={request.options} preview /></OverviewSection>}
        <OverviewSection label={TAB_LABEL.usage} onOpen={() => { onTab('usage'); }}><UsageRows usage={request.usage} /></OverviewSection>
        <OverviewSection label={TAB_LABEL.timing} onOpen={() => { onTab('timing'); }}><RequestTiming layout={layout} request={request} preview /></OverviewSection>
      </div>
    </>
  );
}

/** 请求 #N 的各页签内容：概述 / 选项 / 用量 / 计时。 */
export function RequestBody({ tab, ...props }: RequestBodyProps) {
  if (tab === 'options') return <RequestOptions options={props.request.options} />;
  if (tab === 'usage') return <RequestUsagePanel layout={props.layout} request={props.request} />;
  if (tab === 'timing') return <RequestTiming layout={props.layout} request={props.request} />;
  return <RequestOverview {...props} />;
}
