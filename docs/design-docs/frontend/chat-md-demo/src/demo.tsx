import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { MarkdownProse } from "@repo/components/messages/MarkdownProse";
import { ReplyStreamingContext } from "@repo/components/messages/reply-streaming-context";
import { ImprovedProse } from "./improved";
import { VARIANTS, type Host, type VariantId } from "./shared";
import { useSmoothText } from "./stream";
import SAMPLE from "../sample-chat.txt";
import IMAGE from "../arch.svg";
import "./improved.css";
import "./variants.css";

const CONTENT_CLASS = "assistant-content relative max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)] font-normal leading-[1.65] text-text-main";
const USER_TEXT = "流式输出的时候回复越长越卡，帮我看看 MarkdownProse 问题出在哪，顺手改掉。";
type Pane = "original" | VariantId;
const IDS = Object.keys(VARIANTS) as VariantId[];
const paneName = (p: Pane) => (p === "original" ? "原版" : VARIANTS[p].name);

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/** 模拟真实网络：一批几十个字、间隔不均。 */
function useReplay(source: string) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number>();
  const start = () => {
    window.clearTimeout(timer.current);
    let pos = 0;
    setText("");
    const tick = () => {
      pos = Math.min(source.length, pos + 12 + Math.floor(Math.random() * 70));
      setText(source.slice(0, pos));
      if (pos >= source.length) { timer.current = window.setTimeout(() => setText(null), 0); return; }
      timer.current = window.setTimeout(tick, 60 + Math.random() * 220);
    };
    timer.current = window.setTimeout(tick, 500);
  };
  const stop = () => { window.clearTimeout(timer.current); setText(null); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { text, streaming: text !== null, start, stop };
}

function Column({ pane, raw, networkStreaming, smooth, breaks, host, onToast }: {
  pane: Pane; raw: string; networkStreaming: boolean; smooth: boolean; breaks: boolean; host: Host; onToast(m: string): void;
}) {
  const smoothed = useSmoothText(raw, smooth && pane !== "original");
  const content = pane === "original" ? raw : smoothed;
  const streaming = networkStreaming || content.length < raw.length;
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    const el = body.current;
    if (el && streaming && follow.current) el.scrollTop = el.scrollHeight;
  }, [content, streaming]);
  useEffect(() => { if (networkStreaming && raw === "" && body.current) { body.current.scrollTop = 0; follow.current = true; } }, [networkStreaming, raw]);
  return (
    <section className="col">
      <header className="col-head">
        <b>{paneName(pane)}</b>
        <span>{pane === "original" ? "现在的 MarkdownProse，原样渲染" : VARIANTS[pane].note}</span>
      </header>
      <div className="col-body" ref={body} onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        <div className="user-row"><div className="user-bubble">{USER_TEXT}</div></div>
        <article className="message-row assistant-reply block">
          <div className={CONTENT_CLASS}>
            {pane === "original" ? (
              <ReplyStreamingContext.Provider value={streaming}>
                <MarkdownProse content={content} onOpenWorkspaceFile={(p) => onToast(`原版：打开 ${p}`)} />
              </ReplyStreamingContext.Provider>
            ) : (
              <ImprovedProse content={content} host={host} options={{ breaks, variant: VARIANTS[pane], streaming }} />
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function App() {
  const [layout, setLayout] = useState<"split" | "single">(() => (window.innerWidth < 1100 ? "single" : "split"));
  const [right, setRight] = useState<VariantId>("a1");
  const [single, setSingle] = useState<Pane>("a1");
  const [breaks, setBreaks] = useState(false);
  const [smooth, setSmooth] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [content, setContent] = useState(SAMPLE);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const replay = useReplay(content);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 1800); return () => clearTimeout(t); }, [toast]);
  const host: Host = {
    openPath: (p, line) => setToast(`在 ActSpace 中打开 ${p}${line ? `，跳到第 ${line} 行` : ""}`),
    openUrl: (u) => setToast(`用系统浏览器打开 ${u}`),
    image: (p) => (p.replace(/^\.\//, "") === "docs/assets/arch.svg" ? IMAGE : null),
  };
  const raw = replay.text ?? content;
  const col = (pane: Pane) => <Column key={pane} pane={pane} raw={raw} networkStreaming={replay.streaming} smooth={smooth} breaks={breaks} host={host} onToast={setToast} />;
  return (
    <>
      <div className="bar">
        <strong>聊天区 Markdown · A 方向</strong>
        <Seg value={layout} options={[["split", "并排"], ["single", "单栏"]]} onChange={setLayout} />
        {layout === "split"
          ? <><span className="lbl">原版 ↔</span><Seg value={right} options={IDS.map((k) => [k, VARIANTS[k].name])} onChange={setRight} /></>
          : <Seg value={single} options={(["original", ...IDS] as Pane[]).map((k) => [k, paneName(k)])} onChange={setSingle} />}
        <span className="sep" />
        <button className={`btn primary ${replay.streaming ? "on" : ""}`} onClick={replay.streaming ? replay.stop : replay.start}>{replay.streaming ? "■ 停止" : "▶ 回放流式"}</button>
        <span className="lbl">平滑输出</span>
        <Seg value={smooth ? "on" : "off"} options={[["on", "开"], ["off", "关"]]} onChange={(v) => setSmooth(v === "on")} />
        <span className="lbl">单个换行</span>
        <Seg value={breaks ? "keep" : "merge"} options={[["merge", "合并"], ["keep", "保留"]]} onChange={(v) => setBreaks(v === "keep")} />
        <Seg value={theme} options={[["light", "浅色"], ["dark", "深色"]]} onChange={setTheme} />
        <button className="btn" onClick={() => setEditing(!editing)}>{editing ? "收起示例" : "编辑示例"}</button>
      </div>
      {editing ? <textarea className="editor" value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} /> : null}
      <main className={layout}>
        {layout === "split" ? <>{col("original")}{col(right)}</> : col(single)}
      </main>
      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
