import { Bot, File, GitBranch, GitFork, MessageSquare } from "lucide-react";
import { reviewFiles } from "../../model/panel-fixtures";
import type { PanelScope } from "../../model/selectors";
import { useSpaceDemoActions } from "../../model/use-space-demo";
import { PanelEmpty } from "../PanelEmpty";

/** 子 Agent、可视化回复：演示里只放说明和空态。 */
export function SpaceSubagentsView() {
  return (
    <PanelEmpty icon={<Bot size={22} strokeWidth={1.6} />}>
      {"这次对话还没有子 Agent。\n子 Agent 是一次性的只读助手，和 Space 里的 Actor 是两回事。"}
    </PanelEmpty>
  );
}

export function SpaceReplyView() {
  return <PanelEmpty icon={<MessageSquare size={22} strokeWidth={1.6} />}>还没有可视化回复。</PanelEmpty>;
}

function DiffCount({ add, del }: { add: number; del: number }) {
  return (
    <span className="whitespace-nowrap font-mono text-act-xxs tabular-nums">
      <span className="text-operational">+{add}</span> <span className="text-danger">−{del}</span>
    </span>
  );
}

/** Review 标签：当前 Actor 带 diff 的文件，点开文件看内容。 */
export function SpaceReviewView({ scope }: { scope: PanelScope }) {
  const { openFile } = useSpaceDemoActions();
  const files = reviewFiles(scope.member);
  if (!files.length) return <PanelEmpty icon={<GitBranch size={22} strokeWidth={1.6} />}>这次还没有改动。</PanelEmpty>;
  const add = files.reduce((s, f) => s + f.add, 0);
  const del = files.reduce((s, f) => s + f.del, 0);
  const BranchIcon = scope.tree ? GitFork : GitBranch;
  return (
    <div>
      <div className="flex items-center gap-2 px-1.5 pb-2.5 pt-0.5 text-act-xs text-text-faint">
        <BranchIcon size={12} aria-hidden="true" />
        <span>{scope.branch} · {files.length} 个文件</span>
        <span className="ml-auto"><DiffCount add={add} del={del} /></span>
      </div>
      {files.map((f) => (
        // 保留原生 <button>：三列网格的文件行，ui/Button 套不上。
        <button
          key={f.name} type="button"
          className="grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 rounded-act-sm border-0 bg-transparent px-2 py-[7px] text-left text-act-xs transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]"
          onClick={() => openFile(`${scope.dir}/${f.name}`)}
        >
          <File size={13} className="text-text-faint" aria-hidden="true" />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-text-main">{f.name}</span>
          <DiffCount add={f.add} del={f.del} />
        </button>
      ))}
    </div>
  );
}
