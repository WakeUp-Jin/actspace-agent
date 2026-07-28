import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  ArrowUp,
  BookOpen,
  Boxes,
  Bug,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  GitBranch,
  Image,
  Infinity,
  Laptop,
  MoreHorizontal,
  Network,
  Paperclip,
  Plus,
  Search,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  ComposerAttachment,
  ContextUsageSnapshot,
  LlmProviderId,
  ModelReasoningEffort,
  ModelSelectionId,
  UsableModelView,
} from "@actspace/shared";
import { DEFAULT_MODEL_ID, MODEL_LIST, MODEL_REASONING_EFFORTS } from "@actspace/shared";
import { ContextPopup } from "./ContextPopup";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";
import {
  formatSelectedModelLabel,
  groupModelsByProvider,
  hasDuplicateModelLabelWithinProvider,
} from "../model-option-groups";

export type ComposerSendOptions = {
  model: ModelSelectionId;
  thinkingEnabled: boolean;
  reasoningEffort?: ModelReasoningEffort;
  attachments?: ComposerAttachment[];
};

export type ComposerWorkspaceOption = {
  value: string;
  label: string;
  workspaceId?: string;
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
const INITIAL_CONTEXT_ROW_CLASS = "initial-context-row flex min-h-7 items-center gap-3 overflow-x-auto px-2 text-sm text-text-muted";
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
const IMAGE_ATTACHMENT_CLASS =
  "image-attachment group/image-attachment relative h-12 w-12 rounded-lg [background:linear-gradient(135deg,rgba(18,92,210,0.12),rgba(255,255,255,0.36)),linear-gradient(155deg,transparent_0_48%,rgba(25,170,110,0.28)_49%_60%,transparent_61%),repeating-linear-gradient(0deg,#ffffff_0_7px,#dce7f5_7px_8px)] [box-shadow:inset_0_0_0_1px_rgba(81,109,158,0.16),0_8px_18px_rgba(54,83,134,0.08)]";
const FILE_ATTACHMENT_CLASS =
  "file-attachment group/file-attachment inline-flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 pr-1.5 text-sm font-medium text-text-main shadow-[0_6px_16px_rgba(31,45,61,0.06)]";
const FILE_ATTACHMENT_NAME_CLASS = "truncate";
const ATTACHMENT_REMOVE_BASE_CLASS =
  "attachment-remove grid place-items-center rounded-lg opacity-0 pointer-events-none transition-[background,color,opacity] duration-[150ms] ease-in-out";
const IMAGE_ATTACHMENT_REMOVE_CLASS =
  `${ATTACHMENT_REMOVE_BASE_CLASS} image-attachment-remove absolute right-[-5px] top-[-5px] h-6 w-6 bg-[rgba(45,51,58,0.86)] text-white shadow-[0_6px_14px_rgba(25,35,52,0.2)] group-hover/image-attachment:pointer-events-auto group-hover/image-attachment:opacity-100 group-focus-within/image-attachment:pointer-events-auto group-focus-within/image-attachment:opacity-100 hover:bg-[rgba(31,36,42,0.94)]`;
const FILE_ATTACHMENT_REMOVE_CLASS =
  `${ATTACHMENT_REMOVE_BASE_CLASS} file-attachment-remove h-[22px] w-[22px] text-text-faint group-hover/file-attachment:pointer-events-auto group-hover/file-attachment:opacity-100 group-focus-within/file-attachment:pointer-events-auto group-focus-within/file-attachment:opacity-100 hover:bg-hover-overlay hover:text-text-main`;
// Composer 输入布局对齐 Cursor：单行内容 inline（+ / 输入 / 模型 / 发送同一行），
// 内容折行到两行及以上自动切 stacked（输入全宽在上、控件行贴底）。
// 用同一个 grid 容器切换 grid-template-areas，DOM 结构不变——textarea 是同一节点，
// 切换布局不 remount、不丢焦点光标；附件存在或 initial surface 强制 stacked。
const COMPOSER_BODY_BASE_CLASS = "composer-body grid min-h-[48px] items-center gap-x-1.5 px-2 py-1.5";
const COMPOSER_BODY_INLINE_CLASS =
  `${COMPOSER_BODY_BASE_CLASS} grid-cols-[auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'plus_input_model_send'] max-[600px]:gap-y-1 max-[600px]:grid-cols-[auto_auto_minmax(0,1fr)_auto] max-[600px]:[grid-template-areas:'input_input_input_input'_'plus_model_._send']`;
const COMPOSER_BODY_STACKED_CLASS =
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
const COMMAND_MENU_CLASS = `${DROPDOWN_MENU_CLASS} command-menu w-[240px] min-w-[240px] p-2`;
const COMMAND_MENU_HINT_CLASS = "px-2 pb-2 pt-1 text-sm text-text-subtle";
const COMMAND_MENU_SEPARATOR_CLASS = "my-1 h-px bg-line";
const COMMAND_MENU_BUTTON_CLASS =
  "command-menu-button flex min-h-[34px] w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-sm font-medium text-text-main transition-colors duration-[120ms] ease-in-out hover:bg-hover-overlay focus-visible:bg-selected focus-visible:outline-none";
const COMMAND_MENU_ICON_CLASS = "text-text-muted";
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

type CommandMenuItem = {
  label: string;
  icon: LucideIcon;
};

type ContextSelectorKind = "workspace" | "branch" | "runtime";

const PRIMARY_COMMAND_ITEMS: CommandMenuItem[] = [
  { label: "Plan", icon: FileText },
  { label: "Debug", icon: Bug },
  { label: "Multitask", icon: Infinity },
  { label: "Ask", icon: CircleHelp },
];

const ATTACH_COMMAND_ITEM: CommandMenuItem = { label: "Attach files", icon: Paperclip };

const SECONDARY_COMMAND_ITEMS: CommandMenuItem[] = [
  { label: "Image", icon: Image },
  { label: "Models", icon: Boxes },
  { label: "Skills", icon: BookOpen },
  { label: "MCP Servers", icon: Network },
];

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
    ...(model?.provider === "duckcoding" && model.reasoningDefaultEffort && {
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

function fileUrlFromPath(path?: string): string | undefined {
  if (!path?.startsWith("/")) return undefined;
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
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
      ? fileUrlFromPath(path) ?? (typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined)
      : undefined,
  };
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
  onExpandContext,
  workspaceOptions = [],
  selectedWorkspaceRoot,
  onSelectWorkspace,
  reviewSummary,
  onOpenReview,
  models,
}: {
  contextSnapshot: ContextUsageSnapshot | null;
  isStreaming?: boolean;
  isAborting?: boolean;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  onAbort?: () => void;
  surface?: ComposerSurface;
  /** 来自设置页的默认模型；首次到达时同步选中，用户手动选过后不再覆盖。 */
  defaultModelId?: ModelSelectionId;
  /** 会话级当前模型；提供时由上层持有，避免 initial/followup Composer 切换时丢选择。 */
  selectedModelId?: ModelSelectionId;
  onSelectedModelChange?: (modelId: ModelSelectionId) => void;
  /** 提供时 Context 弹窗显示「展开完整视图」按钮，点击在右侧面板打开 Context Tab。 */
  onExpandContext?: () => void;
  workspaceOptions?: ComposerWorkspaceOption[];
  selectedWorkspaceRoot?: string | null;
  onSelectWorkspace?: (workspaceRoot: string) => void;
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
  const [isDragActive, setIsDragActive] = useState(false);
  const [message, setMessage] = useState("");
  const [isInputMultiline, setIsInputMultiline] = useState(false);
  const composerRef = useRef<HTMLElement | null>(null);
  const composerBodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const commandButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelSearchInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelOptionsRef = useRef<HTMLDivElement | null>(null);
  const hasAttachments = attachments.length > 0;
  const selectedModelAvailable = modelList.some((model) => model.id === selectedModelId);
  const canSendMessage = Boolean((message.trim() || attachments.length > 0) && selectedModelAvailable);
  const editingModelSpec = modelList.find((spec) => spec.id === editingModelId);
  const editingModelOptions = modelRuntimeOptions[editingModelId] ?? modelDefaultRuntimeOptions(editingModelSpec);
  const selectedModelSpec = modelList.find((spec) => spec.id === selectedModelId);
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
  const selectedModelDisplayLabel = selectedModelSpec
    ? formatSelectedModelLabel(selectedModelSpec, modelList)
    : selectedModelId;
  const selectedModelTitle = selectedModelSpec
    ? `${selectedModelSpec.provider} / ${selectedModelSpec.label} / ${selectedModelSpec.apiModel}`
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
  const placeholder = surface === "initial" ? "Plan, Build, / for commands, @ for context" : "Send follow-up";
  const selectedWorkspaceLabel =
    workspaceOptions.find((workspace) => workspace.value === selectedWorkspaceRoot)?.label ??
    workspaceOptions[0]?.label ??
    "Workspace";

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
      const modelWidth = modelButtonRef.current?.offsetWidth ?? 0;
      const sendWidth = body.querySelector<HTMLElement>(".send-button")?.offsetWidth ?? 0;
      const inlineInputWidth = Math.max(
        1,
        body.clientWidth - paddingWidth - commandWidth - modelWidth - sendWidth - columnGap * 3,
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
  }, [message, resolvedLayout, selectedModelId, surface]);

  function closeFloatingPanels() {
    setCommandOpen(false);
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
    setAttachments((current) => dedupeAttachments([...current, ...nextAttachments]));
  }

  async function handleAttachFiles() {
    setCommandOpen(false);

    if (window.actspace?.selectFiles) {
      try {
        const result = await window.actspace.selectFiles();
        if (!result.canceled) {
          appendAttachments(result.attachments);
        }
      } catch (error) {
        console.error("Failed to select files", error);
      }
      return;
    }

    console.warn("File attachment picker is only available in the desktop app.");
  }

  function sendCurrentMessage() {
    if (!canSendMessage || !onSend || isStreaming) return;
    const nextAttachments = attachments;
    const options: ComposerSendOptions = {
      model: selectedModelId,
      thinkingEnabled: selectedModelOptions.thinkingEnabled,
    };
    if (selectedModelOptions.thinkingEnabled && selectedModelOptions.reasoningEffort) {
      options.reasoningEffort = selectedModelOptions.reasoningEffort;
    }
    if (nextAttachments.length > 0) {
      options.attachments = nextAttachments;
    }
    onSend(message.trim(), options);
    setMessage("");
    setAttachments([]);
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
        commandButtonRef.current?.contains(target) || commandMenuRef.current?.contains(target);
      const clickedInsideModelPopover =
        modelButtonRef.current?.contains(target) ||
        modelMenuRef.current?.contains(target) ||
        modelOptionsRef.current?.contains(target);

      if (!clickedInsideCommandPopover) {
        setCommandOpen(false);
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
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function renderCommandMenuButton(item: CommandMenuItem) {
    const Icon = item.icon;
    return (
      <button
        className={COMMAND_MENU_BUTTON_CLASS}
        type="button"
        role="menuitem"
        key={item.label}
        onClick={() => setCommandOpen(false)}
      >
        <Icon className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={2} aria-hidden="true" />
        <span>{item.label}</span>
      </button>
    );
  }

  function renderAttachMenuButton() {
    const Icon = ATTACH_COMMAND_ITEM.icon;
    return (
      <button
        className={COMMAND_MENU_BUTTON_CLASS}
        type="button"
        role="menuitem"
        key={ATTACH_COMMAND_ITEM.label}
        onClick={() => void handleAttachFiles()}
      >
        <Icon className={COMMAND_MENU_ICON_CLASS} size={16} strokeWidth={2} aria-hidden="true" />
        <span>{ATTACH_COMMAND_ITEM.label}</span>
      </button>
    );
  }

  function renderComposerInput() {
    return (
      <textarea
        className={surface === "initial" ? COMPOSER_INITIAL_INPUT_CLASS : COMPOSER_INPUT_CLASS}
        aria-label="Message composer"
        placeholder={placeholder}
        rows={1}
        ref={inputRef}
        value={message}
        disabled={isStreaming}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          // IME 输入法（中文/日文等）在候选词面板按回车"上屏"时，
          // nativeEvent.isComposing 为 true 或 keyCode 为 229，此时不应触发发送。
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
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
                className={IMAGE_ATTACHMENT_CLASS}
                aria-label={`Attached image ${attachment.name}`}
                key={attachment.id}
                style={getAttachmentPreviewStyle(attachment)}
                title={attachment.name}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={IMAGE_ATTACHMENT_REMOVE_CLASS}
                      type="button"
                      aria-label={`Remove ${attachment.name}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setAttachments((current) => current.filter((item) => item.id !== attachment.id));
                      }}
                    >
                      <X size={16} strokeWidth={2.4} aria-hidden="true" />
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
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
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
          <div className={COMMAND_MENU_CLASS} ref={commandMenuRef} role="menu" aria-label="Add agents, context, tools">
            <div className={COMMAND_MENU_HINT_CLASS}>Add agents, context, tools.</div>
            {PRIMARY_COMMAND_ITEMS.map(renderCommandMenuButton)}
            <div className={COMMAND_MENU_SEPARATOR_CLASS} />
            {renderAttachMenuButton()}
            {SECONDARY_COMMAND_ITEMS.map(renderCommandMenuButton)}
          </div>
        ) : null}
      </div>
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
                    {editingModelSpec?.provider !== "duckcoding" ? (
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
    const tooltipLabel = isStreaming ? "停止 Agent" : canSendMessage ? "发送消息" : "输入消息后发送";
    const ariaLabel = isStreaming ? "Stop agent" : canSendMessage ? "Send message" : "Enter a message to send";

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
        {renderModelSelector()}
        {renderSendButton()}
      </div>
    );
  }

  function renderPanel() {
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
        <div
          ref={composerBodyRef}
          className={resolvedLayout === "inline" ? COMPOSER_BODY_INLINE_CLASS : COMPOSER_BODY_STACKED_CLASS}
          data-layout={resolvedLayout}
        >
          {renderComposerInput()}
          {renderToolbar()}
        </div>
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
          <span className={STATUS_ITEM_CLASS}>
            <GitBranch className={STATUS_ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
            <span>main</span>
          </span>
          <span className={STATUS_ITEM_CLASS}>
            <Laptop className={STATUS_ICON_CLASS} size={14} strokeWidth={2} aria-hidden="true" />
            <span>Local</span>
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
    const menuItems =
      isWorkspaceSelector && workspaceOptions.length > 0
        ? workspaceOptions
        : [{ value: label, label }];

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
        {contextSelectorOpen === kind ? (
          <div className={DROPDOWN_MENU_CLASS} role="menu" aria-label={`${label} options`}>
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
        {renderContextSelector("branch", "main", "branch")}
        {renderContextSelector("runtime", "Local", "runtime")}
      </div>
    );
  }

  function renderPlanNewIdeaChip() {
    if (surface !== "initial") return null;

    return (
      <div className={INITIAL_CHIP_ROW_CLASS}>
        <button className={INITIAL_CHIP_CLASS} type="button">
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
      {renderPanel()}
      {renderComposerStatusRow()}
      {renderPlanNewIdeaChip()}
    </footer>
  );
}
