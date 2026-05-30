import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Files, RotateCw } from "lucide-react";
import type { SessionVisualizationItem } from "@actspace/shared";
import { HtmlRenderView } from "./HtmlRenderView";

/**
 * 右侧面板「Reply HTML」视图。
 *
 * 聚合**当前会话**里已转换生成的可视化 HTML：渲染区占满，文件列表收进一个下拉选择器
 * （像模型选择器），不再用常驻侧栏挡住渲染图。
 * - 顶部操作栏（左起）：文件选择器（下拉浮层 + 滚动列表，只显示文件名）、刷新。
 * - 主体：复用沙箱 `HtmlRenderView` 渲染选中文件（半可信 → trust="chat"）。
 * 数据走 `visualize:list` IPC；浏览器 mock 无 IPC 时降级为空态。
 */

const ROOT_CLASS = "flex min-h-0 flex-1 flex-col";
const TOOLBAR_CLASS = "relative flex shrink-0 items-center gap-1.5 border-b border-line px-2.5 py-1.5";
const PICKER_BUTTON_CLASS =
  "inline-flex min-w-0 max-w-[260px] items-center gap-1.5 rounded-act-sm border border-line bg-surface px-2 py-1 text-[12px] text-text-main transition-colors hover:border-line-strong disabled:opacity-60 [cursor:pointer] disabled:[cursor:default]";
const PICKER_LABEL_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const ICON_BUTTON_CLASS =
  "grid h-[26px] w-[26px] place-items-center rounded-act-sm border-0 bg-transparent text-text-faint transition-colors hover:bg-brand-soft hover:text-brand [cursor:pointer]";
const POPOVER_CLASS =
  "absolute left-2.5 top-[calc(100%+4px)] z-[70] max-h-[320px] w-[260px] overflow-auto rounded-act-md border border-line bg-surface-raised p-1 shadow-act-popover";
const POPOVER_ITEM_BASE =
  "block w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-act-sm border-0 bg-transparent px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-brand-soft [cursor:pointer]";
const POPOVER_ITEM_ACTIVE = "bg-brand-soft text-brand";
const POPOVER_ITEM_INACTIVE = "text-text-main";
const POPOVER_EMPTY_CLASS = "px-2.5 py-2 text-[12px] leading-[1.6] text-text-faint";
const RENDER_CELL_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
const EMPTY_CLASS =
  "grid min-h-0 flex-1 place-items-center whitespace-pre-line p-6 text-center text-[13px] leading-[1.7] text-text-muted";
const STATE_CLASS = "p-[18px] text-[13px] text-text-muted";

export function ReplyHtmlRenderView({ sessionId }: { sessionId: string | null }) {
  const [items, setItems] = useState<SessionVisualizationItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !window.actspace?.listVisualizations || !sessionId) {
      setItems([]);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const result = await window.actspace.listVisualizations({ sessionId });
      setItems(result.items);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取可视化文件失败");
      setStatus("error");
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const selected = useMemo(() => {
    const byKey = items.find((item) => `${item.messageId}:${item.sourceHash}` === selectedKey);
    return byKey ?? items[0] ?? null;
  }, [items, selectedKey]);

  const hasItems = items.length > 0;

  if (status === "error") {
    return (
      <div className={ROOT_CLASS}>
        <div className={STATE_CLASS}>读取失败：{error}</div>
      </div>
    );
  }

  return (
    <div className={ROOT_CLASS}>
      <div className={TOOLBAR_CLASS} ref={toolbarRef}>
        <button
          type="button"
          className={PICKER_BUTTON_CLASS}
          disabled={!hasItems}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          title={selected?.title}
          onClick={() => setPickerOpen((value) => !value)}
        >
          <Files size={14} strokeWidth={2} className="shrink-0 opacity-70" />
          <span className={PICKER_LABEL_CLASS}>
            {hasItems ? (selected?.title ?? "选择文件") : "暂无文件"}
          </span>
          {hasItems ? <ChevronDown size={13} strokeWidth={2} className="shrink-0 opacity-70" /> : null}
        </button>
        <button
          type="button"
          className={ICON_BUTTON_CLASS}
          aria-label="刷新文件列表"
          title="刷新"
          onClick={() => void refresh()}
        >
          <RotateCw size={14} strokeWidth={2} className={status === "loading" ? "animate-spin" : ""} />
        </button>

        {pickerOpen && hasItems ? (
          <div className={POPOVER_CLASS} role="listbox">
            {items.map((item) => {
              const key = `${item.messageId}:${item.sourceHash}`;
              const isActive = selected ? key === `${selected.messageId}:${selected.sourceHash}` : false;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`${POPOVER_ITEM_BASE} ${isActive ? POPOVER_ITEM_ACTIVE : POPOVER_ITEM_INACTIVE}`}
                  title={item.title}
                  onClick={() => {
                    setSelectedKey(key);
                    setPickerOpen(false);
                  }}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className={RENDER_CELL_CLASS}>
        {selected ? (
          <HtmlRenderView
            key={`${selected.messageId}:${selected.sourceHash}`}
            html={selected.html}
            trust="chat"
            relativePath={selected.title}
          />
        ) : (
          <div className={EMPTY_CLASS}>
            {status === "loading"
              ? "加载中…"
              : "当前会话还没有生成可视化 HTML。\n在某条回复下点「可视化」按钮即可生成。"}
          </div>
        )}
      </div>
    </div>
  );
}
