import { BookOpen, FileText, Library, Plus } from "lucide-react";
import { Button } from "../../ui/Button";
import { currentSpace } from "../model/selectors";
import type { LibraryFile } from "../model/types";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../model/use-space-demo";
import { PanelEmpty } from "./PanelEmpty";

/** 右栏「库」标签：Actor 产出 + 你放进去的文件。预览、添加都只提示「演示里省略」。 */

const ROW_CLASS =
  "grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-act-sm border-0 bg-transparent px-2 py-[7px] text-left transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const FOLDER_CLASS = "flex items-center gap-[7px] px-2 pb-1 pt-3 text-act-xxs font-semibold tracking-[0.03em] text-text-faint";

// 保留原生 <button>：三列网格的文件行，ui/Button 套不上。
function FileRow({ file, onOpen }: { file: LibraryFile; onOpen: () => void }) {
  const Icon = file.kind === "artifact" ? FileText : BookOpen;
  return (
    <button type="button" className={ROW_CLASS} onClick={onOpen}>
      <Icon size={14} strokeWidth={1.8} className="text-text-faint" aria-hidden="true" />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-act-sm text-text-main">
        {file.name}
        {file.src ? <small className="block text-act-xxs font-normal text-text-faint">来自 {file.src}</small> : null}
      </span>
      <span className="whitespace-nowrap text-act-xxs tabular-nums text-text-faint">{file.date}</span>
    </button>
  );
}

export function LibraryList() {
  const library = useSpaceDemoSelector((s) => currentSpace(s).library);
  const { showNotice } = useSpaceDemoActions();
  const artifacts = library.filter((f) => f.kind === "artifact");
  const added = library.filter((f) => f.kind === "added");
  const preview = () => showNotice("演示里省略：预览文件");

  return (
    <div>
      <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
        <span className="flex-1 text-act-xs text-text-faint">{library.length} 个文件</span>
        <Button variant="ghost" size="xs" onClick={() => showNotice("演示里省略：从磁盘添加文件")}>
          <Plus size={12} aria-hidden="true" /> 添加
        </Button>
      </div>
      {artifacts.length ? (
        <>
          <div className={FOLDER_CLASS}><FileText size={12} aria-hidden="true" /> Actor 产出</div>
          {artifacts.map((f) => <FileRow key={f.id} file={f} onOpen={preview} />)}
        </>
      ) : null}
      {added.length ? (
        <>
          <div className={FOLDER_CLASS}><BookOpen size={12} aria-hidden="true" /> 你放进去的</div>
          {added.map((f) => <FileRow key={f.id} file={f} onOpen={preview} />)}
        </>
      ) : null}
      {library.length ? null : <PanelEmpty icon={<Library size={22} strokeWidth={1.6} />}>库还是空的。</PanelEmpty>}
      <div className="mx-1 mt-3.5 rounded-act-md border border-dashed border-line px-3 py-2.5 text-act-xs leading-[1.6] text-text-faint">
        库就是 <code className="font-mono text-text-muted [overflow-wrap:anywhere]">spaces/&lt;id&gt;/library/</code> 这个真实目录。Actor 的产出写进{" "}
        <code className="font-mono text-text-muted">artifacts/</code>，代码本身不会复制进来。
      </div>
    </div>
  );
}
