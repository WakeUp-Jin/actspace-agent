import type { ReactNode } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { Button } from "../../ui/Button";
import type { ActorBlock, SpaceMember } from "../model/types";
import { useSpaceDemoActions } from "../model/use-space-demo";
import { ActorRefText } from "./ActorRef";

/** 两侧带细线的分隔：时间、任务开始/完成、记忆同步共用。 */
export function ThreadDivider({ children, tone = "faint" }: { children: ReactNode; tone?: "faint" | "muted" }) {
  return (
    <div className={`flex items-center gap-2.5 py-0.5 text-act-xxs tabular-nums ${tone === "muted" ? "text-text-muted" : "text-text-faint"}`}>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="inline-flex items-center gap-1">{children}</span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
    </div>
  );
}

function ApprovalBlock({ member }: { member: SpaceMember }) {
  const { approve, deny } = useSpaceDemoActions();
  if (member.status === "wait" && member.approval) {
    return (
      <section aria-label="审批" className="overflow-hidden rounded-act-md border border-line bg-surface shadow-act-soft">
        <h2 className="flex items-center gap-2 px-3.5 pb-1.5 pt-2.5 text-act-sm font-semibold text-text-main">
          <ShieldAlert size={14} className="shrink-0 text-warning" aria-hidden="true" />想运行一条命令
        </h2>
        <pre className="mx-3.5 whitespace-pre-wrap break-words rounded-act-sm bg-surface-subtle px-2.5 py-2 font-mono text-act-xs text-text-main">{member.approval.cmd}</pre>
        <p className="mx-3.5 mt-2 text-act-xs leading-relaxed text-text-faint">{member.approval.why}</p>
        <div className="flex flex-wrap justify-end gap-1.5 p-3">
          <Button variant="secondary" size="sm" onClick={() => deny(member.id)}>拒绝</Button>
          <Button variant="primary" size="sm" onClick={() => approve(member.id)}>运行</Button>
        </div>
      </section>
    );
  }
  const Icon = member.denied ? X : Check;
  return (
    <section aria-label="审批" className="overflow-hidden rounded-act-md border border-line bg-surface shadow-act-soft">
      <p className="flex items-center gap-1.5 px-3.5 py-2.5 text-act-xs text-text-faint">
        <Icon size={12} aria-hidden="true" />
        {member.denied ? "已拒绝这条命令，等你给别的方向。" : "已批准，继续往下做。"}
      </p>
    </section>
  );
}

/** Actor 标签页里的一条对话块。 */
export function ActorBlockView({ block, member }: { block: ActorBlock; member: SpaceMember }) {
  switch (block.k) {
    case "task":
      return <ThreadDivider tone="muted">开始 · {block.t} · {block.at}</ThreadDivider>;
    case "done":
      return <ThreadDivider tone="muted"><Check size={12} aria-hidden="true" />完成 · {block.t} · {block.at}</ThreadDivider>;
    case "brief":
      return (
        <div className="rounded-act-md bg-surface-subtle px-3 py-2.5 text-act-sm leading-relaxed text-text-main">
          <small className="mb-0.5 block text-act-xxs tracking-wide text-text-faint">协调 Agent 交来的事</small>
          {block.t}
        </div>
      );
    case "line":
      return (
        <div className="flex flex-wrap items-baseline gap-x-2 text-act-xs text-text-muted [overflow-wrap:anywhere]">
          <span className="min-w-[34px] shrink-0 text-text-faint">{block.k1}</span>
          <code className="font-mono text-text-main">{block.t}</code>
          {block.diff ? (
            <span className="tabular-nums">
              <span className="text-operational">+{block.diff[0]}</span> <span className="text-danger">−{block.diff[1]}</span>
            </span>
          ) : null}
        </div>
      );
    case "sync":
      return <ThreadDivider>{block.t}</ThreadDivider>;
    case "text":
      return <p className="text-act-md leading-relaxed [overflow-wrap:anywhere]"><ActorRefText text={block.t} /></p>;
    case "approval":
      return <ApprovalBlock member={member} />;
  }
}
