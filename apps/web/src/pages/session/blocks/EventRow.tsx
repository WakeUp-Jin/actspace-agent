import type { MessageBlock } from "@actspace/shared";
import { formatElapsed } from "../../../sessions/composer-state";
import { cx } from "../../../ui/cx";

// 共享选择器里的英文状态文案（desktop 原样显示），这里换成中文。
const STATUS_TEXT: Readonly<Record<string, string>> = { Stopped: "已停止", "Operating Space · Expanding": "思考中…" };

/** 状态提示与上下文压缩分隔线。 */
export function EventRow({ block }: { readonly block: Extract<MessageBlock, { kind: "status" | "context_compaction" }> }) {
  if (block.kind === "status") {
    return <p className={cx("m-0 text-act-sm", block.tone === "error" ? "text-danger" : "text-text-faint")}>{STATUS_TEXT[block.content] ?? block.content}</p>;
  }
  const text = block.status === "running" ? "正在压缩上下文…" : block.status === "failed" ? `压缩失败${block.errorMessage ? `：${block.errorMessage}` : ""}` : `上下文已压缩${block.durationMs ? ` · ${formatElapsed(block.durationMs)}` : ""}`;
  return (
    <div className="flex items-center gap-3 text-act-xs text-text-faint" role="separator">
      <span className="h-px flex-1 bg-line" />
      <span className={cx(block.status === "running" && "shimmer-text")}>{text}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** 等模型首个输出时的占位。 */
export function ThinkingWait() {
  return <div className="tl"><span className="shimmer-text">思考中</span></div>;
}
