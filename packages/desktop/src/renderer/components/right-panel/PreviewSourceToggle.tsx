export type PreviewMode = "preview" | "source";

const GROUP_CLASS = "inline-flex items-center gap-0.5 rounded-act-sm border border-line bg-surface-subtle p-0.5";
const BUTTON_BASE =
  "rounded-[5px] border-0 px-2 py-0.5 text-[11px] leading-none [cursor:pointer] [-webkit-app-region:no-drag]";
const BUTTON_ACTIVE = "bg-brand-soft text-brand";
const BUTTON_INACTIVE = "bg-transparent text-text-muted hover:text-text-main";

/** Preview / 源码 分段控件，Markdown 与 HTML 渲染视图共用。 */
export function PreviewSourceToggle({
  mode,
  onChange,
  previewLabel = "预览",
}: {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
  previewLabel?: string;
}) {
  return (
    <div className={GROUP_CLASS} role="tablist" aria-label="预览或源码">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "preview"}
        className={`${BUTTON_BASE} ${mode === "preview" ? BUTTON_ACTIVE : BUTTON_INACTIVE}`}
        onClick={() => onChange("preview")}
      >
        {previewLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "source"}
        className={`${BUTTON_BASE} ${mode === "source" ? BUTTON_ACTIVE : BUTTON_INACTIVE}`}
        onClick={() => onChange("source")}
      >
        源码
      </button>
    </div>
  );
}
