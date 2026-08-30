import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  CONTEXT_BUCKET_REGISTRY,
  getContextBucketDisplay,
  type ContextState,
  type ContextStateEntry,
} from "@actspace/shared";

/**
 * 右侧面板 Context 完整只读视图（见 `front-右侧面板与文件渲染规范.md`）。
 *
 * 数据来源（方案 B）：持久化快照只存 token 统计；逐条全文明细在打开视图时由 main 进程
 * `context:describe` 现场重算（不调用 LLM）。本组件优先用现算结果渲染逐条 entry，
 * describe 未回来 / 失败时退回持久化快照（仅显示 token 统计、空内容）。
 *
 * - 分区按 `CONTEXT_BUCKET_REGISTRY` 顺序固定列出；即便某类上下文为空也保留分区（默认折叠）。
 * - 分区标题左侧一条同色竖线联动 Context 弹窗的 `--act-context-*`。
 * - 每条内容默认夹 3 行（4-B），过长给「展开/收起」看全文；白底卡片、不整行染色。
 * - Conversation 默认折叠、展开最多 20 条；提供 .md/.json 导出（renderer Blob）。
 * - 只读：不增删改、不 pin。
 */

const CONVERSATION_VISIBLE_CAP = 20;
/** 预览超过该长度或行数时，提供「展开/收起」切换全文（4-B 前端展开）。 */
const ENTRY_EXPAND_CHAR_THRESHOLD = 160;
const ENTRY_EXPAND_LINE_THRESHOLD = 3;

/** entry.kind → bucket key（注册表里工具的 key 是 tools，entry 里是 toolDefinitions）。 */
const KIND_TO_BUCKET: Record<ContextStateEntry["kind"], string> = {
  systemPrompt: "systemPrompt",
  toolDefinitions: "tools",
  rules: "rules",
  skills: "skills",
  summarizedConversation: "summarizedConversation",
  conversation: "conversation",
};

const TOOLBAR_CLASS = "flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2";
const TITLE_CLASS = "text-[13px] font-semibold text-text-main";
const EXPORT_BUTTON_CLASS =
  "rounded-act-sm border border-line bg-surface-subtle px-2 py-0.5 text-[11px] text-text-muted hover:text-text-main hover:border-line-strong [cursor:pointer]";
const BODY_CLASS = "min-h-0 flex-1 overflow-auto p-3";
const SECTION_CLASS = "mb-3";
const SECTION_HEADER_CLASS =
  "flex w-full items-center gap-2 border-0 bg-transparent px-0 py-1 text-left [cursor:pointer]";
const SECTION_BAR_CLASS = "h-[14px] w-[3px] shrink-0 rounded-full";
const SECTION_LABEL_CLASS = "text-[12px] font-semibold text-text-main";
const SECTION_META_CLASS = "ml-auto flex items-center gap-1.5 text-[11px] tabular-nums text-text-faint";
const ENTRY_LIST_CLASS = "mt-1.5 grid gap-1.5";
const ENTRY_CLASS = "rounded-act-sm border border-line bg-surface px-2.5 py-2";
const ENTRY_HEAD_CLASS = "flex items-baseline justify-between gap-2";
const ENTRY_TITLE_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium text-text-main";
const ENTRY_TOKENS_CLASS = "shrink-0 text-[11px] tabular-nums text-text-faint";
const ENTRY_PREVIEW_FULL_CLASS = "whitespace-pre-wrap break-words text-[12px] leading-[1.6] text-text-muted";
const ENTRY_PREVIEW_CLAMP_CLASS = "line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-[1.55] text-text-muted";
const ENTRY_TOGGLE_CLASS =
  "mt-1 inline-flex items-center border-0 bg-transparent p-0 text-[11px] text-info hover:text-info-hover hover:underline [cursor:pointer]";
const ENTRY_EMPTY_CLASS = "text-[12px] italic text-text-faint";
const EMPTY_CLASS = "p-[18px] text-[13px] text-text-muted";
const CAP_NOTE_CLASS = "px-1 pt-1 text-[11px] text-text-faint";

type Section = {
  bucketKey: string;
  label: string;
  colorVar: string;
  entries: ContextStateEntry[];
  totalTokens: number;
};

/**
 * 按注册表顺序构建分区。
 *
 * 分区来源 = 注册表 ∪ 出现过的 entry/桶 key，保证空桶也保留（折叠展示）。
 * 分区 token 优先取 snapshot.buckets（与 Context 弹窗权威一致），缺省退回逐条求和。
 */
function buildSections(state: ContextState | null): Section[] {
  const entriesByBucket = new Map<string, ContextStateEntry[]>();
  for (const entry of state?.entries ?? []) {
    const bucketKey = KIND_TO_BUCKET[entry.kind] ?? entry.kind;
    const list = entriesByBucket.get(bucketKey);
    if (list) {
      list.push(entry);
    } else {
      entriesByBucket.set(bucketKey, [entry]);
    }
  }

  const tokensByBucket = new Map<string, number>();
  for (const bucket of state?.buckets ?? []) {
    const key = bucket.key ?? bucket.name;
    if (key) tokensByBucket.set(key, bucket.tokens);
  }

  const sections: Section[] = [];
  const seen = new Set<string>();
  const pushSection = (bucketKey: string) => {
    if (seen.has(bucketKey)) return;
    seen.add(bucketKey);
    const entries = entriesByBucket.get(bucketKey) ?? [];
    const display = getContextBucketDisplay(bucketKey);
    const totalTokens =
      tokensByBucket.get(bucketKey) ?? entries.reduce((sum, entry) => sum + (entry.estimatedTokens ?? 0), 0);
    sections.push({ bucketKey, label: display.label, colorVar: display.colorVar, entries, totalTokens });
  };

  for (const bucket of CONTEXT_BUCKET_REGISTRY) {
    pushSection(bucket.key);
  }
  // 注册表里没有的桶（未来 MCP / subagents 等）兜底排末尾。
  for (const bucketKey of entriesByBucket.keys()) pushSection(bucketKey);
  for (const bucketKey of tokensByBucket.keys()) pushSection(bucketKey);
  return sections;
}

function isExpandable(preview: string): boolean {
  return preview.length > ENTRY_EXPAND_CHAR_THRESHOLD || preview.split("\n").length > ENTRY_EXPAND_LINE_THRESHOLD;
}

function contextToMarkdown(state: ContextState): string {
  const lines: string[] = [`# Context（${state.sessionId}）`, "", `更新于：${state.updatedAt}`, ""];
  for (const section of buildSections(state)) {
    lines.push(`## ${section.label}（${section.entries.length} 条 · ~${section.totalTokens} tokens）`, "");
    for (const entry of section.entries) {
      lines.push(`- **${entry.title}** · ~${entry.estimatedTokens} tokens`);
      if (entry.preview) {
        lines.push(`  > ${entry.preview.replace(/\n/g, "\n  > ")}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ContextEntryItem({ entry, sectionLabel }: { entry: ContextStateEntry; sectionLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  // 单条汇总型 bucket（title 与分区名相同）不重复标题，直接给内容更省版面。
  const showTitle = entry.title !== sectionLabel;
  const preview = entry.preview;
  const expandable = !!preview && isExpandable(preview);

  return (
    <div className={ENTRY_CLASS}>
      {showTitle ? (
        <div className={ENTRY_HEAD_CLASS}>
          <span className={ENTRY_TITLE_CLASS} title={entry.title}>
            {entry.title}
          </span>
          <span className={ENTRY_TOKENS_CLASS}>~{entry.estimatedTokens.toLocaleString()}</span>
        </div>
      ) : null}
      {preview ? (
        <>
          <p className={expanded ? ENTRY_PREVIEW_FULL_CLASS : ENTRY_PREVIEW_CLAMP_CLASS}>{preview}</p>
          {expandable ? (
            <button type="button" className={ENTRY_TOGGLE_CLASS} onClick={() => setExpanded((value) => !value)}>
              {expanded ? "收起" : "展开全文"}
            </button>
          ) : null}
        </>
      ) : (
        <p className={ENTRY_EMPTY_CLASS}>本条无文本内容。</p>
      )}
    </div>
  );
}

function ContextSection({ section, loading }: { section: Section; loading: boolean }) {
  const isConversation = section.bucketKey === "conversation";
  const isEmpty = section.entries.length === 0;
  // 会话默认折叠；空桶折叠保留；其余有内容的分区默认展开。
  const [open, setOpen] = useState(!isConversation && !isEmpty && section.totalTokens > 0);
  const visibleEntries = isConversation && open ? section.entries.slice(0, CONVERSATION_VISIBLE_CAP) : section.entries;
  const hiddenCount = section.entries.length - visibleEntries.length;

  return (
    <div className={SECTION_CLASS}>
      <button type="button" className={SECTION_HEADER_CLASS} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className={SECTION_BAR_CLASS} style={{ background: `var(${section.colorVar})` }} aria-hidden="true" />
        <span className={SECTION_LABEL_CLASS}>{section.label}</span>
        <span className={SECTION_META_CLASS}>
          <span>{section.entries.length} 条</span>
          <span>~{section.totalTokens.toLocaleString()} tokens</span>
          {open ? <ChevronDown size={13} strokeWidth={2.2} /> : <ChevronRight size={13} strokeWidth={2.2} />}
        </span>
      </button>
      {open ? (
        <div className={ENTRY_LIST_CLASS}>
          {isEmpty ? (
            <p className={ENTRY_EMPTY_CLASS}>
              {loading
                ? "正在重建上下文明细…"
                : section.totalTokens > 0
                  ? "暂无法生成该类上下文的内容预览。"
                  : "本会话暂未使用该类上下文。"}
            </p>
          ) : (
            visibleEntries.map((entry) => (
              <ContextEntryItem key={entry.id} entry={entry} sectionLabel={section.label} />
            ))
          )}
          {hiddenCount > 0 ? (
            <p className={CAP_NOTE_CLASS}>仅显示前 {CONVERSATION_VISIBLE_CAP} 条，其余 {hiddenCount} 条请导出查看。</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ContextRenderView({
  contextState,
  sessionId,
}: {
  contextState?: ContextState | null;
  sessionId?: string | null;
}) {
  // 持久化快照只存 token 统计；打开视图时按需向 main 现场重算逐条全文。
  const [described, setDescribed] = useState<ContextState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDescribed(null);
    if (!sessionId || typeof window === "undefined" || !window.actspace?.describeContext) {
      setLoading(false);
      return;
    }
    setLoading(true);
    window.actspace
      .describeContext({ sessionId })
      .then((fresh) => {
        if (!cancelled) setDescribed(fresh);
      })
      .catch(() => {
        if (!cancelled) setDescribed(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 现算结果（含逐条全文）优先；未回来时退回持久化快照（仅 token 统计 / 空内容）。
  const effectiveState = described ?? contextState ?? null;
  const sections = useMemo(() => buildSections(effectiveState), [effectiveState]);
  const entryCount = useMemo(
    () => sections.reduce((sum, section) => sum + section.entries.length, 0),
    [sections],
  );

  if (!effectiveState) {
    return (
      <div className={EMPTY_CLASS}>
        {loading
          ? "正在重建上下文明细…"
          : "当前没有可展示的上下文明细。开始对话后，这里会按分组列出喂给模型的完整上下文。"}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={TOOLBAR_CLASS}>
        <span className={TITLE_CLASS}>Context · {entryCount} 条</span>
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            className={EXPORT_BUTTON_CLASS}
            onClick={() => downloadBlob(contextToMarkdown(effectiveState), "text/markdown", "context.md")}
          >
            导出 .md
          </button>
          <button
            type="button"
            className={EXPORT_BUTTON_CLASS}
            onClick={() => downloadBlob(JSON.stringify(effectiveState, null, 2), "application/json", "context.json")}
          >
            导出 .json
          </button>
        </span>
      </div>
      <div className={BODY_CLASS}>
        {sections.map((section) => (
          <ContextSection key={section.bucketKey} section={section} loading={loading} />
        ))}
      </div>
    </div>
  );
}
