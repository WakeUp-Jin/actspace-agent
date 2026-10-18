import type { ExploreBlock } from "../../../sessions/transcript-model";
import { ToolLine } from "./ToolLine";

const RUNNING_STATES: ReadonlySet<string | undefined> = new Set(["running", "pending"]);

/** 读文件 / 搜索的动作与目标，文案对齐桌面端 ToolLogLine。 */
export function exploreLine(block: ExploreBlock): { verb: string; target: string; meta?: string } {
  const scope = (value?: string) => (value ? ` in ${value}` : "");
  switch (block.kind) {
    case "read": return { verb: "Read", target: block.filePath, ...(block.range ? { meta: block.range } : {}) };
    case "grep": return { verb: "Grep", target: `${block.pattern}${scope(block.scope)}` };
    case "glob": return { verb: "Glob", target: `${block.pattern}${scope(block.scope)}` };
    case "search": return { verb: "Searched files", target: `${block.scope ? `${block.scope} ` : ""}for ${block.query}` };
    case "web_search": return { verb: block.mode === "url" ? "Fetched" : "Searched web", target: block.url ?? block.query ?? block.displayText };
  }
}

/** 相邻的读文件 / 搜索：每个一行，和桌面端一样不合并成摘要。 */
export function ExploreGroup({ blocks }: { readonly blocks: readonly ExploreBlock[] }) {
  return (
    <div className="flex flex-col gap-[5px]">
      {blocks.map(block => {
        const line = exploreLine(block);
        const failed = block.status === "failed" || block.status === "denied";
        return <ToolLine key={block.id} verb={line.verb} target={line.target} title={line.target} running={RUNNING_STATES.has(block.status)} error={failed} {...(line.meta ? { extra: <span className="tl-meta">{line.meta}</span> } : {})} />;
      })}
    </div>
  );
}
