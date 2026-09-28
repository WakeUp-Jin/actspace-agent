import { AlertTriangle, Check, Code2, Copy, Download, Maximize2, Workflow } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { MermaidThemeId } from "../../appearance/types";
import { IconButton } from "../ui/IconButton";
import { MermaidPreviewDialog } from "./MermaidPreviewDialog";
import {
  MermaidRenderError,
  downloadMermaidPng,
  instantiateMermaidSvg,
  mermaidTheme,
  nextMermaidInstanceId,
  peekMermaidCache,
  renderMermaid,
  type MermaidRenderResult,
} from "./mermaid-renderer";

type RenderState =
  | { status: "loading" }
  | { status: "ready"; result: MermaidRenderResult }
  | { status: "error"; message: string };

// Shell and toolbar reuse the code block chrome from markdown.css so the source view looks identical.
const BLOCK_CLASS = "markdown-code-shell mermaid-block";
const TOOLBAR_CLASS = "markdown-code-toolbar gap-2";
const CANVAS_CLASS = "mermaid-canvas flex min-h-[120px] px-4 py-5";
// Wide diagrams shrink to the chat column, but never below this share of their
// intrinsic size; past that the canvas scrolls and the preview shows the whole diagram.
const MIN_INLINE_SCALE = 0.72;

function initialState(source: string, themeId: MermaidThemeId): RenderState {
  const cached = peekMermaidCache(source, themeId);
  return cached ? { status: "ready", result: cached } : { status: "loading" };
}

/**
 * A closed ```mermaid fence in a chat reply. The source stays inspectable:
 * it can be copied, shown in place of the diagram, and is shown automatically
 * when rendering fails, so a bad diagram never hides what the model wrote.
 */
export function MermaidDiagramBlock({ source, themeId, sourceView }: {
  source: string;
  themeId: MermaidThemeId;
  /** Highlighted source code (the fence's <code> element). */
  sourceView: ReactNode;
}) {
  const [state, setState] = useState<RenderState>(() => initialState(source, themeId));
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const [instanceId] = useState(nextMermaidInstanceId);
  const theme = mermaidTheme(themeId);

  useEffect(() => {
    let cancelled = false;
    const cached = peekMermaidCache(source, themeId);
    if (cached) {
      setState({ status: "ready", result: cached });
      return;
    }
    setState({ status: "loading" });
    renderMermaid(source, themeId).then(
      (result) => { if (!cancelled) setState({ status: "ready", result }); },
      (error: unknown) => {
        if (cancelled) return;
        setState({ status: "error", message: error instanceof MermaidRenderError ? error.message : "图表渲染失败" });
      },
    );
    return () => { cancelled = true; };
  }, [source, themeId]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const flash = (update: () => void, reset: () => void) => {
    update();
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(reset, 1_600);
  };

  const copySource = async () => {
    try {
      await navigator.clipboard?.writeText(source);
      flash(() => setCopied(true), () => setCopied(false));
    } catch {
      flash(() => setNotice("复制失败"), () => setNotice(null));
    }
  };

  const downloadPng = async () => {
    if (state.status !== "ready") return;
    try {
      await downloadMermaidPng(state.result, theme);
    } catch {
      flash(() => setNotice("导出失败"), () => setNotice(null));
    }
  };

  const ready = state.status === "ready";
  const sourceVisible = showSource || state.status === "error";

  return (
    <div className={BLOCK_CLASS} data-state={state.status}>
      <div className={TOOLBAR_CLASS}>
        <span className="inline-flex items-center gap-1.5">
          <Workflow size={12} aria-hidden="true" />
          mermaid
        </span>
        <div className="flex items-center gap-0.5">
          {notice ? <span role="status" className="mr-1 font-sans text-text-muted">{notice}</span> : null}
          {state.status !== "error" ? (
            <IconButton
              size="xs"
              label={showSource ? "显示图表" : "查看源码"}
              aria-pressed={showSource}
              onClick={() => setShowSource((value) => !value)}
            >
              {showSource ? <Workflow size={13} aria-hidden="true" /> : <Code2 size={13} aria-hidden="true" />}
            </IconButton>
          ) : null}
          <IconButton size="xs" label={copied ? "已复制源码" : "复制 Mermaid 源码"} onClick={() => void copySource()}>
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </IconButton>
          <IconButton size="xs" label="下载 PNG" disabled={!ready} onClick={() => void downloadPng()}>
            <Download size={13} aria-hidden="true" />
          </IconButton>
          <IconButton size="xs" label="放大查看" disabled={!ready} onClick={() => setExpanded(true)}>
            <Maximize2 size={13} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="m-0 flex items-center gap-1.5 border-b border-line px-3 py-2 font-sans text-act-xs text-text-muted">
          <AlertTriangle size={13} aria-hidden="true" className="shrink-0 text-warning" />
          无法渲染图表：{state.message}，已显示源码。
        </p>
      ) : null}

      {sourceVisible ? (
        <pre className="markdown-code-block">{sourceView}</pre>
      ) : state.status === "ready" ? (
        <div
          className={CANVAS_CLASS}
          style={{ background: theme.canvas, "--mermaid-min-width": `${Math.round(state.result.width * MIN_INLINE_SCALE)}px` } as CSSProperties}
          role="img"
          aria-label={`Mermaid 图表：${state.result.diagramType}`}
          // SVG is produced by the strict Mermaid config and sanitized again in mermaid-renderer.
          dangerouslySetInnerHTML={{ __html: instantiateMermaidSvg(state.result, instanceId) }}
        />
      ) : (
        <div className={`${CANVAS_CLASS} items-center`} style={{ background: theme.canvas, color: theme.muted }} role="status" aria-busy="true">
          <span className="text-act-xs">正在渲染图表…</span>
        </div>
      )}

      {expanded && ready ? (
        <MermaidPreviewDialog
          result={state.result}
          theme={theme}
          onClose={() => setExpanded(false)}
          onDownload={() => void downloadPng()}
        />
      ) : null}
    </div>
  );
}
