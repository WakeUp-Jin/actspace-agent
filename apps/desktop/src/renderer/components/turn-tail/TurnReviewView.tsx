import { ChevronDown, Columns2, FileSearch, WrapText } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "../ui/IconButton";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/Menu";
import { useRightPanel, type RightPanelTab } from "../right-panel/RightPanelContext";
import { openTurnFile } from "./open-turn-file";
import { TurnFileDiff } from "./TurnFileDiff";

/**
 * 「第 N 轮改动」Review 标签：文件下拉菜单 + 选中文件的对比，可切左右/单栏、自动换行，或打开整个文件。
 * 数据是打开标签时随标签带来的本轮改动快照，不读 git；布局照搬 DeepSeek Harness `ReviewTab.tsx`。
 */

const GROUPED = new Intl.NumberFormat("en-US");
const PRESSED_CLASS = "aria-pressed:bg-selected aria-pressed:text-text-main";

function Counts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <>
      <span className="text-success">+{GROUPED.format(additions)}</span>
      <span className="text-danger">-{GROUPED.format(deletions)}</span>
    </>
  );
}

export function TurnReviewView({ tab }: { tab: Extract<RightPanelTab, { kind: "turnReview" }> }) {
  const { openTab } = useRightPanel();
  const files = tab.changes.files;
  const [index, setIndex] = useState(tab.index);
  const [split, setSplit] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 每次从卡片点进来（revision 变化）都跳到点的那个文件；之前在菜单里选的不保留。
  useEffect(() => { setIndex(tab.index); }, [tab.index, tab.revision]);
  const file = files[index] ?? files[0];
  if (!file) return <p className="m-0 p-4 text-act-sm text-text-muted">这轮没有可显示的改动。</p>;

  async function openWholeFile() {
    setError(null);
    setError(await openTurnFile({ sessionId: tab.sessionId, workspaceRoot: tab.workspaceRoot, relativePath: file.path, openTab }));
  }

  return (
    <div className="turn-diff h-full" data-turn-review>
      <div className="flex h-[38px] flex-none items-center gap-1.5 border-b-[0.5px] border-line pr-1.5 pl-2">
        <Menu>
          <MenuTrigger
            className="inline-flex h-7 max-w-full min-w-0 shrink items-center gap-1 rounded-act-sm border-0 bg-transparent pr-1.5 pl-2 text-act-xs leading-5 text-text-main hover:bg-hover-overlay aria-expanded:bg-hover-overlay focus-visible:outline-2 focus-visible:outline-focus-ring"
            aria-label="选择要查看的文件"
            title={file.path}
            data-review-file={file.path}
          >
            <span className="min-w-0 truncate">{file.path}</span>
            <ChevronDown size={12} className="flex-none" aria-hidden="true" />
          </MenuTrigger>
          <MenuContent align="start" className="max-w-[min(480px,calc(100vw-24px))]">
            <MenuRadioGroup value={String(index)} onValueChange={(value) => setIndex(Number(value))}>
              {files.map((entry, at) => (
                <MenuRadioItem key={entry.path} value={String(at)}>
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <span className="min-w-0 truncate leading-5">{entry.path}</span>
                    <span className="inline-flex flex-none gap-1.5 font-mono text-act-xs text-text-faint">
                      <Counts additions={entry.additions} deletions={entry.deletions} />
                    </span>
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
        <span className="mr-auto inline-flex min-w-0 flex-none gap-1.5 font-mono text-act-xs leading-5 text-text-faint">
          <Counts additions={file.additions} deletions={file.deletions} />
        </span>
        <span className="ml-auto inline-flex flex-none items-center gap-0.5">
          <IconButton label="左右对比" tooltip={split ? "切换为单栏对比" : "切换为左右对比"} tooltipSide="bottom" aria-pressed={split} className={PRESSED_CLASS} onClick={() => setSplit((value) => !value)} data-review-tool="split">
            <Columns2 size={15} />
          </IconButton>
          <IconButton label="自动换行" tooltip={wrap ? "关闭自动换行" : "开启自动换行"} tooltipSide="bottom" aria-pressed={wrap} className={PRESSED_CLASS} onClick={() => setWrap((value) => !value)} data-review-tool="wrap">
            <WrapText size={15} />
          </IconButton>
          {file.deleted ? null : (
            <IconButton label={`在侧边栏打开 ${file.path}`} tooltip="在侧边栏打开整个文件" tooltipSide="bottom" onClick={() => void openWholeFile()} data-review-tool="open-file">
              <FileSearch size={15} />
            </IconButton>
          )}
        </span>
      </div>
      {error ? <p className="turn-diff-status text-danger" role="alert">{error}</p> : null}
      <TurnFileDiff key={file.path} file={file} split={split} wrap={wrap} />
    </div>
  );
}
