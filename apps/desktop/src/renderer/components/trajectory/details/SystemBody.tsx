import { ChevronRight } from 'lucide-react';
import { T, TAB_LABEL, promptDiffLines, namedParametersJson, type TrajectoryCell, type TrajectoryPromptDetail } from '../../../trajectory';
import { JsonTree } from '../../ui/JsonTree';
import { ToolCallGlyph } from '../kind-icons';
import { MarkdownFragment, NoPayload, valueText } from './shared';

const promptText = (prompt: TrajectoryPromptDetail | null | undefined) => prompt?.systemPrompt ?? valueText(prompt?.systemPromptParts) ?? '';
const toolsJson = (prompt: TrajectoryPromptDetail | null | undefined) => JSON.stringify(prompt?.tools ?? [], null, 2);

export function SystemPromptView({ cell }: { cell: TrajectoryCell }) {
  const text = promptText(cell.record.promptDetail);
  if (text === '') return <NoPayload>{T.systemPromptMissing}</NoPayload>;
  return <MarkdownFragment text={text} className="tj-systemPrompt" />;
}

type CatalogTool = { readonly name: string; readonly description: string; readonly parameters: unknown };

function catalogTools(prompt: TrajectoryPromptDetail | null | undefined): readonly CatalogTool[] {
  const tools = prompt?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.map((tool, index) => {
    const data = tool !== null && typeof tool === 'object' && !Array.isArray(tool) ? tool : {};
    return {
      name: typeof data.name === 'string' ? data.name : `${T.toolCall} ${index + 1}`,
      description: typeof data.description === 'string' ? data.description : '',
      parameters: data.parameters ?? data.inputSchema ?? data.input_schema ?? {},
    };
  });
}

/** 工具目录：每个工具一个 `<details>`，展开后是完整描述和参数树。 */
export function ToolCatalog({ cell }: { cell: TrajectoryCell }) {
  const tools = catalogTools(cell.record.promptDetail);
  if (tools.length === 0) return <NoPayload>{T.toolsMissing}</NoPayload>;
  return (
    <div className="tj-toolCatalog">
      {tools.map((tool, index) => (
        <details className="tj-toolCatalogItem" key={`${tool.name}:${index}`}>
          <summary className="tj-toolCatalogSummary">
            <ChevronRight className="tj-toolCatalogChevron" size={12} aria-hidden="true" />
            <ToolCallGlyph className="tj-toolCatalogIcon" />
            <span className="tj-toolCatalogName">{tool.name}</span>
            <span className="tj-toolCatalogDescription">{tool.description}</span>
          </summary>
          <div className="tj-toolCatalogDefinition">
            {tool.description !== '' && <p className="tj-toolCatalogFullDescription">{tool.description}</p>}
            <JsonTree data={tool.parameters} label={namedParametersJson(tool.name)} className="tj-toolCatalogTree" />
          </div>
        </details>
      ))}
    </div>
  );
}

function DiffSection({ title, before, after }: { title: string; before: string; after: string }) {
  const lines = promptDiffLines(before, after);
  if (lines.length === 0) return null;
  return (
    <section className="tj-promptDiffSection">
      <h3 className="tj-promptDiffTitle">{title}</h3>
      <pre className="tj-promptDiff">
        {lines.map((line, index) => <span className={`tj-promptDiffLine${line.kind}`} key={index}>{line.text || ' '}{'\n'}</span>)}
      </pre>
    </section>
  );
}

export function SystemPromptDiff({ cell }: { cell: TrajectoryCell }) {
  const { promptDetail: after, previousPromptDetail: before } = cell.record;
  return (
    <div className="tj-promptDiffSections">
      <DiffSection title={TAB_LABEL.systemPrompt} before={promptText(before)} after={promptText(after)} />
      <DiffSection title={TAB_LABEL.tools} before={toolsJson(before)} after={toolsJson(after)} />
    </div>
  );
}
