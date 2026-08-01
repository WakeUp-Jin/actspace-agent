import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  ArrowUp,
  Asterisk,
  BookOpen,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  Image,
  Laptop,
  ListChecks,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Cloud,
  FolderOpen,
  FolderPlus,
  Server,
  Search,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  ComposerMode,
  ComposerAttachment,
  ContextUsageSnapshot,
  LlmProviderId,
  ModelReasoningEffort,
  ModelSelectionId,
  SkillCatalogItem,
  SessionRunLocation,
  UsableModelView,
  WorkspaceGitContext,
} from "@actspace/shared";
import { DEFAULT_MODEL_ID, MODEL_LIST, MODEL_REASONING_EFFORTS } from "@actspace/shared";
import { ContextPopup } from "./ContextPopup";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";
import {
  formatSelectedModelLabel,
  groupModelsByProvider,
  hasDuplicateModelLabelWithinProvider,
} from "../model-option-groups";
import {
  composerSlashFunctionOptionId,
  composerSlashSkillOptionId,
  filterComposerSlashFunctions,
  filterComposerSlashSkills,
  parseComposerSlashQuery,
  type ComposerSlashFunction,
  type ComposerSlashFunctionId,
} from "./composer-slash-commands";

export type ComposerSendOptions = {
  model: ModelSelectionId;
  mode: ComposerMode;
  selectedSkills: string[];
  thinkingEnabled: boolean;
  reasoningEffort?: ModelReasoningEffort;
  attachments?: ComposerAttachment[];
};

export type ComposerWorkspaceOption = {
  value: string;
  label: string;
  workspaceId?: string;
};

export type ComposerExecutionContext = {
  gitContext: WorkspaceGitContext | null;
  selectedBranch?: string;
  runLocation: SessionRunLocation;
  locked?: boolean;
  onSelectBranch?: (branch: string) => void;
  onSelectRunLocation?: (location: SessionRunLocation) => void;
  onUseExistingWorkspace?: () => void;
  onCreateWorkspaceFolder?: (name: string) => void;
};

export type ComposerDraftRestore = {
  id: number;
  text: string;
  attachments?: ComposerAttachment[];
  error?: string;
};

export type ComposerReviewSummary = {
  status: "loading" | "changes" | "empty" | "notAvailable" | "noBaseline" | "partial" | "failed";
  additions?: number;
  deletions?: number;
  reason?: string;
};

export type ComposerSurface = "followup" | "initial";

const COMPOSER_WRAP_CLASS =
  "composer-wrap relative mx-auto grid w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] gap-2 max-[600px]:w-[calc(100%_-_36px)]";
const COMPOSER_INITIAL_WRAP_CLASS =
  "composer-wrap composer-wrap-initial relative mx-auto grid w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),706px)] gap-2 max-[600px]:w-[calc(100%_-_36px)]";
const INITIAL_CONTEXT_ROW_CLASS = "initial-context-row relative z-20 flex min-h-7 items-center gap-3 overflow-visible px-2 text-sm text-text-muted max-[600px]:flex-wrap";
const INITIAL_CONTEXT_SELECTOR_CLASS =
  "initial-context-selector inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-1 py-1 text-sm font-medium text-text-muted transition-colors duration-[120ms] ease-in-out hover:text-text-main";
const COMPOSER_ACTION_STRIP_CLASS = "composer-action-strip flex min-h-[34px] items-center gap-2";
const REVIEW_PREVIEW_BUTTON_CLASS =
  "review-preview-button inline-flex h-[30px] items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium text-text-muted shadow-[0_1px_2px_rgba(31,45,61,0.04)] transition-[background-color,border-color,color] duration-[120ms] ease-in-out hover:border-line-strong hover:bg-surface-subtle hover:text-text-main disabled:cursor-default disabled:hover:border-line disabled:hover:bg-surface disabled:hover:text-text-muted";
const REVIEW_ADDITION_CLASS = "font-medium text-success";
const REVIEW_DELETION_CLASS = "font-medium text-danger";
const REVIEW_OVERFLOW_BUTTON_CLASS =
  "review-overflow-button grid h-[30px] w-[30px] place-items-center rounded-full border border-line bg-surface text-text-faint shadow-[0_1px_2px_rgba(31,45,61,0.04)] transition-[background-color,border-color,color] duration-[120ms] ease-in-out hover:border-line-strong hover:bg-surface-subtle hover:text-text-main";
const COMPOSER_PANEL_CLASS =
  "composer-panel relative grid overflow-visible rounded-[22px] border border-line bg-surface shadow-act-soft";
const COMPOSER_PANEL_INITIAL_CLASS =
  "composer-panel composer-panel-initial relative grid overflow-visible rounded-[18px] border border-line bg-surface shadow-act-soft";
const COMPOSER_ATTACHMENTS_CLASS = "composer-attachments flex min-h-14 flex-wrap items-center gap-2.5 px-3 pb-1 pt-3";
const IMAGE_ATTACHMENT_WRAPPER_CLASS = "group/image-attachment relative h-12 w-12 shrink-0";
const IMAGE_ATTACHMENT_CLASS =
  "image-attachment block h-12 w-12 overflow-hidden rounded-lg border border-line bg-surface-subtle bg-cover bg-center shadow-[0_4px_12px_rgba(20,21,18,0.08)] transition-[border-color,opacity] duration-[120ms] hover:border-line-strong hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const FILE_ATTACHMENT_CLASS =
  "file-attachment group/file-attachment inline-flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 pr-1.5 text-sm font-medium text-text-main shadow-[0_6px_16px_rgba(31,45,61,0.06)]";
const FILE_ATTACHMENT_NAME_CLASS = "truncate";
const ATTACHMENT_REMOVE_BASE_CLASS =
  "attachment-remove grid place-items-center rounded-lg opacity-0 pointer-events-none transition-[background,color,opacity] duration-[150ms] ease-in-out";
const IMAGE_ATTACHMENT_REMOVE_CLASS =
  `${ATTACHMENT_REMOVE_BASE_CLASS} image-attachment-remove absolute right-[-4px] top-[-4px] h-[18px] w-[18px] rounded-full bg-text-main text-surface shadow-[0_3px_8px_rgba(20,21,18,0.2)] group-hover/image-attachment:pointer-events-auto group-hover/image-attachment:opacity-100 group-focus-within/image-attachment:pointer-events-auto group-focus-within/image-attachment:opacity-100 hover:opacity-80`;
const FILE_ATTACHMENT_REMOVE_CLASS =
  `${ATTACHMENT_REMOVE_BASE_CLASS} file-attachment-remove h-[22px] w-[22px] text-text-faint group-hover/file-attachment:pointer-events-auto group-hover/file-attachment:opacity-100 group-focus-within/file-attachment:pointer-events-auto group-focus-within/file-attachment:opacity-100 hover:bg-hover-overlay hover:text-text-main`;
// Composer 输入布局对齐 Cursor：单行内容 inline（+ / 输入 / 模型 / 发送同一行），
// 内容折行到两行及以上自动切 stacked（输入全宽在上、控件行贴底）。
// 用同一个 grid 容器切换 grid-template-areas，DOM 结构不变——textarea 是同一节点，
// 切换布局不 remount、不丢焦点光标；附件存在或 initial surface 强制 stacked。
const COMPOSER_BODY_BASE_CLASS = "composer-body grid min-h-[48px] items-center gap-x-1.5 px-2 py-1.5";
const COMPOSER_BODY_INLINE_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'plus_mode_input_model_send'] max-[600px]:gap-y-1 max-[600px]:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] max-[600px]:[grid-template-areas:'input_input_input_input_input'_'plus_mode_model_._send']`;
const COMPOSER_BODY_STACKED_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} gap-y-1 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'input_input_input_input_input'_'plus_mode_model_._send']`;
const COMPOSER_BODY_AGENT_INLINE_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} grid-cols-[auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'plus_input_model_send'] max-[600px]:gap-y-1 max-[600px]:grid-cols-[auto_auto_minmax(0,1fr)_auto] max-[600px]:[grid-template-areas:'input_input_input_input'_'plus_model_._send']`;
const COMPOSER_BODY_AGENT_STACKED_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} gap-y-1 grid-cols-[auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'input_input_input_input'_'plus_model_._send']`;
const COMPOSER_INPUT_CLASS =
  "composer-input block w-full min-h-[34px] max-h-[142px] [grid-area:input] resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-[7px] text-[15px] leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
const COMPOSER_INITIAL_INPUT_CLASS =
  "composer-input block w-full min-h-[76px] max-h-[172px] [grid-area:input] resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-[7px] text-[15px] leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
// 单行高度 = 20px line-height + 7px*2 padding = 34px；超过它说明内容折行（显式换行或自动 wrap）。
const COMPOSER_SINGLE_LINE_MAX_PX = 40;
const CONTROL_GROUP_CLASS = "control-group relative";
const COMMAND_BUTTON_CLASS =
  "command-button grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface-subtle text-text-muted transition-[background,border,color] duration-[120ms] ease-in-out hover:border-line-strong hover:bg-hover-overlay hover:text-text-main aria-expanded:border-line-strong aria-expanded:bg-selected aria-expanded:text-text-main";
const MODE_BUTTON_BASE_CLASS =
  "mode-button inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-0 px-2.5 text-sm font-medium transition-[filter,opacity] duration-[120ms] ease-in-out hover:brightness-95";
const MODE_BUTTON_CLASS: Record<ComposerMode, string> = {
  chat: "bg-info-soft text-on-info",
  plan: "bg-warning-soft text-on-warning",
  agent: "bg-operational-soft text-operational",
};
const MODEL_BUTTON_CLASS =
  "model-button inline-flex h-8 max-w-[220px] items-center gap-[6px] rounded-full border-0 bg-transparent px-1.5 text-sm font-medium text-text-muted transition-colors duration-[120ms] ease-in-out hover:text-text-main max-[600px]:max-w-[210px]";
const MODEL_BUTTON_TEXT_CLASS = "model-button-text truncate";
// 发送按钮对齐 Cursor：反色圆形按钮 + 上箭头。bg-text-main / text-surface 随主题翻转
// （浅色 = 近黑底白箭头，深色 = 近白底深箭头），禁用态退为灰底。
const SEND_BUTTON_CLASS =
  "send-button grid h-8 w-8 shrink-0 place-items-center rounded-full border-0 bg-text-main text-surface transition-[background,opacity] duration-[120ms] ease-in-out hover:opacity-85 disabled:cursor-default aria-disabled:cursor-default aria-disabled:bg-text-subtle aria-disabled:hover:opacity-100";
// 不含水平锚点（left/right）的基类，方便不同菜单各自选择向左/向右展开，避免 left-0 与 right-0 冲突。
const DROPDOWN_MENU_BASE_CLASS =
  "dropdown-menu absolute bottom-[calc(100%_+_8px)] z-30 min-w-[180px] overflow-hidden rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover";
const DROPDOWN_MENU_CLASS = `${DROPDOWN_MENU_BASE_CLASS} left-0`;
const COMMAND_MENU_CLUSTER_CLASS =
  "command-menu-cluster absolute bottom-[calc(100%_+_8px)] left-0 z-30 flex items-end gap-2 max-[600px]:w-[260px]";
const COMMAND_MENU_CLASS =
  "command-menu w-[240px] min-w-[240px] overflow-hidden rounded-xl border border-line bg-surface-raised/96 p-2 shadow-act-popover";
const SKILL_MENU_CLASS =
  "skill-menu max-h-[360px] w-[300px] min-w-[300px] overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-2 shadow-act-popover max-[600px]:w-[260px] max-[600px]:min-w-[260px]";
const INITIAL_DROPDOWN_MENU_BASE_CLASS =
  "dropdown-menu absolute top-[calc(100%_+_8px)] z-30 max-h-[min(360px,calc(100vh_-_120px))] overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover";
const INITIAL_DROPDOWN_MENU_CLASS = `${INITIAL_DROPDOWN_MENU_BASE_CLASS} left-0`;
const RECENT_WORKSPACE_LIMIT = 5;
const COMMAND_MENU_HINT_CLASS = "px-2 pb-2 pt-1 text-sm text-text-subtle";
const COMMAND_MENU_SEPARATOR_CLASS = "my-1 h-px bg-line";
const COMMAND_MENU_BUTTON_CLASS =
  "command-menu-button flex min-h-[34px] w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-sm font-medium text-text-main transition-colors duration-[120ms] ease-in-out hover:bg-hover-overlay focus-visible:bg-selected focus-visible:outline-none";
const COMMAND_MENU_ICON_CLASS = "text-text-muted";
const SKILL_DESCRIPTION_CLASS = "line-clamp-2 text-xs font-normal leading-4 text-text-faint";
const SKILL_SCOPE_CLASS = "ml-auto shrink-0 text-[10px] uppercase tracking-wide text-text-faint";
const SKILL_PILL_CLASS =
  "group/skill-pill inline-flex h-9 max-w-[240px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 pr-1.5 text-sm font-medium text-text-main shadow-[0_6px_16px_rgba(31,45,61,0.06)]";
const SLASH_MENU_ID = "composer-slash-command-menu";
const SLASH_FUNCTIONS_LABEL_ID = "composer-slash-functions-label";
const SLASH_SKILLS_LABEL_ID = "composer-slash-skills-label";
const SLASH_MENU_BASE_CLASS =
  "slash-command-menu absolute left-0 z-40 w-[min(520px,calc(100vw_-_36px))] max-w-full overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover transition-[opacity,transform] duration-[140ms] ease-out motion-reduce:transition-none max-[600px]:right-0 max-[600px]:w-auto";
const SLASH_MENU_POSITION_CLASS: Record<ComposerSurface, string> = {
  initial: "top-[calc(100%_+_8px)] max-h-[min(280px,calc(50vh_-_90px))]",
  followup: "bottom-[calc(100%_+_8px)] max-h-[min(420px,calc(100vh_-_120px))]",
};
const SLASH_GROUP_LABEL_CLASS =
  "sticky top-0 z-10 bg-surface-raised/96 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint";
const SLASH_FUNCTION_OPTION_CLASS =
  "slash-command-option flex min-h-9 w-full items-center gap-2 rounded-act-md border-0 bg-transparent px-2 py-1 text-left text-text-main transition-colors duration-[120ms] ease-in-out hover:bg-hover-overlay focus-visible:outline-none";
const SLASH_SKILL_OPTION_CLASS = SLASH_FUNCTION_OPTION_CLASS;
const SLASH_OPTION_ACTIVE_CLASS = "bg-selected";
const SLASH_FUNCTION_ICON_CLASS = "shrink-0 text-text-muted";
const SLASH_FUNCTION_COMMAND_CLASS = "shrink-0 font-mono text-[12px] font-medium leading-5 text-text-main";
const SLASH_FUNCTION_DESCRIPTION_CLASS = "ml-auto min-w-0 flex-1 truncate text-right text-[12px] font-normal leading-5 text-text-faint";
const SLASH_SKILL_NAME_CLASS = "max-w-[42%] shrink-0 truncate text-[12px] font-medium leading-5 text-text-main";
const SLASH_SKILL_DESCRIPTION_CLASS = SLASH_FUNCTION_DESCRIPTION_CLASS;
const SLASH_STATUS_CLASS = "px-2 py-4 text-[13px] text-text-faint";
const SLASH_EMPTY_CLASS = "px-3 py-7 text-center text-[13px] text-text-faint";
// 模型菜单维持 Cursor 式紧凑单列：主菜单只负责选择，Options 作为贴行的轻量二级浮层。
const MODEL_MENU_CLUSTER_CLASS =
  "absolute bottom-[calc(100%_+_8px)] z-30 w-[244px]";
const MODEL_MENU_BASE_CLASS =
  "model-menu max-h-[292px] w-[244px] overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-1 shadow-act-popover transition-[opacity,transform] duration-[140ms] ease-out motion-reduce:transition-none";
const MODEL_SEARCH_WRAP_CLASS =
  "sticky top-0 z-10 flex h-9 items-center gap-2 rounded-act-md bg-surface-raised px-2 text-text-faint";
const MODEL_SEARCH_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] leading-5 text-text-main outline-none placeholder:text-text-subtle";
const MODEL_SEARCH_EMPTY_CLASS = "px-2.5 py-6 text-center text-[13px] text-text-faint";
const MODEL_PROVIDER_GROUP_CLASS = "model-provider-group";
const MODEL_PROVIDER_LABEL_CLASS =
  "model-provider-label px-2 pb-1 pt-2 text-[11px] font-semibold leading-4 text-text-faint";
const MODEL_MENU_ROW_CLASS =
  "model-menu-row relative flex min-h-[34px] items-center rounded-act-md transition-colors duration-[120ms] ease-in-out hover:bg-hover-overlay focus-within:bg-selected";
const MODEL_MENU_ROW_SELECTED_CLASS = "is-selected-row";
const MODEL_SELECT_BUTTON_CLASS =
  "model-select-button flex min-h-[34px] min-w-0 flex-1 items-center justify-start rounded-act-md border-0 bg-transparent px-2 py-1.5 pr-[46px] text-left text-[14px] font-normal leading-5 text-text-main";
const MODEL_SELECT_BUTTON_SELECTED_CLASS = "pr-[58px]";
const MODEL_ROW_ACTIONS_CLASS =
  "model-row-actions absolute right-2 flex h-full min-w-[34px] items-center justify-end gap-1";
const MODEL_ROW_ACTIONS_SELECTED_CLASS = "min-w-[50px]";
const MODEL_EDIT_BUTTON_CLASS =
  "model-edit-button h-6 min-w-[34px] justify-center rounded-act-sm border-0 bg-transparent px-1.5 text-[11px] font-medium text-text-muted transition-[opacity,background,color] duration-[120ms] ease-in-out focus-visible:bg-selected focus-visible:outline-none hover:bg-selected hover:text-text-main";
const MODEL_CHECK_ICON_CLASS = "model-check-icon text-text-main";
const MODEL_OPTIONS_MENU_BASE_CLASS =
  "model-options-menu absolute z-40 w-[210px] rounded-xl border border-line bg-surface-raised/96 p-1 shadow-act-popover transition-[opacity,transform] duration-[140ms] ease-out motion-reduce:transition-none";
const MODEL_OPTIONS_ESTIMATED_HEIGHT_PX = 292;
const DROPDOWN_LABEL_CLASS = "dropdown-label px-2 pb-1 pt-1.5 text-[11px] font-medium text-text-faint";
const OPTION_SEPARATOR_CLASS = "mx-1 my-1 h-px bg-line";
const OPTION_TOGGLE_ROW_CLASS =
  "option-toggle-row flex min-h-[34px] cursor-pointer items-center gap-2 rounded-act-md px-2 py-1.5 text-[14px] text-text-main hover:bg-hover-overlay";
const OPTION_TOGGLE_LABEL_CLASS = "flex-1";
const OPTION_TOGGLE_INPUT_CLASS = "absolute opacity-0 pointer-events-none";
// 注意：track 的底色不写进基类，由 on/off 分支二选一给出，避免同属性 utility 互相覆盖。
// 同优先级、按样式表顺序覆盖导致开启时不变主题色。
const TOGGLE_TRACK_CLASS =
  "toggle-track relative inline-flex h-5 w-8 rounded-full transition-colors duration-[120ms] ease-in-out";
const TOGGLE_TRACK_ON_CLASS = "bg-operational";
const TOGGLE_TRACK_OFF_CLASS = "bg-line";
const TOGGLE_THUMB_CLASS =
  "toggle-thumb absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_4px_rgba(31,45,61,0.22)] transition-transform duration-[120ms] ease-in-out";
const TOGGLE_THUMB_ON_CLASS = "translate-x-3";
const OPTION_EMPTY_CLASS = "px-2.5 py-2 text-sm text-text-faint";
const OPTION_CHOICE_CLASS =
  "flex min-h-[32px] w-full items-center rounded-act-md border-0 bg-transparent px-2 text-left text-[13px] text-text-main transition-colors duration-[120ms] ease-in-out hover:bg-hover-overlay focus-visible:bg-selected focus-visible:outline-none disabled:cursor-default disabled:text-text-faint disabled:hover:bg-transparent";
const OPTION_CHOICE_LABEL_CLASS = "flex-1 capitalize";
const STATUS_ROW_CLASS =
  "composer-status-row flex min-h-5 items-center justify-between gap-3 px-3 text-[13px] leading-5 text-text-faint";
const STATUS_GROUP_CLASS = "flex min-w-0 items-center gap-3";
const STATUS_ITEM_CLASS = "inline-flex min-w-0 items-center gap-1.5";
const STATUS_ICON_CLASS = "shrink-0 text-text-subtle";
const STATUS_USAGE_CLASS = "inline-flex shrink-0 items-center gap-1.5 text-text-muted";
const STATUS_USAGE_DOT_CLASS = "h-[15px] w-[15px] shrink-0 rounded-full";
// 3px 环形进度：conic 填充已用占比，radial mask 挖空中心形成圆环。
const STATUS_USAGE_DOT_MASK =
  "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))";
const INITIAL_CHIP_ROW_CLASS = "initial-chip-row flex min-h-8 items-center";
const INITIAL_CHIP_CLASS =
  "initial-plan-chip inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-sm font-medium text-text-muted shadow-[0_1px_2px_rgba(31,45,61,0.04)]";
const COMPOSER_DROP_ACTIVE_CLASS = "border-line-strong bg-selected";

type ModeMenuItem = {
  mode: ComposerMode;
  label: string;
  icon: LucideIcon;
};

type ComposerSlashResult =
  | { kind: "function"; item: ComposerSlashFunction }
  | { kind: "skill"; item: SkillCatalogItem };

type ContextSelectorKind = "workspace" | "branch" | "runtime";

const MODE_MENU_ITEMS: ModeMenuItem[] = [
  { mode: "chat", label: "Chat", icon: MessageCircle },
  { mode: "plan", label: "Plan", icon: ListChecks },
];

const MODE_META: Record<Exclude<ComposerMode, "agent">, Omit<ModeMenuItem, "mode">> = {
  chat: { label: "Chat", icon: MessageCircle },
  plan: { label: "Plan", icon: ListChecks },
};

const SLASH_FUNCTION_ICONS: Record<ComposerSlashFunctionId, LucideIcon> = {
  chat: MessageCircle,
  plan: ListChecks,
  agent: Server,
  compact: Asterisk,
  eval: Search,
  status: ChartPie,
  review: GitBranch,
};

function getSlashCommandDisplayName(command: string): string {
  return command.startsWith("/") ? command.slice(1) : command;
}

type ComposerModelOption = {
  id: ModelSelectionId;
  label: string;
  provider: LlmProviderId;
  apiModel: string;
  thinkingDefault: boolean;
  supportsThinkingToggle: boolean;
  reasoningEfforts?: ModelReasoningEffort[] | null;
  reasoningDefaultEffort?: ModelReasoningEffort;
  reasoningMandatory: boolean;
};

type ComposerModelRuntimeOptions = {
  thinkingEnabled: boolean;
  reasoningEffort?: ModelReasoningEffort;
};

const REASONING_EFFORT_LABELS: Record<ModelReasoningEffort, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

const LEGACY_MODEL_OPTIONS: ComposerModelOption[] = MODEL_LIST.map((spec) => ({
  id: spec.id,
  label: spec.label,
  provider: spec.provider,
  apiModel: spec.apiModel,
  thinkingDefault: spec.thinkingDefault,
  supportsThinkingToggle: spec.supportsThinkingToggle,
  reasoningMandatory: false,
}));

function isModelEditable(model: ComposerModelOption): boolean {
  return model.supportsThinkingToggle || model.reasoningEfforts !== undefined;
}

function modelDefaultRuntimeOptions(model: ComposerModelOption | undefined): ComposerModelRuntimeOptions {
  return {
    thinkingEnabled: model?.reasoningMandatory || model?.thinkingDefault || false,
    ...((model?.provider === "duckcoding" || model?.provider === "deepseek") && model.reasoningDefaultEffort && {
      reasoningEffort: model.reasoningDefaultEffort,
    }),
  };
}

function reasoningEffortLabel(model: ComposerModelOption | undefined, effort: ModelReasoningEffort): string {
  if (model?.provider === "duckcoding" && effort === "low") return "Light";
  return REASONING_EFFORT_LABELS[effort];
}

function modelReasoningEfforts(model: ComposerModelOption | undefined): ModelReasoningEffort[] {
  if (model?.reasoningEfforts === null) return [...MODEL_REASONING_EFFORTS];
  return model?.reasoningEfforts ?? [];
}

function getComposerWrapClass(surface: ComposerSurface) {
  return surface === "initial" ? COMPOSER_INITIAL_WRAP_CLASS : COMPOSER_WRAP_CLASS;
}

function getComposerPanelClass(surface: ComposerSurface) {
  return surface === "initial" ? COMPOSER_PANEL_INITIAL_CLASS : COMPOSER_PANEL_CLASS;
}

function createAttachmentId(): string {
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function basenameOf(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized;
}

function inferAttachmentKind(file: File, path?: string): ComposerAttachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (path && /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(path)) return "image";
  return "file";
}

function attachmentFromDroppedFile(file: File): ComposerAttachment {
  const path = window.actspace?.getPathForFile?.(file) || undefined;
  const kind = inferAttachmentKind(file, path);
  return {
    id: createAttachmentId(),
    kind,
    name: path ? basenameOf(path) : file.name,
    path,
    mimeType: file.type || undefined,
    previewUrl: kind === "image"
      ? (typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined)
      : undefined,
  };
}

function revokeAttachmentPreview(attachment: ComposerAttachment): void {
  if (attachment.previewUrl?.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

function dedupeAttachments(attachments: ComposerAttachment[]): ComposerAttachment[] {
  const seen = new Set<string>();
  const result: ComposerAttachment[] = [];
  for (const attachment of attachments) {
    const key = attachment.path || `${attachment.name}:${attachment.mimeType ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(attachment);
  }
  return result;
}

function getAttachmentPreviewStyle(attachment: ComposerAttachment): CSSProperties | undefined {
  return attachment.previewUrl
    ? {
        backgroundImage: `url("${attachment.previewUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;
}

export function Composer({
  contextSnapshot,
  isStreaming = false,
  isAborting = false,
  onSend,
  onAbort,
  surface = "followup",
  defaultModelId,
  selectedModelId: controlledSelectedModelId,
  onSelectedModelChange,
  mode = "agent",
  onModeChange,
  selectedSkills = [],
  onSelectedSkillsChange,
  onOpenAttachmentPreview,
  onExpandContext,
  workspaceOptions = [],
  selectedWorkspaceRoot,
  onSelectWorkspace,
  executionContext,
  draftRestore,
  focusRequestId = 0,
  reviewSummary,
  onOpenReview,
  models,
}: {
  contextSnapshot: ContextUsageSnapshot | null;
  isStreaming?: boolean;
  isAborting?: boolean;
  onSend?: (text: string, options: ComposerSendOptions) => void | Promise<void>;
  onAbort?: () => void;
  surface?: ComposerSurface;
  /** 来自设置页的默认模型；首次到达时同步选中，用户手动选过后不再覆盖。 */
  defaultModelId?: ModelSelectionId;
  /** 会话级当前模型；提供时由上层持有，避免 initial/followup Composer 切换时丢选择。 */
  selectedModelId?: ModelSelectionId;
  onSelectedModelChange?: (modelId: ModelSelectionId) => void;
  mode?: ComposerMode;
  onModeChange?: (mode: ComposerMode) => void;
  selectedSkills?: string[];
  onSelectedSkillsChange?: (skills: string[]) => void;
  onOpenAttachmentPreview?: (attachment: ComposerAttachment) => void;
  /** 提供时 Context 弹窗显示「展开完整视图」按钮，点击在右侧面板打开 Context Tab。 */
  onExpandContext?: () => void;
  workspaceOptions?: ComposerWorkspaceOption[];
  selectedWorkspaceRoot?: string | null;
  onSelectWorkspace?: (workspaceRoot: string) => void;
  executionContext?: ComposerExecutionContext;
  draftRestore?: ComposerDraftRestore | null;
  focusRequestId?: number;
  reviewSummary?: ComposerReviewSummary | null;
  onOpenReview?: () => void;
  models?: UsableModelView[];
}) {
  const modelList: ComposerModelOption[] = models === undefined
    ? LEGACY_MODEL_OPTIONS
    : models.map((model) => ({
        id: model.key,
        label: model.label,
        provider: model.provider,
        apiModel: model.apiModel,
        thinkingDefault: model.thinkingDefault,
        supportsThinkingToggle: model.capabilities.thinkingToggle,
        reasoningEfforts: model.capabilities.reasoningEfforts,
        reasoningDefaultEffort: model.capabilities.reasoningDefaultEffort,
        reasoningMandatory: model.capabilities.reasoningMandatory === true,
      }));
  const initialModelId = controlledSelectedModelId ?? defaultModelId ?? DEFAULT_MODEL_ID;
  const [commandOpen, setCommandOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [slashMenuEntered, setSlashMenuEntered] = useState(false);
  const [skillItems, setSkillItems] = useState<SkillCatalogItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const skillLoadWorkspaceRef = useRef<string | null>(null);
  const skillLoadRequestRef = useRef(0);
  const skillsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slashFocusFrameRef = useRef<number | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelOptionsOpen, setModelOptionsOpen] = useState(false);
  const [contextSelectorOpen, setContextSelectorOpen] = useState<ContextSelectorKind | null>(null);
  const [localSelectedModelId, setLocalSelectedModelId] = useState<ModelSelectionId>(initialModelId);
  const selectedModelId = controlledSelectedModelId ?? localSelectedModelId;
  const [editingModelId, setEditingModelId] = useState<ModelSelectionId>(initialModelId);
  const [hoveredModelId, setHoveredModelId] = useState<ModelSelectionId | null>(null);
  const [focusedModelId, setFocusedModelId] = useState<ModelSelectionId | null>(null);
  const [modelOptionsOffset, setModelOptionsOffset] = useState(0);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [modelMenuEntered, setModelMenuEntered] = useState(false);
  const [modelOptionsEntered, setModelOptionsEntered] = useState(false);
  const [modelRuntimeOptions, setModelRuntimeOptions] = useState<Partial<Record<ModelSelectionId, ComposerModelRuntimeOptions>>>({});
  const userPickedModelRef = useRef(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [message, setMessage] = useState("");
  const [workspaceFolderName, setWorkspaceFolderName] = useState("");
  const [creatingWorkspaceFolder, setCreatingWorkspaceFolder] = useState(false);
  const [isInputMultiline, setIsInputMultiline] = useState(false);
  const composerRef = useRef<HTMLElement | null>(null);
  const composerBodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const commandButtonRef = useRef<HTMLButtonElement | null>(null);
  const modeButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandMenuRef = useRef<HTMLDivElement | null>(null);
  const slashMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelSearchInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelOptionsRef = useRef<HTMLDivElement | null>(null);
  const hasAttachments = attachments.length > 0 || selectedSkills.length > 0;
  const selectedModelAvailable = modelList.some((model) => model.id === selectedModelId);
  const selectedModelSpec = modelList.find((spec) => spec.id === selectedModelId);
  const canSendMessage = Boolean(
    (message.trim() || attachments.length > 0) && selectedModelAvailable,
  );
  const editingModelSpec = modelList.find((spec) => spec.id === editingModelId);
  const editingModelOptions = modelRuntimeOptions[editingModelId] ?? modelDefaultRuntimeOptions(editingModelSpec);
  const selectedModelOptions = modelRuntimeOptions[selectedModelId] ?? modelDefaultRuntimeOptions(selectedModelSpec);
  const editingReasoningEfforts = modelReasoningEfforts(editingModelSpec);
  const normalizedModelSearchQuery = modelSearchQuery.trim().toLocaleLowerCase();
  const filteredModelList = normalizedModelSearchQuery
    ? modelList.filter((model) =>
        model.label.toLocaleLowerCase().includes(normalizedModelSearchQuery) ||
        model.provider.toLocaleLowerCase().includes(normalizedModelSearchQuery) ||
        model.apiModel.toLocaleLowerCase().includes(normalizedModelSearchQuery) ||
        model.id.toLocaleLowerCase().includes(normalizedModelSearchQuery))
    : modelList;
  const filteredModelGroups = groupModelsByProvider(filteredModelList);
  const slashQuery = isStreaming ? null : parseComposerSlashQuery(message);
  const slashOpen = slashQuery !== null && !slashDismissed;
  const filteredSlashFunctions = slashQuery === null ? [] : filterComposerSlashFunctions(slashQuery);
  const filteredSlashSkills = slashQuery === null ? [] : filterComposerSlashSkills(skillItems, slashQuery);
  const slashResults: ComposerSlashResult[] = [
    ...filteredSlashFunctions.map((item): ComposerSlashResult => ({ kind: "function", item })),
    ...filteredSlashSkills.map((item): ComposerSlashResult => ({ kind: "skill", item })),
  ];
  const slashResultKey = slashResults
    .map((result) => result.kind === "function" ? `function:${result.item.id}` : `skill:${result.item.scope}:${result.item.name}`)
    .join("|");
  const activeSlashResult = slashResults[Math.min(slashActiveIndex, Math.max(0, slashResults.length - 1))];
  const activeSlashOptionId = activeSlashResult
    ? activeSlashResult.kind === "function"
      ? composerSlashFunctionOptionId(activeSlashResult.item.id)
      : composerSlashSkillOptionId(activeSlashResult.item.name)
    : undefined;
  const selectedModelDisplayLabel = selectedModelSpec
    ? formatSelectedModelLabel(selectedModelSpec, modelList)
    : modelList.length === 0
      ? "未连接模型"
      : selectedModelId;
  const selectedModelTitle = selectedModelSpec
    ? `${selectedModelSpec.provider} / ${selectedModelSpec.label} / ${selectedModelSpec.apiModel}`
    : modelList.length === 0
      ? "请先在设置中连接模型服务"
      : selectedModelId;
  const contextUsagePercent = contextSnapshot?.percentUsed ?? 0;
  const contextRingPercent = Math.max(0, Math.min(100, contextUsagePercent));
  const contextRingColor =
    contextRingPercent >= 90
      ? "var(--act-color-danger)"
      : contextRingPercent >= 75
        ? "var(--act-color-warning)"
        : "var(--act-color-text-faint)";
  // 有内容但占比不足 1% 时显示「<1」，避免「明明有数据却是 0%」的误解。
  const contextPercentLabel =
    contextSnapshot && contextSnapshot.totalTokens > 0 && contextUsagePercent <= 0
      ? "<1"
      : `${contextUsagePercent}`;
  // 单行内容用 inline 紧凑布局；内容折行、有附件或 initial surface 切 stacked（参考 Cursor）。
  const resolvedLayout: "inline" | "stacked" =
    surface === "initial" || hasAttachments || isInputMultiline ? "stacked" : "inline";
  const placeholder = mode === "chat"
    ? surface === "initial" ? "Ask anything..." : "Continue the conversation..."
    : mode === "plan"
      ? surface === "initial" ? "Plan and design before coding..." : "Refine the plan..."
      : surface === "initial"
        ? "Plan, build, or ask..."
        : "Send follow-up";
  const selectedWorkspaceLabel =
    workspaceOptions.find((workspace) => workspace.value === selectedWorkspaceRoot)?.label ??
    workspaceOptions[0]?.label ??
    "Workspace";
  const gitStatus = executionContext?.gitContext?.status;
  const gitReady = gitStatus === "ready";
  const gitHasBranch = gitReady || gitStatus === "no_head";
  const selectedBranch = executionContext?.selectedBranch ?? executionContext?.gitContext?.currentBranch;
  const runLocation = executionContext?.runLocation ?? "this_mac";

  // 默认模型可能在 Composer 挂载后才异步到达（settings:get）；只在用户尚未手动
  // 选择过模型时同步，避免覆盖用户当前会话里的临时选择。
  useEffect(() => {
    if (!defaultModelId || controlledSelectedModelId || userPickedModelRef.current) return;
    setLocalSelectedModelId(defaultModelId);
    setEditingModelId(defaultModelId);
  }, [controlledSelectedModelId, defaultModelId, models]);

  useEffect(() => {
    if (!controlledSelectedModelId) return;
    setEditingModelId(controlledSelectedModelId);
  }, [controlledSelectedModelId, models]);

  useEffect(() => {
    if (!draftRestore) return;
    setMessage(draftRestore.text);
    setAttachments((current) => {
      current.forEach(revokeAttachmentPreview);
      return draftRestore.attachments ?? [];
    });
    setAttachmentError(null);
    setSlashDismissed(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [draftRestore]);

  useEffect(() => {
    if (focusRequestId <= 0) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestId]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach(revokeAttachmentPreview);
  }, []);

  useLayoutEffect(() => {
    if (!slashOpen) {
      setSlashMenuEntered(false);
      return;
    }
    setSlashMenuEntered(false);
    const handle = window.requestAnimationFrame(() => setSlashMenuEntered(true));
    return () => window.cancelAnimationFrame(handle);
  }, [slashOpen]);

  useEffect(() => {
    if (!slashOpen) return;
    setCommandOpen(false);
    setSkillsOpen(false);
    setModelOpen(false);
    setHoveredModelId(null);
    setFocusedModelId(null);
    setModelOptionsOpen(false);
    setContextSelectorOpen(null);
    setContextOpen(false);
    void loadSkills();
  }, [selectedWorkspaceRoot, slashOpen]);

  useEffect(() => {
    if (!commandOpen && !skillsOpen && !modelOpen && !modelOptionsOpen && !contextSelectorOpen && !contextOpen) return;
    setSlashDismissed(true);
  }, [commandOpen, contextOpen, contextSelectorOpen, modelOpen, modelOptionsOpen, skillsOpen]);

  useEffect(() => {
    if (!slashOpen) return;
    setSlashActiveIndex(0);
  }, [slashOpen, slashQuery, slashResultKey]);

  useEffect(() => {
    if (!slashOpen || !activeSlashOptionId) return;
    document.getElementById(activeSlashOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeSlashOptionId, slashOpen]);

  useLayoutEffect(() => {
    if (!modelOpen) {
      setModelMenuEntered(false);
      setModelSearchQuery("");
      return;
    }
    setModelMenuEntered(false);
    const handle = window.requestAnimationFrame(() => {
      setModelMenuEntered(true);
      modelSearchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [modelOpen]);

  useLayoutEffect(() => {
    if (!modelOptionsOpen) {
      setModelOptionsEntered(false);
      return;
    }
    setModelOptionsEntered(false);
    const handle = window.requestAnimationFrame(() => setModelOptionsEntered(true));
    return () => window.cancelAnimationFrame(handle);
  }, [modelOptionsOpen, editingModelId]);

  // 原生 textarea 不会随内容自动长高（粘贴大段文本时只会内部滚动）。
  // 多行判定必须始终按 inline 布局的可用宽度测量：如果在 stacked 的全宽输入框中测量，
  // 长文本可能被误判为单行，切回更窄的 inline 后又发生折行，但 effect 不再触发，最终裁切内容。
  // 判定完成后再按当前布局宽度设置实际高度；布局切换和容器宽度变化都会安全重测。
  useLayoutEffect(() => {
    const input = inputRef.current;
    const body = composerBodyRef.current;
    if (!input || !body) return;

    function measureInput() {
      const bodyStyle = window.getComputedStyle(body);
      const paddingLeft = Number.parseFloat(bodyStyle.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(bodyStyle.paddingRight) || 0;
      const paddingWidth = paddingLeft + paddingRight;
      const columnGap = Number.parseFloat(bodyStyle.columnGap) || 0;
      const commandWidth = commandButtonRef.current?.offsetWidth ?? 0;
      const modeWidth = modeButtonRef.current?.offsetWidth ?? 0;
      const modelWidth = modelButtonRef.current?.offsetWidth ?? 0;
      const sendWidth = body.querySelector<HTMLElement>(".send-button")?.offsetWidth ?? 0;
      const inlineInputWidth = Math.max(
        1,
        body.clientWidth - paddingWidth - commandWidth - modeWidth - modelWidth - sendWidth - columnGap * 4,
      );
      const previousWidth = input.style.width;

      input.style.width = `${inlineInputWidth}px`;
      input.style.height = "auto";
      const inlineContentHeight = input.scrollHeight;

      input.style.width = previousWidth;
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
      setIsInputMultiline(inlineContentHeight > COMPOSER_SINGLE_LINE_MAX_PX);
    }

    measureInput();

    if (typeof ResizeObserver === "undefined") return;
    let observedWidth = body.clientWidth;
    const resizeObserver = new ResizeObserver(() => {
      if (body.clientWidth === observedWidth) return;
      observedWidth = body.clientWidth;
      measureInput();
    });
    resizeObserver.observe(body);
    return () => resizeObserver.disconnect();
  }, [message, mode, resolvedLayout, selectedModelId, surface]);

  function closeFloatingPanels() {
    setCommandOpen(false);
    setSkillsOpen(false);
    setSlashDismissed(true);
    setModelOpen(false);
    setHoveredModelId(null);
    setFocusedModelId(null);
    setModelOptionsOpen(false);
    setContextSelectorOpen(null);
    setContextOpen(false);
  }

  function updateModelRuntimeOptions(
    modelId: ModelSelectionId,
    update: (current: ComposerModelRuntimeOptions) => ComposerModelRuntimeOptions,
  ) {
    const model = modelList.find((candidate) => candidate.id === modelId);
    setModelRuntimeOptions((current) => ({
      ...current,
      [modelId]: update(current[modelId] ?? modelDefaultRuntimeOptions(model)),
    }));
  }

  function appendAttachments(nextAttachments: ComposerAttachment[]) {
    if (nextAttachments.length === 0) return;
    setAttachments((current) => {
      const next = dedupeAttachments([...current, ...nextAttachments]);
      const retainedIds = new Set(next.map((attachment) => attachment.id));
      nextAttachments
        .filter((attachment) => !retainedIds.has(attachment.id))
        .forEach(revokeAttachmentPreview);
      return next;
    });
    setAttachmentError(null);
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);
      if (removed) revokeAttachmentPreview(removed);
      return current.filter((attachment) => attachment.id !== attachmentId);
    });
  }

  async function handleSelectImages() {
    setCommandOpen(false);
    setSkillsOpen(false);

    if (window.actspace?.selectImages) {
      try {
        const result = await window.actspace.selectImages();
        if (!result.canceled) {
          appendAttachments(result.attachments);
        }
      } catch (error) {
        console.error("Failed to select images", error);
        setAttachmentError("图片选择失败。");
      }
      return;
    }

    console.warn("Image picker is only available in the desktop app.");
    setAttachmentError("当前环境不支持图片选择。");
  }

  async function handlePasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (imageFiles.length === 0) return;

    event.preventDefault();
    if (!window.actspace?.importComposerImage) {
      setAttachmentError("当前环境不支持粘贴图片。");
      return;
    }

    const results = await Promise.all(imageFiles.map(async (file) => {
      try {
        return await window.actspace.importComposerImage!({
          name: file.name || "pasted-image.png",
          mimeType: file.type || undefined,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      } catch {
        return { ok: false as const, error: { code: "write_failed" as const, message: "图片粘贴失败。" } };
      }
    }));
    const imported = results.flatMap((result) => result.ok ? [result.attachment] : []);
    if (imported.length > 0) appendAttachments(imported);
    let failureMessage: string | undefined;
    for (const result of results) {
      if (result.ok === false) {
        failureMessage = result.error.message;
        break;
      }
    }
    setAttachmentError(failureMessage ?? null);
  }

  async function loadSkills(forceReload = false) {
    if (!window.actspace?.listSkills) {
      skillLoadRequestRef.current += 1;
      setSkillsLoading(false);
      setSkillsError("Skills are only available in the desktop app.");
      return;
    }
    const workspaceKey = selectedWorkspaceRoot ?? "__default__";
    if (!forceReload && skillLoadWorkspaceRef.current === workspaceKey) return;
    skillLoadWorkspaceRef.current = workspaceKey;
    const requestId = skillLoadRequestRef.current + 1;
    skillLoadRequestRef.current = requestId;
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const result = await window.actspace.listSkills({ workspaceRoot: selectedWorkspaceRoot ?? undefined });
      if (skillLoadRequestRef.current !== requestId) return;
      setSkillItems(result.items
        .filter((skill) => skill.enabledForAgent && !skill.shadowed && skill.status === "available")
        .sort((left, right) => {
          if (left.scope !== right.scope) return left.scope === "project" ? -1 : 1;
          return left.name.localeCompare(right.name);
        }));
    } catch (error) {
      if (skillLoadRequestRef.current !== requestId) return;
      skillLoadWorkspaceRef.current = null;
      console.error("Failed to list Skills", error);
      setSkillsError("Failed to load Skills.");
    } finally {
      if (skillLoadRequestRef.current === requestId) setSkillsLoading(false);
    }
  }

  async function handleOpenSkills(forceReload = false) {
    setSkillsOpen(true);
    await loadSkills(forceReload);
  }

  function toggleSkill(name: string) {
    onSelectedSkillsChange?.(
      selectedSkills.includes(name)
        ? selectedSkills.filter((skill) => skill !== name)
        : [...selectedSkills, name],
    );
  }

  function cancelSkillsClose() {
    if (!skillsCloseTimerRef.current) return;
    clearTimeout(skillsCloseTimerRef.current);
    skillsCloseTimerRef.current = null;
  }

  function scheduleSkillsClose() {
    cancelSkillsClose();
    skillsCloseTimerRef.current = setTimeout(() => {
      setSkillsOpen(false);
      skillsCloseTimerRef.current = null;
    }, 120);
  }

  function createSendOptions(includeAttachments: boolean): ComposerSendOptions {
    const options: ComposerSendOptions = {
      model: selectedModelId,
      mode,
      selectedSkills,
      thinkingEnabled: selectedModelOptions.thinkingEnabled,
    };
    if (selectedModelOptions.thinkingEnabled && selectedModelOptions.reasoningEffort) {
      options.reasoningEffort = selectedModelOptions.reasoningEffort;
    }
    if (includeAttachments && attachments.length > 0) {
      options.attachments = attachments;
    }
    return options;
  }

  function cancelSlashFocusFrame() {
    if (slashFocusFrameRef.current === null) return;
    window.cancelAnimationFrame(slashFocusFrameRef.current);
    slashFocusFrameRef.current = null;
  }

  function finishSlashSelection(nextMessage = "") {
    cancelSlashFocusFrame();
    setMessage(nextMessage);
    setSlashDismissed(true);
    inputRef.current?.focus();
    if (!nextMessage) return;
    slashFocusFrameRef.current = window.requestAnimationFrame(() => {
      slashFocusFrameRef.current = null;
      const input = inputRef.current;
      if (!input || input.value !== nextMessage) return;
      input.focus();
      input.setSelectionRange(nextMessage.length, nextMessage.length);
    });
  }

  function executeSlashFunction(item: ComposerSlashFunction) {
    switch (item.id) {
      case "chat":
      case "plan":
      case "agent":
        onModeChange?.(item.id);
        finishSlashSelection();
        return;
      case "compact":
        if (!onSend || isStreaming || !selectedModelAvailable) return;
        onSend("/compact", createSendOptions(false));
        finishSlashSelection();
        return;
      case "eval":
        finishSlashSelection("/eval ");
        return;
      case "status":
        onExpandContext?.();
        finishSlashSelection();
        return;
      case "review":
        onOpenReview?.();
        finishSlashSelection();
    }
  }

  function selectSlashResult(result: ComposerSlashResult | undefined) {
    if (!result) return;
    if (result.kind === "function") {
      executeSlashFunction(result.item);
      return;
    }
    toggleSkill(result.item.name);
    finishSlashSelection();
  }

  function sendCurrentMessage() {
    if (!canSendMessage || !onSend || isStreaming) return;
    const sentAttachments = [...attachments];
    const sendResult = onSend(message.trim(), createSendOptions(true));
    void Promise.resolve(sendResult).finally(() => {
      sentAttachments.forEach(revokeAttachmentPreview);
    });
    setMessage("");
    setAttachments([]);
    setAttachmentError(null);
    closeFloatingPanels();
  }

  function handleDropFiles(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    if (isStreaming) return;

    const files = Array.from(event.dataTransfer.files);
    appendAttachments(files.map(attachmentFromDroppedFile));
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      const clickedInsideCommandPopover =
        commandButtonRef.current?.contains(target) ||
        modeButtonRef.current?.contains(target) ||
        commandMenuRef.current?.contains(target);
      const clickedInsideModelPopover =
        modelButtonRef.current?.contains(target) ||
        modelMenuRef.current?.contains(target) ||
        modelOptionsRef.current?.contains(target);

      if (!clickedInsideCommandPopover) {
        setCommandOpen(false);
        setSkillsOpen(false);
      }

      if (!clickedInsideModelPopover) {
        setModelOpen(false);
        setHoveredModelId(null);
        setFocusedModelId(null);
        setModelOptionsOpen(false);
      }

      if (composerRef.current?.contains(event.target as Node)) {
        return;
      }

      closeFloatingPanels();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeFloatingPanels();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelSkillsClose();
      cancelSlashFocusFrame();
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function renderModeMenuButton(item: ModeMenuItem) {
    const Icon = item.icon;
    return (
      <button
        className={COMMAND_MENU_BUTTON_CLASS}
        type="button"
        role="menuitem"
        key={item.mode}
        onClick={() => {
          onModeChange?.(item.mode);
          setCommandOpen(false);
          setSkillsOpen(false);
        }}
      >
        <Icon className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={2} aria-hidden="true" />
        <span>{item.label}</span>
        {mode === item.mode ? <Check className="ml-auto text-text-muted" size={15} strokeWidth={2.2} /> : null}
      </button>
    );
  }

  function renderComposerInput() {
    return (
      <textarea
        className={surface === "initial" ? COMPOSER_INITIAL_INPUT_CLASS : COMPOSER_INPUT_CLASS}
        aria-label="Message composer"
        aria-autocomplete={slashOpen ? "list" : undefined}
        aria-controls={slashOpen ? SLASH_MENU_ID : undefined}
        aria-expanded={slashOpen}
        aria-activedescendant={slashOpen ? activeSlashOptionId : undefined}
        aria-haspopup="listbox"
        placeholder={placeholder}
        rows={1}
        ref={inputRef}
        value={message}
        disabled={isStreaming}
        onChange={(event) => {
          cancelSlashFocusFrame();
          setMessage(event.target.value);
          setSlashDismissed(false);
        }}
        onPaste={(event) => {
          void handlePasteImages(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Tab" && event.shiftKey) {
            event.preventDefault();
            onModeChange?.("plan");
            return;
          }
          if (slashOpen && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setSlashDismissed(true);
            return;
          }
          if (slashOpen && slashResults.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setSlashActiveIndex((current) => (current + direction + slashResults.length) % slashResults.length);
            return;
          }
          if (event.key !== "Enter" || event.shiftKey) return;
          // IME 输入法（中文/日文等）在候选词面板按回车"上屏"时，
          // nativeEvent.isComposing 为 true 或 keyCode 为 229，此时不应触发发送。
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (slashOpen && activeSlashResult) {
            event.preventDefault();
            selectSlashResult(activeSlashResult);
            return;
          }
          event.preventDefault();
          sendCurrentMessage();
        }}
      />
    );
  }

  function renderAttachmentStrip() {
    if (!hasAttachments) return null;

    return (
      <div className={COMPOSER_ATTACHMENTS_CLASS} aria-label="Attached files">
        {attachments.map((attachment) => {
          if (attachment.kind === "image") {
            return (
              <div
                className={IMAGE_ATTACHMENT_WRAPPER_CLASS}
                aria-label={`Attached image ${attachment.name}`}
                key={attachment.id}
              >
                <button
                  className={IMAGE_ATTACHMENT_CLASS}
                  type="button"
                  aria-label={`Preview attached image ${attachment.name}`}
                  disabled={!attachment.previewUrl || !onOpenAttachmentPreview}
                  onClick={() => onOpenAttachmentPreview?.(attachment)}
                  style={getAttachmentPreviewStyle(attachment)}
                  title={attachment.name}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={IMAGE_ATTACHMENT_REMOVE_CLASS}
                      type="button"
                      aria-label={`Remove ${attachment.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAttachment(attachment.id);
                      }}
                    >
                      <X size={11} strokeWidth={2.6} aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>移除 {attachment.name}</TooltipContent>
                </Tooltip>
              </div>
            );
          }

          return (
            <div className={FILE_ATTACHMENT_CLASS} aria-label={`Attached file ${attachment.name}`} key={attachment.id}>
              <FileText size={17} strokeWidth={1.9} aria-hidden="true" />
              <span className={FILE_ATTACHMENT_NAME_CLASS}>{attachment.name}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={FILE_ATTACHMENT_REMOVE_CLASS}
                    type="button"
                    aria-label={`Remove ${attachment.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeAttachment(attachment.id);
                    }}
                  >
                    <X size={13} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>移除 {attachment.name}</TooltipContent>
              </Tooltip>
            </div>
          );
        })}
        {selectedSkills.map((skill) => (
          <div className={SKILL_PILL_CLASS} aria-label={`Selected Skill ${skill}`} key={skill}>
            <BookOpen size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className="truncate">{skill}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg text-text-faint transition-colors hover:bg-hover-overlay hover:text-text-main"
                  type="button"
                  aria-label={`Remove Skill ${skill}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleSkill(skill);
                  }}
                >
                  <X size={13} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>移除 Skill {skill}</TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
    );
  }

  function renderSkillsMenu() {
    return (
      <div className={SKILL_MENU_CLASS} role="menu" aria-label="Skills">
        <button
          className={`${COMMAND_MENU_BUTTON_CLASS} hidden max-[600px]:flex`}
          type="button"
          onClick={() => setSkillsOpen(false)}
        >
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          <span>Back</span>
        </button>
        <div className={COMMAND_MENU_HINT_CLASS}>Available Skills</div>
        {skillsLoading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-sm text-text-faint">
            <Loader2 className="animate-spin" size={16} aria-hidden="true" /> Loading Skills...
          </div>
        ) : skillsError ? (
          <div className="px-2 py-4 text-sm text-on-danger">
            <span>{skillsError}</span>
            <button
              className="ml-2 rounded-act-sm px-1.5 py-0.5 font-medium text-text-main hover:bg-hover-overlay"
              type="button"
              onClick={() => void handleOpenSkills(true)}
            >
              Retry
            </button>
          </div>
        ) : skillItems.length === 0 ? (
          <div className="px-2 py-4 text-sm text-text-faint">No enabled skills</div>
        ) : skillItems.map((skill) => (
          <button
            className={COMMAND_MENU_BUTTON_CLASS}
            type="button"
            role="menuitemcheckbox"
            aria-checked={selectedSkills.includes(skill.name)}
            key={`${skill.scope}:${skill.name}`}
            onClick={() => toggleSkill(skill.name)}
          >
            <BookOpen className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={2} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{skill.name}</span>
              <span className={SKILL_DESCRIPTION_CLASS}>{skill.description || "No description"}</span>
            </span>
            <span className={SKILL_SCOPE_CLASS}>{skill.scope}</span>
            {selectedSkills.includes(skill.name) ? <Check size={15} strokeWidth={2.2} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    );
  }

  function renderSlashMenu() {
    if (!slashOpen || slashQuery === null) return null;
    const slashMenuMotionClass = slashMenuEntered
      ? "translate-y-0 scale-100 opacity-100"
      : `pointer-events-none ${surface === "initial" ? "-translate-y-1" : "translate-y-1"} scale-[0.985] opacity-0`;
    const showSkillsGroup =
      skillsLoading ||
      Boolean(skillsError) ||
      filteredSlashSkills.length > 0 ||
      (slashQuery === "" && skillItems.length === 0);
    const showTotalEmpty =
      slashQuery !== "" &&
      filteredSlashFunctions.length === 0 &&
      filteredSlashSkills.length === 0 &&
      !skillsLoading &&
      !skillsError;

    return (
      <div
        className={`${SLASH_MENU_BASE_CLASS} ${SLASH_MENU_POSITION_CLASS[surface]} ${slashMenuMotionClass}`}
        id={SLASH_MENU_ID}
        ref={slashMenuRef}
        role="listbox"
        aria-label="Slash commands"
      >
        {filteredSlashFunctions.length > 0 ? (
          <div role="group" aria-labelledby={SLASH_FUNCTIONS_LABEL_ID}>
            <div className={SLASH_GROUP_LABEL_CLASS} id={SLASH_FUNCTIONS_LABEL_ID}>Functions</div>
            {filteredSlashFunctions.map((item) => {
              const Icon = SLASH_FUNCTION_ICONS[item.id];
              const commandDisplayName = getSlashCommandDisplayName(item.command);
              const optionId = composerSlashFunctionOptionId(item.id);
              const isActive = activeSlashOptionId === optionId;
              const isSelectedMode = item.id === mode;
              return (
                <button
                  className={`${SLASH_FUNCTION_OPTION_CLASS}${isActive ? ` ${SLASH_OPTION_ACTIVE_CLASS}` : ""}`}
                  id={optionId}
                  type="button"
                  role="option"
                  aria-label={`${commandDisplayName}: ${item.description}`}
                  aria-selected={isSelectedMode}
                  key={item.id}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    const index = slashResults.findIndex((result) => result.kind === "function" && result.item.id === item.id);
                    if (index >= 0) setSlashActiveIndex(index);
                  }}
                  onClick={() => executeSlashFunction(item)}
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
                <Loader2 className="animate-spin" size={15} aria-hidden="true" /> Loading Skills...
              </div>
            ) : skillsError ? (
              <div className={SLASH_STATUS_CLASS}>
                <span>Skills unavailable.</span>
                <button
                  className="ml-2 rounded-act-sm px-1.5 py-0.5 font-medium text-text-main hover:bg-hover-overlay"
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => void loadSkills(true)}
                >
                  Retry
                </button>
              </div>
            ) : filteredSlashSkills.length > 0 ? filteredSlashSkills.map((skill) => {
              const optionId = composerSlashSkillOptionId(skill.name);
              const isActive = activeSlashOptionId === optionId;
              const isSelected = selectedSkills.includes(skill.name);
              return (
                <button
                  className={`${SLASH_SKILL_OPTION_CLASS}${isActive ? ` ${SLASH_OPTION_ACTIVE_CLASS}` : ""}`}
                  id={optionId}
                  type="button"
                  role="option"
                  aria-label={`${skill.name}: ${skill.description || "No description"}. ${isSelected ? "Selected" : "Not selected"}`}
                  aria-selected={isSelected}
                  key={`${skill.scope}:${skill.name}`}
                  onPointerDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    const index = slashResults.findIndex((result) => result.kind === "skill" && result.item.name === skill.name);
                    if (index >= 0) setSlashActiveIndex(index);
                  }}
                  onClick={() => selectSlashResult({ kind: "skill", item: skill })}
                >
                  <BookOpen className={SLASH_FUNCTION_ICON_CLASS} size={14} strokeWidth={1.9} aria-hidden="true" />
                  <span className={SLASH_SKILL_NAME_CLASS}>{skill.name}</span>
                  {isSelected ? <Check className="shrink-0 text-text-muted" size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
                  <span className={SLASH_SKILL_DESCRIPTION_CLASS}>{skill.description || "No description"}</span>
                </button>
              );
            }) : (
              <div className={SLASH_STATUS_CLASS}>No enabled Skills</div>
            )}
          </div>
        ) : null}

        {showTotalEmpty ? (
          <div className={SLASH_EMPTY_CLASS}>No matching functions or Skills</div>
        ) : null}
      </div>
    );
  }

  function renderAddMenuButton() {
    return (
      <div className={`${CONTROL_GROUP_CLASS} [grid-area:plus]`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={COMMAND_BUTTON_CLASS}
              type="button"
              aria-label="Add agents, context, tools"
              aria-expanded={commandOpen}
              aria-haspopup="menu"
              ref={commandButtonRef}
              onClick={() => {
                setCommandOpen((value) => !value);
                setSkillsOpen(false);
                setModelOpen(false);
                setModelOptionsOpen(false);
                setContextSelectorOpen(null);
                setContextOpen(false);
              }}
            >
              <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>添加上下文、工具或附件</TooltipContent>
        </Tooltip>
        {commandOpen ? (
          <div
            className={COMMAND_MENU_CLUSTER_CLASS}
            ref={commandMenuRef}
            onPointerEnter={cancelSkillsClose}
            onPointerLeave={scheduleSkillsClose}
          >
            <div
              className={`${COMMAND_MENU_CLASS}${skillsOpen ? " max-[600px]:hidden" : ""}`}
              role="menu"
              aria-label="Add context and tools"
            >
            <div className={COMMAND_MENU_HINT_CLASS}>Choose mode or add context.</div>
              {MODE_MENU_ITEMS.map(renderModeMenuButton)}
              <div className={COMMAND_MENU_SEPARATOR_CLASS} />
              <button
                className={COMMAND_MENU_BUTTON_CLASS}
                type="button"
                role="menuitem"
                onClick={() => void handleSelectImages()}
              >
                <Image className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={2} aria-hidden="true" />
                <span>Image</span>
              </button>
              <button
                className={COMMAND_MENU_BUTTON_CLASS}
                type="button"
                role="menuitem"
                aria-expanded={skillsOpen}
                onPointerEnter={() => void handleOpenSkills()}
                onFocus={() => void handleOpenSkills()}
                onClick={() => void handleOpenSkills()}
              >
                <BookOpen className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={2} aria-hidden="true" />
                <span>Skills</span>
                <ChevronRight className="ml-auto text-text-faint" size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            {skillsOpen ? renderSkillsMenu() : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderModeSelector() {
    if (mode === "agent") return null;
    const selectedMode = MODE_META[mode];
    const Icon = selectedMode.icon;
    return (
      <button
        className={`${MODE_BUTTON_BASE_CLASS} ${MODE_BUTTON_CLASS[mode]} [grid-area:mode]`}
        type="button"
        ref={modeButtonRef}
        aria-label={`Remove ${selectedMode.label} mode`}
        disabled={isStreaming}
        onClick={() => {
          onModeChange?.("agent");
          setCommandOpen(false);
          setSkillsOpen(false);
          setModelOpen(false);
          setModelOptionsOpen(false);
          setContextSelectorOpen(null);
          setContextOpen(false);
        }}
      >
        <Icon size={15} strokeWidth={2} aria-hidden="true" />
        <span>{selectedMode.label}</span>
        <X size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
    );
  }

  function renderModelSelector() {
    // inline 时模型按钮靠右，菜单向左锚定；stacked 时从左侧向右展开。
    const modelMenuClusterClass = `${MODEL_MENU_CLUSTER_CLASS} ${resolvedLayout === "inline" ? "right-0" : "left-0"}`;
    const modelMenuMotionClass = modelMenuEntered
      ? "translate-y-0 scale-100 opacity-100"
      : "pointer-events-none translate-y-1 scale-[0.985] opacity-0";
    const modelOptionsMotionClass = modelOptionsEntered
      ? "translate-x-0 opacity-100"
      : resolvedLayout === "inline"
        ? "pointer-events-none translate-x-1 opacity-0"
        : "pointer-events-none -translate-x-1 opacity-0";
    const modelOptionsMenuClass = `${MODEL_OPTIONS_MENU_BASE_CLASS} ${modelOptionsMotionClass} ${
      resolvedLayout === "inline" ? "right-[calc(100%_+_8px)]" : "left-[calc(100%_+_8px)]"
    }`;
    return (
      <div className={`${CONTROL_GROUP_CLASS} [grid-area:model]`}>
        <button
          className={MODEL_BUTTON_CLASS}
          type="button"
          ref={modelButtonRef}
          aria-expanded={modelOpen}
          onClick={() => {
            setModelOpen((value) => !value);
            setModelOptionsOpen(false);
            setCommandOpen(false);
            setContextSelectorOpen(null);
            setContextOpen(false);
          }}
        >
          <span className={MODEL_BUTTON_TEXT_CLASS} title={selectedModelTitle}>{selectedModelDisplayLabel}</span>
          <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {modelOpen ? (
          <div className={modelMenuClusterClass}>
            <div
              className={`${MODEL_MENU_BASE_CLASS} ${modelMenuMotionClass} ${
                resolvedLayout === "inline" ? "origin-bottom-right" : "origin-bottom-left"
              }`}
              ref={modelMenuRef}
              role="menu"
              aria-label="Models"
              onScroll={() => setModelOptionsOpen(false)}
            >
              <label className={MODEL_SEARCH_WRAP_CLASS}>
                <Search size={14} strokeWidth={2} aria-hidden="true" />
                <input
                  ref={modelSearchInputRef}
                  className={MODEL_SEARCH_INPUT_CLASS}
                  type="search"
                  value={modelSearchQuery}
                  placeholder="Search models"
                  aria-label="Search models"
                  onChange={(event) => {
                    setModelSearchQuery(event.target.value);
                    setModelOptionsOpen(false);
                  }}
                />
              </label>
              {filteredModelGroups.map((group) => (
                <div
                  className={MODEL_PROVIDER_GROUP_CLASS}
                  key={group.provider}
                  role="group"
                  aria-label={group.label}
                >
                  <div className={MODEL_PROVIDER_LABEL_CLASS}>{group.label}</div>
                  {group.models.map((spec) => {
                    const showEdit =
                      hoveredModelId === spec.id ||
                      focusedModelId === spec.id ||
                      (modelOptionsOpen && editingModelId === spec.id);
                    const showApiModel = hasDuplicateModelLabelWithinProvider(spec, modelList);
                    return (
                      <div
                        className={`${MODEL_MENU_ROW_CLASS} ${spec.id === selectedModelId ? MODEL_MENU_ROW_SELECTED_CLASS : ""}`}
                        key={spec.id}
                        onPointerEnter={() => setHoveredModelId(spec.id)}
                        onPointerOver={() => setHoveredModelId(spec.id)}
                        onPointerLeave={() => {
                          setHoveredModelId((currentId) => (currentId === spec.id ? null : currentId));
                        }}
                        onMouseEnter={() => setHoveredModelId(spec.id)}
                        onMouseOver={() => setHoveredModelId(spec.id)}
                        onMouseLeave={() => {
                          setHoveredModelId((currentId) => (currentId === spec.id ? null : currentId));
                        }}
                        onFocusCapture={() => setFocusedModelId(spec.id)}
                        onBlurCapture={(event) => {
                          const nextTarget = event.relatedTarget;
                          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                            setFocusedModelId((currentId) => (currentId === spec.id ? null : currentId));
                          }
                        }}
                      >
                        <button
                          type="button"
                          className={`${MODEL_SELECT_BUTTON_CLASS} ${
                            spec.id === selectedModelId ? MODEL_SELECT_BUTTON_SELECTED_CLASS : ""
                          }`}
                          onClick={() => {
                            userPickedModelRef.current = true;
                            setLocalSelectedModelId(spec.id);
                            onSelectedModelChange?.(spec.id);
                            setEditingModelId(spec.id);
                            setHoveredModelId(null);
                            setFocusedModelId(null);
                            setModelOptionsOpen(false);
                            setModelOpen(false);
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate">{spec.label}</span>
                            {showApiModel ? (
                              <span className="block truncate font-mono text-[10px] leading-3 text-text-faint">
                                {spec.apiModel}
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <div className={`${MODEL_ROW_ACTIONS_CLASS} ${
                          spec.id === selectedModelId ? MODEL_ROW_ACTIONS_SELECTED_CLASS : ""
                        }`}>
                          {isModelEditable(spec) ? (
                            <button
                              type="button"
                              className={MODEL_EDIT_BUTTON_CLASS}
                              aria-label={`Edit ${spec.id} options`}
                              style={{
                                opacity: showEdit ? 1 : 0,
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                const row = event.currentTarget.closest<HTMLElement>(".model-menu-row");
                                const menu = modelMenuRef.current;
                                if (row && menu) {
                                  const rowOffset = Math.max(0, row.offsetTop - menu.scrollTop);
                                  const maxOffset = Math.max(0, menu.clientHeight - MODEL_OPTIONS_ESTIMATED_HEIGHT_PX);
                                  setModelOptionsOffset(Math.min(rowOffset, maxOffset));
                                }
                                setEditingModelId(spec.id);
                                setCommandOpen(false);
                                setContextSelectorOpen(null);
                                setContextOpen(false);
                                setModelOptionsOpen(true);
                              }}
                            >
                              Edit
                            </button>
                          ) : null}
                          {spec.id === selectedModelId ? (
                            <Check className={MODEL_CHECK_ICON_CLASS} size={14} strokeWidth={2.2} />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {filteredModelList.length === 0 ? (
                <div className={MODEL_SEARCH_EMPTY_CLASS}>No matching models.</div>
              ) : null}
            </div>
            {modelOptionsOpen ? (
              <div
                className={modelOptionsMenuClass}
                ref={modelOptionsRef}
                style={{ top: `${modelOptionsOffset}px` }}
              >
                <div className={DROPDOWN_LABEL_CLASS}>Options</div>
                {editingModelSpec?.supportsThinkingToggle ? (
                  <label className={OPTION_TOGGLE_ROW_CLASS}>
                    <span className={OPTION_TOGGLE_LABEL_CLASS}>Thinking</span>
                    <input
                      className={OPTION_TOGGLE_INPUT_CLASS}
                      type="checkbox"
                      checked={editingModelOptions.thinkingEnabled}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        updateModelRuntimeOptions(editingModelId, (current) => ({
                          ...current,
                          thinkingEnabled: checked,
                        }));
                      }}
                      aria-label={`${editingModelId} Thinking`}
                    />
                    <span
                      className={`${TOGGLE_TRACK_CLASS} ${editingModelOptions.thinkingEnabled ? TOGGLE_TRACK_ON_CLASS : TOGGLE_TRACK_OFF_CLASS}`}
                      aria-hidden="true"
                    >
                      <span className={`${TOGGLE_THUMB_CLASS}${editingModelOptions.thinkingEnabled ? ` ${TOGGLE_THUMB_ON_CLASS}` : ""}`} />
                    </span>
                  </label>
                ) : editingModelSpec?.reasoningMandatory ? (
                  <div className="px-2 py-1.5 text-[13px] text-text-muted">Thinking is always enabled.</div>
                ) : null}
                {editingReasoningEfforts.length > 0 ? (
                  <>
                    {(editingModelSpec?.supportsThinkingToggle || editingModelSpec?.reasoningMandatory) ? (
                      <div className={OPTION_SEPARATOR_CLASS} />
                    ) : null}
                    <div className={DROPDOWN_LABEL_CLASS}>Effort</div>
                    {editingModelSpec?.provider !== "duckcoding" && editingModelSpec?.provider !== "deepseek" ? (
                      <button
                        type="button"
                        className={OPTION_CHOICE_CLASS}
                        disabled={!editingModelOptions.thinkingEnabled}
                        onClick={() => updateModelRuntimeOptions(editingModelId, (current) => ({
                          thinkingEnabled: current.thinkingEnabled,
                        }))}
                      >
                        <span className={OPTION_CHOICE_LABEL_CLASS}>Auto</span>
                        {!editingModelOptions.reasoningEffort ? (
                          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                        ) : null}
                      </button>
                    ) : null}
                    {editingReasoningEfforts.map((effort) => (
                      <button
                        type="button"
                        className={OPTION_CHOICE_CLASS}
                        disabled={!editingModelOptions.thinkingEnabled}
                        key={effort}
                        onClick={() => updateModelRuntimeOptions(editingModelId, (current) => ({
                          ...current,
                          reasoningEffort: effort,
                        }))}
                      >
                        <span className={OPTION_CHOICE_LABEL_CLASS}>{reasoningEffortLabel(editingModelSpec, effort)}</span>
                        {editingModelOptions.reasoningEffort === effort ? (
                          <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                        ) : null}
                      </button>
                    ))}
                  </>
                ) : !editingModelSpec?.supportsThinkingToggle && !editingModelSpec?.reasoningMandatory ? (
                  <div className={OPTION_EMPTY_CLASS}>No extra options yet.</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderSendButton() {
    const sendDisabled = isAborting || (!isStreaming && !canSendMessage);
    const modelUnavailable = !selectedModelAvailable;
    const tooltipLabel = isStreaming
      ? "停止 Agent"
      : modelUnavailable
          ? "请先在设置中连接模型服务"
          : canSendMessage
            ? "发送消息"
            : "输入消息后发送";
    const ariaLabel = isStreaming
      ? "Stop agent"
      : modelUnavailable
          ? "No available model. Open Settings to connect a provider"
          : canSendMessage
            ? "Send message"
            : "Enter a message to send";

    return (
      <div className="[grid-area:send] grid">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`${SEND_BUTTON_CLASS} send-button${isStreaming ? " is-stop" : ""}${isAborting ? " is-aborting" : ""}`}
            type="button"
            aria-label={ariaLabel}
            aria-disabled={sendDisabled}
            onClick={() => {
              if (sendDisabled) return;
              if (isStreaming) {
                onAbort?.();
                return;
              }
              sendCurrentMessage();
            }}
          >
            {isStreaming ? (
              <Square size={12} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />
            ) : (
              <ArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
      </div>
    );
  }

  // display:contents 让 toolbar 保留分组语义（aria/测试定位），
  // 同时让 +/模型/发送直接参与外层 grid 的 grid-template-areas 排布。
  function renderToolbar() {
    return (
      <div className="composer-bar contents" aria-label="Composer toolbar">
        {renderAddMenuButton()}
        {renderModeSelector()}
        {renderModelSelector()}
        {renderSendButton()}
      </div>
    );
  }

  function renderPanel() {
    const composerBodyClass = mode === "agent"
      ? resolvedLayout === "inline" ? COMPOSER_BODY_AGENT_INLINE_CLASS : COMPOSER_BODY_AGENT_STACKED_CLASS
      : resolvedLayout === "inline" ? COMPOSER_BODY_INLINE_CLASS : COMPOSER_BODY_STACKED_CLASS;
    return (
      <div
        className={`${getComposerPanelClass(surface)}${isDragActive ? ` ${COMPOSER_DROP_ACTIVE_CLASS}` : ""}`}
        aria-label="Message composer panel"
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isStreaming && event.dataTransfer.types.includes("Files")) {
            setIsDragActive(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragActive(false);
          }
        }}
        onDrop={handleDropFiles}
      >
        {renderAttachmentStrip()}
        {attachmentError ? (
          <div className="px-3 pb-1 text-xs text-danger" role="alert">
            {attachmentError}
          </div>
        ) : null}
        <div
          ref={composerBodyRef}
          className={composerBodyClass}
          data-layout={resolvedLayout}
        >
          {renderComposerInput()}
          {renderToolbar()}
        </div>
        {renderSlashMenu()}
      </div>
    );
  }

  function renderReviewActionsStrip() {
    if (surface !== "followup") return null;
    if (!reviewSummary || reviewSummary.status === "empty") return null;

    const showCounts = reviewSummary.status === "changes" || reviewSummary.status === "partial";
    const isLoading = reviewSummary.status === "loading";
    const ariaLabel =
      showCounts
        ? `Review pending changes +${reviewSummary.additions ?? 0} -${reviewSummary.deletions ?? 0}`
        : reviewSummary.reason === "not_a_repository"
          ? "Review workspace changes; Git repository is not initialized"
          : "Review workspace changes";

    return (
      <div className={COMPOSER_ACTION_STRIP_CLASS} aria-label="Pending review actions">
        <button
          className={REVIEW_PREVIEW_BUTTON_CLASS}
          type="button"
          aria-label={ariaLabel}
          disabled={isLoading}
          onClick={onOpenReview}
        >
          <span>Review</span>
          {showCounts ? (
            <>
              <span className={REVIEW_ADDITION_CLASS}>+{reviewSummary.additions ?? 0}</span>
              <span className={REVIEW_DELETION_CLASS}>-{reviewSummary.deletions ?? 0}</span>
            </>
          ) : null}
        </button>
        <button className={REVIEW_OVERFLOW_BUTTON_CLASS} type="button" aria-label="More review actions">
          <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    );
  }

  function renderComposerStatusRow() {
    if (surface !== "followup") return null;

    return (
      <div className={STATUS_ROW_CLASS}>
        <div className={STATUS_GROUP_CLASS}>
          {gitHasBranch || executionContext?.locked ? (
            <span className={STATUS_ITEM_CLASS} title={selectedBranch}>
              <GitBranch className={STATUS_ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
              <span className="max-w-[240px] truncate">{selectedBranch ?? "Detached HEAD"}</span>
            </span>
          ) : null}
          <span className={STATUS_ITEM_CLASS}>
            <Laptop className={STATUS_ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
            <span>{runLocation === "worktree" ? "Worktree" : "This Mac"}</span>
          </span>
        </div>
        <button
          className={STATUS_USAGE_CLASS}
          type="button"
          aria-label={`Context usage ${contextPercentLabel}%`}
          onClick={() => {
            setContextOpen((value) => !value);
            setCommandOpen(false);
            setModelOpen(false);
            setModelOptionsOpen(false);
            setContextSelectorOpen(null);
          }}
        >
          <span
            className={STATUS_USAGE_DOT_CLASS}
            aria-hidden="true"
            style={{
              background: `conic-gradient(${contextRingColor} ${contextRingPercent}%, var(--act-color-border) ${contextRingPercent}%)`,
              WebkitMask: STATUS_USAGE_DOT_MASK,
              mask: STATUS_USAGE_DOT_MASK
            }}
          />
          <span>{contextPercentLabel}%</span>
        </button>
      </div>
    );
  }

  function renderContextSelector(kind: ContextSelectorKind, label: string, icon?: "branch" | "runtime") {
    const isWorkspaceSelector = kind === "workspace";
    const menuItems = isWorkspaceSelector ? workspaceOptions.slice(0, RECENT_WORKSPACE_LIMIT) : [];

    return (
      <div className={CONTROL_GROUP_CLASS}>
        <button
          className={INITIAL_CONTEXT_SELECTOR_CLASS}
          type="button"
          aria-label={`Select ${kind}`}
          aria-expanded={contextSelectorOpen === kind}
          aria-haspopup="menu"
          onClick={() => {
            setContextSelectorOpen((current) => (current === kind ? null : kind));
            setCommandOpen(false);
            setModelOpen(false);
            setModelOptionsOpen(false);
            setContextOpen(false);
          }}
        >
          {icon === "branch" ? <GitBranch size={14} strokeWidth={2} aria-hidden="true" /> : null}
          {icon === "runtime" ? <Laptop size={14} strokeWidth={2} aria-hidden="true" /> : null}
          <span>{label}</span>
          <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {contextSelectorOpen === kind && kind === "workspace" ? (
          <div className={`${INITIAL_DROPDOWN_MENU_CLASS} w-[240px]`} role="menu" aria-label={`${label} options`}>
            <div className={DROPDOWN_LABEL_CLASS}>Recents</div>
            {menuItems.map((item) => (
              <button
                className={COMMAND_MENU_BUTTON_CLASS}
                type="button"
                role="menuitem"
                key={item.value}
                onClick={() => {
                  if (isWorkspaceSelector) {
                    onSelectWorkspace?.(item.value);
                  }
                  setContextSelectorOpen(null);
                }}
              >
                <span>{item.label}</span>
              </button>
            ))}
            <div className={COMMAND_MENU_SEPARATOR_CLASS} />
            <button
              className={COMMAND_MENU_BUTTON_CLASS}
              type="button"
              role="menuitem"
              onClick={() => {
                executionContext?.onUseExistingWorkspace?.();
                setContextSelectorOpen(null);
              }}
            >
              <FolderOpen className={COMMAND_MENU_ICON_CLASS} size={15} aria-hidden="true" />
              <span>Use Existing...</span>
            </button>
            {creatingWorkspaceFolder ? (
              <form
                className="flex items-center gap-1.5 px-2 py-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = workspaceFolderName.trim();
                  if (!name) return;
                  executionContext?.onCreateWorkspaceFolder?.(name);
                  setWorkspaceFolderName("");
                  setCreatingWorkspaceFolder(false);
                  setContextSelectorOpen(null);
                }}
              >
                <input
                  className="min-w-0 flex-1 rounded-act-sm border border-line bg-surface px-2 py-1 text-sm text-text-main outline-none focus:border-line-strong"
                  aria-label="New folder name"
                  autoFocus
                  value={workspaceFolderName}
                  onChange={(event) => setWorkspaceFolderName(event.target.value)}
                  placeholder="Folder name"
                />
                <button className="rounded-act-sm px-2 py-1 text-sm text-text-main hover:bg-hover-overlay" type="submit">
                  Create
                </button>
              </form>
            ) : (
              <button
                className={COMMAND_MENU_BUTTON_CLASS}
                type="button"
                role="menuitem"
                onClick={() => setCreatingWorkspaceFolder(true)}
              >
                <FolderPlus className={COMMAND_MENU_ICON_CLASS} size={15} aria-hidden="true" />
                <span>New Folder</span>
              </button>
            )}
          </div>
        ) : null}
        {contextSelectorOpen === kind && kind === "branch" ? (
          <div className={`${INITIAL_DROPDOWN_MENU_CLASS} max-h-[320px] w-[300px]`} role="menu" aria-label="Branch options">
            <div className={DROPDOWN_LABEL_CLASS}>Branches</div>
            {executionContext?.gitContext?.branches.map((branch) => (
              <button
                className={COMMAND_MENU_BUTTON_CLASS}
                type="button"
                role="menuitemradio"
                aria-checked={branch.name === selectedBranch}
                key={branch.name}
                onClick={() => {
                  executionContext.onSelectBranch?.(branch.name);
                  setContextSelectorOpen(null);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {branch.name === selectedBranch ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        ) : null}
        {contextSelectorOpen === kind && kind === "runtime" ? (
          <div className={`${INITIAL_DROPDOWN_MENU_CLASS} w-[240px]`} role="menu" aria-label="Run on options">
            <div className={DROPDOWN_LABEL_CLASS}>Run on</div>
            <button className={COMMAND_MENU_BUTTON_CLASS} type="button" role="menuitem" disabled>
              <Cloud className={COMMAND_MENU_ICON_CLASS} size={16} aria-hidden="true" />
              <span className="flex-1">Cloud</span>
              <span className="text-[11px] text-text-faint">Coming soon</span>
            </button>
            <button
              className={COMMAND_MENU_BUTTON_CLASS}
              type="button"
              role="menuitemradio"
              aria-checked={runLocation === "this_mac"}
              onClick={() => {
                executionContext?.onSelectRunLocation?.("this_mac");
                setContextSelectorOpen(null);
              }}
            >
              <Laptop className={COMMAND_MENU_ICON_CLASS} size={16} aria-hidden="true" />
              <span className="flex-1">This Mac</span>
              {runLocation === "this_mac" ? <Check size={15} aria-hidden="true" /> : null}
            </button>
            <button className={COMMAND_MENU_BUTTON_CLASS} type="button" role="menuitem" disabled>
              <Server className={COMMAND_MENU_ICON_CLASS} size={16} aria-hidden="true" />
              <span className="flex-1">Remote SSH</span>
              <span className="text-[11px] text-text-faint">Coming soon</span>
            </button>
            {gitReady ? <div className={COMMAND_MENU_SEPARATOR_CLASS} /> : null}
            {gitReady ? (
              <button
                className={COMMAND_MENU_BUTTON_CLASS}
                type="button"
                role="menuitemradio"
                aria-checked={runLocation === "worktree"}
                onClick={() => {
                  executionContext?.onSelectRunLocation?.("worktree");
                  setContextSelectorOpen(null);
                }}
              >
                <Plus className={COMMAND_MENU_ICON_CLASS} size={16} aria-hidden="true" />
                <span className="flex-1">New Worktree</span>
                {runLocation === "worktree" ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            ) : gitStatus === "no_head" ? (
              <button className={COMMAND_MENU_BUTTON_CLASS} type="button" role="menuitem" disabled>
                <Plus className={COMMAND_MENU_ICON_CLASS} size={16} aria-hidden="true" />
                <span className="flex-1">New Worktree</span>
                <span className="text-[11px] text-text-faint">Requires commit</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderInitialContextRow() {
    if (surface !== "initial") return null;

    return (
      <div className={INITIAL_CONTEXT_ROW_CLASS} aria-label="Initial composer context selectors">
        {renderContextSelector("workspace", selectedWorkspaceLabel)}
        {gitHasBranch ? renderContextSelector("branch", selectedBranch ?? "Detached HEAD", "branch") : null}
        {renderContextSelector("runtime", runLocation === "worktree" ? "New Worktree" : "This Mac", "runtime")}
      </div>
    );
  }

  function renderDraftError() {
    if (!draftRestore?.error) return null;
    return (
      <div className="rounded-act-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">
        {draftRestore.error}
      </div>
    );
  }

  function renderPlanNewIdeaChip() {
    if (surface !== "initial") return null;

    return (
      <div className={INITIAL_CHIP_ROW_CLASS}>
        <button
          className={INITIAL_CHIP_CLASS}
          type="button"
          disabled={isStreaming}
          onClick={() => onModeChange?.("plan")}
        >
          Plan New Idea <span className="ml-1 text-text-faint">⇧Tab</span>
        </button>
      </div>
    );
  }

  return (
    <footer className={getComposerWrapClass(surface)} ref={composerRef}>
      {contextOpen ? (
        <ContextPopup
          snapshot={contextSnapshot}
          onClose={() => setContextOpen(false)}
          onExpand={
            onExpandContext
              ? () => {
                  onExpandContext();
                  setContextOpen(false);
                }
              : undefined
          }
        />
      ) : null}
      {renderReviewActionsStrip()}
      {renderInitialContextRow()}
      {renderDraftError()}
      {renderPanel()}
      {renderComposerStatusRow()}
      {renderPlanNewIdeaChip()}
    </footer>
  );
}
