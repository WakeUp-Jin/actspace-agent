import type { TrajectoryCell } from '../../../trajectory';
import { MarkdownFragment } from './shared';
import { JsonTree } from '../../ui/JsonTree';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Readable structure uses recorded source categories; the raw tab keeps exact model text. */
export function ContextBody({ cell, text, preview }: { cell: TrajectoryCell; text: string; preview: boolean }) {
  const category = cell.record.contextPresentation?.category;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return <MarkdownFragment text={text} preview={preview} />; }
  if (category === '规则' && typeof object(value).content === 'string') return <MarkdownFragment text={object(value).content as string} preview={preview} />;
  if ((category === '技能目录' || category === '已加载技能') && Array.isArray(value) && value.every(item => typeof object(item).id === 'string')) return <div className="tj-toolCatalog">
    {value.map((item, index) => {
      const entry = object(item);
      return <details key={`${String(entry.id)}:${index}`} className="tj-toolCatalogItem">
        <summary className="tj-toolCatalogSummary"><span className="tj-toolCatalogName">{String(entry.name ?? entry.id)}</span><span className="tj-toolCatalogDescription">{typeof entry.description === 'string' ? entry.description : ''}</span></summary>
        <div className="tj-toolCatalogDefinition">{typeof entry.content === 'string' ? <MarkdownFragment text={entry.content} preview={preview} /> : <JsonTree data={entry} label="技能信息" />}</div>
      </details>;
    })}
  </div>;
  return <JsonTree data={value} label="上下文内容" />;
}
