/**
 * 右侧面板文件视图的「在外部应用中打开」入口（对齐 Cursor 第二层右侧的 Open 按钮）。
 *
 * - 目标是**当前文件**而不是 workspace 根：main 侧按 `relativePath` 解析并做越界校验。
 * - 不做「点图标直接用上次的应用打开」：这一栏的图标很小，误触会直接拉起外部程序，
 *   所以统一先出菜单，选中后才真正打开（选择会被记住并排在菜单里带勾）。
 * - 无 preload（浏览器 mock）时整个按钮不渲染，而不是渲染一个点了报错的按钮。
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, SquareArrowOutUpRight } from "lucide-react";
import type { WorkspaceOpenTool, WorkspaceOpenToolId } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { OPEN_TOOL_LABELS, readStoredOpenTool, storeOpenTool, toolIcon } from "../workspace/workspaceOpenTool";

const TRIGGER_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const MENU_CLASS =
  "absolute right-0 top-[calc(100%+4px)] z-[95] min-w-[196px] overflow-hidden rounded-act-lg border border-line bg-surface-raised p-1.5 shadow-act-popover";
const MENU_ITEM_CLASS =
  "flex min-h-8 w-full items-center gap-2.5 rounded-act-md border-0 bg-transparent px-2 text-left text-[12px] text-text-main transition-colors hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:text-text-faint disabled:hover:bg-transparent [cursor:pointer] disabled:[cursor:default]";
const MENU_HINT_CLASS = "px-2 py-1 text-[11px] text-text-faint";
const MENU_ERROR_CLASS = "border-t border-line px-2 pt-1.5 text-[11px] leading-relaxed text-danger";

export function OpenInAppMenu({
  workspaceRoot,
  relativePath,
}: {
  workspaceRoot?: string;
  relativePath: string;
}) {
  const [open, setOpen] = useState(false);
  const [tools, setTools] = useState<WorkspaceOpenTool[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferred, setPreferred] = useState<WorkspaceOpenToolId>(readStoredOpenTool);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const available = typeof window !== "undefined" && typeof window.actspace?.openWorkspaceInTool === "function";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      queueMicrotask(() => triggerRef.current?.focus());
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!available) return null;

  const loadTools = async () => {
    const api = window.actspace?.listWorkspaceOpenTools;
    if (!api) return;
    try {
      setTools((await api()).tools);
    } catch {
      // 列不出应用不影响打开动作本身，菜单退化成「只有上次用过的那个」。
      setTools([]);
    }
  };

  const openWith = async (toolId: WorkspaceOpenToolId) => {
    const api = window.actspace?.openWorkspaceInTool;
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api({ workspaceRoot, relativePath, toolId });
      if (!result.ok) {
        setError(result.message ?? "打开失败。");
        return;
      }
      setPreferred(toolId);
      storeOpenTool(toolId);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开失败。");
    } finally {
      setBusy(false);
    }
  };

  const listed: WorkspaceOpenTool[] = tools.length
    ? tools
    : [{ id: preferred, label: OPEN_TOOL_LABELS[preferred], available: true }];

  return (
    <div ref={anchorRef} className="relative flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={TRIGGER_CLASS}
            aria-label="在外部应用中打开"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
              const next = !open;
              setOpen(next);
              setError(null);
              if (next) void loadTools();
            }}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <SquareArrowOutUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>在外部应用中打开</TooltipContent>
      </Tooltip>
      {open ? (
        <div className={MENU_CLASS} role="menu" aria-label="打开方式">
          <div className={MENU_HINT_CLASS}>打开 {relativePath}</div>
          {listed.map((tool) => (
            <button
              key={tool.id}
              type="button"
              role="menuitem"
              className={MENU_ITEM_CLASS}
              disabled={!tool.available || busy}
              onClick={() => void openWith(tool.id)}
            >
              {toolIcon(tool, 15)}
              <span className="min-w-0 flex-1 truncate">{tool.label}</span>
              {!tool.available ? <span className="text-[11px] text-text-faint">未安装</span> : null}
              {tool.id === preferred && tool.available ? (
                <span className="text-[11px] text-text-faint">上次</span>
              ) : null}
            </button>
          ))}
          {error ? <div className={MENU_ERROR_CLASS}>{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
