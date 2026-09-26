import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  Asterisk,
  BookOpen,
  Bot,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  Image,
  Laptop,
  ListTodo,
  Loader2,
  MessageCircle,
  Paperclip,
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
  ChatAttachmentIssue,
  ComposerMode,
  ComposerAttachment,
  ContextState,
  ContextUsageSnapshot,
  LlmProviderId,
  MainAgentForm,
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
import { selectRequestContextEstimate } from "@actspace/client/sessions";
import { contextEstimateToSnapshot, useOptionalSessionProjection } from "../session";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";

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
  sessionId: string;
  text: string;
  attachments?: ComposerAttachment[];
  error?: string;
  attachmentIssue?: ChatAttachmentIssue;
};

export type ComposerDraftReader = (draftKey: string) => string;
export type ComposerDraftWriter = (draftKey: string, text: string) => void;
/** 空会话切换形态：由上层用目标形态新建会话替换当前空会话，并带上草稿。 */
export type ComposerAgentFormSwitch = {
  agentForm: MainAgentForm;
  mode: ComposerMode;
  draft: { text: string; attachments: ComposerAttachment[] };
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
const INITIAL_CONTEXT_ROW_CLASS = "initial-context-row relative z-20 flex min-h-7 items-center gap-3 overflow-visible px-2 text-act-md leading-5 text-text-muted max-[600px]:flex-wrap";
const INITIAL_CONTEXT_SELECTOR_CLASS =
  "initial-context-selector inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-1 py-1 text-act-md leading-5 font-medium text-text-muted transition-colors duration-(--motion-fast) ease-in-out hover:text-text-main";
const COMPOSER_ACTION_STRIP_CLASS = "composer-action-strip flex min-h-[34px] items-center gap-2";
const REVIEW_ADDITION_CLASS = "font-medium text-success";
const REVIEW_DELETION_CLASS = "font-medium text-danger";
const COMPOSER_PANEL_CLASS =
  "composer-panel relative grid overflow-visible rounded-act-lg border border-line bg-surface transition-colors duration-(--motion-fast) focus-within:border-line-strong";
const COMPOSER_PANEL_INITIAL_CLASS =
  "composer-panel composer-panel-initial relative grid overflow-visible rounded-act-lg border border-line bg-surface transition-colors duration-(--motion-fast) focus-within:border-line-strong";
const COMPOSER_ATTACHMENTS_CLASS = "composer-attachments flex min-h-14 flex-wrap items-center gap-2.5 px-3 pb-1 pt-3";
const IMAGE_ATTACHMENT_WRAPPER_CLASS = "group/image-attachment relative h-12 w-12 shrink-0";
const IMAGE_ATTACHMENT_CLASS =
  "image-attachment block h-12 w-12 overflow-hidden rounded-lg border border-line bg-surface-subtle bg-cover bg-center shadow-act-thumb transition-[border-color,opacity] duration-(--motion-fast) hover:border-line-strong hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const FILE_ATTACHMENT_CLASS =
  "file-attachment group/file-attachment inline-flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 pr-1.5 text-act-md leading-5 font-medium text-text-main shadow-act-thumb";
const FILE_ATTACHMENT_NAME_CLASS = "truncate";
const ATTACHMENT_REMOVE_BASE_CLASS =
  "attachment-remove grid place-items-center rounded-lg opacity-0 pointer-events-none transition-[background,color,opacity] duration-(--motion-base) ease-in-out";
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
// Chat followup 没有分支/运行位置/权限，状态行只剩 context 用量，所以把它收进输入框：
// inline 时位于模型与发送之间，stacked 时跟随模型排在其右侧。
const COMPOSER_BODY_CHAT_INLINE_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] [grid-template-areas:'plus_mode_input_model_context_send'] max-[600px]:gap-y-1 max-[600px]:grid-cols-[auto_auto_auto_auto_minmax(0,1fr)_auto] max-[600px]:[grid-template-areas:'input_input_input_input_input_input'_'plus_mode_model_context_._send']`;
const COMPOSER_BODY_CHAT_STACKED_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} gap-y-1 grid-cols-[auto_auto_auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'input_input_input_input_input_input'_'plus_mode_model_context_._send']`;
const COMPOSER_INPUT_CLASS =
  "composer-input block w-full min-h-[34px] max-h-[142px] [grid-area:input] resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-[7px] text-act-lg leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
const COMPOSER_INITIAL_INPUT_CLASS =
  "composer-input block w-full min-h-[76px] max-h-[172px] [grid-area:input] resize-none overflow-y-auto border-0 bg-transparent px-1.5 py-[7px] text-act-lg leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
// 单行高度 = 20px line-height + 7px*2 padding = 34px；超过它说明内容折行（显式换行或自动 wrap）。
const COMPOSER_SINGLE_LINE_MAX_PX = 40;
const CONTROL_GROUP_CLASS = "control-group relative";
// 附件按钮对齐主流 Web 聊天：无边框纯图标，只在 hover / focus 时出现浅色圆底。
const MODE_BUTTON_BASE_CLASS =
  "mode-button inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-0 px-2.5 text-act-md leading-5 font-medium transition-[filter,opacity] duration-(--motion-fast) ease-in-out hover:brightness-95";
const MODE_BUTTON_CLASS: Record<ComposerMode, string> = {
  plan: "bg-warning-soft text-on-warning",
  agent: "bg-operational-soft text-operational",
};
const MODEL_BUTTON_CLASS =
  "model-button inline-flex h-8 max-w-[220px] items-center gap-[6px] rounded-full border-0 bg-transparent px-1.5 text-act-md leading-5 font-medium text-text-muted transition-colors duration-(--motion-fast) ease-in-out hover:text-text-main max-[600px]:max-w-[210px]";
const MODEL_BUTTON_TEXT_CLASS = "model-button-text truncate";
// 发送按钮对齐 Cursor：反色圆形按钮 + 上箭头。bg-text-main / text-surface 随主题翻转
// （浅色 = 近黑底白箭头，深色 = 近白底深箭头），禁用态退为灰底。
// 不含水平锚点（left/right）的基类，方便不同菜单各自选择向左/向右展开，避免 left-0 与 right-0 冲突。
const DROPDOWN_MENU_BASE_CLASS =
  "dropdown-menu absolute bottom-[calc(100%_+_8px)] z-30 min-w-[180px] overflow-hidden rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover";
const DROPDOWN_MENU_CLASS = `${DROPDOWN_MENU_BASE_CLASS} left-0`;
// + 菜单对齐 Cursor：与输入框同宽的面板，行内「图标 · 名称 · 灰色说明」；Skills 在同一面板内下钻。
const COMMAND_MENU_CLASS =
  "command-menu absolute bottom-[calc(100%_+_8px)] left-0 right-0 z-30 max-h-[min(420px,calc(100vh_-_160px))] overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover";
const COMMAND_MENU_ROW_CLASS =
  "command-menu-row flex min-h-[34px] w-full items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 text-left text-act-md leading-5 text-text-main transition-colors duration-(--motion-fast) ease-in-out hover:bg-hover-overlay focus-visible:bg-selected focus-visible:outline-none";
const COMMAND_MENU_ROW_LABEL_CLASS = "shrink-0 font-medium";
const COMMAND_MENU_ROW_DESCRIPTION_CLASS = "min-w-0 truncate text-act-sm text-text-faint";
const COMMAND_MENU_BACK_ROW_CLASS =
  "command-menu-back flex min-h-[30px] w-full items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-left text-act-sm font-medium text-text-muted transition-colors duration-(--motion-fast) ease-in-out hover:bg-hover-overlay hover:text-text-main focus-visible:bg-selected focus-visible:outline-none";
const INITIAL_DROPDOWN_MENU_BASE_CLASS =
  "dropdown-menu absolute top-[calc(100%_+_8px)] z-30 max-h-[min(360px,calc(100vh_-_120px))] overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover";
const INITIAL_DROPDOWN_MENU_CLASS = `${INITIAL_DROPDOWN_MENU_BASE_CLASS} left-0`;
const RECENT_WORKSPACE_LIMIT = 5;
const COMMAND_MENU_SEPARATOR_CLASS = "my-1 h-px bg-line";
const COMMAND_MENU_BUTTON_CLASS =
  "command-menu-button flex min-h-[34px] w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-act-md leading-5 font-medium text-text-main transition-colors duration-(--motion-fast) ease-in-out hover:bg-hover-overlay focus-visible:bg-selected focus-visible:outline-none";
const COMMAND_MENU_ICON_CLASS = "text-text-muted";
const SKILL_SCOPE_CLASS = "ml-auto shrink-0 text-act-xxs uppercase tracking-wide text-text-faint";
const SKILL_PILL_CLASS =
  "group/skill-pill inline-flex h-9 max-w-[240px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 pr-1.5 text-act-md leading-5 font-medium text-text-main shadow-act-thumb";
const SLASH_MENU_ID = "composer-slash-command-menu";
const SLASH_FUNCTIONS_LABEL_ID = "composer-slash-functions-label";
const SLASH_SKILLS_LABEL_ID = "composer-slash-skills-label";
const SLASH_MENU_BASE_CLASS =
  "slash-command-menu absolute left-0 z-40 w-[min(520px,calc(100vw_-_36px))] max-w-full overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover transition-[opacity,transform] duration-(--motion-fast) ease-out motion-reduce:transition-none max-[600px]:right-0 max-[600px]:w-auto";
const SLASH_MENU_POSITION_CLASS: Record<ComposerSurface, string> = {
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
// 模型菜单维持 Cursor 式紧凑单列：主菜单只负责选择，Options 作为贴行的轻量二级浮层。
const MODEL_MENU_CLUSTER_CLASS =
  "absolute bottom-[calc(100%_+_8px)] z-30 w-[244px]";
const MODEL_MENU_BASE_CLASS =
  "model-menu max-h-[292px] w-[244px] overflow-y-auto rounded-xl border border-line bg-surface-raised/96 p-1 shadow-act-popover transition-[opacity,transform] duration-(--motion-fast) ease-out motion-reduce:transition-none";
const MODEL_SEARCH_WRAP_CLASS =
  "sticky top-0 z-10 flex h-9 items-center gap-2 rounded-act-md bg-surface-raised px-2 text-text-faint";
const MODEL_SEARCH_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent p-0 text-act-sm leading-5 text-text-main outline-none placeholder:text-text-subtle";
const MODEL_SEARCH_EMPTY_CLASS = "px-2.5 py-6 text-center text-act-sm text-text-faint";
const MODEL_PROVIDER_GROUP_CLASS = "model-provider-group";
const MODEL_PROVIDER_LABEL_CLASS =
  "model-provider-label px-2 pb-1 pt-2 text-act-xxs font-semibold leading-4 text-text-faint";
const MODEL_MENU_ROW_CLASS =
  "model-menu-row relative flex min-h-[34px] items-center rounded-act-md transition-colors duration-(--motion-fast) ease-in-out hover:bg-hover-overlay focus-within:bg-selected";
const MODEL_MENU_ROW_SELECTED_CLASS = "is-selected-row";
const MODEL_SELECT_BUTTON_CLASS =
  "model-select-button flex min-h-[34px] min-w-0 flex-1 items-center justify-start rounded-act-md border-0 bg-transparent px-2 py-1.5 pr-[46px] text-left text-act-md font-normal leading-5 text-text-main";
const MODEL_SELECT_BUTTON_SELECTED_CLASS = "pr-[58px]";
const MODEL_ROW_ACTIONS_CLASS =
  "model-row-actions absolute right-2 flex h-full min-w-[34px] items-center justify-end gap-1";
const MODEL_ROW_ACTIONS_SELECTED_CLASS = "min-w-[50px]";
const MODEL_EDIT_BUTTON_CLASS =
  "model-edit-button h-6 min-w-[34px] justify-center rounded-act-sm border-0 bg-transparent px-1.5 text-act-xxs font-medium text-text-muted transition-[opacity,background,color] duration-(--motion-fast) ease-in-out focus-visible:bg-selected focus-visible:outline-none hover:bg-selected hover:text-text-main";
const MODEL_CHECK_ICON_CLASS = "model-check-icon text-text-main";
const MODEL_OPTIONS_MENU_BASE_CLASS =
  "model-options-menu absolute z-40 w-[210px] rounded-xl border border-line bg-surface-raised/96 p-1 shadow-act-popover transition-[opacity,transform] duration-(--motion-fast) ease-out motion-reduce:transition-none";
const MODEL_OPTIONS_ESTIMATED_HEIGHT_PX = 292;
const DROPDOWN_LABEL_CLASS = "dropdown-label px-2 pb-1 pt-1.5 text-act-xxs font-medium text-text-faint";
const OPTION_SEPARATOR_CLASS = "mx-1 my-1 h-px bg-line";
const OPTION_TOGGLE_ROW_CLASS =
  "option-toggle-row flex min-h-[34px] cursor-pointer items-center gap-2 rounded-act-md px-2 py-1.5 text-act-md text-text-main hover:bg-hover-overlay";
const OPTION_TOGGLE_LABEL_CLASS = "flex-1";
const OPTION_TOGGLE_INPUT_CLASS = "absolute opacity-0 pointer-events-none";
// 注意：track 的底色不写进基类，由 on/off 分支二选一给出，避免同属性 utility 互相覆盖。
// 同优先级、按样式表顺序覆盖导致开启时不变主题色。
const TOGGLE_TRACK_CLASS =
  "toggle-track relative inline-flex h-5 w-8 rounded-full transition-colors duration-(--motion-fast) ease-in-out";
const TOGGLE_TRACK_ON_CLASS = "bg-operational";
const TOGGLE_TRACK_OFF_CLASS = "bg-line";
const TOGGLE_THUMB_CLASS =
  "toggle-thumb absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-act-knob transition-transform duration-(--motion-fast) ease-in-out";
const TOGGLE_THUMB_ON_CLASS = "translate-x-3";
const OPTION_EMPTY_CLASS = "px-2.5 py-2 text-act-md leading-5 text-text-faint";
const OPTION_CHOICE_CLASS =
  "flex min-h-[32px] w-full items-center rounded-act-md border-0 bg-transparent px-2 text-left text-act-sm text-text-main transition-colors duration-(--motion-fast) ease-in-out hover:bg-hover-overlay focus-visible:bg-selected focus-visible:outline-none disabled:cursor-default disabled:text-text-faint disabled:hover:bg-transparent";
const OPTION_CHOICE_LABEL_CLASS = "flex-1 capitalize";
const STATUS_ROW_CLASS =
  "composer-status-row flex min-h-5 items-center justify-between gap-3 px-3 text-act-sm leading-5 text-text-faint";
const STATUS_GROUP_CLASS = "flex min-w-0 items-center gap-3";
const STATUS_ITEM_CLASS = "inline-flex min-w-0 items-center gap-1.5";
const STATUS_ICON_CLASS = "shrink-0 text-text-subtle";
const STATUS_USAGE_CLASS = "inline-flex shrink-0 items-center gap-1.5 text-text-muted";
const STATUS_USAGE_DOT_CLASS = "h-[15px] w-[15px] shrink-0 rounded-full";
const INLINE_USAGE_CLASS =
  "[grid-area:context] inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border-0 bg-transparent px-1.5 text-act-sm text-text-faint transition-colors duration-(--motion-fast) ease-in-out hover:text-text-main aria-expanded:text-text-main";
const INLINE_USAGE_DOT_CLASS = "h-[13px] w-[13px] shrink-0 rounded-full";
// 3px 环形进度：conic 填充已用占比，radial mask 挖空中心形成圆环。
const STATUS_USAGE_DOT_MASK =
  "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))";
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

type CommandMenuModeKey = "agent" | "plan" | "chat";

// + 菜单的模式区是完整的模式选择器，当前模式打勾；Chat 形态绑定 Session，只在空会话里可选。
// 语义色：Agent 蓝、Plan 黄、Chat 绿，与 Composer 中的模式标签一致。
const COMMAND_MENU_MODES: Record<CommandMenuModeKey, { label: string; description: string; icon: LucideIcon; iconClass: string }> = {
  agent: { label: "Agent", description: "读写工作区、执行命令，完成开发任务", icon: Bot, iconClass: "text-info" },
  plan: { label: "Plan", description: "先规划和设计，再编写代码", icon: ListTodo, iconClass: "text-warning" },
  chat: { label: "Chat", description: "日常对话、联网查询与生图，不接触工作区", icon: MessageCircle, iconClass: "text-operational" },
};
const CHAT_MODE_PILL_CLASS = "bg-operational-soft text-operational";

const MODE_META: Record<Exclude<ComposerMode, "agent">, Omit<ModeMenuItem, "mode">> = {
  plan: { label: "Plan", icon: ListTodo },
};

const SLASH_FUNCTION_ICONS: Record<ComposerSlashFunctionId, LucideIcon> = {
  plan: ListTodo,
  agent: Bot,
  compact: Asterisk,
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
    ...(model?.reasoningDefaultEffort && {
      reasoningEffort: model.reasoningDefaultEffort,
    }),
  };
}

function currentModelRuntimeOptions(model: ComposerModelOption | undefined, saved?: ComposerModelRuntimeOptions): ComposerModelRuntimeOptions {
  if (!saved) return modelDefaultRuntimeOptions(model);
  const thinkingEnabled = Boolean(model?.reasoningMandatory || ((model && isModelEditable(model)) && saved.thinkingEnabled));
  return { thinkingEnabled, ...(thinkingEnabled && saved.reasoningEffort && modelReasoningEfforts(model).includes(saved.reasoningEffort) ? { reasoningEffort: saved.reasoningEffort } : {}) };
}

function reasoningEffortLabel(model: ComposerModelOption | undefined, effort: ModelReasoningEffort): string {
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
  contextState,
  sessionId,
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
  onAgentFormChange,
  selectedSkills = [],
  onSelectedSkillsChange,
  onOpenAttachmentPreview,
  onExpandContext,
  workspaceOptions = [],
  selectedWorkspaceRoot,
  onSelectWorkspace,
  executionContext,
  draftRestore,
  draftKey,
  readDraft,
  writeDraft,
  inputHistory = [],
  focusRequestId = 0,
  reviewSummary,
  onOpenReview,
  models,
  agentForm = "agent",
  permissionControl,
}: {
  contextSnapshot: ContextUsageSnapshot | null;
  contextState?: ContextState | null;
  sessionId?: string | null;
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
  /** 仅 initial（空会话）生效：提供时 + 菜单与 Chat 标签可在 Chat / Agent 形态间切换。 */
  onAgentFormChange?: (change: ComposerAgentFormSwitch) => void;
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
  draftKey?: string;
  readDraft?: ComposerDraftReader;
  writeDraft?: ComposerDraftWriter;
  inputHistory?: string[];
  focusRequestId?: number;
  reviewSummary?: ComposerReviewSummary | null;
  onOpenReview?: () => void;
  models?: UsableModelView[];
  agentForm?: MainAgentForm;
  permissionControl?: ReactNode;
}) {
  const isChatForm = agentForm === "chat";
  // 形态在 Session 创建时绑定 preset；只有还没发过消息的空会话允许「换一个形态重新开始」。
  const canSwitchAgentForm = surface === "initial" && Boolean(onAgentFormChange) && !isStreaming;
  const sessionProjection = useOptionalSessionProjection();
  const projectionCell = sessionProjection !== null && sessionProjection.sessionId !== null && sessionProjection.sessionId === (sessionId ?? sessionProjection.sessionId)
    ? sessionProjection.cell
    : null;
  const projectedContextEstimate = projectionCell ? selectRequestContextEstimate(projectionCell) : null;
  const effectiveContextSnapshot: ContextUsageSnapshot | null = (contextState ? {
    basis: contextState.basis,
    totalTokens: contextState.totalEstimatedTokens,
    maxTokens: contextState.maxTokens,
    percentUsed: contextState.percentUsed,
    estimator: contextState.estimator,
    buckets: contextState.buckets,
  } : null)
    ?? contextSnapshot
    ?? (projectedContextEstimate ? contextEstimateToSnapshot(projectedContextEstimate) : null);
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
  const [sendError, setSendError] = useState<{ message: string; issue?: ChatAttachmentIssue } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [message, setMessage] = useState(() => draftKey && readDraft ? readDraft(draftKey) : "");
  const [workspaceFolderName, setWorkspaceFolderName] = useState("");
  const [creatingWorkspaceFolder, setCreatingWorkspaceFolder] = useState(false);
  const [isInputMultiline, setIsInputMultiline] = useState(false);
  const composerRef = useRef<HTMLElement | null>(null);
  const composerBodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const historyIndexRef = useRef<number | null>(null);
  const commandButtonRef = useRef<HTMLButtonElement | null>(null);
  const modeButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandMenuRef = useRef<HTMLDivElement | null>(null);
  const slashMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelSearchInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelOptionsRef = useRef<HTMLDivElement | null>(null);
  const hasAttachments = attachments.length > 0 || (!isChatForm && selectedSkills.length > 0);
  const selectedModelAvailable = modelList.some((model) => model.id === selectedModelId);
  const selectedModelSpec = modelList.find((spec) => spec.id === selectedModelId);
  const canSendMessage = Boolean(
    (message.trim() || attachments.length > 0) && selectedModelAvailable,
  );
  const editingModelSpec = modelList.find((spec) => spec.id === editingModelId);
  const editingModelOptions = currentModelRuntimeOptions(editingModelSpec, modelRuntimeOptions[editingModelId]);
  const selectedModelOptions = currentModelRuntimeOptions(selectedModelSpec, modelRuntimeOptions[selectedModelId]);
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
  const filteredSlashFunctions = slashQuery === null ? [] : filterComposerSlashFunctions(slashQuery).filter((item) => !isChatForm || ["compact", "status"].includes(item.id));
  const filteredSlashSkills = slashQuery === null || isChatForm ? [] : filterComposerSlashSkills(skillItems, slashQuery);
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
  const contextUsagePercent = effectiveContextSnapshot?.percentUsed ?? 0;
  const contextRingPercent = Math.max(0, Math.min(100, contextUsagePercent));
  const contextRingColor =
    contextRingPercent >= 90
      ? "var(--act-color-danger)"
      : contextRingPercent >= 75
        ? "var(--act-color-warning)"
        : "var(--act-color-text-faint)";
  // 有内容但占比不足 1% 时显示「<1」，避免「明明有数据却是 0%」的误解。
  const contextPercentLabel = effectiveContextSnapshot && effectiveContextSnapshot.maxTokens > 0 && effectiveContextSnapshot.totalTokens > 0 && contextUsagePercent <= 0
      ? "<1"
      : `${Math.floor(contextUsagePercent)}`;
  // 单行内容用 inline 紧凑布局；内容折行、有附件或 initial surface 切 stacked（参考 Cursor）。
  const showInlineContextUsage = isChatForm && surface === "followup";
  const resolvedLayout: "inline" | "stacked" =
    surface === "initial" || hasAttachments || isInputMultiline ? "stacked" : "inline";
  const placeholder = isChatForm
    ? surface === "initial" ? "有什么想聊的？" : "继续对话…"
    : mode === "plan"
      ? surface === "initial" ? "先规划和设计，再编写代码…" : "继续完善方案…"
      : surface === "initial"
        ? "规划、构建，或提出问题…"
        : "继续补充…";
  const selectedWorkspaceLabel =
    workspaceOptions.find((workspace) => workspace.value === selectedWorkspaceRoot)?.label ??
    workspaceOptions[0]?.label ??
    "工作区";
  const gitStatus = executionContext?.gitContext?.status;
  const gitReady = gitStatus === "ready";
  const gitHasBranch = gitReady || gitStatus === "no_head";
  const selectedBranch = executionContext?.selectedBranch ?? executionContext?.gitContext?.currentBranch;
  const detachedHead = gitReady && Boolean(executionContext?.gitContext?.detachedCommit);
  const branchLabel = selectedBranch || (detachedHead ? "分离的 HEAD" : undefined);
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
    if (!draftKey || !readDraft) return;
    setMessage(readDraft(draftKey));
    setSendError(null);
    historyIndexRef.current = null;
    setSlashDismissed(false);
  }, [draftKey, readDraft]);

  useEffect(() => {
    if (!draftRestore || draftRestore.sessionId !== draftKey) return;
    setMessage(draftRestore.text);
    if (draftKey) writeDraft?.(draftKey, draftRestore.text);
    historyIndexRef.current = null;
    setAttachments((current) => {
      current.forEach(revokeAttachmentPreview);
      return draftRestore.attachments ?? [];
    });
    setAttachmentError(null);
    setSendError(draftRestore.error ? { message: draftRestore.error, issue: draftRestore.attachmentIssue } : null);
    setSlashDismissed(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [draftKey, draftRestore, writeDraft]);

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
    setSendError((current) => {
      if (!current?.issue) return current;
      if (current.issue.attachmentId === attachmentId) return null;
      if (current.issue.code !== "total_text_too_large" || !current.issue.textCharacterCounts) return current;
      const counts = { ...current.issue.textCharacterCounts };
      delete counts[attachmentId];
      return Object.values(counts).reduce((sum, count) => sum + count, 0) > (current.issue.limit ?? 256_000)
        ? { ...current, issue: { ...current.issue, textCharacterCounts: counts } } : null;
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

  async function handleSelectChatFiles() {
    setCommandOpen(false);
    setSkillsOpen(false);

    if (window.actspace?.selectFiles) {
      try {
        const result = await window.actspace.selectFiles();
        if (!result.canceled) appendAttachments(result.attachments);
      } catch (error) {
        console.error("Failed to select Chat attachments", error);
        setAttachmentError("附件选择失败。");
      }
      return;
    }

    console.warn("File picker is only available in the desktop app.");
    setAttachmentError("当前环境不支持附件选择。");
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
      setSkillsError("请在桌面应用中使用 Skills。");
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
      setSkillsError("加载 Skills 失败。");
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

  function switchAgentForm(nextForm: MainAgentForm, nextMode: ComposerMode) {
    setCommandOpen(false);
    setSkillsOpen(false);
    onAgentFormChange?.({
      agentForm: nextForm,
      mode: nextMode,
      // Agent 形态只接受图片附件；Chat 形态图片和文本文件都接受。
      draft: { text: message, attachments: nextForm === "agent" ? attachments.filter((item) => item.kind === "image") : attachments },
    });
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
    if (draftKey) writeDraft?.(draftKey, nextMessage);
    historyIndexRef.current = null;
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
    if (draftKey) writeDraft?.(draftKey, "");
    historyIndexRef.current = null;
    setAttachments([]);
    setAttachmentError(null);
    closeFloatingPanels();
    setSendError(null);
  }

  function navigateInputHistory(direction: -1 | 1): boolean {
    if (inputHistory.length === 0) return false;

    const currentIndex = historyIndexRef.current;
    if (currentIndex === null) {
      if (direction === 1 || message.length > 0) return false;
      const nextIndex = inputHistory.length - 1;
      const nextMessage = inputHistory[nextIndex] ?? "";
      historyIndexRef.current = nextIndex;
      setMessage(nextMessage);
      if (draftKey) writeDraft?.(draftKey, nextMessage);
      window.requestAnimationFrame(() => {
        const input = inputRef.current;
        input?.setSelectionRange(input.value.length, input.value.length);
      });
      return true;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0) return true;

    if (nextIndex >= inputHistory.length) {
      historyIndexRef.current = null;
      setMessage("");
      if (draftKey) writeDraft?.(draftKey, "");
      return true;
    }

    const nextMessage = inputHistory[nextIndex] ?? "";
    historyIndexRef.current = nextIndex;
    setMessage(nextMessage);
    if (draftKey) writeDraft?.(draftKey, nextMessage);
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      input?.setSelectionRange(input.value.length, input.value.length);
    });
    return true;
  }

  function handleDropFiles(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    if (isStreaming) return;

    const files = Array.from(event.dataTransfer.files);
    if (isChatForm) {
      const unsupported = files.find((file) => {
        const path = window.actspace?.getPathForFile?.(file) || file.name;
        return !/\.(png|jpe?g|webp|gif|txt|md|markdown|json|csv)$/i.test(path);
      });
      if (unsupported) {
        setAttachmentError("Chat 仅支持图片、TXT、Markdown、JSON 和 CSV 文件。");
        return;
      }
    }
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
      cancelSlashFocusFrame();
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function renderCommandModeRow(key: CommandMenuModeKey) {
    const item = COMMAND_MENU_MODES[key];
    const Icon = item.icon;
    const selected = isChatForm ? key === "chat" : key === mode;
    return (
      <button
        className={COMMAND_MENU_ROW_CLASS}
        type="button"
        role="menuitem"
        key={key}
        aria-label={item.label}
        onClick={() => {
          if (selected) {
            setCommandOpen(false);
            return;
          }
          if (key === "chat") return switchAgentForm("chat", "agent");
          if (isChatForm) return switchAgentForm("agent", key);
          onModeChange?.(key);
          setCommandOpen(false);
          setSkillsOpen(false);
        }}
      >
        <Icon className={`shrink-0 ${item.iconClass}`} size={16} strokeWidth={1.9} aria-hidden="true" />
        <span className={COMMAND_MENU_ROW_LABEL_CLASS}>{item.label}</span>
        <span className={COMMAND_MENU_ROW_DESCRIPTION_CLASS}>{item.description}</span>
        {selected ? <Check className="ml-auto shrink-0 text-text-muted" size={15} strokeWidth={2.2} aria-hidden="true" /> : null}
      </button>
    );
  }

  function renderComposerInput() {
    return (
      <textarea
        className={surface === "initial" ? COMPOSER_INITIAL_INPUT_CLASS : COMPOSER_INPUT_CLASS}
        aria-label="消息输入框"
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
          if (draftKey) writeDraft?.(draftKey, event.target.value);
          historyIndexRef.current = null;
          setSlashDismissed(false);
        }}
        onPaste={(event) => {
          void handlePasteImages(event);
        }}
        onKeyDown={(event) => {
          if (!isChatForm && event.key === "Tab" && event.shiftKey) {
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
          if (
            (event.key === "ArrowUp" || event.key === "ArrowDown") &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229 &&
            navigateInputHistory(event.key === "ArrowUp" ? -1 : 1)
          ) {
            event.preventDefault();
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
      <div className={COMPOSER_ATTACHMENTS_CLASS} aria-label="已附加的文件">
        {attachments.map((attachment) => {
          if (attachment.kind === "image") {
            return (
              <div
                className={IMAGE_ATTACHMENT_WRAPPER_CLASS}
                aria-label={`已附加的图片 ${attachment.name}`}
                aria-describedby={sendError?.issue?.attachmentId === attachment.id ? "composer-send-error" : undefined}
                key={attachment.id}
              >
                <button
                  className={IMAGE_ATTACHMENT_CLASS}
                  type="button"
                  aria-label={`预览附加图片 ${attachment.name}`}
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
                      aria-label={`移除 ${attachment.name}`}
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
            <div className={FILE_ATTACHMENT_CLASS} aria-label={`已附加的文件 ${attachment.name}`} aria-describedby={sendError?.issue?.attachmentId === attachment.id ? "composer-send-error" : undefined} key={attachment.id}>
              <FileText size={17} strokeWidth={1.9} aria-hidden="true" />
              <span className={FILE_ATTACHMENT_NAME_CLASS}>{attachment.name}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={FILE_ATTACHMENT_REMOVE_CLASS}
                    type="button"
                    aria-label={`移除 ${attachment.name}`}
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
          <div className={SKILL_PILL_CLASS} aria-label={`已选择的 Skill ${skill}`} key={skill}>
            <BookOpen size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className="truncate">{skill}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg text-text-faint transition-colors hover:bg-hover-overlay hover:text-text-main"
                  type="button"
                  aria-label={`移除 Skill ${skill}`}
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
      <div className={COMMAND_MENU_CLASS} ref={commandMenuRef} role="menu" aria-label="Skills">
        <button
          className={COMMAND_MENU_BACK_ROW_CLASS}
          type="button"
          aria-label="返回"
          onClick={() => setSkillsOpen(false)}
        >
          <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
          <span>Skills</span>
        </button>
        <div className={COMMAND_MENU_SEPARATOR_CLASS} />
        {skillsLoading ? (
          <div className="flex items-center gap-2 px-2 py-4 text-act-md leading-5 text-text-faint">
            <Loader2 className="animate-spin" size={16} aria-hidden="true" /> 正在加载 Skills…
          </div>
        ) : skillsError ? (
          <div className="px-2 py-4 text-act-md leading-5 text-on-danger">
            <span>{skillsError}</span>
            <button
              className="ml-2 rounded-act-sm px-1.5 py-0.5 font-medium text-text-main hover:bg-hover-overlay"
              type="button"
              onClick={() => void handleOpenSkills(true)}
            >
              重试
            </button>
          </div>
        ) : skillItems.length === 0 ? (
          <div className="px-2 py-4 text-act-md leading-5 text-text-faint">暂无已启用的 Skills</div>
        ) : skillItems.map((skill) => (
          <button
            className={COMMAND_MENU_ROW_CLASS}
            type="button"
            role="menuitemcheckbox"
            aria-checked={selectedSkills.includes(skill.name)}
            key={`${skill.scope}:${skill.name}`}
            onClick={() => toggleSkill(skill.name)}
          >
            <BookOpen className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className={COMMAND_MENU_ROW_LABEL_CLASS}>{skill.name}</span>
            <span className={COMMAND_MENU_ROW_DESCRIPTION_CLASS}>{skill.description || "暂无说明"}</span>
            <span className={SKILL_SCOPE_CLASS}>{skill.scope}</span>
            {selectedSkills.includes(skill.name) ? <Check className="shrink-0 text-text-muted" size={15} strokeWidth={2.2} aria-hidden="true" /> : null}
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
        aria-label="斜杠命令"
      >
        {filteredSlashFunctions.length > 0 ? (
          <div role="group" aria-labelledby={SLASH_FUNCTIONS_LABEL_ID}>
            <div className={SLASH_GROUP_LABEL_CLASS} id={SLASH_FUNCTIONS_LABEL_ID}>功能</div>
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
                <Loader2 className="animate-spin" size={15} aria-hidden="true" /> 正在加载 Skills…
              </div>
            ) : skillsError ? (
              <div className={SLASH_STATUS_CLASS}>
                <span>Skills 暂不可用。</span>
                <button
                  className="ml-2 rounded-act-sm px-1.5 py-0.5 font-medium text-text-main hover:bg-hover-overlay"
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => void loadSkills(true)}
                >
                  重试
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
                  aria-label={`${skill.name}: ${skill.description || "暂无说明"}. ${isSelected ? "已选择" : "未选择"}`}
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

  function renderAddMenuButton() {
    // 已开始的 Chat 会话没有可切换的模式，+ 菜单只剩附件一项：直接换成回形针，也暗示形态已锁定。
    if (isChatForm && !canSwitchAgentForm) return (
      <div className={`${CONTROL_GROUP_CLASS} [grid-area:plus]`}>
        <IconButton
          className="attach-button"
          label="添加图片或文件"
          tooltip="添加图片或文件（PNG、JPEG、WEBP、GIF、TXT、Markdown、JSON、CSV）"
          size="lg"
          shape="round"
          onClick={() => {
            setModelOpen(false);
            setModelOptionsOpen(false);
            setContextOpen(false);
            void handleSelectChatFiles();
          }}
        >
          <Paperclip size={18} strokeWidth={1.9} aria-hidden="true" />
        </IconButton>
      </div>
    );
    return (
      <div className={`${CONTROL_GROUP_CLASS} [grid-area:plus]`}>
        <IconButton
          className="command-button"
          label="添加 Agent、上下文或工具"
          tooltip="添加上下文、工具或附件"
          variant="soft"
          size="lg"
          shape="round"
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
        </IconButton>
      </div>
    );
  }

  function renderCommandMenu() {
    if (!commandOpen) return null;
    if (!isChatForm && skillsOpen) return renderSkillsMenu();

    const modeKeys: CommandMenuModeKey[] = canSwitchAgentForm ? ["agent", "plan", "chat"] : isChatForm ? [] : ["agent", "plan"];
    const AttachmentIcon = isChatForm ? Paperclip : Image;
    return (
      <div className={COMMAND_MENU_CLASS} ref={commandMenuRef} role="menu" aria-label="添加上下文或工具">
        {modeKeys.map(renderCommandModeRow)}
        {modeKeys.length > 0 ? <div className={COMMAND_MENU_SEPARATOR_CLASS} /> : null}
        <button
          className={COMMAND_MENU_ROW_CLASS}
          type="button"
          role="menuitem"
          aria-label={isChatForm ? "图片与文件" : "图片"}
          onClick={() => void (isChatForm ? handleSelectChatFiles() : handleSelectImages())}
        >
          <AttachmentIcon className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={1.9} aria-hidden="true" />
          <span className={COMMAND_MENU_ROW_LABEL_CLASS}>{isChatForm ? "图片与文件" : "图片"}</span>
          {isChatForm ? <span className={COMMAND_MENU_ROW_DESCRIPTION_CLASS}>PNG、JPEG、WEBP、GIF、TXT、Markdown、JSON、CSV</span> : null}
        </button>
        {!isChatForm ? (
          <button
            className={COMMAND_MENU_ROW_CLASS}
            type="button"
            role="menuitem"
            aria-label="Skills"
            aria-haspopup="menu"
            aria-expanded={skillsOpen}
            onClick={() => void handleOpenSkills()}
          >
            <BookOpen className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className={COMMAND_MENU_ROW_LABEL_CLASS}>Skills</span>
            <span className={COMMAND_MENU_ROW_DESCRIPTION_CLASS}>为本轮加载技能说明</span>
            <ChevronRight className="ml-auto shrink-0 text-text-faint" size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  }

  function renderModeSelector() {
    if (isChatForm) return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`${MODE_BUTTON_BASE_CLASS} ${CHAT_MODE_PILL_CLASS} [grid-area:mode] hover:brightness-100`} tabIndex={0}>
            <MessageCircle size={15} strokeWidth={2} aria-hidden="true" />
            <span>Chat</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{canSwitchAgentForm ? "发送前可在 + 菜单中切换模式" : "对话已开始，需要开发能力请新建 Agent 会话"}</TooltipContent>
      </Tooltip>
    );
    if (mode === "agent") return null;
    const selectedMode = MODE_META[mode];
    const Icon = selectedMode.icon;
    return (
      <button
        className={`${MODE_BUTTON_BASE_CLASS} ${MODE_BUTTON_CLASS[mode]} [grid-area:mode]`}
        type="button"
        ref={modeButtonRef}
        aria-label={`移除 ${selectedMode.label} 模式`}
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
              aria-label="模型"
              onScroll={() => setModelOptionsOpen(false)}
            >
              <label className={MODEL_SEARCH_WRAP_CLASS}>
                <Search size={14} strokeWidth={2} aria-hidden="true" />
                <input
                  ref={modelSearchInputRef}
                  className={MODEL_SEARCH_INPUT_CLASS}
                  type="search"
                  value={modelSearchQuery}
                  placeholder="搜索模型"
                  aria-label="搜索模型"
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
                              <span className="block truncate font-mono text-act-xxs leading-3 text-text-faint">
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
                              aria-label={`编辑 ${spec.id} 选项`}
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
                              编辑
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
                <div className={MODEL_SEARCH_EMPTY_CLASS}>没有匹配的模型。</div>
              ) : null}
            </div>
            {modelOptionsOpen ? (
              <div
                className={modelOptionsMenuClass}
                ref={modelOptionsRef}
                style={{ top: `${modelOptionsOffset}px` }}
              >
                <div className={DROPDOWN_LABEL_CLASS}>选项</div>
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
                  <div className="px-2 py-1.5 text-act-sm text-text-muted">此模型始终启用 Thinking。</div>
                ) : null}
                {editingReasoningEfforts.length > 0 ? (
                  <>
                    {(editingModelSpec?.supportsThinkingToggle || editingModelSpec?.reasoningMandatory) ? (
                      <div className={OPTION_SEPARATOR_CLASS} />
                    ) : null}
                    <div className={DROPDOWN_LABEL_CLASS}>Effort</div>
                    {editingModelSpec?.provider !== "deepseek" ? (
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
                  <div className={OPTION_EMPTY_CLASS}>暂无其他选项。</div>
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
      ? "停止 Agent"
      : modelUnavailable
          ? "暂无可用模型，请在设置中连接服务商"
          : canSendMessage
            ? "发送消息"
            : "输入消息后发送";

    return (
      <div className="[grid-area:send] grid">
      <IconButton
        className={`send-button${isStreaming ? " is-stop" : ""}${isAborting ? " is-aborting" : ""}`}
        label={ariaLabel}
        tooltip={tooltipLabel}
        variant="primary"
        size="md"
        shape="round"
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
      </IconButton>
      </div>
    );
  }

  // display:contents 让 toolbar 保留分组语义（aria/测试定位），
  // 同时让 +/模型/发送直接参与外层 grid 的 grid-template-areas 排布。
  function renderToolbar() {
    return (
      <div className="composer-bar contents" aria-label="输入框工具栏">
        {renderAddMenuButton()}
        {renderModeSelector()}
        {renderModelSelector()}
        {showInlineContextUsage ? renderContextUsageButton("inline") : null}
        {renderSendButton()}
      </div>
    );
  }

  function renderPanel() {
    const composerBodyClass = showInlineContextUsage
      ? resolvedLayout === "inline" ? COMPOSER_BODY_CHAT_INLINE_CLASS : COMPOSER_BODY_CHAT_STACKED_CLASS
      : mode === "agent" && !isChatForm
        ? resolvedLayout === "inline" ? COMPOSER_BODY_AGENT_INLINE_CLASS : COMPOSER_BODY_AGENT_STACKED_CLASS
        : resolvedLayout === "inline" ? COMPOSER_BODY_INLINE_CLASS : COMPOSER_BODY_STACKED_CLASS;
    return (
      <div
        className={`${getComposerPanelClass(surface)}${isDragActive ? ` ${COMPOSER_DROP_ACTIVE_CLASS}` : ""}`}
        aria-label="消息输入面板"
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
          <div className="px-3 pb-1 text-act-xs leading-4 text-danger" role="alert">
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
        {renderCommandMenu()}
        {renderSlashMenu()}
      </div>
    );
  }

  function renderReviewActionsStrip() {
    if (isChatForm) return null;
    if (surface !== "followup" && surface !== "initial") return null;
    if (!reviewSummary || reviewSummary.status === "empty") return null;

    const showCounts = reviewSummary.status === "changes" || reviewSummary.status === "partial";
    const isLoading = reviewSummary.status === "loading";
    const ariaLabel =
      showCounts
        ? `审查待处理变更 +${reviewSummary.additions ?? 0} -${reviewSummary.deletions ?? 0}`
        : reviewSummary.reason === "not_a_repository"
          ? "查看工作区变更；Git 仓库尚未初始化"
          : "查看工作区变更";

    return (
      <div className={COMPOSER_ACTION_STRIP_CLASS} aria-label="待处理的审查操作">
        <Button
          className="review-preview-button"
          variant="secondary"
          shape="pill"
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
        </Button>
        <IconButton className="review-overflow-button" label="更多审查操作" variant="secondary" shape="round">
          <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
        </IconButton>
      </div>
    );
  }

  function renderContextUsageButton(variant: "status" | "inline") {
    return (
      <button
        className={variant === "inline" ? INLINE_USAGE_CLASS : STATUS_USAGE_CLASS}
        type="button"
        aria-label={`上下文用量 ${contextPercentLabel}%`}
        aria-expanded={contextOpen}
        onClick={() => {
          setContextOpen((value) => !value);
          setCommandOpen(false);
          setModelOpen(false);
          setModelOptionsOpen(false);
          setContextSelectorOpen(null);
        }}
      >
        <span
          className={variant === "inline" ? INLINE_USAGE_DOT_CLASS : STATUS_USAGE_DOT_CLASS}
          aria-hidden="true"
          style={{
            background: `conic-gradient(${contextRingColor} ${contextRingPercent}%, var(--act-color-border) ${contextRingPercent}%)`,
            WebkitMask: STATUS_USAGE_DOT_MASK,
            mask: STATUS_USAGE_DOT_MASK
          }}
        />
        <span>{contextPercentLabel}%</span>
      </button>
    );
  }

  function renderComposerStatusRow() {
    if (surface !== "followup" || isChatForm) return null;

    return (
      <div className={STATUS_ROW_CLASS}>
        <div className={STATUS_GROUP_CLASS}>
          {branchLabel ? (
            <span className={STATUS_ITEM_CLASS} title={selectedBranch}>
              <GitBranch className={STATUS_ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
              <span className="max-w-[240px] truncate">{branchLabel}</span>
            </span>
          ) : null}
          <span className={STATUS_ITEM_CLASS}>
            <Laptop className={STATUS_ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
            <span>{runLocation === "worktree" ? "工作树" : "本机"}</span>
          </span>
          {permissionControl ? <span className={STATUS_ITEM_CLASS}>{permissionControl}</span> : null}
        </div>
        {renderContextUsageButton("status")}
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
          aria-label={`选择${kind === "workspace" ? "工作区" : kind === "branch" ? "分支" : "运行位置"}`}
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
          <div className={`${INITIAL_DROPDOWN_MENU_CLASS} w-[240px]`} role="menu" aria-label={`${label}选项`}>
            <div className={DROPDOWN_LABEL_CLASS}>最近使用</div>
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
              <span>使用已有文件夹…</span>
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
                  className="min-w-0 flex-1 rounded-act-sm border border-line bg-surface px-2 py-1 text-act-md leading-5 text-text-main outline-none focus:border-line-strong"
                  aria-label="新文件夹名称"
                  autoFocus
                  value={workspaceFolderName}
                  onChange={(event) => setWorkspaceFolderName(event.target.value)}
                  placeholder="文件夹名称"
                />
                <button className="rounded-act-sm px-2 py-1 text-act-md leading-5 text-text-main hover:bg-hover-overlay" type="submit">
                  创建
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
                <span>新建文件夹</span>
              </button>
            )}
          </div>
        ) : null}
        {contextSelectorOpen === kind && kind === "branch" ? (
          <div className={`${INITIAL_DROPDOWN_MENU_CLASS} max-h-[320px] w-[300px]`} role="menu" aria-label="分支选项">
            <div className={DROPDOWN_LABEL_CLASS}>分支</div>
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
          <div className={`${INITIAL_DROPDOWN_MENU_CLASS} w-[240px]`} role="menu" aria-label="运行位置选项">
            <div className={DROPDOWN_LABEL_CLASS}>运行位置</div>
            <button className={COMMAND_MENU_BUTTON_CLASS} type="button" role="menuitem" disabled>
              <Cloud className={COMMAND_MENU_ICON_CLASS} size={16} aria-hidden="true" />
              <span className="flex-1">云端</span>
              <span className="text-act-xxs text-text-faint">即将推出</span>
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
              <span className="flex-1">本机</span>
              {runLocation === "this_mac" ? <Check size={15} aria-hidden="true" /> : null}
            </button>
            <button className={COMMAND_MENU_BUTTON_CLASS} type="button" role="menuitem" disabled>
              <Server className={COMMAND_MENU_ICON_CLASS} size={16} aria-hidden="true" />
              <span className="flex-1">远程 SSH</span>
              <span className="text-act-xxs text-text-faint">即将推出</span>
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
                <span className="flex-1">新建工作树</span>
                {runLocation === "worktree" ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            ) : gitStatus === "no_head" ? (
              <button className={COMMAND_MENU_BUTTON_CLASS} type="button" role="menuitem" disabled>
                <Plus className={COMMAND_MENU_ICON_CLASS} size={16} aria-hidden="true" />
                <span className="flex-1">新建工作树</span>
                <span className="text-act-xxs text-text-faint">需要先创建提交</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderInitialContextRow() {
    if (surface !== "initial" || isChatForm) return null;

    return (
      <div className={INITIAL_CONTEXT_ROW_CLASS} aria-label="初始工作区与运行位置选择">
        {renderContextSelector("workspace", selectedWorkspaceLabel)}
        {gitHasBranch && branchLabel ? renderContextSelector("branch", branchLabel, "branch") : null}
        {renderContextSelector("runtime", runLocation === "worktree" ? "新建工作树" : "本机", "runtime")}
      </div>
    );
  }

  function renderDraftError() {
    if (!sendError) return null;
    return (
      <div id="composer-send-error" className="rounded-act-md border border-danger/30 bg-danger-subtle px-3 py-2 text-act-md leading-5 text-danger" role="alert">
        {sendError.message}
      </div>
    );
  }

  return (
    <footer className={getComposerWrapClass(surface)} ref={composerRef}>
      {contextOpen ? (
        <ContextPopup
          snapshot={effectiveContextSnapshot}
          contextState={contextState}
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
    </footer>
  );
}
