import { useState, type ReactNode } from 'react';
import {
  STATUS_LABEL, T, formatDurationMs, formatStartedAt, formatThroughput, formatUnixSeconds,
  type TrajectoryAssistantMetrics, type TrajectoryCell, type TrajectoryLayout, type TrajectoryRequestView,
} from '../../../trajectory';

/** 点击在本地时间和 Unix 时间戳之间切换；正在选中文字时不切换。 */
export function StartedAtValue({ timestamp }: { timestamp: number | null | undefined }) {
  const [showUnix, setShowUnix] = useState(false);
  if (timestamp == null || !Number.isFinite(timestamp)) return <dd>{T.notAvailable}</dd>;
  return (
    <dd>
      <button
        type="button"
        className="tj-timestampToggle"
        title={showUnix ? T.showLocalTime : T.showUnixTimestamp}
        onClick={(event) => {
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed && selection.rangeCount > 0 && selection.getRangeAt(0).intersectsNode(event.currentTarget)) return;
          setShowUnix(current => !current);
        }}
      >
        {showUnix ? formatUnixSeconds(timestamp) : formatStartedAt(timestamp)}
      </button>
    </dd>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => <div><dt>{label}</dt><dd>{children}</dd></div>;

function totalTime(m: TrajectoryAssistantMetrics): string {
  if (!m.timingRecorded) return T.notRecorded;
  if (m.stepStartTime === null) return T.stepStartUnavailable;
  if (m.completedTime === null) return STATUS_LABEL.running;
  return formatDurationMs(Math.max(0, m.completedTime - m.stepStartTime));
}

function ttft(m: TrajectoryAssistantMetrics): string {
  if (!m.timingRecorded) return T.notRecorded;
  if (m.stepStartTime === null) return T.stepStartUnavailable;
  if (m.firstTokenTime === null) return T.firstTokenUnavailable;
  return formatDurationMs(Math.max(0, m.firstTokenTime - m.stepStartTime));
}

function generationTime(m: TrajectoryAssistantMetrics): string {
  if (!m.timingRecorded || m.firstTokenTime === null) return T.firstTokenUnavailable;
  if (m.completedTime === null) return STATUS_LABEL.running;
  return formatDurationMs(Math.max(0, m.completedTime - m.firstTokenTime));
}

function throughput(m: TrajectoryAssistantMetrics): string {
  if (!m.usageProvided) return T.usageUnavailable;
  if (m.outputTokens === null) return T.outputTokensUnavailable;
  if (!m.timingRecorded || m.firstTokenTime === null) return T.firstTokenUnavailable;
  if (m.completedTime === null) return STATUS_LABEL.running;
  const seconds = (m.completedTime - m.firstTokenTime) / 1_000;
  return seconds <= 0 ? T.durationTooShort : formatThroughput(m.outputTokens / seconds);
}

function AssistantTimingPanel({ metrics }: { metrics: TrajectoryAssistantMetrics }) {
  return (
    <dl className="tj-overview">
      <div><dt>{T.started}</dt><StartedAtValue timestamp={metrics.stepStartTime} /></div>
      <Row label={T.totalDuration}>{totalTime(metrics)}</Row>
      <Row label={T.ttft}>{ttft(metrics)}</Row>
      <Row label={T.generation}>{generationTime(metrics)}</Row>
      <Row label={T.throughput}>{throughput(metrics)}</Row>
    </dl>
  );
}

/** 记录计时：助手有首 token 指标时用助手面板，其余是开始时间、时长、来源。 */
export function RecordTiming({ cell, preview = false }: { cell: TrajectoryCell; preview?: boolean }) {
  const metrics = cell.record.assistantMetrics;
  if (cell.kind === 'message' && metrics) return <AssistantTimingPanel metrics={metrics} />;
  return (
    <dl className="tj-overview">
      <div><dt>{T.started}</dt><StartedAtValue timestamp={cell.startedAt} /></div>
      <Row label={T.duration}>{formatDurationMs(cell.durationMs)}</Row>
      {!preview && <Row label={T.timingSource}>{cell.durationMs === null ? T.notAvailable : cell.record.timingSource ?? T.sessionTimestamps}</Row>}
    </dl>
  );
}

/** 请求计时：有结果助手时沿用它的计时，否则用请求自己的开始和完成时间。 */
export function RequestTiming({ layout, request, preview = false }: { layout: TrajectoryLayout; request: TrajectoryRequestView; preview?: boolean }) {
  const assistant = request.purpose === 'assistant' && request.resultRecordId !== null
    ? layout.cells.find(cell => cell.recordId === request.resultRecordId && cell.kind === 'message')
    : undefined;
  if (assistant) return <RecordTiming cell={assistant} preview={preview} />;
  const anchor = layout.cells.find(cell => cell.requestKey === request.key);
  const startedAt = request.startedAt ?? anchor?.startedAt ?? null;
  const duration = request.startedAt === null || request.completedAt === null ? null : Math.max(0, request.completedAt - request.startedAt);
  return (
    <dl className="tj-overview">
      <div><dt>{T.started}</dt><StartedAtValue timestamp={startedAt} /></div>
      <Row label={T.duration}>{formatDurationMs(duration)}</Row>
      {!preview && request.startedAt !== null && <Row label={T.timingSource}>{duration === null ? T.sessionTimestampsRunning : T.sessionTimestamps}</Row>}
    </dl>
  );
}
