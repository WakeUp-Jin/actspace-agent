import type { ReactNode } from "react";

type Block =
  | { type: "heading"; depth: 1 | 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; language?: string; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "hr" };

type InlineToken =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "link"; text: string; href: string };

const ORDERED_LIST_RE = /^\d+[.)]\s+/;
const UNORDERED_LIST_RE = /^[-*+]\s+/;

export function MarkdownProse({ content }: { content: string }) {
  const blocks = parseBlocks(content);

  return (
    <div className="markdown-prose">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const HeadingTag = `h${block.depth}` as const;
      return <HeadingTag key={index}>{renderInline(block.text)}</HeadingTag>;
    }
    case "paragraph":
      return <p key={index}>{renderInline(block.text)}</p>;
    case "blockquote":
      return <blockquote key={index}>{renderInline(block.text)}</blockquote>;
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ListTag>
      );
    }
    case "code":
      return (
        <pre className="markdown-code-block" key={index}>
          <code>{block.code}</code>
        </pre>
      );
    case "table":
      return (
        <div className="markdown-table-wrap" key={index}>
          <table>
            <thead>
              <tr>
                {block.headers.map((header, headerIndex) => (
                  <th key={`${index}-h-${headerIndex}`}>{renderInline(header)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${index}-r-${rowIndex}`}>
                  {block.headers.map((_, cellIndex) => (
                    <td key={`${index}-r-${rowIndex}-${cellIndex}`}>
                      {renderInline(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={index} />;
  }
}

function parseBlocks(markdown: string): Block[] {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      index += index < lines.length ? 1 : 0;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        depth: heading[1].length as 1 | 2 | 3 | 4,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    const table = parseTable(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    if (ORDERED_LIST_RE.test(trimmed) || UNORDERED_LIST_RE.test(trimmed)) {
      const ordered = ORDERED_LIST_RE.test(trimmed);
      const items: string[] = [];
      const markerRe = ordered ? ORDERED_LIST_RE : UNORDERED_LIST_RE;

      while (index < lines.length && markerRe.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(markerRe, "").trim());
        index += 1;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && shouldJoinParagraph(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function shouldJoinParagraph(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("```")) return false;
  if (/^(#{1,4})\s+/.test(trimmed)) return false;
  if (/^[-*_]{3,}$/.test(trimmed)) return false;
  if (trimmed.startsWith(">")) return false;
  if (ORDERED_LIST_RE.test(trimmed) || UNORDERED_LIST_RE.test(trimmed)) return false;
  return true;
}

function parseTable(lines: string[], startIndex: number): { block: Block; nextIndex: number } | null {
  const headerLine = lines[startIndex]?.trim();
  const separatorLine = lines[startIndex + 1]?.trim();
  if (!isTableRow(headerLine) || !isTableSeparator(separatorLine)) return null;

  const headers = splitTableRow(headerLine);
  const rows: string[][] = [];
  let index = startIndex + 2;

  while (index < lines.length && isTableRow(lines[index].trim())) {
    rows.push(splitTableRow(lines[index].trim()));
    index += 1;
  }

  return { block: { type: "table", headers, rows }, nextIndex: index };
}

function isTableRow(line?: string): line is string {
  return Boolean(line && line.includes("|"));
}

function isTableSeparator(line?: string): boolean {
  if (!line || !line.includes("|")) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(text: string): ReactNode[] {
  return parseInline(text).map((token, index) => {
    switch (token.type) {
      case "code":
        return <code key={index}>{token.text}</code>;
      case "strong":
        return <strong key={index}>{renderInline(token.text)}</strong>;
      case "em":
        return <em key={index}>{renderInline(token.text)}</em>;
      case "link":
        return (
          <a key={index} href={token.href} target="_blank" rel="noreferrer">
            {renderInline(token.text)}
          </a>
        );
      case "text":
        return token.text;
    }
  });
}

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ type: "text", text: text.slice(cursor, match.index) });
    }

    const value = match[0];
    if (value.startsWith("`")) {
      tokens.push({ type: "code", text: value.slice(1, -1) });
    } else if (value.startsWith("**") || value.startsWith("__")) {
      tokens.push({ type: "strong", text: value.slice(2, -2) });
    } else if (value.startsWith("*") || value.startsWith("_")) {
      tokens.push({ type: "em", text: value.slice(1, -1) });
    } else {
      const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        tokens.push({ type: "link", text: link[1], href: sanitizeHref(link[2]) });
      }
    }

    cursor = match.index + value.length;
  }

  if (cursor < text.length) {
    tokens.push({ type: "text", text: text.slice(cursor) });
  }

  return tokens;
}

function sanitizeHref(href: string): string {
  const trimmed = href.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return "#";
}
