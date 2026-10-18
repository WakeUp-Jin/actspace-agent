import { useState } from "react";
import { Check, Copy, FileText } from "lucide-react";
import type { ContextPathEntry } from "@actspace/shared";
import { cn } from "../../ui/cn";
import { IconButton } from "../../ui/IconButton";
import { formatPathReadAgo, groupContextPaths, splitContextPath } from "./context-paths-model";
import { ROW_FOCUS_CLASS } from "./ContextPanelParts";

const TAG_CLASS = "shrink-0 whitespace-nowrap rounded-act-xs px-1.5 text-act-xxs leading-[17px]";

/**
 * 「路径」卡片展开后的列表：按目录分组或平铺。点一行展开完整路径和元数据；
 * 复制只写剪贴板，查看和复制都不读文件、不改变活跃 / 睡眠。
 */
export function ContextPathList({ paths, cycle, grouped, workspaceRoot }: {
  paths: readonly ContextPathEntry[];
  cycle: number;
  grouped: boolean;
  workspaceRoot?: string;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) => setOpen(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const row = (path: ContextPathEntry) => (
    <ContextPathRow key={path.id} path={path} cycle={cycle} showDir={!grouped} workspaceRoot={workspaceRoot} open={open.has(path.id)} onToggle={() => toggle(path.id)} />
  );
  if (!grouped) return <ul className="m-0 list-none px-1.5 py-0">{paths.map(row)}</ul>;
  return (
    <div>
      {groupContextPaths(paths, workspaceRoot).map(group => (
        <section key={group.dir} aria-label={group.dir || "根目录"}>
          <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-2 font-mono text-act-xxs text-text-faint">
            <span className="min-w-0 truncate" title={group.dir}>{group.dir || "/"}</span>
            <span className="ml-auto font-sans tabular-nums">{group.paths.length}</span>
          </div>
          <ul className="m-0 list-none px-1.5 py-0">{group.paths.map(row)}</ul>
        </section>
      ))}
    </div>
  );
}

function ContextPathRow({ path, cycle, showDir, workspaceRoot, open, onToggle }: {
  path: ContextPathEntry;
  cycle: number;
  showDir: boolean;
  workspaceRoot?: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { dir, name } = splitContextPath(path.path, workspaceRoot);
  const sleeping = path.visibility === "sleeping";
  const fresh = !sleeping && path.addedCycle === cycle;
  const lastRead = path.lastReadAt ? new Date(path.lastReadAt) : null;
  return (
    <li className={cn("rounded-act-sm", open && "bg-surface-subtle")} data-path-id={path.id}>
      <div className="group flex items-center gap-1 pr-1">
        {/* 整行可点的展开按钮，和「上下文明细」分类行同类，Button 原语不适合整行列表项。 */}
        <button type="button" aria-expanded={open} onClick={onToggle} title={path.path}
          className={cn("flex min-w-0 flex-1 items-center gap-[7px] rounded-act-sm border-0 bg-transparent py-1 pl-2 pr-1 text-left [cursor:pointer] hover:bg-hover-overlay", ROW_FOCUS_CLASS)}>
          <FileText size={13} strokeWidth={2} aria-hidden="true" className="shrink-0 text-text-faint" />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
            <span className={cn("shrink truncate text-act-xs", sleeping ? "text-text-muted" : "text-text-main")}>{name}</span>
            {showDir && dir ? <span className="min-w-0 flex-1 truncate font-mono text-act-xxs text-text-faint">{dir}</span> : null}
            {!showDir && path.description ? <span className="min-w-0 flex-1 truncate text-act-xxs text-text-faint">{path.description}</span> : null}
          </span>
          {fresh ? <span className={cn(TAG_CLASS, "bg-info-soft text-info")} title="本周期新加入">新</span> : null}
          {path.nextCompaction === "wake" ? <span className={cn(TAG_CLASS, "bg-success-soft font-medium text-success")} title="本周期被读取过，下次压缩时会回到活跃">待唤醒</span> : null}
          {path.nextCompaction === "sleep" ? <span className={cn(TAG_CLASS, "border border-line text-text-faint")} title="本周期没被读取，下次压缩时会转为睡眠">将睡眠</span> : null}
          <span className={cn("w-[30px] shrink-0 text-right text-act-xxs tabular-nums", path.readsInCycle ? "text-text-muted" : "text-text-faint")} title="本周期读取次数">
            {path.readsInCycle ? `读 ${path.readsInCycle}` : "—"}
          </span>
          <span className="w-[54px] shrink-0 text-right text-act-xxs tabular-nums text-text-faint" title={lastRead ? `最近读取 ${lastRead.toLocaleString()}` : "从未读取"}>
            {formatPathReadAgo(path.lastReadAt, Date.now())}
          </span>
        </button>
        <CopyPathButton path={path.path} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
      </div>
      {open ? (
        <div className="pb-2.5 pl-7 pr-2.5 pt-0.5">
          <div className="flex items-start gap-1.5 rounded-act-sm border border-line bg-surface px-2 py-1.5">
            <span className="min-w-0 flex-1 select-text break-all font-mono text-act-xxs leading-relaxed text-text-main">{path.path}</span>
            <CopyPathButton path={path.path} />
          </div>
          <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-act-xxs">
            {path.description ? <><dt className="text-text-faint">说明</dt><dd className="m-0 text-text-main">{path.description}</dd></> : null}
            <dt className="text-text-faint">状态</dt>
            <dd className="m-0 text-text-main">{sleeping ? "睡眠 · 只在索引中，模型仍可按需读取" : "活跃 · 导航行在上下文中，不含文件全文"}</dd>
            <dt className="text-text-faint">本周期读取</dt><dd className="m-0 tabular-nums text-text-main">{path.readsInCycle} 次</dd>
            <dt className="text-text-faint">最近读取</dt><dd className="m-0 tabular-nums text-text-main">{lastRead ? lastRead.toLocaleString() : "—"}</dd>
            <dt className="text-text-faint">加入于</dt><dd className="m-0 tabular-nums text-text-main">第 {path.addedCycle} 周期{path.addedCycle === cycle ? "（本周期）" : ""}</dd>
            <dt className="text-text-faint">来源</dt><dd className="m-0 break-all text-text-faint">{path.owners.join("、") || "—"}</dd>
          </dl>
        </div>
      ) : null}
    </li>
  );
}

function CopyPathButton({ path, className }: { path: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <IconButton label={state === "copied" ? "已复制" : state === "failed" ? "复制失败" : "复制完整路径"} size="xs" variant="ghost" className={className} onClick={() => void copy()}>
      {state === "copied" ? <Check size={12} strokeWidth={2} aria-hidden="true" /> : <Copy size={12} strokeWidth={2} aria-hidden="true" />}
    </IconButton>
  );
}
