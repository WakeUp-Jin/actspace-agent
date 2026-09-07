import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PreviewSourceToggle, type PreviewMode } from "./PreviewSourceToggle";

/**
 * 右侧面板 HTML 渲染视图（V1）。
 *
 * 安全闸（见 `front-右侧面板与文件渲染规范.md`）：
 * - `sandbox="allow-scripts"`，**绝不加 `allow-same-origin`**（srcDoc 默认继承宿主 origin，两者同开可逃逸）。
 * - CSP 双档注入 srcDoc：file→strict 禁外联；chat→relaxed 允 https 静态资源但 `connect-src 'none'` 禁外传。
 * - 单向 postMessage 桥：iframe 只回传内容高度与运行时错误，父窗口不向 iframe 注入可执行内容。
 */

const CSP_STRICT =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none';";
const CSP_RELAXED =
  "default-src 'none'; img-src https: data: blob:; style-src https: 'unsafe-inline'; font-src https: data:; script-src https: 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none';";

const MIN_IFRAME_HEIGHT = 160;
const MAX_IFRAME_HEIGHT = 20000;
const MAX_IFRAME_WIDTH = 20000;
const FIXED_CANVAS_THRESHOLD = 1;

// 只有「聊天生成的 html」才用到这条工具栏：它没有工作区操作栏可以挂切换按钮。
const TOOLBAR_CLASS = "flex shrink-0 items-center justify-end gap-2 border-b border-line px-3 py-1.5";
const ERROR_BAR_CLASS =
  "flex shrink-0 items-center gap-1.5 border-b border-line bg-danger-soft px-3 py-1.5 text-[11px] text-danger";
const SOURCE_CLASS =
  "m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-[1.55] text-text-main";

type ResolvedTheme = "light" | "dark";

function resolveTheme(): ResolvedTheme {
  if (typeof document === "undefined") {
    return "light";
  }
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return "dark";
  if (attr === "light") return "light";
  // "system" 或未设置：跟随 OS。
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

const BRIDGE_SCRIPT = `<script>(function(){
  function post(msg){ try { parent.postMessage(Object.assign({ __actspacePreview: true }, msg), '*'); } catch (e) {} }
  function sendLayout(){
    var root = document.documentElement;
    var body = document.body;
    var width = Math.max(
      window.innerWidth || 0,
      root ? root.scrollWidth : 0,
      body ? body.scrollWidth : 0,
      root ? root.getBoundingClientRect().width : 0,
      body ? body.getBoundingClientRect().width : 0
    );
    var h = Math.max(
      root ? root.scrollHeight : 0,
      body ? body.scrollHeight : 0
    );
    post({ type: 'layout', width: width, height: h, viewportWidth: window.innerWidth || 0 });
  }
  window.addEventListener('error', function(e){
    var t = e && e.target;
    if (t && t !== window && t.tagName) {
      post({ type: 'error', message: 'Resource failed: ' + (t.src || t.href || t.tagName) });
    } else {
      post({ type: 'error', message: (e && e.message) || 'Script error' });
    }
  }, true);
  window.addEventListener('unhandledrejection', function(){ post({ type: 'error', message: 'Unhandled promise rejection' }); });
  document.addEventListener('DOMContentLoaded', sendLayout);
  window.addEventListener('load', sendLayout);
  window.addEventListener('resize', sendLayout);
  if (window.ResizeObserver) {
    try {
      var observer = new ResizeObserver(sendLayout);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
    } catch (e) {}
  }
  setTimeout(sendLayout, 60);
})();</script>`;

function baselineStyle(theme: ResolvedTheme): string {
  // srcDoc 不能继承父文档 CSS variables，因此这里与 tokens.css 的 surface / text 主色保持精确同步。
  const bg = theme === "dark" ? "#242522" : "#ffffff";
  const fg = theme === "dark" ? "#f1f1ed" : "#20201e";
  // 只设默认色与排版基线，不覆盖产物自带样式。
  return `<style>:root{color-scheme:${theme};}html{background:${bg};color:${fg};}body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6;}</style>`;
}

function buildHead(csp: string, theme: ResolvedTheme): string {
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">${baselineStyle(theme)}`;
}

/** 把 CSP/主题基线与桥脚本注入到 srcDoc：兼容完整文档与片段两种输入。 */
function composeSrcDoc(html: string, csp: string, theme: ResolvedTheme): string {
  const head = buildHead(csp, theme);
  const looksLikeDocument = /<html[\s>]/i.test(html) || /<!doctype/i.test(html);

  if (!looksLikeDocument) {
    return `<!doctype html><html><head>${head}</head><body>${html}${BRIDGE_SCRIPT}</body></html>`;
  }

  let out = html;
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${head}</head>`);
  } else if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (match) => `${match}${head}`);
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/<html[^>]*>/i, (match) => `${match}<head>${head}</head>`);
  } else {
    out = `${head}${out}`;
  }

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${BRIDGE_SCRIPT}</body>`);
  } else {
    out = `${out}${BRIDGE_SCRIPT}`;
  }
  return out;
}

/**
 * `mode` / `onModeChange` 一起传 = 受控（切换按钮在工作区操作栏上，视图不再自带工具栏）；
 * 都不传 = 自持状态并渲染视图内的分段控件，供没有操作栏的聊天 html 使用。
 */
export function HtmlRenderView({
  html,
  trust,
  relativePath,
  mode,
  onModeChange,
}: {
  html: string;
  trust: "chat" | "file";
  relativePath?: string;
  mode?: PreviewMode;
  onModeChange?: (mode: PreviewMode) => void;
}) {
  const [ownMode, setOwnMode] = useState<PreviewMode>("preview");
  const activeMode = mode ?? ownMode;
  const [height, setHeight] = useState(MIN_IFRAME_HEIGHT);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [fixedCanvasWidth, setFixedCanvasWidth] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const theme = useMemo(resolveTheme, []);
  const csp = trust === "file" ? CSP_STRICT : CSP_RELAXED;
  const srcDoc = useMemo(() => composeSrcDoc(html, csp, theme), [html, csp, theme]);

  // 切换内容时重置错误与高度，避免旧错误残留。
  useEffect(() => {
    setError(null);
    setHeight(MIN_IFRAME_HEIGHT);
    setFixedCanvasWidth(null);
  }, [srcDoc]);

  useEffect(() => {
    if (activeMode !== "preview") return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const publishWidth = (width: number) => {
      if (Number.isFinite(width) && width > 0) {
        setViewportWidth(width);
      }
    };
    publishWidth(viewport.clientWidth);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      publishWidth(entries[0]?.contentRect.width ?? viewport.clientWidth);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [activeMode, srcDoc]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      const data = event.data as {
        __actspacePreview?: boolean;
        type?: string;
        width?: number;
        height?: number;
        viewportWidth?: number;
        message?: string;
      };
      if (!data || data.__actspacePreview !== true) {
        return;
      }
      if (data.type === "layout") {
        if (typeof data.height === "number" && Number.isFinite(data.height)) {
          setHeight(Math.min(MAX_IFRAME_HEIGHT, Math.max(MIN_IFRAME_HEIGHT, Math.ceil(data.height))));
        }
        if (
          typeof data.width === "number"
          && Number.isFinite(data.width)
          && typeof data.viewportWidth === "number"
          && Number.isFinite(data.viewportWidth)
          && data.width > data.viewportWidth + FIXED_CANVAS_THRESHOLD
        ) {
          const nextWidth = Math.min(MAX_IFRAME_WIDTH, Math.ceil(data.width));
          // 锁住首次发现的自然画布宽度，避免 iframe 扩宽后又被误判成响应式页面而来回振荡。
          setFixedCanvasWidth((current) => current === null ? nextWidth : Math.max(current, nextWidth));
        }
      } else if (data.type === "error" && typeof data.message === "string") {
        setError(data.message);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const scale = fixedCanvasWidth && viewportWidth > 0
    ? Math.min(1, viewportWidth / fixedCanvasWidth)
    : 1;
  const renderedWidth = fixedCanvasWidth ? Math.ceil(fixedCanvasWidth * scale) : undefined;
  const renderedHeight = Math.ceil(height * scale);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {onModeChange ? null : (
        <div className={TOOLBAR_CLASS}>
          <PreviewSourceToggle mode={activeMode} onChange={setOwnMode} />
        </div>
      )}
      {error ? (
        <div className={ERROR_BAR_CLASS} role="alert">
          <AlertTriangle size={13} strokeWidth={2.2} />
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">预览出错：{error}</span>
        </div>
      ) : null}
      {activeMode === "preview" ? (
        <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto bg-surface" data-html-preview-viewport>
          <div
            className="relative mx-auto"
            data-html-preview-canvas
            style={{
              width: renderedWidth === undefined ? "100%" : renderedWidth,
              height: renderedHeight,
            }}
          >
            <iframe
              ref={iframeRef}
              title={relativePath ?? "HTML 预览"}
              sandbox="allow-scripts"
              srcDoc={srcDoc}
              className="absolute left-0 top-0 block border-0"
              style={{
                width: fixedCanvasWidth ?? "100%",
                height,
                transform: fixedCanvasWidth ? `scale(${scale})` : undefined,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      ) : (
        <pre className={SOURCE_CLASS}>
          <code>{html}</code>
        </pre>
      )}
    </div>
  );
}
