import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { workspacesApi } from "../../api/workspaces";
import { useRunTargetContext } from "../../target/run-target-context";
import { fileExtension, FileTypeIcon } from "../files/FileTypeIcon";
import { useRightPanel } from "../right-panel/RightPanelContext";
import { openTurnFile, showTurnFileMenu } from "./open-turn-file";
import { OpenWithButton, type OpenWithOperation } from "./OpenWithButton";
import { TURN_CARD_TILE_CLASS } from "./TurnChangesCard";
import { basename, type TurnPresentedFile } from "./turn-tail-data";
import { useFileApplications } from "./useFileApplications";

/**
 * 交付卡：Agent 用 `present` 声明的文件，两列网格（单个或窄于 620px 时一列），超过 4 个折叠。
 * 点卡片在右侧预览，右键弹文件菜单；右侧分体按钮用应用打开或显示文件位置（远端会话只能预览，右键改为下载）。
 * 移植自 DeepSeek Harness `ui-deliverables/client/Deliverables.tsx` 与 `PresentedFileCard.tsx`。
 */

const COLLAPSED_PRESENTED_COUNT = 4;
/** 「已请求打开」这类成功提示停留多久再淡出。 */
export const PRESENTED_SUCCESS_HOLD_MS = 5000;
const PRESENTED_SUCCESS_FADE_MS = 200;

type Phase = "opening" | "opened" | "error" | "revealing" | "revealed" | "revealError";

const PHASE_TEXT: Record<Phase, string> = {
  opening: "正在打开…",
  opened: "已请求打开",
  error: "打开失败，点击重试",
  revealing: "正在文件管理器中显示…",
  revealed: "已请求在文件管理器中显示",
  revealError: "无法在文件管理器中显示，请重试",
};

/** 去掉描述末尾的括注（「季度报告（终稿）」→「季度报告」），没有描述时显示扩展名。 */
export function cardDescription(description: string | undefined, fallback: string): string {
  const trimmed = description?.replace(/\s*(?:\([^()]*\)|（[^（）]*）)\s*$/u, "").trim();
  return trimmed ? trimmed : fallback;
}

function canChooseApplication(): boolean {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
}

export function TurnDeliverables({ files, sessionId, workspaceRoot }: {
  files: readonly TurnPresentedFile[];
  sessionId: string | null;
  workspaceRoot?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (files.length === 0) return null;
  const collapsible = files.length > COLLAPSED_PRESENTED_COUNT;
  const shown = collapsible && !expanded ? files.slice(0, COLLAPSED_PRESENTED_COUNT) : files;
  return (
    <div className="@container flex min-w-0 flex-col gap-4" data-turn-deliverables>
      <div className={`grid min-w-0 gap-2.5 ${files.length === 1 ? "grid-cols-1" : "grid-cols-2 @max-[620px]:grid-cols-1"}`}>
        {shown.map((file) => (
          <PresentedFileCard key={file.path} file={file} sessionId={sessionId} workspaceRoot={workspaceRoot} />
        ))}
      </div>
      {collapsible ? (
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1 self-center rounded-act-sm border-0 bg-transparent px-[11px] py-px text-act-xs leading-[18px] text-text-faint hover:bg-hover-overlay focus-visible:outline-2 focus-visible:outline-focus-ring"
          aria-expanded={expanded}
          aria-label={expanded ? "收起交付文件列表" : `展开全部 ${files.length} 个交付文件`}
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded ? "收起" : `全部 ${files.length} 个文件`}</span>
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}

function PresentedFileCard({ file, sessionId, workspaceRoot }: {
  file: TurnPresentedFile;
  sessionId: string | null;
  workspaceRoot?: string | null;
}) {
  const { openTab } = useRightPanel();
  const isRemote = useRunTargetContext().target.kind === "remote";
  const native = !isRemote && Boolean(workspaceRoot);
  const chooseApplication = canChooseApplication();
  const apps = useFileApplications(workspaceRoot, file.path, native && chooseApplication);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [fading, setFading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((timer) => window.clearTimeout(timer)); }, []);

  const name = basename(file.path);
  const pending = phase === "opening" || phase === "revealing";
  const succeeded = phase === "opened" || phase === "revealed";
  const failed = phase === "error" || phase === "revealError" || (!phase && previewError !== null);
  const status = phase ? PHASE_TEXT[phase] : previewError;

  function settle(next: Phase) {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    setFading(false);
    setPhase(next);
    if (next !== "opened" && next !== "revealed") return;
    timers.current = [
      window.setTimeout(() => setFading(true), PRESENTED_SUCCESS_HOLD_MS),
      window.setTimeout(() => { setPhase(null); setFading(false); }, PRESENTED_SUCCESS_HOLD_MS + PRESENTED_SUCCESS_FADE_MS),
    ];
  }

  async function run(operation: OpenWithOperation) {
    if (pending || !workspaceRoot) return;
    const reveal = operation.kind === "reveal";
    setPreviewError(null);
    settle(reveal ? "revealing" : "opening");
    try {
      const result = await workspacesApi.openFile({
        workspaceRoot,
        relativePath: file.path,
        action: reveal ? "reveal" : "open",
        ...(operation.kind === "application" ? { applicationId: operation.id } : {}),
      });
      settle(result.ok ? reveal ? "revealed" : "opened" : reveal ? "revealError" : "error");
    } catch {
      settle(reveal ? "revealError" : "error");
    }
  }

  async function preview() {
    setPhase(null);
    setPreviewError(await openTurnFile({ sessionId, workspaceRoot, relativePath: file.path, openTab }));
  }

  async function showMenu() {
    setPhase(null);
    setPreviewError(await showTurnFileMenu({ sessionId, workspaceRoot, relativePath: file.path, remote: isRemote, openTab }));
  }

  return (
    <div
      className="group/card relative flex h-15 min-w-0 items-center gap-2.5 overflow-hidden rounded-act-lg border-[0.5px] border-line bg-[var(--act-color-turn-card-fill)] px-2.5 py-2 text-text-main transition-colors duration-(--motion-fast) hover:bg-[var(--act-color-turn-card-hover)]"
      data-presented-file
    >
      <button
        type="button"
        className="absolute inset-0 z-1 w-full cursor-pointer rounded-act-lg border-0 bg-transparent p-0 focus-visible:shadow-[inset_0_0_0_2px_var(--act-color-focus-ring)] focus-visible:outline-none"
        title={file.absolutePath ?? file.path}
        aria-label={`在侧边栏预览 ${file.path}`}
        onClick={() => void preview()}
        onContextMenu={(event) => {
          event.preventDefault();
          void showMenu();
        }}
      />
      <span className={`pointer-events-none relative z-2 ${TURN_CARD_TILE_CLASS}`}>
        <FileTypeIcon path={file.path} size={20} />
      </span>
      <div className="pointer-events-none relative z-2 flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="truncate text-act-sm leading-5 font-medium">{name}</span>
          <span
            className={`truncate text-act-xxs leading-4 ${failed ? "text-danger" : "text-text-faint"}`}
            role={status ? "status" : undefined}
            data-presented-description
          >
            <span
              className={`${status ? "" : "group-hover/card:hidden"} transition-opacity duration-(--motion-fast) motion-reduce:transition-none ${fading ? "opacity-0" : ""}`}
              data-success={succeeded || undefined}
            >
              {status ?? cardDescription(file.description, fileExtension(name).toUpperCase() || "文件")}
            </span>
            {status ? null : <span className="hidden group-hover/card:inline">在侧边栏预览</span>}
          </span>
        </div>
        {native ? (
          <div className="pointer-events-auto inline-flex flex-none">
            <OpenWithButton
              applications={apps.applications}
              failed={apps.failed}
              loading={apps.loading}
              pending={pending}
              chooseApplication={chooseApplication}
              onAction={(operation) => void run(operation)}
              onRefresh={apps.refresh}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
