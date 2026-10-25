import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionJournal, createCompactionTransaction, createCoreCodecRegistry } from '@actspace/session-journal';
import { projectTrajectoryWindow } from '@actspace/client/sessions';
import { buildTrajectorySnapshot, deriveLayout } from '../trajectory';
import { RecordOverview } from '../components/trajectory/details/RecordOverview';

function compactedLayout(stats?: Parameters<typeof createCompactionTransaction>[0]['stats']) {
  const journal = new SessionJournal({ registry: createCoreCodecRegistry() });
  for (const messageId of ['u1', 'u2', 'u3']) {
    journal.append({ type: 'user/message', eventVersion: 1, source: { ownerPluginId: '@actspace/core' }, data: { messageId, content: messageId }, surface: { kind: 'append', node: { messageId, kind: 'user', content: messageId } } });
  }
  journal.appendMany(createCompactionTransaction({ surface: journal.surface, start: 0, end: 3, compactionId: 'k1', contributorIds: [], summaryDigest: 'digest', durationMs: 23_000, summary: { messageId: 'summary', kind: 'user', content: '目标：改游标分页' }, ...(stats ? { stats } : {}) }));
  const runtime = buildTrajectorySnapshot(projectTrajectoryWindow('session', { events: journal.events, fromSeq: 0, throughJournalSeq: journal.lastSeq, beforeSeq: null, turnOffset: 0, requestOffset: 0 }));
  const layout = deriveLayout(runtime);
  return { layout, cell: layout.cells.find(cell => cell.kind === 'compacted')! };
}

function renderOverview(stats?: Parameters<typeof compactedLayout>[0]) {
  const { layout, cell } = compactedLayout(stats);
  render(<dl><RecordOverview layout={layout} cell={cell} thinkingExpanded={false} onThinkingExpanded={() => {}} onTab={() => {}} onSelectRecord={() => {}} onSelectRequest={() => {}} /></dl>);
  return cell;
}

const row = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('trajectory compaction overview', () => {
  it('merges span and recorded stats into the compaction record', () => {
    const { cell } = compactedLayout({ trigger: 'auto', beforeTokens: 182_400, afterTokens: 9_100 });
    expect(cell.record.compaction).toEqual({ compactionId: 'k1', trigger: 'auto', messageCount: 3, beforeTokens: 182_400, afterTokens: 9_100 });
    // 事务里的事件同一时刻写入，时长取 compaction/end 记录的 durationMs。
    expect(cell.record.durationMs).toBe(23_000);
  });

  it('shows trigger, compacted messages and before → after tokens', () => {
    renderOverview({ trigger: 'manual', beforeTokens: 182_400, afterTokens: 9_100 });
    expect(row('触发方式')).toBe('手动');
    expect(row('压缩消息数')).toBe('3 条');
    expect(row('Token')).toBe('182400 tok → 约 9100 tok');
  });

  it('keeps the old rows for journals written before stats were recorded', () => {
    renderOverview();
    expect(screen.queryByText('触发方式')).toBeNull();
    expect(row('压缩消息数')).toBe('3 条');
    expect(row('Token')).toBe('—');
  });
});
