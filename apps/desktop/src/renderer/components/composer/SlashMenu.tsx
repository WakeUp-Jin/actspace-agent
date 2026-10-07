import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { Asterisk, BookOpen, Bot, ChartPie, Check, GitBranch, ListTodo, Loader2, type LucideIcon } from "lucide-react";
import type { ComposerMode, SkillCatalogItem } from "@actspace/shared";
import {
  composerSlashFunctionOptionId,
  composerSlashSkillOptionId,
  filterComposerSlashFunctions,
  filterComposerSlashSkills,
  parseComposerSlashQuery,
  type ComposerSlashFunction,
  type ComposerSlashFunctionId,
} from "../composer-slash-commands";

export const SLASH_MENU_ID = "composer-slash-command-menu";
const SLASH_FUNCTIONS_LABEL_ID = "composer-slash-functions-label";
const SLASH_SKILLS_LABEL_ID = "composer-slash-skills-label";
const SLASH_MENU_BASE_CLASS =
  "slash-command-menu absolute left-0 z-40 w-[min(520px,calc(100vw_-_36px))] max-w-full overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover transition-[opacity,transform] duration-(--motion-fast) ease-out motion-reduce:transition-none max-[600px]:right-0 max-[600px]:w-auto";
const SLASH_MENU_POSITION_CLASS: Record<"followup" | "initial", string> = {
  initial: "top-[calc(100%_+_8px)] max-h-[min(280px,calc(50vh_-_90px))]",
  followup: "bottom-[calc(100%_+_8px)] max-h-[min(420px,calc(100vh_-_120px))]",
};
const SLASH_GROUP_LABEL_CLASS =
  "sticky top-0 z-10 bg-surface-raised/96 px-2 pb-1 pt-2 text-act-xxs font-semibold uppercase tracking-[0.08em] text-text-faint";
const SLASH_FUNCTION_OPTION_CLASS =
  "slash-command-option flex min-h-9 w-full items-center gap-2 rounded-act-md border-0 bg-transparent px-2 py-1 text-left text-text-main transition-colors duration-(--motion-fast) ease-in-out hover:bg-hover-overlay focus-visible:outline-none";
const SLASH_SKILL_OPTION_CLASS = SLASH_FUNCTION_OPTION_CLASS;
const SLASH_OPTION_ACTIVE_CLASS = "bg-selected";
const SLASH_FUNCTION_ICON_CLASS = "shrink-0 text-text-muted";
const SLASH_FUNCTION_COMMAND_CLASS = "shrink-0 font-mono text-act-xs font-medium leading-5 text-text-main";
const SLASH_FUNCTION_DESCRIPTION_CLASS = "ml-auto min-w-0 flex-1 truncate text-right text-act-xs font-normal leading-5 text-text-faint";
const SLASH_SKILL_NAME_CLASS = "max-w-[42%] shrink-0 truncate text-act-xs font-medium leading-5 text-text-main";
const SLASH_SKILL_DESCRIPTION_CLASS = SLASH_FUNCTION_DESCRIPTION_CLASS;
const SLASH_STATUS_CLASS = "px-2 py-4 text-act-sm text-text-faint";
const SLASH_EMPTY_CLASS = "px-3 py-7 text-center text-act-sm text-text-faint";

const SLASH_FUNCTION_ICONS: Record<ComposerSlashFunctionId, LucideIcon> = {
  plan: ListTodo,
  agent: Bot,
  compact: Asterisk,
  status: ChartPie,
  review: GitBranch,
};

export type ComposerSlashResult =
  | { kind: "function"; item: ComposerSlashFunction }
  | { kind: "skill"; item: SkillCatalogItem };

function slashOptionId(result: ComposerSlashResult): string {
  return result.kind === "function" ? composerSlashFunctionOptionId(result.item.id) : composerSlashSkillOptionId(result.item.name);
}

export type SlashFunctionHandlers = {
  readonly selectMode: (mode: "plan" | "agent") => void;
  /** 不能压缩时（运行中锁定、模型不可用、没有发送回调）不传。 */
  readonly compact?: () => void;
  readonly openContext?: () => void;
  readonly openReview?: () => void;
};

/** 执行一条斜杠功能；返回 false 表示这次没执行（/compact 不可用），菜单保持打开。 */
export function runSlashFunction(id: ComposerSlashFunctionId, handlers: SlashFunctionHandlers): boolean {
  switch (id) {
    case "plan":
    case "agent":
      handlers.selectMode(id);
      return true;
    case "compact":
      if (!handlers.compact) return false;
      handlers.compact();
      return true;
    case "status":
      handlers.openContext?.();
      return true;
    case "review":
      handlers.openReview?.();
      return true;
  }
}

function getSlashCommandDisplayName(command: string): string {
  return command.startsWith("/") ? command.slice(1) : command;
}

export type SlashMenuOptions = {
  readonly message: string;
  /** 运行中锁定输入时不开菜单。 */
  readonly inputLocked: boolean;
  /** Chat 只有 /compact 和 /status，没有 Skills。 */
  readonly isChatForm: boolean;
  /** 运行中不切模式：去掉 /plan 和 /agent（/compact 会进入队列）。 */
  readonly isStreaming: boolean;
  readonly skills: readonly SkillCatalogItem[];
  /** 点在 Composer 外面（浮层除外）关菜单。 */
  readonly composerRef: RefObject<HTMLElement | null>;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  /** 换输入框文字并写回草稿。 */
  readonly setDraftText: (text: string) => void;
  /** 选完一项、输入框文字被换掉之后（重置输入历史游标）。 */
  readonly onDraftReplaced: () => void;
};

/**
 * 09 T28：斜杠菜单的状态。输入框内容是 `/xxx` 就打开，Esc、点外面、打开别的浮层时收起（`dismiss`），
 * 内容一改又允许打开（`reset`）。高亮项随结果变化回到第一项，并滚进可见区。
 */
export function useSlashMenu({ message, inputLocked, isChatForm, isStreaming, skills, composerRef, inputRef, setDraftText, onDraftReplaced }: SlashMenuOptions) {
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [entered, setEntered] = useState(false);

  const query = inputLocked ? null : parseComposerSlashQuery(message);
  const open = query !== null && !dismissed;
  const functions = query === null ? [] : filterComposerSlashFunctions(query)
    .filter((item) => !isChatForm || ["compact", "status"].includes(item.id))
    .filter((item) => !isStreaming || (item.id !== "plan" && item.id !== "agent"));
  const matchedSkills = query === null || isChatForm ? [] : filterComposerSlashSkills([...skills], query);
  const results: ComposerSlashResult[] = [
    ...functions.map((item): ComposerSlashResult => ({ kind: "function", item })),
    ...matchedSkills.map((item): ComposerSlashResult => ({ kind: "skill", item })),
  ];
  const resultKey = results
    .map((result) => result.kind === "function" ? `function:${result.item.id}` : `skill:${result.item.scope}:${result.item.name}`)
    .join("|");
  const active = results[Math.min(activeIndex, Math.max(0, results.length - 1))];
  const activeOptionId = active ? slashOptionId(active) : undefined;

  useLayoutEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    setEntered(false);
    const handle = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, query, resultKey]);

  useEffect(() => {
    if (!open || !activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId, open]);

  // `+` 面板、模型菜单、上下文用量浮层和新建页的运行目标菜单都由 Radix 自己处理点外和 Esc。
  // 这里只管 Composer 自己画的斜杠菜单。
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      // 浮层挂在 body 上，点浮层内部也算点在 Composer 里。
      if (composerRef.current?.contains(event.target as Node) || (event.target as Element | null)?.closest?.("[data-composer-floating]")) {
        return;
      }
      setDismissed(true);
    }

    function handleKeyDown(event: KeyboardEvent) {
      // 组字时的 Esc 是输入法取消候选，不关浮层（与输入框自己的 isImeComposing 一致）。
      if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229) {
        setDismissed(true);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只挂一次；composerRef 是稳定的 ref
  }, []);

  return {
    query,
    open,
    entered,
    functions,
    skills: matchedSkills,
    results,
    active,
    activeOptionId,
    dismiss: () => setDismissed(true),
    /** 输入框内容变了：允许菜单再次打开。 */
    reset: () => setDismissed(false),
    move: (direction: 1 | -1) => setActiveIndex((current) => (current + direction + results.length) % results.length),
    /** 鼠标移到某一项上：高亮跟过去。 */
    highlight: (result: ComposerSlashResult) => {
      const optionId = slashOptionId(result);
      const index = results.findIndex((candidate) => slashOptionId(candidate) === optionId);
      if (index >= 0) setActiveIndex(index);
    },
    /** 选完一项：清空输入框，收起菜单，焦点回输入框。 */
    finish: () => {
      setDraftText("");
      onDraftReplaced();
      setDismissed(true);
      inputRef.current?.focus();
    },
  };
}

export type SlashMenuState = ReturnType<typeof useSlashMenu>;

export type SlashMenuProps = {
  surface: "followup" | "initial";
  slash: SlashMenuState;
  /** 当前模式：/plan、/agent 旁边打勾。 */
  mode: ComposerMode;
  selectedSkills: readonly string[];
  skillsLoading: boolean;
  skillsError: string | null;
  /** 全部可用 Skills 的数量：空查询下一个都没有时显示「暂无已启用的 Skills」。 */
  skillCount: number;
  onSelect: (result: ComposerSlashResult) => void;
  onRetrySkills: () => void;
};

export function SlashMenu({ surface, slash, mode, selectedSkills, skillsLoading, skillsError, skillCount, onSelect, onRetrySkills }: SlashMenuProps) {
  if (!slash.open || slash.query === null) return null;
  const motionClass = slash.entered
    ? "translate-y-0 scale-100 opacity-100"
    : `pointer-events-none ${surface === "initial" ? "-translate-y-1" : "translate-y-1"} scale-[0.985] opacity-0`;
  const showSkillsGroup =
    skillsLoading ||
    Boolean(skillsError) ||
    slash.skills.length > 0 ||
    (slash.query === "" && skillCount === 0);
  const showTotalEmpty =
    slash.query !== "" &&
    slash.functions.length === 0 &&
    slash.skills.length === 0 &&
    !skillsLoading &&
    !skillsError;

  return (
    <div
      className={`${SLASH_MENU_BASE_CLASS} ${SLASH_MENU_POSITION_CLASS[surface]} ${motionClass}`}
      id={SLASH_MENU_ID}
      role="listbox"
      aria-label="斜杠命令"
    >
      {slash.functions.length > 0 ? (
        <div role="group" aria-labelledby={SLASH_FUNCTIONS_LABEL_ID}>
          <div className={SLASH_GROUP_LABEL_CLASS} id={SLASH_FUNCTIONS_LABEL_ID}>功能</div>
          {slash.functions.map((item) => {
            const Icon = SLASH_FUNCTION_ICONS[item.id];
            const commandDisplayName = getSlashCommandDisplayName(item.command);
            const optionId = composerSlashFunctionOptionId(item.id);
            const isActive = slash.activeOptionId === optionId;
            const isSelectedMode = item.id === mode;
            const result: ComposerSlashResult = { kind: "function", item };
            return (
              // 原生 button（从 Composer 搬来）：listbox 的 option，按下不抢输入框焦点，高亮由键盘和鼠标共同驱动。
              <button
                className={`${SLASH_FUNCTION_OPTION_CLASS}${isActive ? ` ${SLASH_OPTION_ACTIVE_CLASS}` : ""}`}
                id={optionId}
                type="button"
                role="option"
                aria-label={`${commandDisplayName}: ${item.description}`}
                aria-selected={isSelectedMode}
                key={item.id}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => slash.highlight(result)}
                onClick={() => onSelect(result)}
              >
                <Icon className={SLASH_FUNCTION_ICON_CLASS} size={14} strokeWidth={1.9} aria-hidden="true" />
                <span className={SLASH_FUNCTION_COMMAND_CLASS}>{commandDisplayName}</span>
                {isSelectedMode ? <Check className="shrink-0 text-text-muted" size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
                <span className={SLASH_FUNCTION_DESCRIPTION_CLASS}>{item.description}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {showSkillsGroup ? (
        <div role="group" aria-labelledby={SLASH_SKILLS_LABEL_ID}>
          <div className={SLASH_GROUP_LABEL_CLASS} id={SLASH_SKILLS_LABEL_ID}>Skills</div>
          {skillsLoading ? (
            <div className={`${SLASH_STATUS_CLASS} flex items-center gap-2`}>
              <Loader2 className="animate-spin" size={15} aria-hidden="true" /> 正在加载 Skills…
            </div>
          ) : skillsError ? (
            <div className={SLASH_STATUS_CLASS}>
              <span>Skills 暂不可用。</span>
              {/* 原生 button（从 Composer 搬来）：状态文字里的行内「重试」，按下不抢输入框焦点。 */}
              <button
                className="ml-2 rounded-act-sm px-1.5 py-0.5 font-medium text-text-main hover:bg-hover-overlay"
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={onRetrySkills}
              >
                重试
              </button>
            </div>
          ) : slash.skills.length > 0 ? slash.skills.map((skill) => {
            const optionId = composerSlashSkillOptionId(skill.name);
            const isActive = slash.activeOptionId === optionId;
            const isSelected = selectedSkills.includes(skill.id ?? skill.name);
            const result: ComposerSlashResult = { kind: "skill", item: skill };
            return (
              // 原生 button（从 Composer 搬来）：同上，listbox 的 option。
              <button
                className={`${SLASH_SKILL_OPTION_CLASS}${isActive ? ` ${SLASH_OPTION_ACTIVE_CLASS}` : ""}`}
                id={optionId}
                type="button"
                role="option"
                aria-label={`${skill.name}: ${skill.description || "暂无说明"}. ${isSelected ? "已选择" : "未选择"}`}
                aria-selected={isSelected}
                key={`${skill.scope}:${skill.name}`}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => slash.highlight(result)}
                onClick={() => onSelect(result)}
              >
                <BookOpen className={SLASH_FUNCTION_ICON_CLASS} size={14} strokeWidth={1.9} aria-hidden="true" />
                <span className={SLASH_SKILL_NAME_CLASS}>{skill.name}</span>
                {isSelected ? <Check className="shrink-0 text-text-muted" size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
                <span className={SLASH_SKILL_DESCRIPTION_CLASS}>{skill.description || "暂无说明"}</span>
              </button>
            );
          }) : (
            <div className={SLASH_STATUS_CLASS}>暂无已启用的 Skills</div>
          )}
        </div>
      ) : null}

      {showTotalEmpty ? (
        <div className={SLASH_EMPTY_CLASS}>没有匹配的功能或 Skills</div>
      ) : null}
    </div>
  );
}
