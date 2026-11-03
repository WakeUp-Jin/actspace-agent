import { EditorView, WidgetType } from "@codemirror/view";

export type FrontmatterEntry = readonly [key: string, value: string];

const TOP_LEVEL_KEY = /^([^\s#:][^:]*?):(?:[ \t]+(.*)|[ \t]*)$/;

/**
 * 把 frontmatter 的 YAML 按顶层键拆成条目。不做完整 YAML 解析：
 * 单行简单值去掉一层引号；数组、对象、多行等复杂值按原文显示（保留缩进）。
 * 注释行忽略；缩进行和 `- ` 开头的行归到上一个键的值里。
 */
export function parseFrontmatter(source: string): FrontmatterEntry[] {
  const lines = source.split(/\r?\n/);
  if (/^---[ \t]*$/.test(lines[0] ?? "")) lines.shift();
  if (/^(?:---|\.\.\.)[ \t]*$/.test(lines[lines.length - 1] ?? "")) lines.pop();
  const entries: { key: string; parts: string[] }[] = [];
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = !/^\s/.test(line) ? TOP_LEVEL_KEY.exec(line) : null;
    if (match) entries.push({ key: match[1].trim(), parts: [(match[2] ?? "").trimEnd()] });
    else if (entries.length) entries[entries.length - 1].parts.push(line.trimEnd());
  }
  return entries.map(({ key, parts }) => {
    const simple = parts.length === 1;
    const value = simple ? parts[0].replace(/^(["'])(.*)\1$/, "$2") : parts.filter((part, i) => i > 0 || part).join("\n");
    return [key, value] as const;
  });
}

/** 文件头属性卡片（D7）：键淡色，值正文色；点一下把光标放进去，露出 YAML 源码，离开后变回卡片。 */
export class FrontmatterWidget extends WidgetType {
  private readonly key: string;

  constructor(readonly entries: readonly FrontmatterEntry[]) {
    super();
    this.key = JSON.stringify(entries);
  }

  eq(other: FrontmatterWidget): boolean {
    return other.key === this.key;
  }

  toDOM(view: EditorView): HTMLElement {
    const card = document.createElement("div");
    card.className = "md-fm-card";
    const title = document.createElement("div");
    title.className = "md-fm-title";
    title.textContent = "属性";
    card.append(title);
    for (const [key, value] of this.entries) {
      const k = document.createElement("div");
      k.className = "md-fm-key";
      k.textContent = key;
      const v = document.createElement("div");
      v.className = "md-fm-val";
      v.textContent = value;
      card.append(k, v);
    }
    card.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const doc = view.state.doc;
      view.dispatch({ selection: { anchor: Math.min(doc.line(1).to + 1, doc.length) }, scrollIntoView: true });
      view.focus();
    });
    return card;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
