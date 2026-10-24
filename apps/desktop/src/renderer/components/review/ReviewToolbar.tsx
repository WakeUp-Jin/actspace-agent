import { useState, type RefObject } from "react";
import { ArrowRightFromLine, ChevronDown, Clipboard, Columns2, Eye, File, FileDiff, Folder, GitPullRequestArrow, Image, ListCollapse, ListTree, MoreHorizontal, RefreshCw, Search } from "lucide-react";
import type { ReviewFileSummary, ReviewSelection, ReviewSnapshot } from "@actspace/shared";
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import type { ReviewDiffMode } from "./review-store";
import { ReviewScopeMenu } from "./ReviewScopeMenu";

const ICON = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-muted hover:bg-surface-subtle hover:text-text-main disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 [cursor:pointer]";
const ICON_SLOT = "inline-flex h-4 w-4 shrink-0 items-center justify-center";

type ToolbarMenu = "scope" | "options" | "jump" | "git";

export function ReviewToolbar({ snapshot, selection, workspaceRoot, sessionId, files, filesVisible, diffMode, splitAvailable, singleFileMode, wrap, ignoreWhitespaceChanges, wordDiff, loadFullFiles, richPreview, allExpanded, onSelectScope, onRefresh, onToggleAll, onJump, onDiffMode, onToggleFiles, onWrap, onWhitespace, onWordDiff, onLoadFullFiles, onRichPreview, onCopyApply, onCommitOrPush, onCreatePr, gitTriggerRef }: {
  snapshot: ReviewSnapshot | null;
  selection: ReviewSelection;
  workspaceRoot?: string;
  sessionId?: string | null;
  files: ReviewFileSummary[];
  filesVisible: boolean;
  diffMode: ReviewDiffMode;
  splitAvailable: boolean;
  singleFileMode: boolean;
  wrap: boolean;
  ignoreWhitespaceChanges: boolean;
  wordDiff: boolean;
  loadFullFiles: boolean;
  richPreview: boolean;
  allExpanded: boolean;
  onSelectScope: (selection: ReviewSelection) => void;
  onRefresh: () => void;
  onToggleAll: (expanded: boolean) => void;
  onJump: (fileId: string) => void;
  onDiffMode: (mode: ReviewDiffMode) => void;
  onToggleFiles: () => void;
  onWrap: () => void;
  onWhitespace: () => void;
  onWordDiff: () => void;
  onLoadFullFiles: () => void;
  onRichPreview: () => void;
  onCopyApply: () => void;
  onCommitOrPush: () => void;
  onCreatePr: () => void;
  /** 「提交或推送」按钮。弹出的对话框关闭后焦点回到它，因为打开对话框的菜单项已经不在了。 */
  gitTriggerRef: RefObject<HTMLButtonElement>;
}) {
  const [menu, setMenu] = useState<ToolbarMenu | null>(null);
  const [jumpQuery, setJumpQuery] = useState("");
  // 每个弹层只管自己：点另一个弹层的按钮时，新弹层先打开，旧弹层随后关闭，不能把新的一起关掉。
  const openChange = (name: ToolbarMenu) => (open: boolean) => setMenu((current) => (open ? name : current === name ? null : current));
  const scopeLabel = selection.kind === "lastTurn" ? "最近一轮" : selection.kind === "uncommitted" ? "未提交" : selection.kind === "unstaged" ? "未暂存" : selection.kind === "staged" ? "已暂存" : selection.kind === "commit" ? "已提交" : "分支";
  const jumpFiles = files.filter((file) => file.path.toLocaleLowerCase().includes(jumpQuery.toLocaleLowerCase())).slice(0, 12);
  const hasFiles = files.length > 0;
  const fileActionHint = hasFiles ? null : "当前审查范围内没有变更文件";
  const splitHint = !hasFiles ? fileActionHint : !splitAvailable ? "加宽审查面板后可使用并排差异" : diffMode === "split" ? "切换为单栏差异" : "切换为并排差异";
  return (
    <div className="relative z-20 shrink-0 border-b border-line bg-surface-raised [pointer-events:auto] [-webkit-app-region:no-drag]" aria-label="审查工具栏">
      <div
        className="flex min-h-11 min-w-0 items-center gap-1 overflow-x-auto px-2.5 scrollbar-none"
        data-review-toolbar-scroll
        onFocusCapture={(event) => {
          const scroll = event.currentTarget;
          const target = event.target;
          // Portal 菜单的 React 焦点事件也会冒泡到这里，不能滚动背景工具栏。
          if (!(target instanceof HTMLElement) || !scroll.contains(target) || scroll.scrollWidth <= scroll.clientWidth) return;
          const left = scroll.getBoundingClientRect().left + scroll.clientLeft;
          const right = left + scroll.clientWidth;
          const bounds = target.getBoundingClientRect();
          // 为 base.css 的 3px focus-visible 轮廓保留空间，只移动本容器。
          const delta = bounds.left - 3 < left ? bounds.left - 3 - left : Math.max(0, bounds.right + 3 - right);
          // Chromium 会按设备像素舍入 scrollLeft，向显露方向取整以免再次裁掉轮廓。
          const next = delta < 0 ? Math.floor(scroll.scrollLeft + delta) : Math.ceil(scroll.scrollLeft + delta);
          if (delta) scroll.scrollLeft = Math.max(0, Math.min(scroll.scrollWidth - scroll.clientWidth, next));
        }}
      >
        <div className="shrink-0">
          <Popover open={menu === "scope"} onOpenChange={openChange("scope")}>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex h-8 min-w-[76px] max-w-[140px] items-center gap-1 whitespace-nowrap rounded-act-sm px-1.5 text-act-sm font-medium text-text-main hover:bg-surface-subtle" aria-label="审查范围">
                <span className="truncate">{scopeLabel}</span><ChevronDown size={13} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(360px,calc(100vw-16px))]">
              <ReviewScopeMenu selection={selection} sessionId={sessionId} workspaceRoot={workspaceRoot} onSelect={(next) => { onSelectScope(next); setMenu(null); }} />
            </PopoverContent>
          </Popover>
        </div>
        {snapshot && (snapshot.totals.additions > 0 || snapshot.totals.deletions > 0) ? <div className="flex shrink-0 gap-1 text-act-xs tabular-nums">{snapshot.totals.additions > 0 ? <span className="text-success">+{snapshot.totals.additions}</span> : null}{snapshot.totals.deletions > 0 ? <span className="text-danger">-{snapshot.totals.deletions}</span> : null}</div> : null}
        <div className="min-w-2 flex-1" />
        <div className="shrink-0">
          <Menu open={menu === "options"} onOpenChange={openChange("options")}>
            <Tooltip><TooltipTrigger asChild><MenuTrigger asChild><button type="button" className={ICON} aria-label="审查选项"><MoreHorizontal size={15} /></button></MenuTrigger></TooltipTrigger><TooltipContent>审查选项</TooltipContent></Tooltip>
            <MenuContent align="end" className="w-[220px]">
              <MenuItem onSelect={onRefresh}><span className={ICON_SLOT}><RefreshCw size={13} /></span>刷新</MenuItem>
              {/* 显示设置切换后菜单不关，方便连着改几项。 */}
              <Option checked={wrap} label="自动换行" icon={<ArrowRightFromLine size={13} />} onToggle={onWrap} />
              <MenuItem onSelect={(event) => { event.preventDefault(); onLoadFullFiles(); }}><span className={ICON_SLOT}><File size={13} /></span>{loadFullFiles ? "不加载完整文件" : "加载完整文件"}</MenuItem>
              <Option checked={richPreview} label="启用富预览" icon={<Image size={13} />} onToggle={onRichPreview} />
              <Option checked={wordDiff} label="显示词级差异" icon={<FileDiff size={13} />} onToggle={onWordDiff} />
              <Option checked={!ignoreWhitespaceChanges} label={ignoreWhitespaceChanges ? "显示空白差异" : "隐藏空白差异"} icon={<Eye size={13} />} onToggle={onWhitespace} />
              <MenuSeparator />
              <MenuItem disabled={!snapshot} onSelect={onCopyApply}><span className={ICON_SLOT}><Clipboard size={13} /></span>复制 git apply 命令</MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <Tooltip><TooltipTrigger asChild><button type="button" className={ICON} aria-label={allExpanded ? (singleFileMode ? "收起当前差异" : "收起全部差异") : (singleFileMode ? "展开当前差异" : "展开全部差异")} aria-disabled={!hasFiles} onClick={() => { if (hasFiles) onToggleAll(!allExpanded); }}>{allExpanded ? <ListCollapse size={15} /> : <ListTree size={15} />}</button></TooltipTrigger><TooltipContent>{fileActionHint ?? (allExpanded ? (singleFileMode ? "收起当前差异" : "收起全部差异") : (singleFileMode ? "展开当前差异" : "展开全部差异"))}</TooltipContent></Tooltip>
        <div className="shrink-0">
          <Popover open={menu === "jump"} onOpenChange={openChange("jump")}>
            <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><button type="button" className={ICON} aria-label="跳转到文件" aria-disabled={!hasFiles} onClick={(event) => { if (!hasFiles) event.preventDefault(); }}><Search size={15} /></button></PopoverTrigger></TooltipTrigger><TooltipContent>{fileActionHint ?? "跳转到文件"}</TooltipContent></Tooltip>
            <PopoverContent align="end" className="w-[min(320px,calc(100vw-32px))] p-2">
              <input className="h-8 w-full rounded-act-sm border border-line bg-surface px-2 text-act-xs text-text-main outline-none focus:border-focus-ring" value={jumpQuery} onChange={(event) => setJumpQuery(event.target.value)} placeholder="跳转到文件…" />
              <div className="mt-1 max-h-[280px] overflow-auto">{jumpFiles.map((file) => <button key={file.id} type="button" className="flex min-h-8 w-full items-center rounded-act-sm px-2 text-left font-mono text-act-xxs text-text-main hover:bg-surface-subtle" onClick={() => { onJump(file.id); setMenu(null); }}>{file.path}</button>)}</div>
            </PopoverContent>
          </Popover>
        </div>
        <Tooltip><TooltipTrigger asChild><button type="button" className={`${ICON} ${diffMode === "split" ? "bg-selected text-text-main" : ""}`} aria-label={diffMode === "split" ? "切换为单栏差异" : "切换为并排差异"} aria-pressed={diffMode === "split"} aria-disabled={!hasFiles || !splitAvailable} onClick={() => { if (hasFiles && splitAvailable) onDiffMode(diffMode === "split" ? "unified" : "split"); }}><Columns2 size={15} /></button></TooltipTrigger><TooltipContent>{splitHint}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><button type="button" className={`${ICON} ${filesVisible ? "bg-selected text-text-main" : ""}`} aria-label={filesVisible ? "隐藏文件列表" : "显示文件列表"} aria-pressed={filesVisible} aria-disabled={!hasFiles} onClick={() => { if (hasFiles) onToggleFiles(); }}><Folder size={15} /></button></TooltipTrigger><TooltipContent>{fileActionHint ?? (filesVisible ? "隐藏文件列表" : "显示文件列表")}</TooltipContent></Tooltip>
        <div className="shrink-0">
          <Menu open={menu === "git"} onOpenChange={openChange("git")}>
            <MenuTrigger asChild>
              <button ref={gitTriggerRef} type="button" className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-act-sm border border-line bg-surface px-2 text-act-xs font-medium text-text-main hover:bg-surface-subtle"><GitPullRequestArrow size={14} />提交或推送<ChevronDown size={12} /></button>
            </MenuTrigger>
            <MenuContent align="end" className="w-[190px]">
              <MenuItem onSelect={onCommitOrPush}>提交或推送</MenuItem>
              <MenuItem onSelect={onCreatePr}>创建 PR</MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
      {snapshot?.comparison ? <div className="flex min-h-7 items-center gap-2 border-t border-line/70 px-3 text-act-xxs text-text-faint"><span className="truncate">{snapshot.comparison.from}</span><span>→</span><span className="truncate">{snapshot.comparison.to}</span></div> : null}
    </div>
  );
}

function Option({ checked, label, icon, onToggle }: { checked: boolean; label: string; icon: React.ReactNode; onToggle: () => void }) {
  return (
    <MenuCheckboxItem checked={checked} onCheckedChange={onToggle} onSelect={(event) => event.preventDefault()}>
      <span className={ICON_SLOT}>{icon}</span>
      <span className="flex-1">{label}</span>
    </MenuCheckboxItem>
  );
}
