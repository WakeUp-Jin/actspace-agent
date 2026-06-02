import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
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
  SendHorizontal,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ComposerAttachment, ContextUsageSnapshot, ModelId } from "@actspace/shared";
import { MODEL_LIST, MODEL_REGISTRY, DEFAULT_MODEL_ID } from "@actspace/shared";
import { ContextPopup } from "./ContextPopup";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

export type ComposerSendOptions = {
  model: ModelId;
  thinkingEnabled: boolean;
  attachments?: ComposerAttachment[];
};

export type ComposerWorkspaceOption = {
  value: string;
  label: string;
  workspaceId?: string;
};

export type ComposerSurface = "followup" | "initial";
export type ComposerInputLayout = "inline" | "stacked";

const COMPOSER_WRAP_CLASS =
  "composer-wrap relative mx-auto grid w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] gap-2";
const COMPOSER_INITIAL_WRAP_CLASS =
  "composer-wrap composer-wrap-initial relative mx-auto grid w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),706px)] gap-2";
const INITIAL_CONTEXT_ROW_CLASS = "initial-context-row flex min-h-7 items-center gap-3 px-2 text-sm text-text-muted";
const INITIAL_CONTEXT_SELECTOR_CLASS =
  "initial-context-selector inline-flex items-center gap-1 rounded-full border-0 bg-transparent px-1 py-1 text-sm font-medium text-text-muted transition-colors duration-[120ms] ease-in-out hover:text-text-main";
const COMPOSER_ACTION_STRIP_CLASS = "composer-action-strip flex min-h-[34px] items-center gap-2";
const REVIEW_PREVIEW_BUTTON_CLASS =
  "review-preview-button inline-flex h-[30px] items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium text-text-muted shadow-[0_1px_2px_rgba(31,45,61,0.04)]";
const REVIEW_ADDITION_CLASS = "font-medium text-success";
const REVIEW_DELETION_CLASS = "font-medium text-danger";
const REVIEW_OVERFLOW_BUTTON_CLASS =
  "review-overflow-button grid h-[30px] w-[30px] place-items-center rounded-full border border-line bg-surface text-text-faint shadow-[0_1px_2px_rgba(31,45,61,0.04)]";
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
  `${ATTACHMENT_REMOVE_BASE_CLASS} file-attachment-remove h-[22px] w-[22px] text-text-faint group-hover/file-attachment:pointer-events-auto group-hover/file-attachment:opacity-100 group-focus-within/file-attachment:pointer-events-auto group-focus-within/file-attachment:opacity-100 hover:bg-brand-soft hover:text-brand-strong`;
const COMPOSER_INPUT_CLASS =
  "composer-input block min-h-[34px] max-h-[116px] flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-[7px] text-[15px] leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
const COMPOSER_STACKED_INPUT_CLASS =
  "composer-input composer-input-stacked block min-h-[42px] max-h-[142px] w-full resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-[15px] leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
const COMPOSER_INITIAL_STACKED_INPUT_CLASS =
  "composer-input composer-input-stacked block min-h-[76px] max-h-[172px] w-full resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-[15px] leading-5 text-text-muted outline-none placeholder:text-text-subtle not-placeholder-shown:text-text-main disabled:cursor-default";
const COMPOSER_BAR_CLASS = "composer-bar relative flex min-h-[48px] items-center gap-2 px-2 py-1.5";
const COMPOSER_BAR_STACKED_CLASS =
  "composer-bar relative flex min-h-[48px] items-center gap-2 px-2 py-1.5";
const COMPOSER_TOOL_SPACER_CLASS = "composer-tool-spacer flex-1";
const CONTROL_GROUP_CLASS = "control-group relative";
const COMMAND_BUTTON_CLASS =
  "command-button grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface-subtle text-text-muted transition-[background,border,color] duration-[120ms] ease-in-out hover:border-line-strong hover:bg-brand-soft hover:text-brand-strong aria-expanded:border-brand/30 aria-expanded:bg-brand-soft aria-expanded:text-brand-strong";
const MODEL_BUTTON_CLASS =
  "model-button inline-flex h-8 max-w-[220px] items-center gap-[6px] rounded-full border-0 bg-transparent px-1.5 text-sm font-medium text-text-muted transition-colors duration-[120ms] ease-in-out hover:text-text-main";
const MODEL_BUTTON_TEXT_CLASS = "model-button-text truncate";
const SEND_BUTTON_CLASS =
  "send-button grid h-9 w-9 shrink-0 place-items-center rounded-full border-0 bg-brand text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24),0_8px_18px_rgba(47,111,255,0.18)] transition-[background,box-shadow,opacity] duration-[120ms] ease-in-out hover:bg-brand-strong hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_10px_22px_rgba(47,111,255,0.22)] disabled:cursor-default disabled:opacity-72 aria-disabled:cursor-default aria-disabled:opacity-72";
const DROPDOWN_MENU_CLASS =
  "dropdown-menu absolute bottom-[calc(100%_+_8px)] left-0 z-30 min-w-[180px] overflow-hidden rounded-xl border border-line bg-surface-raised/96 p-1.5 shadow-act-popover";
const COMMAND_MENU_CLASS = `${DROPDOWN_MENU_CLASS} command-menu w-[240px] min-w-[240px] p-2`;
const COMMAND_MENU_HINT_CLASS = "px-2 pb-2 pt-1 text-sm text-text-subtle";
const COMMAND_MENU_SEPARATOR_CLASS = "my-1 h-px bg-line";
const COMMAND_MENU_BUTTON_CLASS =
  "command-menu-button flex min-h-[34px] w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-sm font-medium text-text-main transition-colors duration-[120ms] ease-in-out hover:bg-brand-soft focus-visible:bg-brand-soft focus-visible:outline-none";
const COMMAND_MENU_ICON_CLASS = "text-text-muted";
const MODEL_MENU_CLASS = `${DROPDOWN_MENU_CLASS} model-menu max-h-[222px] min-w-[280px] overflow-y-auto`;
const MODEL_MENU_ROW_CLASS = "model-menu-row relative flex items-center rounded-lg";
const MODEL_MENU_ROW_SELECTED_CLASS = "is-selected-row bg-brand-soft";
const MODEL_SELECT_BUTTON_CLASS =
  "model-select-button flex min-w-0 flex-1 justify-start rounded-lg border-0 bg-transparent px-[9px] py-2 pr-[54px] text-left text-text-main";
const MODEL_SELECT_BUTTON_SELECTED_CLASS = "pr-[72px]";
const MODEL_ROW_ACTIONS_CLASS =
  "model-row-actions absolute right-2.5 flex h-full min-w-[42px] items-center justify-end gap-[5px]";
const MODEL_ROW_ACTIONS_SELECTED_CLASS = "min-w-[62px]";
const MODEL_EDIT_BUTTON_CLASS =
  "model-edit-button h-[26px] min-w-[42px] justify-center rounded-[7px] border-0 bg-transparent text-xs font-semibold text-text-muted transition-[opacity,background,color] duration-[120ms] ease-in-out focus-visible:outline-none hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main";
const MODEL_CHECK_ICON_CLASS = "model-check-icon text-text-main";
const MODEL_OPTIONS_MENU_CLASS = `${DROPDOWN_MENU_CLASS} model-options-menu bottom-0 left-[calc(100%_+_8px)] w-[220px] min-w-[220px]`;
const DROPDOWN_LABEL_CLASS = "dropdown-label px-2.5 pb-[5px] pt-[7px] text-xs font-semibold text-text-faint";
const OPTION_TOGGLE_ROW_CLASS =
  "option-toggle-row flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-[9px] py-[7px] text-text-main hover:bg-brand-soft";
const OPTION_TOGGLE_LABEL_CLASS = "flex-1";
const OPTION_TOGGLE_INPUT_CLASS = "absolute opacity-0 pointer-events-none";
const TOGGLE_TRACK_CLASS =
  "toggle-track relative inline-flex h-5 w-8 rounded-full bg-line-strong transition-colors duration-[120ms] ease-in-out";
const TOGGLE_TRACK_ON_CLASS = "bg-brand";
const TOGGLE_THUMB_CLASS =
  "toggle-thumb absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_4px_rgba(31,45,61,0.22)] transition-transform duration-[120ms] ease-in-out";
const TOGGLE_THUMB_ON_CLASS = "translate-x-3";
const OPTION_EMPTY_CLASS = "px-2.5 py-2 text-sm text-text-faint";
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
const COMPOSER_DROP_ACTIVE_CLASS = "border-brand/40 bg-brand-soft";

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

const DEFAULT_MODEL_SPEC = MODEL_REGISTRY[DEFAULT_MODEL_ID];
const MOCK_ATTACHMENTS: ComposerAttachment[] = [
  {
    id: "mock-image-attachment",
    kind: "image",
    name: "mock-screenshot.png",
    mimeType: "image/png",
  },
  {
    id: "mock-file-attachment",
    kind: "file",
    name: "README.md",
    path: "/mock/README.md",
    mimeType: "text/markdown",
  },
];

function isModelEditable(_modelId: ModelId): boolean {
  return true;
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
  inputLayout,
  showDemoAttachments = false,
  defaultModelId,
  onExpandContext,
  workspaceOptions = [],
  selectedWorkspaceRoot,
  onSelectWorkspace,
}: {
  contextSnapshot: ContextUsageSnapshot | null;
  isStreaming?: boolean;
  isAborting?: boolean;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  onAbort?: () => void;
  surface?: ComposerSurface;
  inputLayout?: ComposerInputLayout;
  showDemoAttachments?: boolean;
  /** 来自设置页的默认模型；首次到达时同步选中，用户手动选过后不再覆盖。 */
  defaultModelId?: ModelId;
  /** 提供时 Context 弹窗显示「展开完整视图」按钮，点击在右侧面板打开 Context Tab。 */
  onExpandContext?: () => void;
  workspaceOptions?: ComposerWorkspaceOption[];
  selectedWorkspaceRoot?: string | null;
  onSelectWorkspace?: (workspaceRoot: string) => void;
}) {
  const initialModelId = defaultModelId ?? DEFAULT_MODEL_ID;
  const [commandOpen, setCommandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelOptionsOpen, setModelOptionsOpen] = useState(false);
  const [contextSelectorOpen, setContextSelectorOpen] = useState<ContextSelectorKind | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<ModelId>(initialModelId);
  const [editingModelId, setEditingModelId] = useState<ModelId>(initialModelId);
  const [hoveredModelId, setHoveredModelId] = useState<ModelId | null>(null);
  const [focusedModelId, setFocusedModelId] = useState<ModelId | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(
    (MODEL_REGISTRY[initialModelId] ?? DEFAULT_MODEL_SPEC).thinkingDefault,
  );
  const userPickedModelRef = useRef(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(
    showDemoAttachments ? MOCK_ATTACHMENTS : [],
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [message, setMessage] = useState("");
  const composerRef = useRef<HTMLElement | null>(null);
  const commandButtonRef = useRef<HTMLButtonElement | null>(null);
  const commandMenuRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelOptionsRef = useRef<HTMLDivElement | null>(null);
  const hasAttachments = attachments.length > 0;
  const canSendMessage = Boolean(message.trim() || attachments.length > 0);
  const editingModelSpec = MODEL_LIST.find((spec) => spec.id === editingModelId);
  const contextUsagePercent = contextSnapshot?.percentUsed ?? 77;
  const contextRingPercent = Math.max(0, Math.min(100, contextUsagePercent));
  // 有内容但占比不足 1% 时显示「<1」，避免「明明有数据却是 0%」的误解。
  const contextPercentLabel =
    contextSnapshot && contextSnapshot.totalTokens > 0 && contextUsagePercent <= 0
      ? "<1"
      : `${contextUsagePercent}`;
  const resolvedInputLayout: ComposerInputLayout =
    surface === "initial" || hasAttachments ? "stacked" : inputLayout ?? "inline";
  const placeholder = surface === "initial" ? "Plan, Build, / for commands, @ for context" : "Send follow-up";
  const selectedWorkspaceLabel =
    workspaceOptions.find((workspace) => workspace.value === selectedWorkspaceRoot)?.label ??
    workspaceOptions[0]?.label ??
    "Workspace";

  useEffect(() => {
    setAttachments(showDemoAttachments ? MOCK_ATTACHMENTS : []);
  }, [showDemoAttachments]);

  // 默认模型可能在 Composer 挂载后才异步到达（settings:get）；只在用户尚未手动
  // 选择过模型时同步，避免覆盖用户当前会话里的临时选择。
  useEffect(() => {
    if (!defaultModelId || userPickedModelRef.current) return;
    setSelectedModelId(defaultModelId);
    setEditingModelId(defaultModelId);
    setThinkingEnabled((MODEL_REGISTRY[defaultModelId] ?? DEFAULT_MODEL_SPEC).thinkingDefault);
  }, [defaultModelId]);

  function closeFloatingPanels() {
    setCommandOpen(false);
    setModelOpen(false);
    setHoveredModelId(null);
    setFocusedModelId(null);
    setModelOptionsOpen(false);
    setContextSelectorOpen(null);
    setContextOpen(false);
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

    appendAttachments(MOCK_ATTACHMENTS);
  }

  function sendCurrentMessage() {
    if (!canSendMessage || !onSend || isStreaming) return;
    const nextAttachments = attachments;
    const options: ComposerSendOptions = {
      model: selectedModelId,
      thinkingEnabled,
    };
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
    const stackedClass =
      surface === "initial" ? COMPOSER_INITIAL_STACKED_INPUT_CLASS : COMPOSER_STACKED_INPUT_CLASS;
    return (
      <textarea
        className={resolvedInputLayout === "stacked" ? stackedClass : COMPOSER_INPUT_CLASS}
        aria-label="Message composer"
        placeholder={placeholder}
        rows={1}
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
      <div className={CONTROL_GROUP_CLASS}>
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
    return (
      <div className={CONTROL_GROUP_CLASS}>
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
          <span className={MODEL_BUTTON_TEXT_CLASS}>{selectedModelId}</span>
          <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {modelOpen ? (
          <div className={MODEL_MENU_CLASS} ref={modelMenuRef}>
            {MODEL_LIST.map((spec) => {
              const showEdit = spec.id === selectedModelId || hoveredModelId === spec.id || focusedModelId === spec.id;
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
                      setSelectedModelId(spec.id);
                      setEditingModelId(spec.id);
                      setThinkingEnabled(spec.thinkingDefault);
                      setHoveredModelId(null);
                      setFocusedModelId(null);
                      setModelOptionsOpen(false);
                      setModelOpen(false);
                    }}
                  >
                    <span>{spec.id}</span>
                  </button>
                  <div className={`${MODEL_ROW_ACTIONS_CLASS} ${
                    spec.id === selectedModelId ? MODEL_ROW_ACTIONS_SELECTED_CLASS : ""
                  }`}>
                    {isModelEditable(spec.id) ? (
                      <button
                        type="button"
                        className={MODEL_EDIT_BUTTON_CLASS}
                        aria-label={`Edit ${spec.id} options`}
                        style={{
                          opacity: showEdit ? 1 : 0,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
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
        ) : null}
        {modelOpen && modelOptionsOpen ? (
          <div className={MODEL_OPTIONS_MENU_CLASS} ref={modelOptionsRef}>
            <div className={DROPDOWN_LABEL_CLASS}>Options</div>
            {editingModelSpec?.supportsThinkingToggle ? (
              <label className={OPTION_TOGGLE_ROW_CLASS}>
                <span className={OPTION_TOGGLE_LABEL_CLASS}>Thinking</span>
                <input
                  className={OPTION_TOGGLE_INPUT_CLASS}
                  type="checkbox"
                  checked={thinkingEnabled}
                  onChange={(event) => setThinkingEnabled(event.target.checked)}
                  aria-label={`${editingModelId} Thinking`}
                />
                <span
                  className={`${TOGGLE_TRACK_CLASS}${thinkingEnabled ? ` ${TOGGLE_TRACK_ON_CLASS}` : ""}`}
                  aria-hidden="true"
                >
                  <span className={`${TOGGLE_THUMB_CLASS}${thinkingEnabled ? ` ${TOGGLE_THUMB_ON_CLASS}` : ""}`} />
                </span>
              </label>
            ) : (
              <div className={OPTION_EMPTY_CLASS}>No extra options yet.</div>
            )}
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
              <Square size={14} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />
            ) : (
              <SendHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
    );
  }

  function renderToolbar() {
    return (
      <div className={resolvedInputLayout === "stacked" ? COMPOSER_BAR_STACKED_CLASS : COMPOSER_BAR_CLASS} aria-label="Composer toolbar">
        {renderAddMenuButton()}
        {resolvedInputLayout === "inline" ? renderComposerInput() : null}
        {renderModelSelector()}
        {resolvedInputLayout === "stacked" ? <div className={COMPOSER_TOOL_SPACER_CLASS} /> : null}
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
        {resolvedInputLayout === "stacked" ? renderComposerInput() : null}
        {renderToolbar()}
      </div>
    );
  }

  function renderReviewActionsStrip() {
    if (surface !== "followup") return null;

    return (
      <div className={COMPOSER_ACTION_STRIP_CLASS} aria-label="Pending review actions">
        <button className={REVIEW_PREVIEW_BUTTON_CLASS} type="button" aria-label="Review pending changes">
          <span>Review</span>
          <span className={REVIEW_ADDITION_CLASS}>+4253</span>
          <span className={REVIEW_DELETION_CLASS}>-5</span>
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
              background: `conic-gradient(var(--act-color-brand-strong) ${contextRingPercent}%, var(--act-color-border-strong) ${contextRingPercent}%)`,
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
