import { Activity, MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

export type SessionMainView = "chat" | "trajectory";

export function SessionViewToggle({
  view,
  onToggle,
}: {
  view: SessionMainView;
  onToggle: () => void;
}) {
  const showingTrajectory = view === "trajectory";
  const label = showingTrajectory ? "返回对话" : "查看执行轨迹";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="chrome-button chrome-session-view-toggle"
          aria-label={label}
          aria-pressed={showingTrajectory}
          title={label}
          onClick={onToggle}
        >
          {showingTrajectory ? (
            <MessageSquare size={15} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <Activity size={15} strokeWidth={1.8} aria-hidden="true" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}
