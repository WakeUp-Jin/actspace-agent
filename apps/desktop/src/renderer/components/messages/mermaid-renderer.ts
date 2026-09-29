/**
 * Mermaid renderer adapter for chat replies.
 *
 * Mermaid source comes from the model, so it is treated as untrusted input:
 * the app owns every config key (source directives cannot override theme or
 * security), interaction statements are stripped before parsing, and the SVG
 * is sanitized again before it reaches the DOM. Mermaid itself is loaded on
 * demand so replies without diagrams never pay for its parser and layout code.
 */
import type { Config as DomPurifyConfig } from "dompurify";
import type { MermaidConfig } from "mermaid";
import type { MermaidThemeId } from "../../appearance/types";

export const MERMAID_MAX_SOURCE_CHARS = 20_000;
export const MERMAID_MAX_EDGES = 500;
export const MERMAID_MAX_SVG_BYTES = 2_000_000;
export const MERMAID_RENDER_TIMEOUT_MS = 10_000;
const CACHE_LIMIT = 32;

export type MermaidErrorKind = "empty" | "too-large" | "syntax" | "timeout" | "invalid-output";

export class MermaidRenderError extends Error {
  constructor(readonly kind: MermaidErrorKind, message: string) {
    super(message);
    this.name = "MermaidRenderError";
  }
}

export interface MermaidRenderResult {
  /** Sanitized SVG. Mount it through instantiateMermaidSvg so each copy gets unique ids. */
  svg: string;
  /** Id Mermaid rendered with; every internal id / CSS scope in `svg` is derived from it. */
  renderId: string;
  diagramType: string;
  /** Intrinsic size from the SVG viewBox; used by the preview and PNG export. */
  width: number;
  height: number;
}

/**
 * Fixed diagram palette. It deliberately does not read `--act-color-*`: the
 * diagram keeps the same look under light, dark and system app themes.
 */
export interface MermaidThemePreset {
  id: MermaidThemeId;
  label: string;
  /** Canvas colour behind the SVG; also filled into exported PNGs. */
  canvas: string;
  /** Secondary text drawn directly on the canvas (loading hint). */
  muted: string;
  fontFamily: string;
  themeVariables: Record<string, string>;
  /** Extra diagram CSS; Mermaid scopes it to the rendered SVG id. */
  themeCSS: string;
}

const DIAGRAM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Segoe UI", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';

// Codex-inspired light palette: soft off-white canvas, near-black text, grey
// connectors and a low-saturation orange for nodes, notes and labels.
const CODEX = {
  canvas: "#fbfaf8",
  text: "#1a1c1f",
  line: "#86878a",
  node: "#ffe7d9",
  nodeSoft: "#fff5f0",
  nodeText: "#6d2e0f",
  nodeBorder: "#e3c8b8",
  surface: "#ffffff",
  border: "#e6e4e0",
} as const;

const CODEX_SERIES = ["#f3883b", "#339cff", "#5dc977", "#eb77b1", "#9b79ec", "#3ab9b1"];

const CODEX_THEME_CSS = `
.node rect, .node circle, .node ellipse, .node polygon, .node path { stroke-width: 1px; }
.node rect { rx: 12px; ry: 12px; }
.node .label text, .node text.nodeLabel, .nodeLabel { font-weight: 600; fill: ${CODEX.nodeText}; }
.edgePaths path, .flowchart-link, .transition { stroke-width: 1px; stroke-linecap: round; stroke-linejoin: round; }
.edgeLabel .label rect, .edgeLabel rect.background { rx: 11px; ry: 11px; fill: ${CODEX.nodeSoft}; stroke: ${CODEX.nodeBorder}; stroke-width: 1px; }
.edgeLabel text, .edgeLabel tspan { font-size: 13px; font-weight: 600; }
rect.actor { rx: 10px; ry: 10px; stroke-width: 1px; }
text.actor > tspan { font-weight: 600; fill: ${CODEX.nodeText}; }
.messageLine0, .messageLine1 { stroke-width: 1px; }
.note { stroke-width: 1px; rx: 8px; ry: 8px; }
.labelBox { stroke-width: 1px; }
.cluster rect { rx: 14px; ry: 14px; stroke-width: 1px; }
`;

export const MERMAID_THEMES: Record<MermaidThemeId, MermaidThemePreset> = {
  codex: {
    id: "codex",
    label: "Codex",
    canvas: CODEX.canvas,
    muted: CODEX.line,
    fontFamily: DIAGRAM_FONT_STACK,
    themeCSS: CODEX_THEME_CSS,
    themeVariables: {
      background: CODEX.canvas,
      fontSize: "14px",
      textColor: CODEX.text,
      lineColor: CODEX.line,
      primaryColor: CODEX.node,
      primaryTextColor: CODEX.nodeText,
      primaryBorderColor: CODEX.nodeBorder,
      secondaryColor: CODEX.nodeSoft,
      secondaryTextColor: CODEX.nodeText,
      secondaryBorderColor: CODEX.nodeBorder,
      tertiaryColor: CODEX.surface,
      tertiaryTextColor: CODEX.text,
      tertiaryBorderColor: CODEX.border,
      mainBkg: CODEX.node,
      nodeBorder: CODEX.nodeBorder,
      nodeTextColor: CODEX.nodeText,
      clusterBkg: CODEX.surface,
      clusterBorder: CODEX.border,
      titleColor: CODEX.text,
      edgeLabelBackground: CODEX.nodeSoft,
      noteBkgColor: CODEX.nodeSoft,
      noteBorderColor: CODEX.nodeBorder,
      noteTextColor: CODEX.text,
      actorBkg: CODEX.node,
      actorBorder: CODEX.nodeBorder,
      actorTextColor: CODEX.nodeText,
      actorLineColor: CODEX.line,
      signalColor: CODEX.line,
      signalTextColor: CODEX.text,
      labelBoxBkgColor: CODEX.node,
      labelBoxBorderColor: CODEX.nodeBorder,
      labelTextColor: CODEX.nodeText,
      loopTextColor: CODEX.text,
      activationBkgColor: CODEX.nodeSoft,
      activationBorderColor: CODEX.nodeBorder,
      sequenceNumberColor: CODEX.surface,
      transitionColor: CODEX.line,
      transitionLabelColor: CODEX.text,
      stateLabelColor: CODEX.nodeText,
      stateBkg: CODEX.node,
      compositeBackground: CODEX.surface,
      compositeTitleBackground: CODEX.nodeSoft,
      specialStateColor: CODEX.line,
      errorBkgColor: "#fbe4dc",
      errorTextColor: "#8e2d1c",
      ...Object.fromEntries(CODEX_SERIES.flatMap((color, index) => [[`pie${index + 1}`, color], [`cScale${index}`, color]])),
      pieStrokeColor: CODEX.surface,
      pieOuterStrokeColor: CODEX.border,
      pieTitleTextColor: CODEX.text,
      pieSectionTextColor: CODEX.surface,
      pieLegendTextColor: CODEX.text,
    },
  },
};

export function mermaidTheme(id: MermaidThemeId): MermaidThemePreset {
  return MERMAID_THEMES[id] ?? MERMAID_THEMES.codex;
}

/** Full, case-insensitive match only: `mer` while streaming stays a code block. */
export function isMermaidLanguage(language: string | undefined | null): boolean {
  return language?.trim().toLowerCase() === "mermaid";
}

/**
 * Whether a fenced code block's raw markdown slice ends with its closing fence.
 * Streaming replies grow token by token; once the fence closes the diagram
 * source can no longer change, so it is safe to render exactly once.
 */
export function isFenceClosed(rawBlock: string): boolean {
  const opening = rawBlock.match(/^[ \t>]*(`{3,}|~{3,})/);
  if (!opening) return false;
  const fence = opening[1];
  const lines = rawBlock.replace(/\s+$/, "").split("\n");
  if (lines.length < 2) return false;
  const last = lines[lines.length - 1].replace(/^[ \t>]*/, "");
  return last.startsWith(fence[0].repeat(fence.length)) && /^(`{3,}|~{3,})$/.test(last) && last[0] === fence[0];
}

// Keys a diagram directive or frontmatter `config:` must never change.
const SECURE_CONFIG_KEYS = [
  "secure",
  "securityLevel",
  "startOnLoad",
  "maxTextSize",
  "maxEdges",
  "suppressErrorRendering",
  "theme",
  "themeVariables",
  "themeCSS",
  "darkMode",
  "fontFamily",
  "altFontFamily",
  "fontSize",
  "look",
  "htmlLabels",
  "flowchart",
  "sequence",
  "arrowMarkerAbsolute",
  "dompurifyConfig",
  "deterministicIds",
  "deterministicIDSeed",
];

// click/link/callback statements (flowchart, class, state) can navigate or call scripts.
const INTERACTION_LINE = /^\s*(?:click|link|callback)\s+\S/i;
const INIT_DIRECTIVE = /%%\{[\s\S]*?\}%%/g;
const FRONTMATTER = /^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Strip everything the model could use to override config or add interaction. */
export function prepareMermaidSource(source: string): string {
  let text = source.replace(/\r\n?/g, "\n");
  const frontmatter = text.match(FRONTMATTER);
  if (frontmatter) {
    // Keep only simple top-level keys (title / displayMode); drop nested config blocks.
    const kept: string[] = [];
    let skippingNested = false;
    for (const line of frontmatter[1].split("\n")) {
      const topLevel = /^[A-Za-z_][\w-]*\s*:/.test(line);
      if (topLevel) {
        skippingNested = /^config\s*:/i.test(line);
        if (!skippingNested) kept.push(line);
      } else if (!skippingNested && line.trim()) {
        kept.push(line);
      }
    }
    const rest = text.slice(frontmatter[0].length);
    text = kept.length > 0 ? `---\n${kept.join("\n")}\n---\n${rest}` : rest;
  }
  return text
    .replace(INIT_DIRECTIVE, "")
    .split("\n")
    .filter((line) => !INTERACTION_LINE.test(line))
    .join("\n")
    .trim();
}

let purifierPromise: Promise<typeof import("dompurify").default> | null = null;

function loadPurifier() {
  purifierPromise ??= import("dompurify").then((module) => {
    const purifier = module.default;
    purifier.addHook("uponSanitizeAttribute", (_node, data) => {
      const name = data.attrName.toLowerCase();
      if ((name === "href" || name === "xlink:href") && !data.attrValue.trim().startsWith("#")) {
        data.keepAttr = false;
      }
    });
    return purifier;
  });
  return purifierPromise;
}

const PURIFY_CONFIG: DomPurifyConfig = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  // Some diagram types still place text inside foreignObject (its HTML is sanitized with the html
  // profile) or reuse defs via <use>; the href hook above limits those references to "#id".
  ADD_TAGS: ["foreignObject", "style", "use"],
  HTML_INTEGRATION_POINTS: { foreignobject: true },
  FORBID_TAGS: ["script", "iframe", "object", "embed", "a"],
  FORBID_ATTR: ["onclick", "onload", "onerror", "onmouseover", "onfocus"],
};

export async function sanitizeMermaidSvg(svg: string): Promise<string> {
  const purifier = await loadPurifier();
  const clean = purifier.sanitize(svg, PURIFY_CONFIG) as unknown as string;
  if (!/^\s*<svg[\s>]/i.test(clean)) {
    throw new MermaidRenderError("invalid-output", "图表输出无效");
  }
  return clean;
}

/** Read the intrinsic diagram size from the SVG viewBox (falls back to width/height). */
export function svgIntrinsicSize(svg: string): { width: number; height: number } {
  const viewBox = svg.match(/viewBox\s*=\s*"([^"]+)"/i)?.[1]?.trim().split(/[\s,]+/).map(Number);
  if (viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  const width = Number.parseFloat(svg.match(/<svg[^>]*\swidth\s*=\s*"([\d.]+)/i)?.[1] ?? "");
  const height = Number.parseFloat(svg.match(/<svg[^>]*\sheight\s*=\s*"([\d.]+)/i)?.[1] ?? "");
  return { width: Number.isFinite(width) && width > 0 ? width : 0, height: Number.isFinite(height) && height > 0 ? height : 0 };
}

type MermaidModule = typeof import("mermaid").default;
let mermaidPromise: Promise<MermaidModule> | null = null;
let initializedTheme: MermaidThemeId | null = null;
let renderSequence = 0;
const cache = new Map<string, MermaidRenderResult>();
// Identical fences mounted together share one render instead of racing the cache.
const inflight = new Map<string, Promise<MermaidRenderResult>>();

function mermaidConfig(theme: MermaidThemePreset): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    maxTextSize: MERMAID_MAX_SOURCE_CHARS,
    maxEdges: MERMAID_MAX_EDGES,
    secure: SECURE_CONFIG_KEYS,
    htmlLabels: false,
    theme: "base",
    darkMode: false,
    fontFamily: theme.fontFamily,
    themeVariables: { ...theme.themeVariables, fontFamily: theme.fontFamily },
    themeCSS: theme.themeCSS,
    flowchart: { htmlLabels: false, useMaxWidth: false },
    sequence: { useMaxWidth: false },
    state: { useMaxWidth: false },
    class: { useMaxWidth: false },
    er: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    journey: { useMaxWidth: false },
    pie: { useMaxWidth: false },
    mindmap: { useMaxWidth: false },
  } as MermaidConfig;
}

async function loadMermaid(theme: MermaidThemePreset): Promise<MermaidModule> {
  mermaidPromise ??= import("mermaid").then((module) => module.default);
  const mermaid = await mermaidPromise;
  if (initializedTheme !== theme.id) {
    mermaid.initialize(mermaidConfig(theme));
    initializedTheme = theme.id;
  }
  return mermaid;
}

function remember(key: string, result: MermaidRenderResult) {
  cache.delete(key);
  cache.set(key, result);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new MermaidRenderError("timeout", "图表渲染超时")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

let instanceSequence = 0;

/** A fresh id for one mounted copy of a diagram. */
export function nextMermaidInstanceId(): string {
  instanceSequence += 1;
  return `act-mermaid-view-${instanceSequence}-i`;
}

/**
 * Cached results are shared, and the preview shows a second copy of the same
 * diagram; rewriting the render id keeps marker ids and scoped CSS unique per copy.
 */
export function instantiateMermaidSvg(result: MermaidRenderResult, instanceId: string): string {
  return result.svg.split(result.renderId).join(instanceId);
}

/** Synchronous cache lookup so remounted blocks (virtualization, streaming) skip the loading state. */
export function peekMermaidCache(source: string, themeId: MermaidThemeId): MermaidRenderResult | undefined {
  return cache.get(`${themeId}\u0000${source}`);
}

export function renderMermaid(source: string, themeId: MermaidThemeId): Promise<MermaidRenderResult> {
  const theme = mermaidTheme(themeId);
  const cacheKey = `${theme.id}\u0000${source}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    remember(cacheKey, cached);
    return Promise.resolve(cached);
  }
  const pending = inflight.get(cacheKey);
  if (pending) return pending;
  const task = renderUncached(source, theme).then(
    (result) => { inflight.delete(cacheKey); remember(cacheKey, result); return result; },
    (error: unknown) => { inflight.delete(cacheKey); throw error; },
  );
  inflight.set(cacheKey, task);
  return task;
}

async function renderUncached(source: string, theme: MermaidThemePreset): Promise<MermaidRenderResult> {
  if (source.length > MERMAID_MAX_SOURCE_CHARS) {
    throw new MermaidRenderError("too-large", "图表源码过长");
  }
  const prepared = prepareMermaidSource(source);
  if (!prepared) throw new MermaidRenderError("empty", "图表源码为空");

  const mermaid = await loadMermaid(theme);
  renderSequence += 1;
  // The "-src" suffix keeps ids prefix-free (act-mermaid-1-src is not a prefix of act-mermaid-10-src).
  const id = `act-mermaid-${renderSequence}-src`;
  let rendered: Awaited<ReturnType<MermaidModule["render"]>>;
  try {
    rendered = await withTimeout(mermaid.render(id, prepared), MERMAID_RENDER_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof MermaidRenderError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/maximum|max(?:TextSize|Edges)|too many edges/i.test(message)) {
      throw new MermaidRenderError("too-large", "图表规模超出限制");
    }
    throw new MermaidRenderError("syntax", "图表语法有误");
  } finally {
    // Mermaid leaves a temporary container when rendering fails; never let it leak into the page.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
  }
  if (rendered.svg.length > MERMAID_MAX_SVG_BYTES) {
    throw new MermaidRenderError("too-large", "图表输出过大");
  }
  const svg = await sanitizeMermaidSvg(rendered.svg);
  return { svg, renderId: id, diagramType: rendered.diagramType, ...svgIntrinsicSize(svg) };
}

const PNG_SCALE = 2;
const PNG_MAX_EDGE = 8_192;

/** Serialize the diagram with explicit pixel size so it rasterizes at its intrinsic scale. */
export function svgForExport(result: MermaidRenderResult): string {
  const doc = new DOMParser().parseFromString(result.svg, "image/svg+xml");
  const svg = doc.documentElement;
  if (result.width > 0 && result.height > 0) {
    svg.setAttribute("width", String(result.width));
    svg.setAttribute("height", String(result.height));
  }
  svg.removeAttribute("style");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(svg);
}

/** Rasterize at 2x (capped at 8192px per edge) over the preset canvas colour. */
export async function mermaidPngBlob(result: MermaidRenderResult, theme: MermaidThemePreset): Promise<Blob> {
  const background = theme.canvas;
  await document.fonts?.ready;
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("image load failed"));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgForExport(result))}`;
  await loaded;
  const width = result.width || image.naturalWidth;
  const height = result.height || image.naturalHeight;
  const scale = Math.min(PNG_SCALE, PNG_MAX_EDGE / Math.max(width, height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png encode failed"))), "image/png");
  });
}

export async function downloadMermaidPng(result: MermaidRenderResult, theme: MermaidThemePreset): Promise<void> {
  const blob = await mermaidPngBlob(result, theme);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mermaid-${result.diagramType || "diagram"}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Test hook: forget loaded modules and cached output. */
export function resetMermaidRendererForTests() {
  mermaidPromise = null;
  initializedTheme = null;
  renderSequence = 0;
  instanceSequence = 0;
  cache.clear();
  inflight.clear();
}
