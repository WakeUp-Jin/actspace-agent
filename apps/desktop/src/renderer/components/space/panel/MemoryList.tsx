import { BookOpen, Brain, Pencil, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { currentSpace } from "../model/selectors";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../model/use-space-demo";
import { PanelEmpty } from "./PanelEmpty";

/** 右栏「记忆」标签：Space 指令（编辑只提示）+ Space 记忆（可忘记）。 */

const HEADING_CLASS = "m-0 mb-0.5 flex items-center gap-2 text-act-xs font-semibold text-text-muted";
const HEADING_NOTE_CLASS = "text-act-xxs font-normal text-text-faint";

export function MemoryList() {
  const space = useSpaceDemoSelector(currentSpace);
  const { forgetMemory, showNotice } = useSpaceDemoActions();

  return (
    <div>
      <section className="pb-3.5 pt-0.5">
        <h4 className={HEADING_CLASS}>
          <BookOpen size={12} aria-hidden="true" /> 指令 <small className={HEADING_NOTE_CLASS}>每个 Actor 开工前都会读</small>
        </h4>
        <div className={`mt-2 whitespace-pre-wrap rounded-act-md border border-line bg-surface px-3 py-2.5 text-act-sm leading-[1.6] [overflow-wrap:anywhere] ${space.instructions ? "text-text-main" : "text-text-faint"}`}>
          {space.instructions || "还没写指令。"}
        </div>
        <div className="mt-2">
          <Button variant="ghost" size="xs" onClick={() => showNotice("演示里省略：编辑指令")}>
            <Pencil size={12} aria-hidden="true" /> 编辑
          </Button>
        </div>
      </section>
      <section className="pb-3.5 pt-0.5">
        <h4 className={HEADING_CLASS}>
          <Brain size={12} aria-hidden="true" /> Space 记忆 <small className={HEADING_NOTE_CLASS}>{space.memory.length} 条</small>
        </h4>
        <p className="m-0 mb-2 text-act-xs leading-[1.55] text-text-faint">
          只有协调 Agent 会写。Actor 自己的记忆跟着 Actor 走，在它的标签页里看。
        </p>
        {space.memory.map((m) => (
          <div key={m.id} className="group flex items-start gap-2 rounded-act-md py-2 pl-2.5 pr-1.5 hover:bg-hover-overlay">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-act-sm leading-[1.55] [overflow-wrap:anywhere]">{m.t}</p>
              <small className="text-act-xxs text-text-faint">{m.src}</small>
            </div>
            <IconButton
              label="忘记" size="xs" variant="ghost"
              className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={() => forgetMemory(m.id)}
            >
              <Trash2 size={12} aria-hidden="true" />
            </IconButton>
          </div>
        ))}
        {space.memory.length ? null : <PanelEmpty icon={<Brain size={22} strokeWidth={1.6} />}>还没有记忆。</PanelEmpty>}
      </section>
    </div>
  );
}
