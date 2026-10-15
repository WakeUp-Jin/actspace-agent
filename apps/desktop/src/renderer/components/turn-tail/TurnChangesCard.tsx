import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { FileTypeIcon } from "../files/FileTypeIcon";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/HoverCard";
import { TurnFileDiff } from "./TurnFileDiff";
import { basename, type TurnChangedFile, type TurnChanges } from "./turn-tail-data";

/**
 * 轮尾改动卡：单文件只有卡头；多文件是卡头 + 文件行，超过 4 行折叠。
 * 卡头和文件行悬停 500ms 弹出该文件的 diff，点击在右侧打开本轮 Review。
 * 布局与尺寸照搬 DeepSeek Harness `ui-deliverables/client/ChangedFiles.tsx`。
 */

/** 折叠时显示的行数。 */
const COLLAPSED_ROWS = 4;

const GROUPED = new Intl.NumberFormat("en-US");

// 卡头与交付卡同高（60px），图标放在 40px 圆角方块里；悬停时统计换成「在侧边栏预览」。
const HEADER_CLASS =
  "group/header flex h-15 w-full min-w-0 items-center gap-2.5 border-0 bg-[var(--act-color-turn-card-fill)] px-2.5 py-2 text-left text-text-main transition-colors duration-(--motion-fast) hover:bg-[var(--act-color-turn-card-hover)] focus-visible:bg-[var(--act-color-turn-card-hover)] focus-visible:shadow-[inset_0_0_0_2px_var(--act-color-focus-ring)] focus-visible:outline-none";
export const TURN_CARD_TILE_CLASS =
  "grid size-10 flex-none place-items-center rounded-act-group border-[0.5px] border-line bg-[var(--act-color-turn-card-tile)]";
const ROW_CLASS =
  "flex min-h-6 w-full min-w-0 items-center justify-between gap-2.5 border-0 bg-transparent py-[7px] pr-[18px] pl-3.5 text-left text-text-faint hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:shadow-[inset_0_0_0_2px_var(--act-color-focus-ring)] focus-visible:outline-none pointer-coarse:min-h-11";
const TOGGLE_CLASS =
  "flex w-full items-center gap-1 border-0 bg-transparent py-2.5 pr-[18px] pl-3.5 text-left text-act-xs leading-[18px] text-text-faint hover:bg-hover-overlay focus-visible:bg-hover-overlay focus-visible:outline-none pointer-coarse:min-h-11";

function Counts({ added, deleted }: { added: number; deleted: number }) {
  return (
    <>
      <span className="text-success">+{GROUPED.format(added)}</span>
      <span className="text-danger">-{GROUPED.format(deleted)}</span>
    </>
  );
}

export function TurnChangesCard({ changes, onOpenReview, onFileContextMenu }: {
  changes: TurnChanges;
  /** 在右侧打开本轮 Review，并选中 `index` 指向的文件。 */
  onOpenReview: (index: number) => void;
  /** 右键还在的文件（已删除的不响应）。 */
  onFileContextMenu: (file: TurnChangedFile) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const describedBy = useId();
  const [expanded, setExpanded] = useState(false);
  const singleFile = changes.files.length === 1 ? changes.files[0] : undefined;
  const foldable = changes.files.length > COLLAPSED_ROWS;
  const rows = foldable && !expanded ? changes.files.slice(0, COLLAPSED_ROWS) : changes.files;
  const contextMenu = (file: TurnChangedFile | undefined) => (event: MouseEvent) => {
    if (!file || file.deleted) return;
    event.preventDefault();
    onFileContextMenu(file);
  };

  const header = (
    <button
      type="button"
      className={HEADER_CLASS}
      aria-label={singleFile ? `查看 ${singleFile.path} 的改动` : "在侧边栏查看本轮改动"}
      aria-describedby={singleFile ? describedBy : undefined}
      onClick={() => onOpenReview(0)}
      onContextMenu={contextMenu(singleFile)}
    >
      <span className={TURN_CARD_TILE_CLASS}>
        {singleFile ? <FileTypeIcon path={singleFile.path} size={20} /> : <FileTypeIcon kind="code" size={20} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-act-sm leading-5 font-medium">
          {singleFile ? `已编辑 ${basename(singleFile.path)}` : `已编辑 ${changes.files.length} 个文件`}
        </span>
        <span className="inline-flex text-act-xxs leading-4 text-text-faint">
          <span className="inline-flex gap-1.5 font-mono group-hover/header:hidden group-focus-visible/header:hidden">
            <Counts added={changes.additions} deleted={changes.deletions} />
          </span>
          <span className="hidden group-hover/header:inline group-focus-visible/header:inline">在侧边栏预览</span>
        </span>
      </span>
    </button>
  );

  return (
    <div
      ref={cardRef}
      className="flex min-w-0 flex-col overflow-hidden rounded-act-lg border-[0.5px] border-line bg-surface text-text-main"
      data-turn-changes
      data-single={singleFile ? "true" : undefined}
    >
      {singleFile ? (
        <>
          <DiffHoverCard cardRef={cardRef} file={singleFile}>{header}</DiffHoverCard>
          <span id={describedBy} hidden>{singleFile.absolutePath ?? singleFile.path}</span>
        </>
      ) : header}
      {singleFile ? null : (
        <ul className="m-0 list-none border-t-[0.5px] border-line p-0">
          {rows.map((file, index) => (
            <li key={file.path}>
              <DiffHoverCard cardRef={cardRef} file={file}>
                <button
                  type="button"
                  className={ROW_CLASS}
                  aria-label={`查看 ${file.path} 的改动`}
                  aria-describedby={`${describedBy}-${index}`}
                  onClick={() => onOpenReview(index)}
                  onContextMenu={contextMenu(file)}
                >
                  <span className="min-w-0 truncate text-act-xs">{file.path}</span>
                  <span className="inline-flex flex-none gap-1.5 font-mono text-act-xxs leading-[18px] whitespace-nowrap">
                    <Counts added={file.additions} deleted={file.deletions} />
                  </span>
                </button>
              </DiffHoverCard>
              <span id={`${describedBy}-${index}`} hidden>{file.absolutePath ?? file.path}</span>
            </li>
          ))}
        </ul>
      )}
      {foldable ? (
        <button
          type="button"
          className={TOGGLE_CLASS}
          aria-expanded={expanded}
          aria-label={expanded ? "收起改动文件列表" : `展开全部 ${changes.files.length} 个改动文件`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded ? "收起" : `全部 ${changes.files.length} 个文件`}</span>
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}

/**
 * 悬停 500ms 弹出的 diff 浮层，宽度跟随整张卡（左右各让出 24px），最高 420px。
 * 内容只在浮层打开时挂载，划过行不会白算 diff。
 */
function DiffHoverCard({ cardRef, file, children }: {
  cardRef: React.RefObject<HTMLDivElement | null>;
  file: TurnChangedFile;
  children: ReactNode;
}) {
  const [width, setWidth] = useState<number | undefined>(undefined);
  return (
    <HoverCard
      openDelay={500}
      closeDelay={200}
      onOpenChange={(open) => {
        if (open && cardRef.current) setWidth(Math.max(cardRef.current.getBoundingClientRect().width - 48, 240));
      }}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="center"
        className="flex max-h-[420px] flex-col overflow-hidden p-0"
        style={width ? { width } : undefined}
        data-turn-changes-preview
      >
        <div className="flex h-[38px] flex-none items-center border-b-[0.5px] border-line px-2 pr-1.5">
          <span className="min-w-0 flex-auto overflow-x-auto font-mono text-act-xs leading-5 whitespace-nowrap text-text-faint">
            {file.absolutePath ?? file.path}
          </span>
        </div>
        <TurnFileDiff file={file} split={false} wrap={false} preview />
      </HoverCardContent>
    </HoverCard>
  );
}
