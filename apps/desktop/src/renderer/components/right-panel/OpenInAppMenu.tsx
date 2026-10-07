/**
 * 右侧面板文件视图的「在外部应用中打开」入口（对齐 Cursor 第二层右侧的 Open 按钮）。
 *
 * - 目标是**当前文件**而不是 workspace 根：main 侧按 `relativePath` 解析并做越界校验。
 * - 不做「点图标直接用上次的应用打开」：这一栏的图标很小，误触会直接拉起外部程序，
 *   所以统一先出菜单，选中后才真正打开（选择会被记住并排在菜单里带勾）。
 * - 无 preload（浏览器 mock）时整个按钮不渲染，而不是渲染一个点了报错的按钮。
 */

import { useState } from "react";
import { Loader2, SquareArrowOutUpRight } from "lucide-react";
import type { WorkspaceOpenTool, WorkspaceOpenToolId } from "@actspace/shared";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "../ui/Menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { OPEN_TOOL_LABELS, readStoredOpenTool, storeOpenTool, toolIcon } from "../workspace/workspaceOpenTool";
import { workspacesApi } from "../../api/workspaces";

const TRIGGER_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const MENU_ERROR_CLASS = "mt-1 border-t border-line px-2 pt-1.5 pb-1 text-act-xxs leading-relaxed text-danger";

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

  const loadTools = async () => {
    const api = workspacesApi.listOpenTools;
    try {
      setTools((await api()).tools);
    } catch {
      // 列不出应用不影响打开动作本身，菜单退化成「只有上次用过的那个」。
      setTools([]);
    }
  };

  const openWith = async (toolId: WorkspaceOpenToolId) => {
    const api = workspacesApi.openInTool;
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
    <Menu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
        if (next) void loadTools();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <MenuTrigger asChild>
            <button type="button" className={TRIGGER_CLASS} aria-label="在外部应用中打开">
              {busy ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <SquareArrowOutUpRight size={14} strokeWidth={1.8} aria-hidden="true" />
              )}
            </button>
          </MenuTrigger>
        </TooltipTrigger>
        <TooltipContent>在外部应用中打开</TooltipContent>
      </Tooltip>
      <MenuContent align="end" className="min-w-[196px] max-w-[320px]">
        <MenuLabel className="truncate">打开 {relativePath}</MenuLabel>
        {listed.map((tool) => (
          <MenuItem
            key={tool.id}
            disabled={!tool.available || busy}
            // 打开失败时菜单留着显示错误，成功后才关。
            onSelect={(event) => {
              event.preventDefault();
              void openWith(tool.id);
            }}
          >
            {toolIcon(tool, 15)}
            <span className="min-w-0 flex-1 truncate">{tool.label}</span>
            {!tool.available ? <span className="text-act-xxs text-text-faint">未安装</span> : null}
            {tool.id === preferred && tool.available ? (
              <span className="text-act-xxs text-text-faint">上次</span>
            ) : null}
          </MenuItem>
        ))}
        {error ? <div className={MENU_ERROR_CLASS} role="alert">{error}</div> : null}
      </MenuContent>
    </Menu>
  );
}
