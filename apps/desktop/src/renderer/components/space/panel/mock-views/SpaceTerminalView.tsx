import { Folder, RotateCw } from "lucide-react";
import { IconButton } from "../../../ui/IconButton";
import { terminalLines } from "../../model/panel-fixtures";
import type { PanelScope } from "../../model/selectors";
import { nameOf } from "../../model/selectors";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../../model/use-space-demo";

/** 终端标签：mock 输出（Actor 跑过的命令）+ 底部目录条。真终端是 xterm，这里不引入。 */
export function SpaceTerminalView({ scope }: { scope: PanelScope }) {
  const actors = useSpaceDemoSelector((s) => s.actors);
  const { showNotice } = useSpaceDemoActions();
  const lines = terminalLines({
    coord: !!scope.coord, member: scope.member, memberName: scope.member ? nameOf(actors, scope.member.id) : undefined,
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-act-sm leading-[1.6] text-text-main [overflow-wrap:anywhere]" role="log" aria-label="终端输出">
        {lines.map((l, i) =>
          l.kind === "dim" ? (
            <div key={i} className="text-text-faint">{l.text}</div>
          ) : (
            <div key={i}>
              <span className="text-operational">$</span> {l.text}
              {l.result ? <div className="text-text-faint">{l.result}</div> : null}
            </div>
          ),
        )}
        <div>
          <span className="text-operational">~/{scope.dir} $</span> <span className="space-caret" aria-hidden="true" />
        </div>
      </div>
      <div className="flex min-h-7 shrink-0 items-center gap-1.5 border-t border-line bg-surface-subtle pl-2.5 pr-1.5 text-act-xxs text-text-faint">
        <Folder size={12} aria-hidden="true" />
        <span>{scope.dir}</span>
        <span aria-hidden="true">·</span>
        <span>{scope.tree ? `工作树 ${scope.tree}` : "本机"}</span>
        <IconButton label="重启终端" size="xs" className="ml-auto" onClick={() => showNotice("演示里省略：重启终端")}>
          <RotateCw size={12} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
