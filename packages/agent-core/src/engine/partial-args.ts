/**
 * Partial JSON 字段提取
 *
 * 用途：LLM 流式输出 tool_call args 时，按字符累积出 partial JSON 字符串。
 * 此模块从该字符串中提取指定 string 字段的当前值，配合 streaming-preview-extractors
 * 把 partial args 转换为 typed ToolUiPreview，再由 bridge 推给前端。
 *
 * 设计要点：
 * - 不依赖第三方 partial-json 解析器
 * - 状态机扫描 `"<fieldName>"\s*:\s*"...` 的 string 值
 * - 正确处理 JSON escape：\", \\, \n, \t, \r, \b, \f, \/, \uXXXX
 * - 字段未闭合（stream 仍在累积）时返回 closed=false + 已累积的部分
 * - 字段闭合时返回 closed=true + 完整 unescape 值
 */

const HEX = /^[0-9a-fA-F]{4}$/;

const ESCAPE_MAP: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

export interface ExtractStringFieldResult {
  value: string;
  closed: boolean;
}

/**
 * 从 partial JSON 字符串中提取指定 string 字段的值。
 *
 * @returns null 表示字段未找到；否则返回 {value, closed}
 */
export function extractStringField(
  partialJson: string,
  fieldName: string,
): ExtractStringFieldResult | null {
  const keyPattern = `"${fieldName}"`;
  let searchFrom = 0;

  while (searchFrom <= partialJson.length - keyPattern.length) {
    const keyIdx = partialJson.indexOf(keyPattern, searchFrom);
    if (keyIdx < 0) return null;

    let i = keyIdx + keyPattern.length;
    while (i < partialJson.length && isWhitespace(partialJson[i])) i++;

    if (partialJson[i] !== ":") {
      searchFrom = keyIdx + keyPattern.length;
      continue;
    }
    i++;
    while (i < partialJson.length && isWhitespace(partialJson[i])) i++;

    if (partialJson[i] !== '"') {
      searchFrom = keyIdx + keyPattern.length;
      continue;
    }
    i++;

    return readStringFrom(partialJson, i);
  }

  return null;
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function readStringFrom(source: string, start: number): ExtractStringFieldResult {
  let out = "";
  let i = start;

  while (i < source.length) {
    const ch = source[i];

    if (ch === '"') {
      return { value: out, closed: true };
    }

    if (ch === "\\") {
      if (i + 1 >= source.length) {
        return { value: out, closed: false };
      }
      const next = source[i + 1];

      if (next === "u") {
        const hex = source.slice(i + 2, i + 6);
        if (hex.length < 4) {
          return { value: out, closed: false };
        }
        if (!HEX.test(hex)) {
          out += "\\u";
          i += 2;
          continue;
        }
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }

      const mapped = ESCAPE_MAP[next];
      if (mapped !== undefined) {
        out += mapped;
        i += 2;
        continue;
      }

      out += next;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  return { value: out, closed: false };
}
