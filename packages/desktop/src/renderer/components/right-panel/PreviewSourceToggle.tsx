export type PreviewMode = "preview" | "source";

const GROUP_CLASS = "inline-flex items-center gap-0.5 rounded-act-sm border border-line bg-surface-subtle p-0.5";
const BAR_BUTTON_CLASS =
  "shrink-0 rounded-act-sm border-0 bg-transparent px-1.5 py-0.5 text-[12px] leading-none text-text-muted hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";

/**
 * 工作区操作栏里的预览 / 源码切换（对齐 Cursor 第二层的 View source / View preview）。
 *
 * 与下面的 `PreviewSourceToggle` 是**同一个状态的两种壳**，不是两套控件：
 * 操作栏只在工作区文件 Tab 上出现，那里空间紧、且已经有两个图标按钮，
 * 所以用「按一下去对面」的单个文字按钮 —— 显示的是**目标**而不是当前态。
 * 聊天生成的 markdown/html 没有操作栏，仍用视图内的分段控件。
 */
export function PreviewSourceButton({
  mode,
  onChange,
  previewLabel = "预览",
}: {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
  previewLabel?: string;
}) {
  const next: PreviewMode = mode === "preview" ? "source" : "preview";
  const label = next === "source" ? "查看源码" : `查看${previewLabel}`;
  return (
    <button type="button" className={BAR_BUTTON_CLASS} onClick={() => onChange(next)}>
      {label}
    </button>
  );
}

const BUTTON_BASE =
  "rounded-[5px] border-0 px-2 py-0.5 text-[11px] leading-none [cursor:pointer] [-webkit-app-region:no-drag]";
const BUTTON_ACTIVE = "bg-selected font-semibold text-text-main";
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
