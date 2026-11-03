// MD 渲染 demo：一个 CodeMirror 6 实例，预览 = Lezer 语法树 + decorations/widgets，源码 = 关掉装饰。
// 规则参考 Codex App 的 text-file-editor-extensions（cm-markdown-* 装饰），每个分歧点都做成可切换的变体。
import { EditorState, Compartment, StateField, StateEffect } from "@codemirror/state";
import { EditorView, Decoration, WidgetType, ViewPlugin, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
import { syntaxTree, syntaxHighlighting, HighlightStyle, LanguageDescription, ensureSyntaxTree } from "@codemirror/language";
import { tags as t, Tag } from "@lezer/highlight";
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";

/* ---------------- 数学公式语法扩展（$...$ 与 $$ 块） ---------------- */
const mathTag = Tag.define();
const MathExtension = {
  defineNodes: [
    { name: "MathBlock", block: true, style: mathTag },
    { name: "MathInline", style: mathTag },
  ],
  parseBlock: [{
    name: "MathBlock",
    before: "FencedCode",
    parse(cx, line) {
      if (!/^\$\$\s*$/.test(line.text.slice(line.pos))) return false;
      const start = cx.lineStart + line.pos;
      let end = cx.lineStart + line.text.length;
      while (cx.nextLine()) {
        end = cx.lineStart + line.text.length;
        if (/^\s*\$\$\s*$/.test(line.text)) { cx.nextLine(); break; }
      }
      cx.addElement(cx.elt("MathBlock", start, end));
      return true;
    },
  }],
  parseInline: [{
    name: "MathInline",
    before: "Escape",
    parse(cx, next, pos) {
      if (next !== 36 || cx.char(pos + 1) === 36 || cx.char(pos + 1) === 32) return -1;
      for (let i = pos + 1; i < cx.end; i++) {
        const c = cx.char(i);
        if (c === 92) { i++; continue; }
        if (c === 36) {
          if (i === pos + 1 || cx.char(i - 1) === 32) return -1;
          return cx.addElement(cx.elt("MathInline", pos, i + 1));
        }
      }
      return -1;
    },
  }],
};

/* ---------------- 配置 / 焦点状态 ---------------- */
export const DEFAULT_CONFIG = {
  reveal: "node", bullet: "dot", task: "checkbox", table: "inline", code: "reveal",
  link: "mod", frontmatter: "card", mermaid: "live", math: "katex", remoteImg: "local",
  lineNumbers: true, theme: "light", paths: "chip",
};
const setConfigEffect = StateEffect.define();
const configField = StateField.define({
  create: () => DEFAULT_CONFIG,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setConfigEffect)) value = e.value;
    return value;
  },
});
const setFocusEffect = StateEffect.define();
const focusField = StateField.define({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFocusEffect)) value = e.value;
    return value;
  },
});
const focusTracker = EditorView.focusChangeEffect.of((_state, focusing) => setFocusEffect.of(focusing));

let toast = () => {};

/* ---------------- 工具函数 ---------------- */
function touches(state, from, to) {
  return state.selection.ranges.some((r) => (r.empty ? r.from >= from && r.from <= to : r.from < to && r.to > from));
}
function linesTouched(state, from, to) {
  const a = state.doc.lineAt(from).number;
  const b = state.doc.lineAt(to).number;
  return state.selection.ranges.some((r) => state.doc.lineAt(r.from).number <= b && state.doc.lineAt(r.to).number >= a);
}
/** D1：标记是否露出。node = 光标落在该语法节点内（Codex）；line = 光标所在行。没焦点时一律隐藏。 */
function revealed(state, from, to) {
  if (!state.field(focusField)) return false;
  return state.field(configField).reveal === "line" ? linesTouched(state, from, to) : touches(state, from, to);
}
function blockRevealed(state, from, to) {
  return state.field(focusField) && touches(state, from, to);
}
function frontmatter(state) {
  const doc = state.doc;
  if (doc.lines < 3 || doc.line(1).text !== "---") return null;
  for (let i = 2; i <= Math.min(doc.lines, 200); i++) {
    const line = doc.line(i);
    if (line.text === "---" || line.text === "...") {
      const entries = [];
      for (let j = 2; j < i; j++) {
        const m = /^([\w-]+):\s*(.*)$/.exec(doc.line(j).text);
        if (m) entries.push([m[1], m[2]]);
      }
      return { from: 0, to: line.to, entries };
    }
  }
  return null;
}
function fenceInfo(state, node) {
  const info = node.getChild("CodeInfo");
  return info ? state.sliceDoc(info.from, info.to).split(/\s+/, 1)[0] : "";
}
function fenceCode(state, node) {
  return node.getChildren("CodeText").map((c) => state.sliceDoc(c.from, c.to)).join("");
}
/** 看起来像工作区文件路径：含 / 的相对路径，或带常见扩展名的文件名；可带 :行号。 */
const PATH_RE = /^(?:\.{1,2}\/)?(?:[\w@\u4e00-\u9fa5.-]+\/)*[\w@\u4e00-\u9fa5-][\w@\u4e00-\u9fa5.-]*\.[A-Za-z][\w]{0,7}(?::\d+(?:-\d+)?)?$/;
const TEXT_PATH_RE = /(?:\.{1,2}\/)?(?:[\w@-]+\/)+[\w@\u4e00-\u9fa5.-]*\.[A-Za-z]\w{0,7}(?::\d+(?:-\d+)?)?/g;
function isPathLike(text) {
  return !/\s/.test(text) && !/^[a-z]+:\/\//i.test(text) && PATH_RE.test(text);
}
function isLocalHref(href) {
  return !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href);
}
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function miniInline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
function placeCursor(view, pos) {
  view.dispatch({ selection: { anchor: Math.min(pos, view.state.doc.length) } });
  view.focus();
}

/* ---------------- 外部渲染器（按需加载） ---------------- */
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
const KATEX_JS = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs";
const MERMAID_JS = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
let katexPromise;
function loadKatex() {
  if (!katexPromise) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = KATEX_CSS;
    document.head.appendChild(link);
    const url = KATEX_JS;
    katexPromise = import(url).then((m) => m.default);
  }
  return katexPromise;
}
let mermaidPromise;
let mermaidQueue = Promise.resolve();
let mermaidTheme = null;
let mermaidSeq = 0;
function renderMermaid(code, theme) {
  const job = mermaidQueue.then(async () => {
    if (!mermaidPromise) { const url = MERMAID_JS; mermaidPromise = import(url).then((m) => m.default); }
    const mermaid = await mermaidPromise;
    if (mermaidTheme !== theme) {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: theme === "dark" ? "dark" : "neutral" });
      mermaidTheme = theme;
    }
    const { svg } = await mermaid.render(`md-mermaid-${++mermaidSeq}`, code);
    return svg;
  });
  mermaidQueue = job.catch(() => {});
  return job;
}

/* ---------------- Widgets ---------------- */
const CHECK_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

class BulletWidget extends WidgetType {
  constructor(depth) { super(); this.depth = depth; }
  eq(o) { return o.depth === this.depth; }
  toDOM() {
    const el = document.createElement("span");
    el.className = `md-bullet md-bullet-${Math.min(this.depth, 3)}`;
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  ignoreEvent() { return false; }
}

const CALLOUT_LABEL = { note: "说明", tip: "提示", important: "重要", warning: "注意", caution: "警告" };
class CalloutLabelWidget extends WidgetType {
  constructor(type) { super(); this.type = type; }
  eq(o) { return o.type === this.type; }
  toDOM() {
    const el = document.createElement("span");
    el.className = "md-callout-label";
    el.textContent = CALLOUT_LABEL[this.type];
    return el;
  }
  ignoreEvent() { return false; }
}

const FILE_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 1.75h5.2L12.5 5v9.25H4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 1.9V5.2h3.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
class FileIconWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const el = document.createElement("span");
    el.className = "md-path-icon";
    el.innerHTML = FILE_SVG;
    return el;
  }
  ignoreEvent() { return false; }
}
const fileIcon = Decoration.widget({ widget: new FileIconWidget(), side: 1 });

class CheckboxWidget extends WidgetType {
  constructor(checked) { super(); this.checked = checked; }
  eq(o) { return o.checked === this.checked; }
  toDOM(view) {
    const box = document.createElement("span");
    box.className = "md-checkbox" + (this.checked ? " is-checked" : "");
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.innerHTML = this.checked ? CHECK_SVG : "";
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      if (!/^\[[ xX]\]$/.test(view.state.sliceDoc(pos, pos + 3))) return;
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.checked ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() { return true; }
}

class ImageWidget extends WidgetType {
  constructor(src, alt) { super(); this.src = src; this.alt = alt; }
  eq(o) { return o.src === this.src && o.alt === this.alt; }
  toDOM(view) {
    const wrap = document.createElement("span");
    wrap.className = "md-img";
    const img = document.createElement("img");
    img.alt = this.alt;
    img.src = this.src;
    img.onload = () => view.requestMeasure();
    img.onerror = () => { wrap.classList.add("is-broken"); wrap.textContent = `图片加载失败：${this.alt || this.src}`; };
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() { return false; }
}

class CodeHeaderWidget extends WidgetType {
  constructor(lang, code) { super(); this.lang = lang; this.code = code; }
  eq(o) { return o.lang === this.lang && o.code === this.code; }
  toDOM(view) {
    const head = document.createElement("span");
    head.className = "md-code-head";
    const lang = document.createElement("span");
    lang.className = "md-code-lang";
    lang.textContent = this.lang || "text";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "md-code-copy";
    copy.textContent = "复制";
    copy.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    copy.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(this.code).catch(() => {});
      copy.textContent = "已复制";
      setTimeout(() => { copy.textContent = "复制"; }, 1200);
    });
    head.addEventListener("mousedown", (e) => {
      if (e.target === copy) return;
      e.preventDefault();
      const line = view.state.doc.lineAt(view.posAtDOM(head));
      placeCursor(view, line.to + 1);
    });
    head.append(lang, copy);
    return head;
  }
  ignoreEvent() { return true; }
}

class MathWidget extends WidgetType {
  constructor(tex, display) { super(); this.tex = tex; this.display = display; }
  eq(o) { return o.tex === this.tex && o.display === this.display; }
  toDOM(view) {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "md-math-block" : "md-math-inline";
    el.textContent = this.tex;
    loadKatex()
      .then((katex) => {
        el.innerHTML = katex.renderToString(this.tex, { displayMode: this.display, throwOnError: false, strict: "ignore" });
        view.requestMeasure();
      })
      .catch(() => el.classList.add("is-error"));
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(el);
      placeCursor(view, this.display ? view.state.doc.lineAt(pos).to + 1 : pos + 1);
    });
    return el;
  }
  ignoreEvent() { return true; }
}

class MermaidWidget extends WidgetType {
  constructor(code, theme, mode) { super(); this.code = code; this.theme = theme; this.mode = mode; }
  eq(o) { return o.code === this.code && o.theme === this.theme && o.mode === this.mode; }
  render(el, view) {
    const token = (el.__token = (el.__token || 0) + 1);
    clearTimeout(el.__timer);
    el.__timer = setTimeout(() => {
      renderMermaid(this.code, this.theme)
        .then((svg) => {
          if (token !== el.__token) return;
          el.innerHTML = svg;
          el.classList.remove("has-error");
          view.requestMeasure();
        })
        .catch((err) => {
          if (token !== el.__token) return;
          el.classList.add("has-error");
          let status = el.querySelector(".md-mermaid-status");
          if (!status) { status = document.createElement("div"); status.className = "md-mermaid-status"; el.prepend(status); }
          status.textContent = `Mermaid 语法错误：${String(err?.message || err).split("\n")[0]}`;
          view.requestMeasure();
        });
    }, this.mode === "below" ? 220 : 0);
  }
  toDOM(view) {
    const el = document.createElement("div");
    el.className = `md-mermaid md-mermaid-${this.mode}`;
    el.innerHTML = '<div class="md-mermaid-status">渲染中…</div>';
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (this.mode !== "replace") return;
      if (view.state.field(configField).mermaid === "always") {
        toast("Codex 做法：图在预览里不能改，要切到源码编辑");
        return;
      }
      const line = view.state.doc.lineAt(view.posAtDOM(el));
      placeCursor(view, line.to + 1);
    });
    this.render(el, view);
    return el;
  }
  updateDOM(el, view) {
    if (!el.classList.contains(`md-mermaid-${this.mode}`)) return false;
    this.render(el, view);
    return true;
  }
  ignoreEvent() { return true; }
}

class TableWidget extends WidgetType {
  constructor(rows) { super(); this.rows = rows; this.key = JSON.stringify(rows); }
  eq(o) { return o.key === this.key; }
  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "md-table-widget";
    const [head, ...body] = this.rows;
    wrap.innerHTML = `<table><thead><tr>${head.map((c) => `<th>${miniInline(c)}</th>`).join("")}</tr></thead><tbody>${body
      .map((r) => `<tr>${head.map((_, i) => `<td>${miniInline(r[i] ?? "")}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
    wrap.addEventListener("mousedown", (e) => {
      e.preventDefault();
      placeCursor(view, view.posAtDOM(wrap) + 2);
    });
    return wrap;
  }
  ignoreEvent() { return true; }
}

class FrontmatterWidget extends WidgetType {
  constructor(entries) { super(); this.entries = entries; this.key = JSON.stringify(entries); }
  eq(o) { return o.key === this.key; }
  toDOM(view) {
    const card = document.createElement("div");
    card.className = "md-fm-card";
    card.innerHTML = `<div class="md-fm-title">属性</div>${this.entries
      .map(([k, v]) => `<div class="md-fm-key">${escapeHtml(k)}</div><div class="md-fm-val">${escapeHtml(v)}</div>`)
      .join("")}`;
    card.addEventListener("mousedown", (e) => {
      e.preventDefault();
      placeCursor(view, 4);
    });
    return card;
  }
  ignoreEvent() { return true; }
}

/* ---------------- 块级装饰（必须来自 StateField） ---------------- */
function tableRows(state, node) {
  const rows = [];
  const first = state.doc.lineAt(node.from).number;
  const last = state.doc.lineAt(node.to).number;
  for (let n = first; n <= last; n++) {
    if (n === first + 1) continue;
    const text = state.doc.line(n).text.trim().replace(/^\|/, "").replace(/\|$/, "");
    rows.push(text.split("|").map((c) => c.trim()));
  }
  return rows;
}

function buildBlocks(state) {
  const cfg = state.field(configField);
  const out = [];
  const fm = frontmatter(state);
  if (fm) {
    if (cfg.frontmatter === "hide") out.push(Decoration.replace({ block: true }).range(fm.from, fm.to));
    else if (cfg.frontmatter === "card" && !blockRevealed(state, fm.from, fm.to))
      out.push(Decoration.replace({ block: true, widget: new FrontmatterWidget(fm.entries) }).range(fm.from, fm.to));
  }
  syntaxTree(state).iterate({
    enter(n) {
      if (fm && n.name !== "Document" && n.from < fm.to) return false;
      if (n.name === "FencedCode") {
        if (fenceInfo(state, n.node) !== "mermaid" || n.node.getChildren("CodeMark").length !== 2) return false;
        const from = state.doc.lineAt(n.from).from;
        const to = state.doc.lineAt(n.to).to;
        const code = fenceCode(state, n.node);
        if (cfg.mermaid === "always" || !blockRevealed(state, from, to))
          out.push(Decoration.replace({ block: true, widget: new MermaidWidget(code, cfg.theme, "replace") }).range(from, to));
        else out.push(Decoration.widget({ block: true, side: 1, widget: new MermaidWidget(code, cfg.theme, "below") }).range(to));
        return false;
      }
      if (n.name === "Table") {
        if (cfg.table !== "widget") return false;
        const from = state.doc.lineAt(n.from).from;
        const to = state.doc.lineAt(n.to).to;
        if (!blockRevealed(state, from, to))
          out.push(Decoration.replace({ block: true, widget: new TableWidget(tableRows(state, n.node)) }).range(from, to));
        return false;
      }
      if (n.name === "MathBlock") {
        if (cfg.math !== "katex") return false;
        const text = state.sliceDoc(n.from, n.to);
        if (!/\n\s*\$\$\s*$/.test(text)) return false;
        if (!blockRevealed(state, n.from, n.to)) {
          const tex = text.replace(/^\$\$\s*\n/, "").replace(/\n\s*\$\$\s*$/, "");
          out.push(Decoration.replace({ block: true, widget: new MathWidget(tex, true) }).range(n.from, n.to));
        }
        return false;
      }
      return undefined;
    },
  });
  return Decoration.set(out, true);
}

const blockField = StateField.define({
  create: buildBlocks,
  update(value, tr) {
    if (tr.docChanged || tr.selection || tr.effects.length || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return buildBlocks(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/* ---------------- 行内 / 行装饰（ViewPlugin，只算可见区域） ---------------- */
const lineDeco = (cls, attributes) => Decoration.line({ class: cls, attributes });
const hide = Decoration.replace({});

function buildInline(view) {
  const { state } = view;
  const cfg = state.field(configField);
  const focused = state.field(focusField);
  const doc = state.doc;
  const out = [];
  const done = new Set();
  const fm = frontmatter(state);

  if (fm && (cfg.frontmatter === "raw" || (cfg.frontmatter === "card" && blockRevealed(state, fm.from, fm.to)))) {
    for (let n = 1; n <= doc.lineAt(fm.to).number; n++) out.push(lineDeco("md-fm-raw").range(doc.line(n).from));
  }
  const eachLine = (from, to, fn) => {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) fn(doc.line(n));
  };

  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter(n) {
        const name = n.name;
        if (name === "Document") return undefined;
        if (fm && n.from < fm.to) return false;
        const node = n.node;
        const parent = node.parent;

        if (/^ATXHeading[1-6]$/.test(name)) {
          const level = Math.min(Number(name.slice(-1)), 4);
          out.push(lineDeco(`md-h md-h${level}`).range(doc.lineAt(n.from).from));
          return undefined;
        }
        if (/^SetextHeading[12]$/.test(name)) {
          const level = Number(name.slice(-1));
          const lastLine = doc.lineAt(n.to);
          eachLine(n.from, n.to, (line) => {
            if (line.number === lastLine.number) {
              if (!revealed(state, line.from, line.to)) out.push(lineDeco("md-setext-mark").range(line.from), hide.range(line.from, line.to));
            } else out.push(lineDeco(`md-h md-h${level}`).range(line.from));
          });
          return false;
        }
        if (name === "HeaderMark") {
          if (!parent || !/^ATXHeading/.test(parent.name) || n.from !== parent.from) return false;
          const end = state.sliceDoc(n.to, n.to + 1) === " " ? n.to + 1 : n.to;
          if (!revealed(state, n.from, end)) out.push(hide.range(n.from, end));
          return false;
        }
        if (name === "EmphasisMark" || name === "StrikethroughMark" || (name === "CodeMark" && parent?.name === "InlineCode")) {
          if (parent && !revealed(state, parent.from, parent.to)) out.push(hide.range(n.from, n.to));
          return false;
        }
        if (name === "InlineCode") {
          const marks = node.getChildren("CodeMark");
          const inner = marks.length === 2 ? state.sliceDoc(marks[0].to, marks[1].from) : "";
          if (cfg.paths !== "codex" && isPathLike(inner)) {
            out.push(Decoration.mark({ class: "md-path", attributes: { "data-path": inner, title: `${cfg.link === "click" ? "单击" : "⌘ + 单击"}在 ActSpace 中打开` } }).range(n.from, n.to));
            out.push(fileIcon.range(marks[0].to));
          } else out.push(Decoration.mark({ class: "md-inline-code" }).range(n.from, n.to));
          return undefined;
        }
        if (name === "Link") {
          const marks = node.getChildren("LinkMark");
          const url = node.getChild("URL");
          if (!url || marks.length < 2 || state.sliceDoc(n.from, n.to).includes("\n")) return undefined;
          const textFrom = marks[0].to;
          const textTo = marks[1].from;
          const href = state.sliceDoc(url.from, url.to);
          const local = isLocalHref(href);
          if (textTo > textFrom) out.push(Decoration.mark({ class: local ? "md-link md-link-file" : "md-link", attributes: { title: href } }).range(textFrom, textTo));
          if (local && textTo > textFrom) out.push(fileIcon.range(textFrom));
          if (!revealed(state, n.from, n.to)) {
            out.push(hide.range(n.from, textFrom));
            out.push(hide.range(textTo, n.to));
          }
          return undefined;
        }
        if (name === "URL" && !["Link", "Image", "Autolink", "LinkReference"].includes(node.parent?.name)) {
          out.push(Decoration.mark({ class: "md-link" }).range(n.from, n.to));
          return false;
        }
        if (name === "Autolink") {
          const url = node.getChild("URL");
          if (url) out.push(Decoration.mark({ class: "md-link" }).range(url.from, url.to));
          if (url && !revealed(state, n.from, n.to)) out.push(hide.range(n.from, url.from), hide.range(url.to, n.to));
          return false;
        }
        if (name === "Image") {
          const url = node.getChild("URL");
          const marks = node.getChildren("LinkMark");
          if (!url || marks.length < 2 || state.sliceDoc(n.from, n.to).includes("\n")) return false;
          const src = state.sliceDoc(url.from, url.to);
          const alt = state.sliceDoc(marks[0].to, marks[1].from);
          const remote = /^https?:\/\//i.test(src);
          if (remote && cfg.remoteImg === "local") {
            out.push(Decoration.mark({ class: "md-img-skipped", attributes: { title: "远程图片不加载" } }).range(n.from, n.to));
            return false;
          }
          if (!revealed(state, n.from, n.to)) out.push(Decoration.replace({ widget: new ImageWidget(src, alt) }).range(n.from, n.to));
          return false;
        }
        if (name === "Paragraph" && cfg.paths === "all") {
          const text = state.sliceDoc(n.from, n.to);
          for (const m of text.matchAll(TEXT_PATH_RE)) {
            const from = n.from + m.index;
            const to = from + m[0].length;
            const inner = syntaxTree(state).resolveInner(from, 1);
            if (inner.name !== "Paragraph") continue;
            out.push(Decoration.mark({ class: "md-path md-path-text", attributes: { "data-path": m[0] } }).range(from, to));
            out.push(fileIcon.range(from));
          }
          return undefined;
        }
        if (name === "Blockquote") {
          if (parent?.name === "Blockquote") return undefined;
          // GitHub 提示框：首行只有 > [!NOTE] 这类标记
          const first = state.doc.lineAt(n.from);
          const alert = /^(\s*>\s*)(\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])\s*$/i.exec(first.text);
          const type = alert?.[3].toLowerCase();
          eachLine(n.from, n.to, (line) => out.push(lineDeco(type ? `md-quote md-callout md-callout-${type}` : "md-quote").range(line.from)));
          if (alert) {
            const from = first.from + alert[1].length;
            const to = from + alert[2].length;
            if (!revealed(state, from, to)) out.push(Decoration.replace({ widget: new CalloutLabelWidget(type) }).range(from, to));
          }
          return undefined;
        }
        if (name === "QuoteMark") {
          let depth = 0;
          for (let p = parent; p; p = p.parent) if (p.name === "Blockquote") depth++;
          if (depth > 1) return false;
          const end = /[\t ]/.test(state.sliceDoc(n.to, n.to + 1)) ? n.to + 1 : n.to;
          const show = focused && cfg.reveal === "line" && linesTouched(state, n.from, n.to);
          if (!show) out.push(hide.range(n.from, end));
          return false;
        }
        if (name === "BulletList" || name === "OrderedList") {
          if (parent?.name !== "ListItem") eachLine(n.from, n.to, (line) => out.push(lineDeco("md-li").range(line.from)));
          return undefined;
        }
        if (name === "ListMark") {
          const item = parent;
          const list = item?.parent;
          const task = item?.getChild("Task");
          const marker = task?.getChild("TaskMarker");
          const end = state.sliceDoc(n.to, n.to + 1) === " " ? n.to + 1 : n.to;
          if (task && marker && cfg.task === "checkbox") {
            if (!revealed(state, n.from, marker.to)) out.push(hide.range(n.from, end));
            return false;
          }
          if (list?.name === "BulletList" && cfg.bullet === "dot" && !revealed(state, n.from, n.to)) {
            let depth = 0;
            for (let p = list; p; p = p.parent) if (p.name === "BulletList") depth++;
            out.push(Decoration.replace({ widget: new BulletWidget(depth) }).range(n.from, n.to));
          } else out.push(Decoration.mark({ class: "md-list-mark" }).range(n.from, n.to));
          return false;
        }
        if (name === "TaskMarker") {
          if (cfg.task !== "checkbox") return false;
          const lm = parent?.parent?.getChild("ListMark");
          const checked = /x/i.test(state.sliceDoc(n.from, n.to));
          if (!revealed(state, lm ? lm.from : n.from, n.to)) out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(n.from, n.to));
          if (checked && parent && parent.to > n.to + 1) out.push(Decoration.mark({ class: "md-task-done" }).range(n.to + 1, parent.to));
          return false;
        }
        if (name === "HorizontalRule") {
          const line = doc.lineAt(n.from);
          if (!(focused && linesTouched(state, n.from, n.to))) out.push(lineDeco("md-hr").range(line.from), hide.range(n.from, n.to));
          return false;
        }
        if (name === "Table") {
          if (cfg.table === "widget") {
            if (blockRevealed(state, n.from, n.to)) eachLine(n.from, n.to, (line) => out.push(lineDeco("md-table-src").range(line.from)));
            return false;
          }
          return undefined;
        }
        if (name === "TableHeader" || name === "TableRow") {
          out.push(lineDeco(name === "TableHeader" ? "md-tr md-th" : "md-tr").range(doc.lineAt(n.from).from));
          return undefined;
        }
        if (name === "TableCell") {
          out.push(Decoration.mark({ class: "md-td" }).range(n.from, n.to));
          return undefined;
        }
        if (name === "TableDelimiter") {
          if (parent?.name === "Table") out.push(lineDeco("md-tsep").range(doc.lineAt(n.from).from));
          out.push(hide.range(n.from, n.to));
          return false;
        }
        if (name === "FencedCode") {
          if (done.has(n.from)) return false;
          done.add(n.from);
          const lang = fenceInfo(state, node);
          const first = doc.lineAt(n.from);
          const last = doc.lineAt(n.to);
          const closed = node.getChildren("CodeMark").length === 2 && last.number > first.number;
          if (lang === "mermaid" && closed && !(cfg.mermaid === "live" && blockRevealed(state, first.from, last.to))) return false;
          if (!closed) {
            eachLine(n.from, n.to, (line) => out.push(lineDeco("md-code-line md-code-open").range(line.from)));
            return false;
          }
          const open = cfg.code === "reveal" && blockRevealed(state, first.from, last.to);
          eachLine(n.from, n.to, (line) => {
            const isFirst = line.number === first.number;
            const isLast = line.number === last.number;
            const cls = ["md-code-line", isFirst && "md-code-first", isLast && "md-code-last", open && (isFirst || isLast) && "md-code-fence", cfg.code === "codex" && "md-code-codex"]
              .filter(Boolean)
              .join(" ");
            out.push(lineDeco(cls, isFirst && cfg.code === "codex" ? { "data-language": lang } : undefined).range(line.from));
            if (open || !(isFirst || isLast) || line.to <= line.from) return;
            if (isFirst && cfg.code === "reveal") out.push(Decoration.replace({ widget: new CodeHeaderWidget(lang, fenceCode(state, node)) }).range(line.from, line.to));
            else out.push(hide.range(line.from, line.to));
          });
          return false;
        }
        if (name === "MathInline") {
          if (cfg.math === "katex" && !revealed(state, n.from, n.to))
            out.push(Decoration.replace({ widget: new MathWidget(state.sliceDoc(n.from + 1, n.to - 1), false) }).range(n.from, n.to));
          return false;
        }
        if (name === "MathBlock") {
          eachLine(n.from, n.to, (line) => out.push(lineDeco("md-math-src").range(line.from)));
          return false;
        }
        return undefined;
      },
    });
  }
  return Decoration.set(out, true);
}

const inlinePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = buildInline(view); }
    update(u) {
      const effects = u.transactions.some((tr) => tr.effects.some((e) => e.is(setConfigEffect) || e.is(setFocusEffect)));
      if (u.docChanged || u.selectionSet || u.viewportChanged || effects || syntaxTree(u.startState) !== syntaxTree(u.state))
        this.decorations = buildInline(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

/* ---------------- 链接点击（D6） ---------------- */
function linkAt(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === "URL" && n.parent?.name !== "Image") return state.sliceDoc(n.from, n.to);
    if (n.name === "Link" || n.name === "Autolink") {
      const url = n.getChild("URL");
      return url ? state.sliceDoc(url.from, url.to) : null;
    }
    if (n.name === "Image") return null;
  }
  return null;
}
const linkClicks = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (e.button !== 0 || e.detail > 1) return false;
    // 用 DOM 反查位置：折行 + 隐藏标记时 posAtCoords 会落到下一行
    const el = e.target instanceof Element ? e.target : null;
    const pos = el && view.contentDOM.contains(el) && el !== view.contentDOM ? view.posAtDOM(el, 0) : view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return false;
    const cfg = view.state.field(configField);
    const pathEl = e.target instanceof Element ? e.target.closest("[data-path]") : null;
    const href = linkAt(view.state, pos);
    const target = pathEl ? pathEl.getAttribute("data-path") : href;
    if (!target) return false;
    const mode = cfg.link;
    const open = mode === "click" ? !e.shiftKey && view.state.selection.main.empty : e.metaKey || e.ctrlKey;
    if (!open) return false;
    e.preventDefault();
    toast(pathEl || isLocalHref(target) ? `在 ActSpace 中打开：${target}` : `用浏览器打开：${target}`);
    return true;
  },
});

/* ---------------- 高亮 ---------------- */
const highlight = HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], class: "tok-heading" },
  { tag: t.emphasis, class: "tok-em" },
  { tag: t.strong, class: "tok-strong" },
  { tag: t.strikethrough, class: "tok-strike" },
  { tag: t.link, class: "tok-link" },
  { tag: t.url, class: "tok-url" },
  { tag: t.monospace, class: "tok-mono" },
  { tag: t.quote, class: "tok-quote" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator, t.labelName], class: "tok-meta" },
  { tag: [t.angleBracket, t.tagName, t.attributeName, t.attributeValue, t.documentMeta], class: "tok-html" },
  { tag: mathTag, class: "tok-math" },
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier], class: "tok-kw" },
  { tag: [t.string, t.special(t.string), t.regexp], class: "tok-str" },
  { tag: [t.comment, t.lineComment, t.blockComment], class: "tok-cmt" },
  { tag: [t.number, t.bool, t.null, t.atom], class: "tok-num" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], class: "tok-fn" },
  { tag: [t.typeName, t.className, t.namespace], class: "tok-type" },
  { tag: [t.propertyName, t.attributeName], class: "tok-prop" },
  { tag: [t.operator, t.punctuation, t.bracket], class: "tok-op" },
]);

const codeLanguages = [
  LanguageDescription.of({ name: "typescript", alias: ["ts", "tsx", "js", "jsx", "javascript"], support: javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: "python", alias: ["py"], support: python() }),
  LanguageDescription.of({ name: "json", support: json() }),
  LanguageDescription.of({ name: "css", support: css() }),
];

/* ---------------- 对外 API ---------------- */
export function create(parent, { doc, config, onChange, onSave, onToast }) {
  toast = onToast || (() => {});
  const modeComp = new Compartment();
  const gutterComp = new Compartment();
  const attrComp = new Compartment();
  let cfg = { ...DEFAULT_CONFIG, ...config };
  let mode = "preview";

  const previewExt = [blockField, inlinePlugin, linkClicks];
  const attrs = () => EditorView.editorAttributes.of({ class: mode === "preview" ? "md-preview" : "md-source", "data-link": cfg.link });
  const gutter = () => (mode === "source" && cfg.lineNumbers ? lineNumbers() : []);

  const state = EditorState.create({
    doc,
    extensions: [
      configField.init(() => cfg),
      focusField,
      focusTracker,
      history(),
      drawSelection(),
      search({ top: true }),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage, codeLanguages, extensions: [MathExtension] }),
      syntaxHighlighting(highlight),
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => { onSave?.(); return true; } },
        ...markdownKeymap,
        ...searchKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((u) => { if (u.docChanged) onChange?.(u.state.doc.toString()); }),
      attrComp.of(attrs()),
      gutterComp.of(gutter()),
      modeComp.of(previewExt),
    ],
  });
  ensureSyntaxTree(state, state.doc.length, 500);
  const view = new EditorView({ state, parent });

  return {
    view,
    getMode: () => mode,
    setMode(next) {
      mode = next;
      view.dispatch({ effects: [modeComp.reconfigure(mode === "preview" ? previewExt : []), attrComp.reconfigure(attrs()), gutterComp.reconfigure(gutter())] });
    },
    setConfig(patch) {
      cfg = { ...cfg, ...patch };
      view.dispatch({ effects: [setConfigEffect.of(cfg), attrComp.reconfigure(attrs()), gutterComp.reconfigure(gutter())] });
    },
    scrollToText(text) {
      const idx = view.state.doc.toString().indexOf(text);
      if (idx < 0) return;
      view.dispatch({ effects: EditorView.scrollIntoView(idx, { y: "start", yMargin: 16 }) });
    },
    markSaved() {},
  };
}
