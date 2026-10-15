import { ChevronRight } from 'lucide-react';
import { T, blockLabel, openBlockSummary, type TrajectoryCell, type TrajectorySourceBlock } from '../../../trajectory';
import { JsonTree } from '../../ui/JsonTree';
import { ToolCallGlyph } from '../kind-icons';
import { MarkdownFragment, NoPayload, RawFragment, findToolCell, valueText, type RecordBodyProps } from './shared';

/** 预览用的文本：用户/上下文取输入，助手取文本块（流式时是累积文本），已压缩取输出。 */
export function markdownSource(cell: TrajectoryCell): string {
  const { record } = cell;
  if (cell.kind === 'user' || cell.kind === 'context') return valueText(record.inputDetail) ?? record.summary;
  if (cell.kind === 'message') {
    const text = (record.sourceBlocks ?? []).filter(block => block.type === 'text').map(block => block.content).join('\n\n');
    return text || (typeof record.outputDetail === 'string' ? record.outputDetail : '');
  }
  return valueText(record.outputDetail) ?? record.result ?? '';
}

type ToolCallEntry = { readonly key: string; readonly callId: string | null; readonly name: string; readonly args: string };

/** 助手块里的工具调用，加上只靠 assistantRecordId 归属、没有对应块的旧记录。 */
function toolCallEntries(cell: TrajectoryCell, layout: RecordBodyProps['layout']): readonly ToolCallEntry[] {
  const blocks = (cell.record.sourceBlocks ?? []).filter(block => block.type === 'tool-call');
  const known = new Set(blocks.map(block => block.callId));
  const entries = blocks.map((block, index): ToolCallEntry => ({ key: `${block.callId ?? ''}:${index}`, callId: block.callId ?? null, name: block.toolName ?? T.toolCall, args: block.content }));
  for (const tool of layout.cells) {
    if (tool.kind !== 'tool' || tool.record.assistantRecordId !== cell.recordId || !tool.record.callId || known.has(tool.record.callId)) continue;
    entries.push({ key: `ref:${tool.recordId}`, callId: tool.record.callId, name: tool.record.toolName ?? T.toolCall, args: valueText(tool.record.toolArguments) ?? '' });
  }
  return entries;
}

function AssistantToolCalls({ cell, layout, preview, onSelectRecord }: RecordBodyProps & { preview: boolean }) {
  const calls = toolCallEntries(cell, layout);
  if (calls.length === 0) return null;
  return (
    <ul className={preview ? 'tj-assistantToolCalls tj-assistantToolCallsPreview' : 'tj-assistantToolCalls'}>
      {calls.map((call) => {
        const target = findToolCell(layout, call.callId);
        return (
          <li key={call.key}>
            <button
              type="button"
              className="tj-assistantToolCallButton"
              disabled={!target}
              title={target ? T.openBlockSummaryTitle : T.toolCallUnavailable}
              onClick={() => { if (target) onSelectRecord(target.recordId); }}
            >
              <ToolCallGlyph className="tj-assistantToolCallIcon" />
              <span className="tj-assistantToolCallText">
                <span className="tj-assistantToolCallName">{call.name}</span>
                {call.args !== '' && <span className="tj-assistantToolCallArgs">{call.args}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 原始内容：按 provider 载荷顺序列出每个块，带 callId 的块可以跳到工具行。 */
function SourceBlocks({ blocks, layout, onSelectRecord }: { blocks: readonly TrajectorySourceBlock[] } & Pick<RecordBodyProps, 'layout' | 'onSelectRecord'>) {
  return (
    <div className="tj-sourceBlocks">
      {blocks.map((block, index) => {
        const target = findToolCell(layout, block.callId);
        const label = <span className="tj-sourceBlockLabel">{blockLabel(index + 1, block.type)}</span>;
        return (
          <section className="tj-sourceBlock" key={index}>
            {target
              ? (
                <button type="button" className="tj-sourceBlockJumpTarget" aria-label={openBlockSummary(index + 1)} title={T.openBlockSummaryTitle} onClick={() => { onSelectRecord(target.recordId); }}>
                  {label}
                  <ChevronRight className="tj-sourceBlockJumpIcon" size={12} aria-hidden="true" />
                </button>
              )
              : <div className="tj-sourceBlockHeader">{label}</div>}
            <pre className="tj-sourceBlockContent">{block.content}</pre>
          </section>
        );
      })}
    </div>
  );
}

type ContentProps = RecordBodyProps & {
  readonly rendered: boolean;
  readonly preview?: boolean;
  readonly thinkingExpanded: boolean;
  readonly onThinkingExpanded: (expanded: boolean) => void;
};

/** 预览（rendered）与原始内容（!rendered）共用；预览里思考折叠，工具调用按钮跳到工具行。 */
export function MarkdownRecordContent({ cell, layout, rendered, preview = false, thinkingExpanded, onThinkingExpanded, onSelectRecord }: ContentProps) {
  const { record } = cell;
  const blocks = record.sourceBlocks ?? [];
  const text = markdownSource(cell);
  const thinking = record.thinkingDetail;
  if (!rendered) {
    if (blocks.length > 0) return <SourceBlocks blocks={blocks} layout={layout} onSelectRecord={onSelectRecord} />;
    const source = [thinking, text].filter(Boolean).join('\n\n');
    return source === '' ? <NoPayload>{T.noContent}</NoPayload> : <RawFragment text={source} preview={preview} />;
  }
  const hasCalls = cell.kind === 'message' && toolCallEntries(cell, layout).length > 0;
  if (!thinking && text === '' && !hasCalls) return <NoPayload>{record.summary || T.noContent}</NoPayload>;
  const calls = hasCalls && <AssistantToolCalls cell={cell} layout={layout} preview={preview} onSelectRecord={onSelectRecord} />;
  if (thinking) {
    return (
      <div className="tj-assistantContent tj-assistantContentRendered">
        <div className={preview && text === '' ? 'tj-thinkingQuote tj-thinkingQuoteOnlyPreview' : 'tj-thinkingQuote'}>
          <button type="button" className="tj-thinkingToggle" aria-expanded={thinkingExpanded} onClick={() => { onThinkingExpanded(!thinkingExpanded); }}>
            {T.thinking}
            <ChevronRight className="tj-thinkingChevron" size={12} aria-hidden="true" />
          </button>
          {thinkingExpanded && <MarkdownFragment text={thinking} preview={preview} compact />}
        </div>
        {text !== '' && <div className="tj-assistantOutput"><MarkdownFragment text={text} preview={preview} /></div>}
        {calls}
      </div>
    );
  }
  return <div>{text !== '' && <MarkdownFragment text={text} preview={preview} />}{calls}</div>;
}

export function MessageSource({ cell }: { cell: TrajectoryCell }) {
  const source = cell.record.messageSource;
  if (source === null || source === undefined) return <NoPayload>{T.sourceNotRecorded}</NoPayload>;
  const data = typeof source === 'object' ? source : { value: source };
  return <JsonTree data={data} label={T.messageSourceJson} collapsedStringLines={12} className="tj-jsonPayload" />;
}
