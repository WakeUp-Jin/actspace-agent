import { Check, GitFork, Laptop, Plug, Plus, Server } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { SessionRunLocation } from "@actspace/shared";
import type { HostConnection, HostConnectionState } from "@actspace/shared/host-protocol";
import { describeReadiness, type ReadinessTone } from "../../target/readiness";
import type { Capability, RunTarget } from "../../target/run-target";
import { cn } from "../ui/cn";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "../ui/Menu";

/** Host 达到这个数量时，远端机器子菜单顶部显示搜索。 */
export const HOST_SEARCH_THRESHOLD = 5;

export type RunTargetDotTone = "connected" | ReadinessTone;

const DOT_CLASS: Record<RunTargetDotTone, string> = {
  connected: "bg-operational",
  pending: "bg-warning animate-pulse motion-reduce:animate-none",
  offline: "border-[1.5px] border-text-subtle",
  error: "bg-danger",
};

/** 运行目标的状态点：运行位置菜单的 Host 行、新建页的运行位置按钮、对话中的状态行共用。 */
export function RunTargetDot({ tone, className }: { tone: RunTargetDotTone; className?: string }) {
  return <span aria-hidden="true" data-tone={tone} className={cn("inline-block size-[7px] shrink-0 rounded-full", DOT_CLASS[tone], className)} />;
}

export function hostStateTone(state: HostConnectionState): RunTargetDotTone {
  return state === "connected" ? "connected" : describeReadiness({ state }, "").tone ?? "error";
}

/** Host 行右侧的状态文字；connected 时不显示。 */
export function hostStateLabel(state: HostConnectionState): string | null {
  return state === "connected" ? null : describeReadiness({ state }, "").label;
}

export type RunLocationMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 触发按钮，经 MenuTrigger asChild 挂上。 */
  children: ReactElement;
  target: RunTarget;
  /** 本机时是原地运行还是新建工作树。 */
  runLocation: SessionRunLocation;
  hosts: readonly HostConnection[];
  newWorktree: Capability;
  /** 新建工作树的起点分支，用在说明「从 {branch} 创建隔离分支」。 */
  branch?: string;
  onSelectLocal: () => void;
  onSelectWorktree: () => void;
  onSelectHost: (hostId: string) => void;
  /** 打开 设置 › Agent 服务器。 */
  onConnectHost: () => void;
};

const ICON_CLASS = "shrink-0 text-text-muted";
const END_CLASS = "ml-auto flex shrink-0 items-center gap-1.5 pl-3 text-act-xs text-text-faint";
const SECOND_LINE_CLASS = "truncate text-act-xxs text-text-faint";

/**
 * 09 T17：新建页的运行位置菜单。本机 ／ 远端机器 › ／ 新建工作树；没有配置 Host 时第二项是「连接远端机器…」。
 * 不可用的 Host 也能选中：草稿照常编辑，发送按 readiness 禁用并说明原因。
 */
export function RunLocationMenu({
  open, onOpenChange, children, target, runLocation, hosts, newWorktree, branch, onSelectLocal, onSelectWorktree, onSelectHost, onConnectHost,
}: RunLocationMenuProps) {
  const isLocal = target.kind === "local";
  const remoteHostId = target.kind === "remote" ? target.hostId : null;
  const remoteName = target.kind === "remote" ? target.hostName : "";
  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuTrigger asChild>{children}</MenuTrigger>
      <MenuContent className="w-[240px]">
        <MenuItem role="menuitemradio" aria-checked={isLocal && runLocation === "this_mac"} onSelect={onSelectLocal}>
          <Laptop className={ICON_CLASS} size={15} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">本机</span>
          {isLocal && runLocation === "this_mac" ? <Check className="shrink-0" size={14} aria-hidden="true" /> : null}
        </MenuItem>
        {hosts.length > 0 ? (
          <MenuSub>
            <MenuSubTrigger>
              <Server className={ICON_CLASS} size={15} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">远端机器</span>
              {remoteName ? <span className="max-w-[96px] shrink-0 truncate text-act-xs text-text-faint">{remoteName}</span> : null}
            </MenuSubTrigger>
            {/* 窄窗口两侧都放不下 260px 时，按 Radix 算出的可用宽度收窄（shift 只沿纵向挪，横向不会把子菜单推回视口）。 */}
            <MenuSubContent className="w-[min(260px,var(--radix-dropdown-menu-content-available-width))]">
              <HostList hosts={hosts} selectedHostId={remoteHostId} onSelectHost={onSelectHost} onConnectHost={onConnectHost} />
            </MenuSubContent>
          </MenuSub>
        ) : (
          <MenuItem onSelect={onConnectHost}>
            <Plug className={ICON_CLASS} size={15} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">连接远端机器…</span>
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem
          role="menuitemradio"
          aria-checked={isLocal && runLocation === "worktree"}
          disabled={!newWorktree.enabled}
          className="py-1"
          onSelect={onSelectWorktree}
        >
          <GitFork className={ICON_CLASS} size={15} aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate">新建工作树</span>
            <span className={SECOND_LINE_CLASS}>{newWorktree.enabled ? (branch ? `从 ${branch} 创建隔离分支` : "创建隔离分支") : newWorktree.reason}</span>
          </span>
          {isLocal && runLocation === "worktree" ? <Check className="shrink-0" size={14} aria-hidden="true" /> : null}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function HostList({ hosts, selectedHostId, onSelectHost, onConnectHost }: {
  hosts: readonly HostConnection[];
  selectedHostId: string | null;
  onSelectHost: (hostId: string) => void;
  onConnectHost: () => void;
}) {
  const searchable = hosts.length >= HOST_SEARCH_THRESHOLD;
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  // 子菜单挂载后 Radix 会把焦点放到菜单本身（键盘打开时），晚一拍再交给搜索框。
  useEffect(() => {
    if (!searchable) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [searchable]);
  const needle = query.trim().toLowerCase();
  const visible = needle ? hosts.filter((host) => host.name.toLowerCase().includes(needle) || host.hostId.toLowerCase().includes(needle)) : hosts;

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" || event.key === "Tab") return;
    // 其余按键只给搜索框：不触发菜单的首字母跳转，← 也只移动光标。
    event.stopPropagation();
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    event.currentTarget.closest("[role=menu]")?.querySelector<HTMLElement>("[role^=menuitem]:not([data-disabled])")?.focus();
  }

  return (
    <>
      {searchable ? (
        <div className="px-1 pb-1">
          <input
            ref={searchRef}
            className="h-7 w-full rounded-act-sm border border-line bg-surface px-2 text-act-sm text-text-main outline-none placeholder:text-text-faint focus:border-line-strong"
            placeholder="搜索机器"
            aria-label="搜索机器"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </div>
      ) : null}
      {visible.map((host) => {
        const label = hostStateLabel(host.state);
        const selected = host.hostId === selectedHostId;
        return (
          <MenuItem key={host.hostId} role="menuitemradio" aria-checked={selected} textValue={host.name} onSelect={() => onSelectHost(host.hostId)}>
            <RunTargetDot tone={hostStateTone(host.state)} />
            <span className="min-w-0 flex-1 truncate">{host.name}</span>
            {label || selected ? (
              <span className={END_CLASS}>
                {label}
                {selected ? <Check className="text-text-main" size={14} aria-hidden="true" /> : null}
              </span>
            ) : null}
          </MenuItem>
        );
      })}
      {visible.length === 0 ? <div className="px-2 py-1.5 text-act-sm text-text-faint">没有匹配的机器</div> : null}
      <MenuSeparator />
      <MenuItem onSelect={onConnectHost}>
        <Plus className={ICON_CLASS} size={15} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">连接新机器…</span>
      </MenuItem>
    </>
  );
}
