// JsonTree 的纯函数：条目遍历、路径格式化、复制文本。不依赖 React。

export type JsonPath = readonly (number | string)[];
export type CopyMode = "json" | "path" | "prettyJson" | "value";

export const OBJECT_PREVIEW_LIMIT = 4;
export const ARRAY_PREVIEW_LIMIT = 5;
export const PREVIEW_DEPTH_LIMIT = 2;

export function isExpandableValue(value: unknown): value is object {
  return typeof value === "object" && value !== null && !(value instanceof Date);
}

export function entriesOf(value: object): readonly (readonly [string, unknown])[] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item] as const);
  return Object.keys(value).map((key) => [key, (value as Record<string, unknown>)[key]] as const);
}

export function bracketOf(value: object): readonly [string, string] {
  return Array.isArray(value) ? ["[", "]"] : ["{", "}"];
}

export function fieldText(field: string): string {
  return field === "" ? '""' : field;
}

export function pathId(path: JsonPath): string {
  return path.map((part) => (typeof part === "number" ? `n${part}` : `s${part.length}:${part}`)).join("/");
}

export function formattedPath(path: JsonPath): string {
  return path.reduce<string>((result, part) => {
    if (typeof part === "number") return `${result}[${part}]`;
    return /^[A-Za-z_$][\w$]*$/.test(part) ? `${result}.${part}` : `${result}[${JSON.stringify(part)}]`;
  }, "$");
}

export function copyText(path: JsonPath, value: unknown, mode: CopyMode): string {
  if (mode === "path") return formattedPath(path);
  if (mode === "prettyJson") return JSON.stringify(value, null, 2) ?? String(value);
  if (mode === "json") return JSON.stringify(value) ?? String(value);
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? "Symbol";
  if (typeof value === "function") return value.name || "Function";
  if (typeof value === "undefined") return "undefined";
  return JSON.stringify(value);
}
