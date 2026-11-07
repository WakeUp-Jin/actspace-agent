/**
 * Explicit visual fixture: the running-text shimmer in a few real row shapes (tool line, long ellipsized line,
 * thinking title, waiting status). `?theme=dark` switches theme, `?freeze=0.5` pauses every animation at that
 * progress of its cycle so before/after screenshots can be compared. No IPC; never imported by the app entry point.
 */
import { createRoot } from "react-dom/client";
import type { MessageBlock } from "@actspace/shared";
import { ToolLogLine } from "../../components/messages/ToolLogLine";
import { ThinkingBlock } from "../../components/messages/ThinkingBlock";
import "../../styles/index.css";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") === "dark" ? "dark" : "light";
const createdAt = "2026-11-04T00:00:00.000Z";
const rows: MessageBlock[] = [
  { kind: "read", id: "r1", createdAt, filePath: "apps/desktop/src/renderer/App.tsx", displayText: "Read apps/desktop/src/renderer/App.tsx", status: "running" },
  { kind: "grep", id: "g1", createdAt, pattern: "ToolUiPreview", scope: "*.ts", displayText: "Grep ToolUiPreview in *.ts", status: "running" },
  { kind: "tool", id: "t1", createdAt, title: "browser_navigate", content: "https://example.com/a/very/long/path/that/keeps/going/and/going/until/the/line/has/to/be/cut/with/an/ellipsis/at/the/end", status: "running" } as MessageBlock,
  { kind: "thinking", id: "th1", createdAt, title: "Thinking...", content: "正在思考", collapsedByDefault: true, status: "running" },
  { kind: "read", id: "r2", createdAt, filePath: "docs/ARCHITECTURE.md", displayText: "Read docs/ARCHITECTURE.md", status: "completed" },
];

function Preview() {
  return (
    <div className="bg-app-bg p-6 text-text-main" style={{ width: 520 }}>
      {rows.map((row) => row.kind === "thinking" ? <ThinkingBlock key={row.id} message={row} /> : <ToolLogLine key={row.id} message={row as never} />)}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
const freeze = query.get("freeze");
if (freeze !== null) {
  // Pause after the first paint; leaves document.getAnimations() frozen at the requested progress of a 1.1s cycle.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = Number(freeze) * 1100; }
  }));
}
