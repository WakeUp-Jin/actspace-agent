/**
 * KairosContextSheet —— Kairos 监控页"上下文"按钮的内容载体。
 *
 * 设计依据：`docs/design-docs/kairos/front-Kairos监控页规范.md`（v1.4 工具 chip 化）。
 *
 * v1.4 改动（仅工具列表）：
 *   - 工具列表从"两列 grid（name + description）"改为"chip 密排（只展示 name）"——
 *     用户走查认为工具描述对快速扫读没价值，pill 形态更直接传达"模型当前持有的能力清单"。
 *
 * v1.3 信息架构（保持）：
 *   - 系统提示词从"6 张独立卡片"改为"一份连贯文档 + 段头条溯源"——附加诊断信息
 *     （段落溯源）只在段头条出现，不再切割主体阅读流。每段不再做预览/折叠，全文直接展示。
 *
 * 信息架构总览：
 *   - Sheet 标题旁直接显示生成时间，节省纵向空间。
 *   - ① 系统提示词：章节流——每段一个 <article>，顶部细分隔线 + 段头条（短色条 +
 *     段名 + 源文件徽章 / 运行时 pill），下面紧跟段正文（font-sans 全文）。
 *   - ② 会话历史：summary 折叠卡 + 倒序消息；每条消息默认显示 3 行，"展开本条"看全文。
 *   - ③ 工具列表：chip 密排——每个工具一颗 pill（只展示 name），flex-wrap 自然换行。
 *
 * Sheet 关闭即 React 卸载销毁，不缓存到 hook state。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type {
  KairosContextMessage,
  KairosContextPromptSegment,
  KairosContextSnapshot,
  KairosContextTool,
} from "@actspace/shared";
import { Sheet } from "../ui/Sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

export interface KairosContextSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** 异步拉取 snapshot；通常来自 `useKairos().getContextSnapshot`。 */
  load(): Promise<KairosContextSnapshot>;
}

const MESSAGES_FIRST_BATCH = 20;
const MESSAGES_PAGE_SIZE = 20;
const MESSAGE_PREVIEW_LINES = 3;

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function KairosContextSheet(props: KairosContextSheetProps) {
  const { open, onOpenChange, load } = props;
  const [snapshot, setSnapshot] = useState<KairosContextSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!open) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (!cancelled) setSnapshot(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, load, refreshKey]);

  const generatedAt = snapshot ? formatTime(snapshot.generatedAt) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="inline-flex items-baseline gap-2.5">
          <span>上下文</span>
          {generatedAt ? (
            <span className="text-[12px] font-normal tabular-nums text-text-faint">
              {generatedAt}
            </span>
          ) : null}
        </span>
      }
      description="Kairos 当前 tick 会看到的系统提示词、会话历史与工具列表。"
      testId="kairos-context-sheet"
      headerActions={
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={loading ? "正在刷新上下文" : "刷新上下文"}
              aria-disabled={loading}
              onClick={() => {
                if (loading) return;
                refresh();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-act-md border border-line bg-surface text-text-muted transition hover:border-line-strong hover:bg-surface-subtle aria-disabled:cursor-not-allowed aria-disabled:opacity-55"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={15} aria-hidden="true" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>{loading ? "正在刷新上下文" : "刷新上下文"}</TooltipContent>
        </Tooltip>
      }
    >
      <SheetBody snapshot={snapshot} loading={loading} error={error} onRetry={refresh} />
    </Sheet>
  );
}

interface SheetBodyProps {
  snapshot: KairosContextSnapshot | null;
  loading: boolean;
  error: string | null;
  onRetry(): void;
}

function SheetBody({ snapshot, loading, error, onRetry }: SheetBodyProps) {
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-act-md border border-on-danger/30 bg-danger-soft px-4 py-3 text-[13px] text-on-danger">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="m-0 font-medium">无法加载上下文</p>
          <p className="m-0 mt-1 break-words text-[12.5px] leading-[1.6]">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-on-danger/30 bg-surface px-2.5 text-xs text-on-danger hover:border-on-danger/50 hover:bg-danger-soft"
        >
          重试
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return <SkeletonView loading={loading} />;
  }

  return (
    <div className="space-y-7">
      <SystemPromptSection segments={snapshot.systemPromptSegments} fullPrompt={snapshot.systemPrompt} />
      <HistorySection snapshot={snapshot} />
      <ToolsSection tools={snapshot.tools} />
    </div>
  );
}

function SkeletonView({ loading }: { loading: boolean }) {
  return (
    <div className="space-y-5" aria-busy={loading} aria-label="正在加载上下文">
      <div className="h-40 animate-pulse rounded-act-md bg-surface-subtle" />
      <div className="h-32 animate-pulse rounded-act-md bg-surface-subtle" />
      <div className="h-24 animate-pulse rounded-act-md bg-surface-subtle" />
    </div>
  );
}

// ─── ① 系统提示词 ────────────────────────────────────────────────

function SystemPromptSection({
  segments,
  fullPrompt,
}: {
  segments: KairosContextPromptSegment[];
  fullPrompt: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(fullPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败静默；浏览器拒绝复制时按钮自然不切文案。
    }
  };

  return (
    <section aria-labelledby="ksheet-prompt">
      <header className="mb-3 flex items-center gap-2">
        <h3
          id="ksheet-prompt"
          className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-faint"
        >
          系统提示词
        </h3>
        <span className="text-[11px] tabular-nums text-text-faint">
          {segments.length} 段
        </span>
        <div className="ml-auto">
          <button
            type="button"
            onClick={onCopyAll}
            className="inline-flex items-center gap-1.5 rounded-[7px] border border-line bg-surface px-2.5 py-1 text-xs text-text-muted transition hover:border-line-strong hover:bg-surface-subtle"
          >
            <Copy size={12} aria-hidden="true" />
            {copied ? "已复制全文" : "复制全文"}
          </button>
        </div>
      </header>
      <div>
        {segments.map((segment, idx) => (
          <PromptSegmentItem
            key={`${segment.label}-${idx}`}
            segment={segment}
            isFirst={idx === 0}
          />
        ))}
      </div>
    </section>
  );
}

function PromptSegmentItem({
  segment,
  isFirst,
}: {
  segment: KairosContextPromptSegment;
  isFirst: boolean;
}) {
  const trimmed = useMemo(() => segment.text.trim(), [segment.text]);

  return (
    <article
      className={cn(
        // 章节流：除首段外，每段顶部一根 1px 分隔线作为章节边界
        isFirst ? "pt-1 pb-5" : "border-t border-line pt-4 pb-5",
      )}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* 短色条：14px 高、3px 宽，垂直锚定段名；替代 v1.2 的"贯穿全段长色条" */}
        <span
          aria-hidden="true"
          className="inline-block h-[14px] w-[3px] shrink-0 rounded-sm bg-gradient-to-b from-line-strong to-line"
        />
        <span className="text-[14px] font-semibold leading-[1.4] text-text-main">
          {segment.label}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {segment.sourceFiles && segment.sourceFiles.length > 0 ? (
            segment.sourceFiles.map((file) => <SourceFileBadge key={file} file={file} />)
          ) : (
            <span className="inline-flex h-[19px] items-center rounded-full bg-warm-soft px-2 text-[10.5px] font-medium text-on-warm">
              运行时生成
            </span>
          )}
        </div>
      </header>
      <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.75] text-text-main">
        {trimmed}
      </div>
    </article>
  );
}

function SourceFileBadge({ file }: { file: string }) {
  const [copied, setCopied] = useState(false);
  const base = basenameOf(file);

  const onCopy = async (ev: React.MouseEvent) => {
    ev.stopPropagation();
    try {
      await navigator.clipboard.writeText(file);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 静默
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title={`${file}（点击复制完整路径）`}
      className="inline-flex h-5 items-center gap-1 rounded-full border border-line bg-surface-subtle px-2 text-[11px] text-text-muted transition hover:border-line-strong hover:bg-brand-soft"
    >
      <FileText size={10} aria-hidden="true" />
      <span className="font-mono">{base}</span>
      {copied ? <span className="ml-0.5 text-brand-strong">已复制</span> : null}
    </button>
  );
}

// ─── ② 会话历史 ──────────────────────────────────────────────────

function HistorySection({ snapshot }: { snapshot: KairosContextSnapshot }) {
  return (
    <CollapsibleSection id="ksheet-history" title="会话历史 (短期记忆)" defaultOpen={false}>
      <div className="space-y-5">
        <HistorySummaryBlock summary={snapshot.historySummary} />
        <HistoryMessagesBlock messages={snapshot.historyMessages} />
      </div>
    </CollapsibleSection>
  );
}

function HistorySummaryBlock({
  summary,
}: {
  summary: KairosContextSnapshot["historySummary"];
}) {
  if (summary.length === 0) {
    return <EmptyHint text="暂无历史摘要——仍在收集近期 tick 数据中。" />;
  }
  return (
    <div className="space-y-2.5">
      <SubsectionLabel>历史摘要</SubsectionLabel>
      {summary.map((segment) => (
        <details
          key={segment.label}
          className="rounded-act-md border border-line bg-surface-subtle"
        >
          <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-medium text-text-main outline-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1.5">
              <ChevronRight
                size={13}
                aria-hidden="true"
                className="transition-transform [details[open]_&]:rotate-90"
              />
              {segment.label}
            </span>
          </summary>
          <div className="border-t border-line px-3 py-2.5 text-[12.5px] leading-[1.7] text-text-main">
            <pre className="m-0 whitespace-pre-wrap break-words font-mono">{segment.text}</pre>
          </div>
        </details>
      ))}
    </div>
  );
}

function HistoryMessagesBlock({ messages }: { messages: KairosContextMessage[] }) {
  const [visibleCount, setVisibleCount] = useState(MESSAGES_FIRST_BATCH);
  // 时间从新到旧；snapshot.messages 是时间升序，所以反转。
  const ordered = useMemo(() => [...messages].reverse(), [messages]);
  const visible = ordered.slice(0, visibleCount);
  const remaining = ordered.length - visible.length;

  if (messages.length === 0) {
    return <EmptyHint text="短期记忆暂为空——Kairos 还没有 tick 过。" />;
  }

  return (
    <div className="space-y-2.5">
      <SubsectionLabel>最近 messages（按时间倒序，共 {messages.length} 条）</SubsectionLabel>
      <ul className="m-0 list-none space-y-2 p-0">
        {visible.map((msg, idx) => (
          <HistoryMessageRow key={`${msg.timestamp ?? "noTs"}-${idx}`} msg={msg} />
        ))}
      </ul>
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + MESSAGES_PAGE_SIZE)}
          className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-line bg-surface px-2.5 text-xs text-text-muted hover:border-line-strong hover:bg-surface-subtle"
        >
          加载更早 {Math.min(remaining, MESSAGES_PAGE_SIZE)} 条
        </button>
      ) : null}
    </div>
  );
}

function HistoryMessageRow({ msg }: { msg: KairosContextMessage }) {
  const [expanded, setExpanded] = useState(false);
  // 默认 3 行（按 \n 切分；视觉上若一行过长换行不影响——但实测短期记忆里换行通常等于段落）。
  const lines = useMemo(() => msg.content.split(/\r?\n/), [msg.content]);
  const truncated = lines.length > MESSAGE_PREVIEW_LINES;
  const text = expanded || !truncated
    ? msg.content
    : `${lines.slice(0, MESSAGE_PREVIEW_LINES).join("\n").trimEnd()}\n…`;
  return (
    <li className="rounded-act-md border border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-faint">
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
            roleBadgeClass(msg.role),
          )}
        >
          {roleLabel(msg.role)}
        </span>
        {msg.source ? <span className="text-text-faint">{msg.source}</span> : null}
        {msg.timestamp ? <span className="ml-auto tabular-nums">{formatTime(msg.timestamp)}</span> : null}
      </div>
      <pre className="m-0 mt-2 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.7] text-text-main">{text}</pre>
      {truncated ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-brand-strong hover:underline"
        >
          {expanded ? "折叠" : "展开本条"}
        </button>
      ) : null}
    </li>
  );
}

// ─── ③ 工具列表 ──────────────────────────────────────────────────

function ToolsSection({ tools }: { tools: KairosContextTool[] }) {
  if (tools.length === 0) {
    return (
      <section aria-labelledby="ksheet-tools">
        <header className="mb-2 flex items-center gap-2">
          <h3
            id="ksheet-tools"
            className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-faint"
          >
            工具列表
          </h3>
        </header>
        <EmptyHint text="未注册任何工具。" />
      </section>
    );
  }
  return (
    <section aria-labelledby="ksheet-tools">
      <header className="mb-3 flex items-center gap-2">
        <h3
          id="ksheet-tools"
          className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-faint"
        >
          工具列表
        </h3>
        <span className="text-[11px] tabular-nums text-text-faint">{tools.length} 个</span>
      </header>
      {/*
        Chip 密排：每个工具是一颗 pill，flex-wrap 自然换行。
        视觉语言与系统提示词段的 source-file badge 同源（圆角 pill + 浅边框 + 浅底 + mono），
        但 chip 字号略大、颜色更深、不带图标——区分"主信息（工具名）"与"附加信息（源文件）"。
        description 字段在契约里保留但 v1.4 起不再渲染。
      */}
      <ul className="m-0 flex flex-wrap gap-1.5 p-0">
        {tools.map((tool) => (
          <li
            key={tool.name}
            className="inline-flex items-center rounded-full border border-line bg-surface-subtle px-2.5 py-0.5 font-mono text-[12px] leading-[1.7] text-text-main"
          >
            {tool.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── helpers ─────────────────────────────────────────────────────

function CollapsibleSection(props: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  return (
    <section aria-labelledby={props.id}>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5"
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn("text-text-faint transition-transform", !open && "-rotate-90")}
          />
          <span
            id={props.id}
            className="text-[13px] font-semibold uppercase tracking-[0.04em] text-text-faint"
          >
            {props.title}
          </span>
        </button>
        {props.actions ? <div className="ml-auto flex items-center gap-1.5">{props.actions}</div> : null}
      </div>
      {open ? <div>{props.children}</div> : null}
    </section>
  );
}

function SubsectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-medium text-text-faint">{children}</div>;
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-act-md border border-dashed border-line bg-surface-subtle px-3 py-3 text-[12.5px] text-text-faint">
      {text}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function basenameOf(p: string): string {
  const trimmed = p.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function roleLabel(role: KairosContextMessage["role"]): string {
  switch (role) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "tool":
      return "tool";
    case "system":
      return "system";
  }
}

function roleBadgeClass(role: KairosContextMessage["role"]): string {
  switch (role) {
    case "user":
      return "bg-brand-soft text-brand-strong";
    case "assistant":
      return "bg-success-soft text-on-success";
    case "tool":
      return "bg-surface-subtle text-text-muted";
    case "system":
      return "bg-warm-soft text-on-warm";
  }
}
