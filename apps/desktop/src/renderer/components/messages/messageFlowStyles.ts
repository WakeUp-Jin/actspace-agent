import type { MessageBlock } from "@actspace/shared";

/** Layout categories only; never change event order or tool identity. */
export function messageFlowKind(message: MessageBlock): "process" | "prose" | "other" {
  if (message.kind === "assistant") return "prose";
  if ("status" in message && message.status === "pending") return "other";
  switch (message.kind) {
    case "thinking": case "read": case "search": case "grep": case "glob":
    case "directory_list": case "web_search": case "media_analysis": case "image_generation":
    case "delete": case "tool": case "error": case "bash": case "edit_diff": case "write_diff":
      return "process";
    default: return "other";
  }
}
