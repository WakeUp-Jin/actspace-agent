import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent } from "react";
import { BookOpen, FileText, X } from "lucide-react";
import type { ComposerAttachment } from "@actspace/shared";
import { dialogsApi } from "../../api/dialogs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";
import { revokeAttachmentPreview } from "./attachment-preview";

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
const SKILL_PILL_CLASS =
  "group/skill-pill inline-flex h-9 max-w-[240px] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 pr-1.5 text-act-md leading-5 font-medium text-text-main shadow-act-thumb";

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
  const path = dialogsApi.getPathForFile(file) || undefined;
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

export type ComposerAttachmentsOptions = {
  readonly draftKey?: string;
  /** 附件草稿按 draftKey 读写；缺省时附件只存在组件里，切换 draftKey 也不换。 */
  readonly readAttachmentDraft?: (draftKey: string) => ComposerAttachment[];
  readonly writeAttachmentDraft?: (draftKey: string, attachments: ComposerAttachment[]) => void;
  /** Chat 只收图片和几种文本文件，拖进来的其他文件整批拒绝。 */
  readonly isChatForm: boolean;
  readonly isRemoteTarget: boolean;
  /** 运行中锁定输入时不接收拖放。 */
  readonly inputLocked: boolean;
  /** 选图 / 选文件前收起 `+` 面板。 */
  readonly onBeforePick: () => void;
  /** 移除一个附件后：Composer 用它更新跟这个附件有关的发送错误。 */
  readonly onRemoved: (attachmentId: string) => void;
};

/**
 * 09 T27：输入框的附件。状态按 draftKey 写回草稿（16 T14），换会话时换入新会话的附件；
 * 选图、选文件、粘贴图片、拖放文件都走这里，失败写进 `error`。
 */
export function useComposerAttachments({
  draftKey, readAttachmentDraft, writeAttachmentDraft, isChatForm, isRemoteTarget, inputLocked, onBeforePick, onRemoved,
}: ComposerAttachmentsOptions) {
  const [attachments, setAttachmentState] = useState<ComposerAttachment[]>(() => draftKey && readAttachmentDraft ? readAttachmentDraft(draftKey) : []);
  const attachmentsRef = useRef(attachments);
  // 附件改动同时写回当前 draftKey 的草稿（16 T14）。ref 同步更新，连续两次改动不会基于旧值。
  const setAttachments = (update: ComposerAttachment[] | ((current: ComposerAttachment[]) => ComposerAttachment[])) => {
    const next = typeof update === "function" ? update(attachmentsRef.current) : update;
    if (next === attachmentsRef.current) return;
    attachmentsRef.current = next;
    setAttachmentState(next);
    if (draftKey) writeAttachmentDraft?.(draftKey, next);
  };
  const persistsAttachmentsRef = useRef(false);
  persistsAttachmentsRef.current = Boolean(draftKey && writeAttachmentDraft);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // 切换会话：换入新会话的附件草稿。上一个会话的附件已经写在它自己的草稿里，不释放。
  useEffect(() => {
    if (!draftKey || !readAttachmentDraft) return;
    const next = readAttachmentDraft(draftKey);
    if (next === attachmentsRef.current) return;
    attachmentsRef.current = next;
    setAttachmentState(next);
    setError(null);
  }, [draftKey, readAttachmentDraft]);

  // 卸载时：附件存在草稿里的（切到设置页等）保留，等发送、移除或会话 evict 时再释放；只存在组件里的才在这里释放。
  useEffect(() => () => {
    if (!persistsAttachmentsRef.current) attachmentsRef.current.forEach(revokeAttachmentPreview);
  }, []);

  function append(nextAttachments: ComposerAttachment[]) {
    if (nextAttachments.length === 0) return;
    setAttachments((current) => {
      const next = dedupeAttachments([...current, ...nextAttachments]);
      const retainedIds = new Set(next.map((attachment) => attachment.id));
      nextAttachments
        .filter((attachment) => !retainedIds.has(attachment.id))
        .forEach(revokeAttachmentPreview);
      return next;
    });
    setError(null);
  }

  function remove(attachmentId: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === attachmentId);
      if (removed) revokeAttachmentPreview(removed);
      return current.filter((attachment) => attachment.id !== attachmentId);
    });
    onRemoved(attachmentId);
  }

  async function selectImages() {
    onBeforePick();

    try {
      const result = await dialogsApi.selectImages();
      if (!result.canceled) {
        append(result.attachments);
      }
    } catch (selectError) {
      console.error("Failed to select images", selectError);
      setError("图片选择失败。");
    }
  }

  async function selectFiles() {
    onBeforePick();

    try {
      const result = await dialogsApi.selectFiles(isRemoteTarget ? { remote: true } : undefined);
      if (!result.canceled) append(result.attachments);
    } catch (selectError) {
      console.error("Failed to select Chat attachments", selectError);
      setError("附件选择失败。");
    }
  }

  async function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (imageFiles.length === 0) return;

    event.preventDefault();
    const results = await Promise.all(imageFiles.map(async (file) => {
      try {
        return await dialogsApi.importComposerImage({
          name: file.name || "pasted-image.png",
          mimeType: file.type || undefined,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      } catch {
        return { ok: false as const, error: { code: "write_failed" as const, message: "图片粘贴失败。" } };
      }
    }));
    const imported = results.flatMap((result) => result.ok ? [result.attachment] : []);
    if (imported.length > 0) append(imported);
    let failureMessage: string | undefined;
    for (const result of results) {
      if (result.ok === false) {
        failureMessage = result.error.message;
        break;
      }
    }
    setError(failureMessage ?? null);
  }

  function dropFiles(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (inputLocked) return;

    const files = Array.from(event.dataTransfer.files);
    if (isChatForm) {
      const unsupported = files.find((file) => {
        const path = dialogsApi.getPathForFile(file) || file.name;
        return !/\.(png|jpe?g|webp|gif|txt|md|markdown|json|csv)$/i.test(path);
      });
      if (unsupported) {
        setError("Chat 仅支持图片、TXT、Markdown、JSON 和 CSV 文件。");
        return;
      }
    }
    append(files.map(attachmentFromDroppedFile));
  }

  return {
    attachments,
    setAttachments,
    error,
    setError,
    dragActive,
    remove,
    selectImages,
    selectFiles,
    pasteImages,
    /** 挂在输入面板上：拖着文件进来时高亮，放下时加入附件。 */
    dropTarget: {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!inputLocked && event.dataTransfer.types.includes("Files")) {
          setDragActive(true);
        }
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragActive(false);
        }
      },
      onDrop: dropFiles,
    },
  };
}

export type ComposerAttachmentsProps = {
  attachments: readonly ComposerAttachment[];
  selectedSkills: readonly string[];
  /** 发送错误指向的附件：它的卡片用 aria-describedby 关联到错误提示。 */
  issueAttachmentId?: string;
  onPreview?: (attachment: ComposerAttachment) => void;
  onRemove: (attachmentId: string) => void;
  onRemoveSkill: (skill: string) => void;
};

/** 输入框里的附件条：图片缩略图、文件卡片和已选的 Skill。 */
export function ComposerAttachments({ attachments, selectedSkills, issueAttachmentId, onPreview, onRemove, onRemoveSkill }: ComposerAttachmentsProps) {
  return (
    <div className={COMPOSER_ATTACHMENTS_CLASS} aria-label="已附加的文件">
      {attachments.map((attachment) => {
        if (attachment.kind === "image") {
          return (
            <div
              className={IMAGE_ATTACHMENT_WRAPPER_CLASS}
              aria-label={`已附加的图片 ${attachment.name}`}
              aria-describedby={issueAttachmentId === attachment.id ? "composer-send-error" : undefined}
              key={attachment.id}
            >
              {/* 原生 button（从 Composer 搬来）：缩略图本身就是按钮，背景是图片，没有 Button 的内边距和底色。 */}
              <button
                className={IMAGE_ATTACHMENT_CLASS}
                type="button"
                aria-label={`预览附加图片 ${attachment.name}`}
                disabled={!attachment.previewUrl || !onPreview}
                onClick={() => onPreview?.(attachment)}
                style={getAttachmentPreviewStyle(attachment)}
                title={attachment.name}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* 原生 button（从 Composer 搬来）：浮在缩略图角上的小圆点，尺寸和描边是定制的。 */}
                  <button
                    className={IMAGE_ATTACHMENT_REMOVE_CLASS}
                    type="button"
                    aria-label={`移除 ${attachment.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(attachment.id);
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
          <div className={FILE_ATTACHMENT_CLASS} aria-label={`已附加的文件 ${attachment.name}`} aria-describedby={issueAttachmentId === attachment.id ? "composer-send-error" : undefined} key={attachment.id}>
            <FileText size={17} strokeWidth={1.9} aria-hidden="true" />
            <span className={FILE_ATTACHMENT_NAME_CLASS}>{attachment.name}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* 原生 button（从 Composer 搬来）：文件卡片里的小 ×，尺寸比 IconButton 最小档还小。 */}
                <button
                  className={FILE_ATTACHMENT_REMOVE_CLASS}
                  type="button"
                  aria-label={`移除 ${attachment.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(attachment.id);
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
              {/* 原生 button（从 Composer 搬来）：Skill 胶囊里的 ×，按下时不抢输入框焦点。 */}
              <button
                className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg text-text-faint transition-colors hover:bg-hover-overlay hover:text-text-main"
                type="button"
                aria-label={`移除 Skill ${skill}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveSkill(skill);
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
