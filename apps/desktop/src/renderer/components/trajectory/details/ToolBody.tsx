import { T, namedParametersJson, toolInput, type TrajectoryCell } from '../../../trajectory';
import { JsonPayload, NoPayload, RawFragment, parseContainer, valueText, type JsonValue } from './shared';
import { JsonTree } from '../../ui/JsonTree';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** 参数 / 结果。结果取模型看到的输出，缺失时才退回原始事件。 */
export function RecordPayload({ cell, direction, preview = false }: { cell: TrajectoryCell; direction: 'input' | 'output'; preview?: boolean }) {
  const value: JsonValue = direction === 'input' ? toolInput(cell) : cell.record.outputDetail ?? cell.record.result ?? cell.record.resultRaw;
  if (value === null || value === undefined || value === '') return <NoPayload>{direction === 'input' ? T.noPayload : T.noResult}</NoPayload>;
  const error = direction === 'output' && cell.isError;
  const json = parseContainer(value);
  if (json !== undefined) return <JsonPayload data={json} label={direction === 'input' ? T.payloadJson : T.resultJson} preview={preview} error={error} />;
  return <RawFragment text={valueText(value) ?? ''} preview={preview} className={error ? 'tj-errorPayload' : undefined} />;
}

/** 工具 Schema：名称、描述、参数树；结构不认识时退回原文。 */
export function RecordSchema({ cell, preview = false }: { cell: TrajectoryCell; preview?: boolean }) {
  const detail = cell.record.schemaDetail;
  if (detail === null || detail === undefined || detail === '') return <NoPayload>{T.schemaUnavailable}</NoPayload>;
  const schema = parseContainer(detail);
  if (isObject(schema) && typeof schema.name === 'string' && typeof schema.description === 'string') {
    const parameters = schema.parameters ?? schema.inputSchema;
    if (isObject(parameters)) {
      return (
        <div className={preview ? 'tj-schema tj-schemaPreview' : 'tj-schema'}>
          <header className="tj-schemaIntro">
            <h3 className="tj-schemaName">{schema.name}</h3>
            <p className="tj-schemaDescription">{schema.description}</p>
          </header>
          <section className="tj-schemaParameters">
            <h4 className="tj-schemaParametersTitle">{T.parameters}</h4>
            <JsonTree data={parameters} label={namedParametersJson(schema.name)} collapsedStringLines={preview ? 3 : 12} className="tj-schemaTree" />
          </section>
        </div>
      );
    }
  }
  if (schema !== undefined) return <JsonPayload data={schema} label={T.parameters} preview={preview} />;
  return <RawFragment text={valueText(detail) ?? ''} preview={preview} />;
}
