import { useMemo, useState } from "react";
import { CodeRenderView } from "./CodeRenderView";

/**
 * CSV / TSV 表格预览。
 *
 * 设计规范早就声明了 `CSV` Tab 类型和「渲染为表格视图」，但一直没实现，
 * 打开 csv 只会看到一坨逗号分隔的纯文本。
 *
 * 解析走自己的小状态机而不是 `split(",")`：字段里的逗号、引号包裹和 `""` 转义都必须处理对，
 * 否则错位的表格比纯文本更误导人。列数不一致或解析不出多列时主动降级为纯文本视图。
 */

const ROOT_CLASS = "flex min-h-0 flex-1 flex-col";
const TOOLBAR_CLASS = "flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5";
const TOOLBAR_HINT_CLASS = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-text-faint";
const TOGGLE_CLASS =
  "shrink-0 rounded-act-sm border border-line bg-surface-subtle px-2 py-0.5 text-[11px] text-text-muted hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const SCROLL_CLASS = "min-h-0 flex-1 overflow-auto";
const TABLE_CLASS = "w-max min-w-full border-collapse text-[12px] leading-[1.5]";
const HEAD_CELL_CLASS =
  "sticky top-0 z-[1] border-b border-r border-line bg-surface-subtle px-2 py-1 text-left font-semibold text-text-main";
const ROW_NUMBER_CLASS =
  "select-none border-b border-r border-line bg-surface-subtle px-2 py-1 text-right font-mono text-text-faint [font-variant-numeric:tabular-nums]";
const CELL_CLASS = "border-b border-r border-line px-2 py-1 align-top text-text-muted [overflow-wrap:anywhere]";

/** 超过这个行数只渲染前 N 行：几万行 <td> 会把面板拖垮，而表格预览的价值在于看结构。 */
const MAX_RENDERED_ROWS = 2000;

export function CsvRenderView({ content, relativePath }: { content: string; relativePath?: string }) {
  const delimiter = relativePath?.toLowerCase().endsWith(".tsv") ? "\t" : ",";
  const rows = useMemo(() => parseDelimited(content, delimiter), [content, delimiter]);
  const [asText, setAsText] = useState(false);

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  // 单列表格没有表格化的意义，直接当文本看更清楚。
  const renderable = rows.length > 0 && columnCount > 1;

  if (asText || !renderable) {
    return (
      <div className={ROOT_CLASS}>
        <div className={TOOLBAR_CLASS}>
          <span className={TOOLBAR_HINT_CLASS}>
            {renderable ? "纯文本视图" : "无法解析为多列表格，已按纯文本显示。"}
          </span>
          {renderable ? (
            <button type="button" className={TOGGLE_CLASS} onClick={() => setAsText(false)}>
              以表格查看
            </button>
          ) : null}
        </div>
        <CodeRenderView content={content} />
      </div>
    );
  }

  const [header, ...bodyRows] = rows;
  const visibleRows = bodyRows.slice(0, MAX_RENDERED_ROWS);
  const hiddenCount = bodyRows.length - visibleRows.length;

  return (
    <div className={ROOT_CLASS}>
      <div className={TOOLBAR_CLASS}>
        <span className={TOOLBAR_HINT_CLASS}>
          {`${bodyRows.length} 行 · ${columnCount} 列`}
          {hiddenCount > 0 ? ` · 仅显示前 ${MAX_RENDERED_ROWS} 行` : ""}
        </span>
        <button type="button" className={TOGGLE_CLASS} onClick={() => setAsText(true)}>
          以纯文本查看
        </button>
      </div>
      <div className={SCROLL_CLASS}>
        <table className={TABLE_CLASS}>
          <thead>
            <tr>
              <th scope="col" className={`${HEAD_CELL_CLASS} text-right`} aria-label="行号">
                #
              </th>
              {Array.from({ length: columnCount }, (_, index) => (
                <th key={index} scope="col" className={HEAD_CELL_CLASS}>
                  {header[index] ?? ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className={ROW_NUMBER_CLASS}>{rowIndex + 1}</td>
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td key={columnIndex} className={CELL_CLASS}>
                    {row[columnIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 解析分隔符文本。
 * 支持引号包裹、字段内的分隔符与换行、`""` 表示一个字面引号；识别 CRLF。
 * 末尾的空行会被丢掉（文件通常以换行结尾，不该多出一行空记录）。
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      endRow();
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    endRow();
  }
  return rows;
}
