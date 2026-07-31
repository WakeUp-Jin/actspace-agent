import { ReviewWorkspace } from "../review/ReviewWorkspace";

export type ReviewRenderViewProps = {
  workspaceRoot?: string;
  sessionId?: string | null;
  refreshKey?: number;
  onReviewChanged?: () => void;
};

/** Right-panel object adapter. Review state remains owned by ReviewWorkspace. */
export function ReviewRenderView(props: ReviewRenderViewProps) {
  return <ReviewWorkspace {...props} />;
}
