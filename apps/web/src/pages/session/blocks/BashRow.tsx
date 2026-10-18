import { useEffect, useState } from "react";
import { useConnectionStore, useHostConnection } from "../../../connection/use-connection";
import { formatElapsed } from "../../../sessions/composer-state";
import { ToolLine } from "./ToolLine";

type BashLike = { readonly status: string; readonly command: string; readonly title: string; readonly intent?: string; readonly cwd?: string; readonly sandboxed?: boolean; readonly notExecuted?: boolean; readonly stdout?: string; readonly stderr?: string; readonly exitCode?: number | null; readonly durationMs?: number; readonly reason?: string; readonly createdAt: string; readonly runId?: string };

const VERBS: Readonly<Record<string, string>> = { pending: "Running", running: "Running", failed: "Failed", denied: "Denied", expired: "Expired", cancelled: "Cancelled" };

function useElapsed(active: boolean, since: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const start = Date.parse(since);
  return formatElapsed(Number.isFinite(start) ? now - start : 0);
}

/** 执行环境徽标：没进入执行的标「未执行」，否则按 sandboxed 标沙盒 / 真实环境；历史数据没有这个字段时不标。 */
function badge(block: BashLike): { text: string; warn: boolean } | null {
  if (block.notExecuted || block.status === "denied") return { text: "未执行", warn: false };
  if (block.sandboxed === true) return { text: "沙盒", warn: false };
  if (block.sandboxed === false) return { text: "真实环境", warn: true };
  return null;
}

/** Bash：Running / Ran / Failed / Denied + 命令 + 环境徽标；点开看意图、命令、目录和输出。 */
export function BashRow({ block, sessionId }: { readonly block: BashLike; readonly sessionId: string }) {
  const connection = useHostConnection();
  const store = useConnectionStore();
  const [open, setOpen] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const running = block.status === "running" || block.status === "pending";
  const elapsed = useElapsed(block.status === "running", block.createdAt);
  const failed = block.status === "failed" || (typeof block.exitCode === "number" && block.exitCode !== 0);
  const inline = [block.stdout, block.stderr].filter(Boolean).join("\n");
  const env = badge(block);
  const verb = VERBS[block.status] ?? (failed ? "Failed" : "Ran");

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || inline || output !== null || !connection || !block.runId) return;
    void connection.client.call("sessions.output", { sessionId, runId: block.runId, offset: 0 }).then(result => {
      const chunks = (result as { chunks?: { text: string }[] }).chunks ?? [];
      setOutput(chunks.map(chunk => chunk.text).join(""));
    }).catch(error => { store.reportError(error); setOutput("无法加载输出"); });
  };

  const where = [block.cwd, env?.text, block.durationMs ? formatElapsed(block.durationMs) : ""].filter(Boolean).join(" · ");
  return (
    <ToolLine
      verb={verb}
      target={<span className="tool-mono text-act-sm">{block.command || block.title}</span>}
      title={block.command}
      grow
      running={running}
      error={failed && block.status !== "denied"}
      extra={<>{block.status === "running" ? <span className="tl-meta">{elapsed}</span> : null}{env ? <span className="tool-badge" data-tone={env.warn ? "warn" : undefined}>{env.text}</span> : null}</>}
      open={open}
      onToggle={toggle}
    >
      <div className="tool-out">
        <pre>
          {block.intent ? <span className="tool-out-note"># {block.intent}{"\n"}</span> : null}
          <span>$ {block.command}{"\n"}</span>
          {where ? <span className="tool-out-note"># {where}{"\n"}</span> : null}
          {"\n"}{inline || output || block.reason || (running ? "" : "无输出")}
        </pre>
      </div>
    </ToolLine>
  );
}
