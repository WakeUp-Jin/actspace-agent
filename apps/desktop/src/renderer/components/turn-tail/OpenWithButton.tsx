import { ChevronDown, ExternalLink, FolderOpen } from "lucide-react";
import { useState } from "react";
import type { WorkspaceFileApplication } from "@actspace/shared";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

/**
 * 交付卡右侧的「用应用打开」分体按钮：左半边用首选应用打开，右半边的下拉列出全部关联应用，最后一项是「显示文件位置」。
 * 移植自 DeepSeek Harness `ui-open-in-app/client/OpenTargetButton.tsx`。
 * 首选应用 = 系统默认，没有默认标记时取列表第一个；一个关联应用都没有时，主按钮改为「显示文件位置」。
 * 只有 macOS 能列出关联应用；其他平台主按钮用系统默认应用打开。
 */

export type OpenWithOperation = { kind: "default" } | { kind: "application"; id: string } | { kind: "reveal" };

const SPLIT_CLASS = "inline-flex h-6 flex-none items-stretch overflow-hidden rounded-act-sm border-[0.5px] border-line-strong";
const HALF_CLASS =
  "inline-flex items-center justify-center border-0 bg-transparent text-act-xxs leading-4 whitespace-nowrap enabled:hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none disabled:cursor-default";

function ApplicationIcon({ source, size = 14 }: { source: string | undefined; size?: number }) {
  const [failed, setFailed] = useState(false);
  return !source || failed
    ? <ExternalLink size={size} aria-hidden="true" />
    : <img src={source} width={size} height={size} className="flex-none object-contain" alt="" draggable={false} onError={() => setFailed(true)} />;
}

export function OpenWithButton({ applications, failed, loading, pending, chooseApplication, onAction, onRefresh }: {
  applications: readonly WorkspaceFileApplication[];
  failed: boolean;
  loading: boolean;
  /** 上一次操作还没返回，两半都暂停点击。 */
  pending: boolean;
  /** 能否列出关联应用（目前只有 macOS）。 */
  chooseApplication: boolean;
  onAction: (operation: OpenWithOperation) => void;
  onRefresh: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const preferred = applications.find((app) => app.default) ?? applications[0];
  const disabled = pending || (chooseApplication && loading);
  const revealDefault = chooseApplication && !preferred && !loading;
  const primaryLabel = !chooseApplication ? "用默认应用打开" : preferred ? `用 ${preferred.name} 打开` : "显示文件位置";

  function primary() {
    if (revealDefault) onAction({ kind: "reveal" });
    // 系统默认标记是尽力而为；没有标记时直接打开按钮上写的那个应用，不让系统再挑一次。
    else if (preferred && !preferred.default) onAction({ kind: "application", id: preferred.id });
    else onAction({ kind: "default" });
  }

  const icon = chooseApplication && loading && !preferred
    ? <span className="inline-block size-[13px] flex-none rounded-act-xs bg-hover-overlay" aria-hidden="true" data-open-with-skeleton />
    : revealDefault
      ? <FolderOpen size={13} aria-hidden="true" />
      : <ApplicationIcon key={preferred?.iconDataUrl} source={preferred?.iconDataUrl} size={13} />;

  return (
    <Menu open={menuOpen && !disabled} onOpenChange={(open) => {
      if (open) onRefresh();
      setMenuOpen(open);
    }}>
      <div className={SPLIT_CLASS} data-open-with data-state={disabled ? "busy" : "idle"}>
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button type="button" className={`${HALF_CLASS} gap-1 px-[5px] py-[3px] text-text-main`} disabled={disabled} aria-label={primaryLabel} onClick={primary}>
              {icon}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{primaryLabel}</TooltipContent>
        </Tooltip>
        <MenuTrigger
          className={`${HALF_CLASS} border-l-[0.5px] border-line-strong py-[3px] pr-1 pl-[3px] text-text-muted`}
          disabled={disabled}
          aria-label="更多打开方式"
        >
          <ChevronDown size={10} aria-hidden="true" />
        </MenuTrigger>
      </div>
      <MenuContent align="end" className="min-w-44">
        {chooseApplication ? applications.map((app) => (
          <MenuItem key={app.id} onSelect={() => onAction({ kind: "application", id: app.id })}>
            <ApplicationIcon key={app.iconDataUrl} source={app.iconDataUrl} />
            <span className="min-w-0 truncate">{app.id === preferred?.id ? `${app.name}（默认）` : app.name}</span>
          </MenuItem>
        )) : (
          <MenuItem onSelect={() => onAction({ kind: "default" })}>
            <ExternalLink size={14} aria-hidden="true" />
            <span>用默认应用打开</span>
          </MenuItem>
        )}
        {failed ? <MenuItem disabled>无法获取应用列表</MenuItem> : null}
        {applications.length > 0 || failed || !chooseApplication ? <MenuSeparator /> : null}
        <MenuItem onSelect={() => onAction({ kind: "reveal" })}>
          <FolderOpen size={14} aria-hidden="true" />
          <span>{revealDefault ? "显示文件位置（默认）" : "显示文件位置"}</span>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
