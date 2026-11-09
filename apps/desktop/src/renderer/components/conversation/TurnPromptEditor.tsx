import { ArrowUp, FileText, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ComposerMode, FileReference, ResponseAnnotationReference } from "@actspace/shared";
import { sessionsApi } from "../../api/sessions";
import { useRunTargetContext } from "../../target/run-target-context";
import { ResponseAnnotationPill } from "../composer/ResponseAnnotationPill";
import { ComposerAttachments, useComposerAttachments } from "../composer/ComposerAttachments";
import { ModelPicker } from "../composer/ModelPicker";
import { useComposerContext } from "../composer/composer-context";
import { useComposerModel } from "../composer/use-composer-model";
import { composerSendOptions } from "../composer/use-composer-send";
import type { ComposerSendOptions } from "../composer/composer-types";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import type { TurnPromptDraft } from "./turn-prompt-draft";

// 原地编辑器（agent-edit-resend-rewind.md §5.1）：Composer 的聚焦边框和阴影，正文自动长高到 240px 后内部滚动。
const EDITOR_CLASS =
  "turn-prompt-editor grid overflow-visible rounded-act-xl border bg-surface shadow-act-composer-focus animate-[fade-in_140ms_ease-out_both]";
const EDITOR_BORDER_CLASS = "border-composer-focus";
const EDITOR_DROP_CLASS = "border-line-strong bg-selected";
const EDITOR_REFERENCES_CLASS = "flex flex-wrap items-center gap-1.5 px-3.5 pt-3";
const EDITOR_INPUT_CLASS =
  "block max-h-[240px] min-h-6 w-full resize-none border-0 bg-transparent px-[calc(var(--conversation-card-padding)-2px)] pt-3 leading-[1.55] text-text-main outline-none placeholder:text-text-faint";
const EDITOR_BAR_CLASS = "flex min-h-[30px] items-center gap-1.5 px-2.5 pb-2 pt-2";
const FILE_REFERENCE_CLASS =
  "inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-act-md border border-line bg-surface-subtle pl-2 pr-0.5 text-act-sm leading-5 text-text-main";
const INPUT_MAX_PX = 240;
const SEND_VARIANT: Record<ComposerMode, "accent" | "warning" | "operational"> = { agent: "accent", plan: "warning", chat: "operational" };

/** 编辑器打开的弹层（模型菜单、Tooltip）在 portal 里：里面的点击不算点到编辑器外面。 */
function insideFloatingLayer(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-radix-popper-content-wrapper], [role='menu'], [role='listbox']"));
}

export type TurnPromptEditorProps = {
  readonly sessionId: string;
  readonly initial: TurnPromptDraft;
  readonly onCancel: () => void;
  readonly onSubmit: (draft: TurnPromptDraft, options: ComposerSendOptions) => void;
};

/** 消息流里的提问编辑器：附件可删可加，模型和下方 Composer 共用；回车发送，Esc 或点到外面取消。 */
export function TurnPromptEditor({ sessionId, initial, onCancel, onSubmit }: TurnPromptEditorProps) {
  const { models, defaultModelId, selectedModelId, onSelectedModelChange, composerMode = "agent", selectedSkills = [] } = useComposerContext();
  const { target, capabilities, readiness } = useRunTargetContext();
  const isRemoteTarget = target.kind === "remote";
  const isChatForm = composerMode === "chat";
  const editorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState(initial.text);
  const [fileReferences, setFileReferences] = useState<readonly FileReference[]>(initial.fileReferences);
  const [responseAnnotations, setResponseAnnotations] = useState<readonly ResponseAnnotationReference[]>(initial.responseAnnotations);
  const [modelOpen, setModelOpen] = useState(false);
  const attachmentState = useComposerAttachments({
    isChatForm, isRemoteTarget, inputLocked: false, initial: initial.attachments,
    onBeforePick: () => setModelOpen(false), onRemoved: () => undefined,
  });
  const { attachments, setAttachments } = attachmentState;
  const model = useComposerModel({
    target, sessionId, models, defaultModelId, selectedModelId, onSelectedModelChange,
    remoteReady: readiness.state === "ready", selectedSkills, configure: false,
  });
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // 原提问里的图片已经存在会话里：按 artifactId 读出预览。
  useEffect(() => {
    const pending = attachments.filter((attachment) => attachment.kind === "image" && !attachment.previewUrl && (attachment.artifactId || attachment.remoteArtifact));
    if (pending.length === 0) return;
    let active = true;
    void Promise.all(pending.map(async (attachment) => {
      const artifactPath = attachment.artifactId ?? attachment.remoteArtifact!.artifactId;
      const result = await sessionsApi.readArtifact({ sessionId, artifactPath }).catch(() => null);
      return result?.dataUrl ? [attachment.id, result.dataUrl] as const : null;
    })).then((entries) => {
      const previews = new Map(entries.filter((entry): entry is readonly [string, string] => entry !== null));
      if (!active || previews.size === 0) return;
      setAttachments((current) => current.map((attachment) => previews.has(attachment.id) && !attachment.previewUrl ? { ...attachment, previewUrl: previews.get(attachment.id) } : attachment));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在打开编辑器时读一次
  }, [sessionId]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_PX)}px`;
  }, [text]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  // 点到编辑器外面取消；编辑器打开的弹层里的点击不算。
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (editorRef.current?.contains(event.target as Node) || insideFloatingLayer(event.target)) return;
      onCancelRef.current();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  const hasContent = Boolean(text.trim()) || attachments.length > 0 || responseAnnotations.length > 0;
  const canSend = hasContent && model.available && readiness.state === "ready";
  const acceptsFiles = isChatForm || capabilities.attachments.files;

  function submit() {
    if (!canSend) return;
    const options = composerSendOptions({
      model: model.selectedModelId, mode: composerMode, selectedSkills, runtimeOptions: model.runtimeOptions,
      attachments, responseAnnotations,
    });
    if (fileReferences.length > 0) options.fileReferences = [...fileReferences];
    onSubmit({ text: text.trim(), attachments, fileReferences, responseAnnotations }, options);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div
      ref={editorRef}
      className={`${EDITOR_CLASS} ${attachmentState.dragActive ? EDITOR_DROP_CLASS : EDITOR_BORDER_CLASS}`}
      aria-label="编辑提问"
      {...attachmentState.dropTarget}
    >
      {fileReferences.length > 0 || responseAnnotations.length > 0 ? (
        <div className={EDITOR_REFERENCES_CLASS}>
          {fileReferences.map((reference) => (
            <span key={reference.relativePath} className={FILE_REFERENCE_CLASS} title={reference.relativePath}>
              <FileText size={14} aria-hidden="true" className="shrink-0 text-text-faint" />
              <span className="truncate">{reference.displayName}</span>
              <IconButton label={`移除 ${reference.displayName}`} variant="ghost" size="xs" onClick={() => setFileReferences((current) => current.filter((item) => item !== reference))}>
                <X size={12} aria-hidden="true" />
              </IconButton>
            </span>
          ))}
          {responseAnnotations.length > 0 ? <ResponseAnnotationPill annotations={responseAnnotations} variant="draft" onClear={() => setResponseAnnotations([])} /> : null}
        </div>
      ) : null}
      <textarea
        ref={inputRef}
        className={EDITOR_INPUT_CLASS}
        aria-label="编辑提问内容"
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={(event) => void attachmentState.pasteImages(event)}
        onKeyDown={handleKeyDown}
      />
      {attachments.length > 0 ? (
        <ComposerAttachments attachments={attachments} selectedSkills={[]} onRemove={attachmentState.remove} onRemoveSkill={() => undefined} />
      ) : null}
      {attachmentState.error ? <p role="alert" className="px-3.5 pt-1 text-act-xs leading-4 text-danger">{attachmentState.error}</p> : null}
      <div className={EDITOR_BAR_CLASS}>
        <IconButton
          label={acceptsFiles ? "添加图片或文件" : "添加图片"}
          variant="ghost"
          size="sm"
          shape="round"
          onClick={() => void (acceptsFiles ? attachmentState.selectFiles() : attachmentState.selectImages())}
        >
          <Plus size={17} aria-hidden="true" />
        </IconButton>
        <ModelPicker
          catalog={model.catalog}
          selectedModelId={model.catalogSelectedModelId}
          onSelect={(modelId) => { model.selectModel(modelId); setModelOpen(false); }}
          options={model.pickerOptions}
          open={modelOpen}
          onOpenChange={setModelOpen}
          triggerLabel={model.displayLabel}
          triggerTitle={model.title}
          disabled={isRemoteTarget && readiness.state !== "ready"}
        />
        <span className="flex-1" />
        <Button variant="ghost" size="xs" onClick={onCancel}>取消</Button>
        <IconButton
          label="发送修改后的提问"
          tooltip="发送"
          variant={SEND_VARIANT[composerMode]}
          size="sm"
          shape="round"
          aria-disabled={!canSend}
          onClick={submit}
        >
          <ArrowUp size={15} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
