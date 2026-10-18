import type { MessageBlock } from "@actspace/shared";
import { ToolLine } from "./ToolLine";

const text = (block: MessageBlock, keys: readonly string[]): string => {
  const record = block as Record<string, unknown>;
  for (const key of keys) if (typeof record[key] === "string" && record[key]) return record[key] as string;
  return "";
};

/** 其余工具的动作与目标：有桌面端文案的照搬，没有的显示工具给出的标题。 */
export function genericLine(block: MessageBlock): { verb: string; target: string } {
  switch (block.kind) {
    case "directory_list": return { verb: "Listed", target: block.path };
    case "delete": return { verb: "Deleted", target: block.filePath };
    case "media_analysis": return { verb: "Analyzed", target: block.mediaName };
    case "image_generation": return { verb: "Generated image", target: block.promptPreview || block.displayText };
    case "present": return { verb: "Presented", target: block.files.map(file => file.path).join(", ") || block.displayText };
    case "agent": return { verb: "Agent", target: text(block, ["description", "title", "promptPreview"]) };
    default: return { verb: text(block, ["title", "displayText", "description"]) || block.kind, target: "" };
  }
}

/** 没有专用样式的工具块：一行动作 + 目标。 */
export function GenericToolRow({ block }: { readonly block: MessageBlock }) {
  const status = "status" in block ? block.status : undefined;
  const failed = status === "failed" || status === "denied" || ("isError" in block && block.isError === true);
  const running = status === "running" || status === "pending";
  const { verb, target } = genericLine(block);
  return <ToolLine verb={verb} target={target} title={target} running={running} error={failed} />;
}
