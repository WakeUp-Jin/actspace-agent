import { Check, ChevronDown, Folder, FolderOpen, FolderPlus, GitBranch, GitFork, Laptop, Server } from "lucide-react";
import { forwardRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent, type ReactNode } from "react";
import type { SessionRunLocation } from "@actspace/shared";
import type { HostConnection } from "@actspace/shared/host-protocol";
import type { HostDescription } from "../../target/host-directory";
import type { ReadinessCopy } from "../../target/readiness";
import type { Capability, RunTarget } from "../../target/run-target";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { RunLocationMenu, RunTargetDot } from "./RunLocationMenu";

export type RunTargetField = "workspace" | "branch" | "runtime";

export type RunTargetWorkspaceOption = { readonly value: string; readonly label: string };

export type RunTargetRowProps = {
  openField: RunTargetField | null;
  onOpenChange: (field: RunTargetField, open: boolean) => void;
  target: RunTarget;
  /** 远端没就绪时的状态点和短文案（`describeReadiness`）；本机或已就绪时为 null。 */
  notReady: ReadinessCopy | null;
  /** Chat 不用工作区和分支：只留运行位置，而且只在远端时显示（本机 Chat 整行不显示，见调用方）。 */
  locationOnly?: boolean;
  hosts: readonly HostConnection[];
  /** 当前远端 Host 的描述；还没读到时为 undefined。 */
  remoteDescription?: HostDescription;
  onSelectHost: (hostId: string | null) => void;
  onSelectRemoteWorkspace: (workspaceId: string) => void;
  onConnectHost: () => void;
  local: {
    workspaces: readonly RunTargetWorkspaceOption[];
    selectedWorkspaceRoot?: string | null;
    workspaceLabel: string;
    onSelectWorkspace?: (workspaceRoot: string) => void;
    onUseExistingWorkspace?: () => void;
    onCreateWorkspaceFolder?: (name: string) => void;
    /** 不显示分支按钮时为空（不是 Git 仓库、没有分支名）。 */
    branchLabel?: string;
    branches: readonly { name: string }[];
    selectedBranch?: string;
    onSelectBranch?: (branch: string) => void;
    runLocation: SessionRunLocation;
    onSelectRunLocation?: (location: SessionRunLocation) => void;
    newWorktree: Capability;
  };
};

const RECENT_WORKSPACE_LIMIT = 5;
const ROW_CLASS = "initial-context-row relative z-20 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-act-md text-text-muted";
const TEXT_BUTTON_CLASS =
  "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-act-sm px-1.5 text-act-md text-text-muted outline-none transition-colors duration-(--motion-fast) hover:bg-hover-overlay hover:text-text-main focus-visible:bg-hover-overlay focus-visible:text-text-main data-[state=open]:bg-hover-overlay data-[state=open]:text-text-main";
const ICON_CLASS = "shrink-0";
const CHEVRON_CLASS = "shrink-0 opacity-70";
const ITEM_ICON_CLASS = "shrink-0 text-text-muted";
const SECOND_LINE_CLASS = "truncate text-act-xxs text-text-faint";
const EMPTY_CLASS = "px-2 py-1.5 text-act-sm text-text-faint";

type TextButtonProps = ComponentPropsWithoutRef<"button"> & { icon: ReactNode; label: string; trailing?: ReactNode };

/**
 * 无边框的文字按钮，作为 MenuTrigger asChild 的子元素（需要转发 ref 和 Radix 给的属性）。
 * 用原生 button：demo 的运行目标行是 14px 常规字重、6px 内边距、展开时保持高亮，Button 的 sm / md 档都不是这个规格。
 */
const TextButton = forwardRef<HTMLButtonElement, TextButtonProps>(({ icon, label, trailing, className, ...props }, ref) => (
  <button ref={ref} type="button" className={cn(TEXT_BUTTON_CLASS, className)} {...props}>
    {icon}
    <span className="min-w-0 truncate">{label}</span>
    {trailing}
    <ChevronDown className={CHEVRON_CLASS} size={12} strokeWidth={2.2} aria-hidden="true" />
  </button>
));
TextButton.displayName = "TextButton";

/**
 * 09 T18：新建页的运行目标行（工作区 ⌄ ／ 分支 ⌄ ／ 运行位置 ⌄）。三个都是文字按钮，菜单用 `ui/Menu`。
 * 远端时不显示分支，工作区列 Host 上的工作区（名称 + 第二行路径）；运行位置按钮写 Host 名，没就绪时带状态点和短文案。
 */
export function RunTargetRow({
  openField, onOpenChange, target, notReady, locationOnly = false, hosts, remoteDescription, onSelectHost, onSelectRemoteWorkspace, onConnectHost, local,
}: RunTargetRowProps) {
  const remote = target.kind === "remote" ? target : null;
  const openProps = (field: RunTargetField) => ({ open: openField === field, onOpenChange: (open: boolean) => onOpenChange(field, open) });
  return (
    <div className={ROW_CLASS} aria-label="初始工作区与运行位置选择">
      {locationOnly ? null : remote ? (
        <RemoteWorkspaceMenu {...openProps("workspace")} target={remote} description={remoteDescription} onSelect={onSelectRemoteWorkspace} />
      ) : (
        <LocalWorkspaceMenu {...openProps("workspace")} local={local} />
      )}
      {!locationOnly && !remote && local.branchLabel ? (
        <Menu {...openProps("branch")}>
          <MenuTrigger asChild>
            <TextButton aria-label="选择分支" icon={<GitBranch className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />} label={local.branchLabel} />
          </MenuTrigger>
          <MenuContent className="max-h-[320px] w-[300px]">
            <MenuLabel>分支</MenuLabel>
            {local.branches.map((branch) => (
              <MenuItem key={branch.name} role="menuitemradio" aria-checked={branch.name === local.selectedBranch} onSelect={() => local.onSelectBranch?.(branch.name)}>
                <GitBranch className={ITEM_ICON_CLASS} size={14} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {branch.name === local.selectedBranch ? <Check className="shrink-0" size={14} aria-hidden="true" /> : null}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
      <RunLocationMenu
        {...openProps("runtime")}
        target={target}
        runLocation={local.runLocation}
        hosts={hosts}
        newWorktree={local.newWorktree}
        branch={local.selectedBranch}
        onSelectLocal={() => {
          onSelectHost(null);
          local.onSelectRunLocation?.("this_mac");
        }}
        onSelectWorktree={() => local.onSelectRunLocation?.("worktree")}
        onSelectHost={onSelectHost}
        onConnectHost={onConnectHost}
      >
        <TextButton
          aria-label="选择运行位置"
          icon={remote
            ? <Server className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
            : local.runLocation === "worktree"
              ? <GitFork className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
              : <Laptop className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />}
          label={remote ? remote.hostName || "远端机器" : local.runLocation === "worktree" ? "新建工作树" : "本机"}
          trailing={notReady?.tone && notReady.label ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-act-xs text-text-faint">
              <RunTargetDot tone={notReady.tone} />
              {notReady.label}
            </span>
          ) : null}
        />
      </RunLocationMenu>
    </div>
  );
}

function LocalWorkspaceMenu({ open, onOpenChange, local }: { open: boolean; onOpenChange: (open: boolean) => void; local: RunTargetRowProps["local"] }) {
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState("");
  const recent = local.workspaces.slice(0, RECENT_WORKSPACE_LIMIT);

  function changeOpen(next: boolean) {
    if (!next) {
      setCreating(false);
      setFolderName("");
    }
    onOpenChange(next);
  }

  function onNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 输入框里的按键不交给菜单（首字母跳转、↑↓ 移动、空格选中）；Esc 和 Tab 照常。
    if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
  }

  return (
    <Menu open={open} onOpenChange={changeOpen}>
      <MenuTrigger asChild>
        <TextButton aria-label="选择工作区" icon={<Folder className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />} label={local.workspaceLabel} />
      </MenuTrigger>
      <MenuContent className="w-[260px]">
        <MenuLabel>最近使用</MenuLabel>
        {recent.map((workspace) => {
          const selected = workspace.value === local.selectedWorkspaceRoot;
          return (
            <MenuItem key={workspace.value} role="menuitemradio" aria-checked={selected} textValue={workspace.label} className="py-1" onSelect={() => local.onSelectWorkspace?.(workspace.value)}>
              <Folder className={ITEM_ICON_CLASS} size={14} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate">{workspace.label}</span>
                <span className={SECOND_LINE_CLASS}>{workspace.value}</span>
              </span>
              {selected ? <Check className="shrink-0" size={14} aria-hidden="true" /> : null}
            </MenuItem>
          );
        })}
        <MenuSeparator />
        <MenuItem onSelect={() => local.onUseExistingWorkspace?.()}>
          <FolderOpen className={ITEM_ICON_CLASS} size={14} aria-hidden="true" />
          <span>使用已有文件夹…</span>
        </MenuItem>
        {creating ? (
          <form
            className="flex items-center gap-1.5 px-1 py-1"
            onSubmit={(event) => {
              event.preventDefault();
              const name = folderName.trim();
              if (!name) return;
              local.onCreateWorkspaceFolder?.(name);
              changeOpen(false);
            }}
          >
            <input
              className="h-7 min-w-0 flex-1 rounded-act-sm border border-line bg-surface px-2 text-act-sm text-text-main outline-none placeholder:text-text-faint focus:border-line-strong"
              aria-label="新文件夹名称"
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={onNameKeyDown}
              placeholder="文件夹名称"
            />
            <Button variant="ghost" size="sm" type="submit">
              创建
            </Button>
          </form>
        ) : (
          <MenuItem
            onSelect={(event) => {
              // 留在菜单里，把这一项换成输入框。
              event.preventDefault();
              setCreating(true);
            }}
          >
            <FolderPlus className={ITEM_ICON_CLASS} size={14} aria-hidden="true" />
            <span>新建文件夹</span>
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

function RemoteWorkspaceMenu({ open, onOpenChange, target, description, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: Extract<RunTarget, { kind: "remote" }>;
  description?: HostDescription;
  onSelect: (workspaceId: string) => void;
}) {
  const label = target.workspaceName ?? (description ? "选择工作区" : "等待 Host 工作区");
  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuTrigger asChild>
        <TextButton aria-label="选择工作区" icon={<Folder className={ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />} label={label} />
      </MenuTrigger>
      <MenuContent className="w-[280px]">
        <MenuLabel>{`${target.hostName || "远端机器"} 上的工作区`}</MenuLabel>
        {!description ? <div className={EMPTY_CLASS}>等待 Host 工作区</div> : null}
        {description && description.workspaces.length === 0 ? <div className={EMPTY_CLASS}>这台机器上还没有工作区</div> : null}
        {description?.workspaces.map((workspace) => {
          const selected = workspace.id === target.workspaceId;
          return (
            <MenuItem key={workspace.id} role="menuitemradio" aria-checked={selected} textValue={workspace.name} className="py-1" onSelect={() => onSelect(workspace.id)}>
              <Folder className={ITEM_ICON_CLASS} size={14} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate">{workspace.name}</span>
                <span className={SECOND_LINE_CLASS}>{workspace.path}</span>
              </span>
              {selected ? <Check className="shrink-0" size={14} aria-hidden="true" /> : null}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}
