import { BookOpen, Check, ChevronLeft, ChevronRight, Image, ListTodo, Loader2, MessageCircle, Paperclip, Search, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ComposerMode, SkillCatalogItem } from "@actspace/shared";
import type { CatalogModel, ModelCatalog } from "../../target/use-model-catalog";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/Popover";
import { filterModelGroups, ModelOptionsBody, modelListEmptyText, showModelDetail, type ModelPickerOptions } from "./ModelPicker";
import { isModelEditable } from "./model-options";

// `+` 面板（09 §3）：与输入框同宽，贴在输入框上方，空间不够时由 Radix 翻到下方。
// 焦点一直留在搜索框里（组合框模式），↑↓ 移动的是 aria-activedescendant。
const PALETTE_CLASS =
  "composer-palette w-(--radix-popper-anchor-width) p-1 transition-[opacity,transform] duration-(--motion-fast) ease-out motion-reduce:transition-none";
const SEARCH_ROW_CLASS = "flex h-8 items-center gap-2 px-2 text-text-faint";
const SEARCH_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent p-0 text-act-sm leading-5 text-text-main outline-none placeholder:text-text-subtle";
const LIST_CLASS = "max-h-[280px] overflow-y-auto";
const GROUP_LABEL_CLASS = "px-2 pb-1 pt-2 text-act-xxs font-semibold leading-4 text-text-faint";
const SEPARATOR_CLASS = "mx-1 my-1 h-px bg-line";
const ROW_CLASS =
  "group/palette-row flex min-h-7 cursor-default items-center gap-2 rounded-act-md px-2 text-act-sm leading-5 text-text-muted aria-disabled:opacity-50 aria-selected:bg-hover-overlay aria-selected:text-text-main";
const ROW_LABEL_CLASS = "shrink-0 truncate font-medium";
const ROW_DESCRIPTION_CLASS = "min-w-0 truncate text-act-xs text-text-faint";
const ROW_TRAILING_CLASS = "ml-auto flex shrink-0 items-center gap-1.5 text-text-faint";
const STATE_CLASS = "flex items-center gap-2 px-2 py-3 text-act-sm text-text-faint";

type PaletteMode = Exclude<ComposerMode, "agent">;
type PalettePage = "main" | "skills" | "models" | "model-options";

const MODE_ROWS: Record<PaletteMode, { label: string; description: string; icon: LucideIcon; iconClass: string }> = {
  plan: { label: "Plan", description: "先出计划，确认后再执行", icon: ListTodo, iconClass: "text-warning" },
  chat: { label: "Chat", description: "纯对话，不使用工具", icon: MessageCircle, iconClass: "text-operational" },
};

const LISTBOX_LABEL: Record<Exclude<PalettePage, "model-options">, string> = {
  main: "添加上下文或工具",
  skills: "Skills",
  models: "模型",
};

/** 只列非默认模式：空会话列 Plan / Chat，已开始的 Agent 会话只列 Plan，当前模式不列。 */
export function paletteModes(mode: ComposerMode, sessionStarted: boolean): PaletteMode[] {
  if (!sessionStarted) return (["plan", "chat"] as const).filter((candidate) => candidate !== mode);
  return mode === "agent" ? ["plan"] : [];
}

export type ComposerPaletteSkills = {
  items: SkillCatalogItem[];
  loading: boolean;
  error: string | null;
  selected: string[];
  onToggle: (name: string) => void;
  onRetry: () => void;
};

export type ComposerPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 面板自己关闭（选完、主页 Esc）后把焦点交还给输入框；点外面、被别的浮层顶掉时不抢焦点。 */
  onReturnFocus: () => void;
  mode: ComposerMode;
  sessionStarted: boolean;
  /** 运行中不能切换模式：模式行显示但不可选。 */
  modeDisabled: boolean;
  onSelectMode: (mode: ComposerMode) => void;
  /** 能力决定是「图片与文件」还是「图片」。 */
  attachment: { label: string; description?: string; icon: "files" | "images"; onSelect: () => void };
  /** Chat 不加载 Skills，不显示入口。 */
  skills: ComposerPaletteSkills | null;
  models: {
    catalog: ModelCatalog;
    selectedModelId: string;
    selectedLabel: string;
    onSelect: (modelId: string) => void;
    options?: ModelPickerOptions;
  };
  /**
   * 被面板锚住的整个输入框面板。`+` 按钮在里面，自己用 open / onOpenChange 开关面板，
   * 不用 PopoverTrigger：同时有 PopoverAnchor 时，Radix 会在 Anchor 挂上后重挂一次触发器。
   * 点按钮关闭不会被当成「点了外面」：Radix 把外部 pointerdown 推迟到 click 之后，那时面板已经关了。
   */
  children: ReactNode;
};


/**
 * Composer 的 `+` 面板：搜索、模式、文件入口、Skills ›、模型 ›。
 * Skills 和模型在同一张卡片里下钻，搜索框左侧的图标变成 ‹ 返回。斜杠菜单仍然独立。
 */
export function ComposerPalette({ open, onOpenChange, children, ...content }: ComposerPaletteProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      {open ? <ComposerPaletteContent {...content} close={() => onOpenChange(false)} /> : null}
    </Popover>
  );
}

type PaletteRow = {
  key: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  /** → 能下钻到的页面。 */
  drill?: () => void;
  trailing?: ReactNode;
  detail?: string;
  activate: () => void;
};

type PaletteSection = { key: string; label?: string; rows: PaletteRow[] };

function matches(query: string, ...texts: (string | undefined)[]): boolean {
  return texts.some((text) => text?.toLocaleLowerCase().includes(query));
}

// 只在打开时挂载：页面、搜索词、当前行随面板关闭一起丢掉。
function ComposerPaletteContent({
  onReturnFocus,
  mode,
  sessionStarted,
  modeDisabled,
  onSelectMode,
  attachment,
  skills,
  models,
  close,
}: Omit<ComposerPaletteProps, "open" | "onOpenChange" | "children"> & { close: () => void }) {
  const [page, setPage] = useState<PalettePage>("main");
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // 下钻前所在的行，返回时回到这一行。
  const returnKeyRef = useRef<string | null>(null);
  // 面板自己关的（选完、主页 Esc）才还焦点。被别的浮层顶掉时焦点已经在新打开的按钮上，
  // 抢回输入框会让那个浮层因为焦点移出又关掉。
  const closedByPaletteRef = useRef(false);
  const listboxId = useId();

  useLayoutEffect(() => {
    const handle = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (page === "model-options") backRef.current?.focus();
    else inputRef.current?.focus();
  }, [page]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const editableSpec = (modelId: string) => {
    const spec = models.options?.find(modelId);
    return spec && isModelEditable(spec) ? spec : undefined;
  };

  function goTo(next: PalettePage, fromKey: string | null) {
    returnKeyRef.current = fromKey;
    setQuery("");
    setActiveKey(null);
    setPage(next);
  }

  function goBack() {
    const parent: PalettePage = page === "model-options" ? "models" : "main";
    const returnKey = page === "model-options" ? `model:${editingModelId}` : page === "skills" ? "entry:skills" : "entry:models";
    setQuery("");
    setActiveKey(returnKey);
    setEditingModelId(null);
    setPage(parent);
  }

  function finish(action: () => void) {
    closedByPaletteRef.current = true;
    close();
    action();
  }

  function openOptions(modelId: string) {
    setEditingModelId(modelId);
    goTo("model-options", `model:${modelId}`);
  }

  const modelRow = (model: CatalogModel, description: string | undefined): PaletteRow => {
    const selected = model.id === models.selectedModelId;
    const editable = editableSpec(model.id);
    return {
      key: `model:${model.id}`,
      label: model.label,
      description,
      icon: <Sparkles className="shrink-0 text-text-faint" size={14} strokeWidth={1.9} aria-hidden="true" />,
      drill: editable ? () => openOptions(model.id) : undefined,
      trailing: (
        <>
          {editable ? (
            <Button
              variant="ghost"
              size="xs"
              tabIndex={-1}
              // 鼠标悬停或键盘移到这一行时才露出；键盘用 → 打开。
              className="opacity-0 group-aria-selected/palette-row:opacity-100"
              aria-label={`编辑 ${model.id} 选项`}
              onClick={(event) => {
                event.stopPropagation();
                openOptions(model.id);
              }}
            >
              编辑
            </Button>
          ) : null}
          {selected ? <Check className="text-text-main" size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
        </>
      ),
      checked: selected,
      activate: () => finish(() => models.onSelect(model.id)),
    };
  };

  const skillRow = (skill: SkillCatalogItem): PaletteRow => {
    const checked = skills?.selected.includes(skill.name) ?? false;
    return {
      key: `skill:${skill.scope}:${skill.name}`,
      label: skill.name,
      description: skill.description || "暂无说明",
      icon: <BookOpen className="shrink-0 text-text-faint" size={14} strokeWidth={1.9} aria-hidden="true" />,
      checked,
      trailing: (
        <>
          <span className="text-act-xxs uppercase tracking-wide">{skill.scope}</span>
          {checked ? <Check className="text-text-main" size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
        </>
      ),
      // 多选：勾完留在面板里。
      activate: () => skills?.onToggle(skill.name),
    };
  };

  const sections: PaletteSection[] = [];
  let emptyState: ReactNode = null;
  if (page === "main") {
    const modeRows = paletteModes(mode, sessionStarted)
      .filter((candidate) => !normalizedQuery || matches(normalizedQuery, MODE_ROWS[candidate].label, MODE_ROWS[candidate].description))
      .map((candidate): PaletteRow => {
        const meta = MODE_ROWS[candidate];
        const Icon = meta.icon;
        return {
          key: `mode:${candidate}`,
          label: meta.label,
          description: meta.description,
          icon: <Icon className={`shrink-0 ${meta.iconClass}`} size={14} strokeWidth={1.9} aria-hidden="true" />,
          disabled: modeDisabled,
          activate: () => finish(() => onSelectMode(candidate)),
        };
      });
    const AttachmentIcon = attachment.icon === "files" ? Paperclip : Image;
    const entryRows: PaletteRow[] = [
      {
        key: "entry:attachment",
        label: attachment.label,
        description: attachment.description,
        icon: <AttachmentIcon className="shrink-0 text-text-faint" size={14} strokeWidth={1.9} aria-hidden="true" />,
        activate: () => finish(attachment.onSelect),
      },
      ...(skills ? [{
        key: "entry:skills",
        label: "Skills",
        description: "为本轮加载技能说明",
        icon: <BookOpen className="shrink-0 text-text-faint" size={14} strokeWidth={1.9} aria-hidden="true" />,
        drill: () => goTo("skills", "entry:skills"),
        trailing: <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />,
        activate: () => goTo("skills", "entry:skills"),
      }] : []),
      {
        key: "entry:models",
        label: "模型",
        description: models.selectedLabel,
        icon: <Sparkles className="shrink-0 text-text-faint" size={14} strokeWidth={1.9} aria-hidden="true" />,
        drill: () => goTo("models", "entry:models"),
        trailing: <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />,
        activate: () => goTo("models", "entry:models"),
      },
    ].filter((row) => !normalizedQuery || matches(normalizedQuery, row.label, row.description));
    if (!normalizedQuery) {
      sections.push({ key: "modes", rows: modeRows }, { key: "entries", rows: entryRows });
    } else {
      // 有搜索词时按组列出：模式、入口、Skills、模型（例如输入 son 直接出现 Sonnet）。
      const skillRows = (skills?.items ?? [])
        .filter((skill) => matches(normalizedQuery, skill.name, skill.description))
        .map(skillRow);
      const modelRows = filterModelGroups(models.catalog, normalizedQuery)
        .flatMap((group) => group.models.map((model) => modelRow(model, group.label)));
      sections.push(
        { key: "modes", label: "模式", rows: modeRows },
        { key: "entries", label: "添加", rows: entryRows },
        { key: "skills", label: "Skills", rows: skillRows },
        { key: "models", label: "模型", rows: modelRows },
      );
      if (sections.every((section) => section.rows.length === 0)) emptyState = <div className={STATE_CLASS}>没有匹配的结果。</div>;
    }
  } else if (page === "skills" && skills) {
    if (skills.loading) {
      emptyState = (
        <div className={STATE_CLASS}>
          <Loader2 className="animate-spin" size={14} aria-hidden="true" /> 正在加载 Skills…
        </div>
      );
    } else if (skills.error) {
      emptyState = (
        <div className={`${STATE_CLASS} text-on-danger`}>
          <span>{skills.error}</span>
          <Button variant="ghost" size="xs" onClick={skills.onRetry}>重试</Button>
        </div>
      );
    } else {
      const rows = skills.items.filter((skill) => !normalizedQuery || matches(normalizedQuery, skill.name, skill.description)).map(skillRow);
      sections.push({ key: "skills", rows });
      if (rows.length === 0) {
        emptyState = <div className={STATE_CLASS}>{skills.items.length === 0 ? "暂无已启用的 Skills" : "没有匹配的 Skills。"}</div>;
      }
    }
  } else if (page === "models") {
    const groups = filterModelGroups(models.catalog, normalizedQuery);
    for (const group of groups) {
      sections.push({
        key: `group:${group.key}`,
        label: group.label,
        rows: group.models.map((model) => ({ ...modelRow(model, undefined), detail: showModelDetail(group, model) ? model.detail : undefined })),
      });
    }
    if (groups.length === 0) emptyState = <div className={STATE_CLASS}>{modelListEmptyText(models.catalog)}</div>;
  }

  const visibleSections = sections.filter((section) => section.rows.length > 0);
  const rows = visibleSections.flatMap((section) => section.rows);
  const enabledRows = rows.filter((row) => !row.disabled);
  // 当前行不在列表里（搜索词变了、刚换页）时落到第一条可选的行。
  const activeRow = enabledRows.find((row) => row.key === activeKey) ?? enabledRows[0];
  const rowId = (row: PaletteRow) => `${listboxId}-${row.key}`;

  useEffect(() => {
    if (!activeRow) return;
    document.getElementById(rowId(activeRow))?.scrollIntoView?.({ block: "nearest" });
  }, [activeRow?.key]);

  function move(delta: 1 | -1) {
    if (enabledRows.length === 0) return;
    const index = activeRow ? enabledRows.indexOf(activeRow) : -1;
    const next = enabledRows[(index + delta + enabledRows.length) % enabledRows.length];
    setActiveKey(next.key);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      activeRow?.activate();
      return;
    }
    const input = event.currentTarget;
    if (event.key === "ArrowRight" && activeRow?.drill && input.selectionStart === input.value.length) {
      event.preventDefault();
      activeRow.drill();
      return;
    }
    if ((event.key === "ArrowLeft" || event.key === "Backspace") && query === "" && page !== "main") {
      event.preventDefault();
      goBack();
    }
  }

  const editingSpec = editingModelId === null ? undefined : editableSpec(editingModelId);
  const listLabel = page === "model-options" ? undefined : LISTBOX_LABEL[page];

  return (
    <PopoverContent
      className={`${PALETTE_CLASS} ${entered ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}
      radius="lg"
      side="top"
      align="start"
      sideOffset={8}
      data-composer-floating=""
      onOpenAutoFocus={(event) => {
        // 浮层在 Portal 里晚一拍挂上，首次聚焦放在这里；换页后的聚焦由上面的 effect 负责。
        event.preventDefault();
        inputRef.current?.focus();
      }}
      onEscapeKeyDown={(event) => {
        // 组字时的 Esc 是输入法取消候选，不关面板；子页先回上一级，主页再关闭。
        if (event.isComposing || event.keyCode === 229) {
          event.preventDefault();
          return;
        }
        if (page === "main") {
          closedByPaletteRef.current = true;
          return;
        }
        event.preventDefault();
        goBack();
      }}
      onCloseAutoFocus={(event) => {
        // 其他情况交给 ui/Popover：焦点随面板一起丢失时才还给打开前的位置。
        if (!closedByPaletteRef.current) return;
        event.preventDefault();
        onReturnFocus();
      }}
    >
      {page === "model-options" ? (
        <>
          <div className={SEARCH_ROW_CLASS}>
            <IconButton ref={backRef} className="-ml-1" label="返回" tooltip={false} size="xs" onClick={goBack}>
              <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
            </IconButton>
            <span className="truncate text-act-sm font-medium text-text-main">{editingSpec?.label ?? editingModelId} 选项</span>
          </div>
          <div className={SEPARATOR_CLASS} />
          {editingSpec && models.options ? <ModelOptionsBody spec={editingSpec} options={models.options} showLabel={false} /> : null}
        </>
      ) : (
        <>
          <div className={SEARCH_ROW_CLASS}>
            {page === "main" ? (
              <Search size={14} strokeWidth={2} aria-hidden="true" />
            ) : (
              <IconButton className="-ml-1" label="返回" tooltip={false} size="xs" tabIndex={-1} onClick={goBack}>
                <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            )}
            <input
              ref={inputRef}
              className={SEARCH_INPUT_CLASS}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeRow ? rowId(activeRow) : undefined}
              aria-autocomplete="list"
              value={query}
              placeholder={page === "main" ? "搜索 Skills、文件、模型…" : page === "skills" ? "搜索 Skills" : "搜索模型"}
              aria-label={page === "main" ? "搜索" : page === "skills" ? "搜索 Skills" : "搜索模型"}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <div className={LIST_CLASS} ref={listRef} id={listboxId} role="listbox" aria-label={listLabel}>
            {visibleSections.map((section, index) => (
              <div key={section.key} role="group" aria-label={section.label}>
                {section.label ? (
                  <div className={GROUP_LABEL_CLASS} aria-hidden="true">{section.label}</div>
                ) : index > 0 ? (
                  <div className={SEPARATOR_CLASS} role="separator" />
                ) : null}
                {section.rows.map((row) => (
                  <div
                    key={row.key}
                    id={rowId(row)}
                    className={ROW_CLASS}
                    role="option"
                    aria-label={row.label}
                    aria-selected={row === activeRow}
                    aria-disabled={row.disabled || undefined}
                    aria-checked={row.checked}
                    onPointerMove={() => {
                      if (!row.disabled && activeKey !== row.key) setActiveKey(row.key);
                    }}
                    // 不让点击把焦点从搜索框拿走。
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (!row.disabled) row.activate();
                    }}
                  >
                    {row.icon}
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className={ROW_LABEL_CLASS}>{row.label}</span>
                      {row.description ? <span className={ROW_DESCRIPTION_CLASS}>{row.description}</span> : null}
                      {row.detail ? <span className={`${ROW_DESCRIPTION_CLASS} font-mono`}>{row.detail}</span> : null}
                    </span>
                    {row.trailing ? <span className={ROW_TRAILING_CLASS}>{row.trailing}</span> : null}
                  </div>
                ))}
              </div>
            ))}
            {emptyState}
          </div>
        </>
      )}
    </PopoverContent>
  );
}
