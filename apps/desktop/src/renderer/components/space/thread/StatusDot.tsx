import { STATUS_LABEL } from "../model/selectors";
import type { MemberStatus } from "../model/types";

// 状态点：等你决定琥珀、出错红、工作中翡翠绿、有结果翡翠绿空心圈、空闲灰（设计文档 §6）。
const DOT_CLASS: Record<MemberStatus, string> = {
  wait: "bg-warning",
  fail: "bg-danger",
  run: "bg-operational",
  result: "border border-operational",
  idle: "bg-text-faint",
};

export function StatusDot({ status, className = "" }: { status: MemberStatus; className?: string }) {
  return <span role="img" aria-label={STATUS_LABEL[status]} className={`inline-block size-1.5 shrink-0 rounded-act-pill ${DOT_CLASS[status]} ${className}`} />;
}
