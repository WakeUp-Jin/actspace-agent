import { MoreHorizontal } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

export type ReviewStripSummary = {
  status: "loading" | "changes" | "empty" | "notAvailable" | "noBaseline" | "partial" | "failed";
  additions?: number;
  deletions?: number;
  reason?: string;
};

const ACTION_STRIP_CLASS = "composer-action-strip flex min-h-[34px] items-center gap-2";
const ADDITION_CLASS = "font-medium text-success";
const DELETION_CLASS = "font-medium text-danger";

export type ReviewStripProps = {
  summary: ReviewStripSummary;
  onOpenReview?: () => void;
};

/** 09 T29：输入框上方的 Review 按钮条。有变更时带 +/- 行数；加载中不可点。是否显示由 Composer 判断。 */
export function ReviewStrip({ summary, onOpenReview }: ReviewStripProps) {
  const showCounts = summary.status === "changes" || summary.status === "partial";
  const isLoading = summary.status === "loading";
  const ariaLabel =
    showCounts
      ? `审查待处理变更 +${summary.additions ?? 0} -${summary.deletions ?? 0}`
      : summary.reason === "not_a_repository"
        ? "查看工作区变更；Git 仓库尚未初始化"
        : "查看工作区变更";

  return (
    <div className={ACTION_STRIP_CLASS} aria-label="待处理的审查操作">
      <Button
        className="review-preview-button"
        variant="secondary"
        shape="pill"
        aria-label={ariaLabel}
        disabled={isLoading}
        onClick={onOpenReview}
      >
        <span>Review</span>
        {showCounts ? (
          <>
            <span className={ADDITION_CLASS}>+{summary.additions ?? 0}</span>
            <span className={DELETION_CLASS}>-{summary.deletions ?? 0}</span>
          </>
        ) : null}
      </Button>
      {/* 技术债：还没有菜单内容，按钮没有 onClick（见 09 执行记录）。 */}
      <IconButton className="review-overflow-button" label="更多审查操作" variant="secondary" shape="round">
        <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
