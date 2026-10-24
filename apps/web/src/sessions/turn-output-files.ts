import { itemBlocks } from "./transcript-model";
import type { Turn } from "./turn-model";

/** Only structured workspace outputs are eligible; display paths and assistant text are not capabilities. */
export function isOutputPath(path: string): boolean {
  return Boolean(path) && !/[\\\u0000-\u001f\u007f:]/.test(path) && !path.startsWith("/") && path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

export function turnOutputFiles(turn: Turn): string[] {
  const paths = new Set<string>();
  for (const block of [...turn.process, ...turn.reply, ...turn.tail].flatMap(itemBlocks)) {
    if (block.kind !== "write_diff" && block.kind !== "edit_diff" && block.kind !== "present") continue;
    if (block.status !== "completed") continue;
    if (("errorMessage" in block && block.errorMessage) || ("isError" in block && block.isError)) continue;
    const outputs = block.kind === "present" ? block.files : [block];
    for (const output of outputs) if (output.outputRelativePath && isOutputPath(output.outputRelativePath)) paths.add(output.outputRelativePath);
  }
  return [...paths];
}
