import { CheckCircle2, CircleAlert, Loader2, X } from "lucide-react";
import type { LocalUpdateProgressPhase, LocalUpdateState } from "@actspace/shared";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";

export function isActiveLocalUpdatePhase(phase: LocalUpdateProgressPhase): boolean {
  return phase === "starting" || phase === "building" || phase === "ready_to_replace" || phase === "waiting_for_exit" || phase === "replacing";
}

const LOCAL_UPDATE_STEPS: { phase: LocalUpdateProgressPhase; label: string }[] = [
  { phase: "starting", label: "启动" },
  { phase: "building", label: "构建" },
  { phase: "ready_to_replace", label: "准备替换" },
  { phase: "waiting_for_exit", label: "退出当前应用" },
  { phase: "replacing", label: "替换" },
];

function localUpdateStepIndex(phase: LocalUpdateProgressPhase): number {
  if (phase === "succeeded") return LOCAL_UPDATE_STEPS.length;
  if (phase === "failed") return Math.max(1, LOCAL_UPDATE_STEPS.findIndex((step) => step.phase === "building") + 1);
  const index = LOCAL_UPDATE_STEPS.findIndex((step) => step.phase === phase);
  return index >= 0 ? index + 1 : 0;
}

function formatLocalUpdateTime(timestamp: string | undefined): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function LocalUpdateProgressDialog({
  state,
  onClose,
}: {
  state: LocalUpdateState;
  onClose: () => void;
}) {
  const progress = state.progress;
  const phase = progress.phase;
  const isFailed = phase === "failed";
  const isSucceeded = phase === "succeeded";
  const isActive = isActiveLocalUpdatePhase(phase);
  const completedSteps = localUpdateStepIndex(phase);
  const progressWidth = isFailed
    ? "100%"
    : `${Math.min(100, Math.max(8, (completedSteps / LOCAL_UPDATE_STEPS.length) * 100))}%`;
  const updatedAt = formatLocalUpdateTime(progress.updatedAt);

  return (
    // 更新进行中不能关闭（Esc 和点遮罩都忽略），结束或失败后才能关。
    <Dialog open onOpenChange={(open) => { if (!open && !isActive) onClose(); }}>
      <DialogContent size="md" surface="raised" backdrop="overlay" className="p-5">
        <DialogTitle className="sr-only">本地更新进度</DialogTitle>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={[
                "flex h-6 w-6 shrink-0 items-center justify-center",
                isFailed ? "text-on-danger" : isSucceeded ? "text-on-success" : "text-operational",
              ].join(" ")}
              aria-hidden="true"
            >
              {isFailed ? (
                <CircleAlert size={21} strokeWidth={2.2} />
              ) : isSucceeded ? (
                <CheckCircle2 size={21} strokeWidth={2.2} />
              ) : (
                <Loader2 size={21} strokeWidth={2.2} className="animate-spin" />
              )}
            </span>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3 className="text-act-lg font-bold text-text-main">本地更新</h3>
              <p className="min-w-0 text-act-xs leading-relaxed text-text-faint">{progress.message}</p>
            </div>
          </div>
          {!isActive ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-act-md text-text-faint transition hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main"
              aria-label="关闭更新进度"
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} />
            </button>
          ) : null}
        </div>

        <div
          className="mt-5 h-2 overflow-hidden rounded-act-pill bg-line"
          role="progressbar"
          aria-label="本地更新进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isFailed ? 100 : Math.round(Math.min(100, Math.max(0, (completedSteps / LOCAL_UPDATE_STEPS.length) * 100)))}
        >
          <div
            className={[
              "h-full rounded-act-pill transition-all duration-(--motion-slow)",
              isFailed ? "bg-danger" : isSucceeded ? "bg-success" : "bg-operational",
            ].join(" ")}
            style={{ width: progressWidth }}
          />
        </div>

        <ol className="mt-4 grid grid-cols-5 gap-1.5">
          {LOCAL_UPDATE_STEPS.map((step, index) => {
            const done = isSucceeded || index < completedSteps;
            const current = step.phase === phase;
            return (
              <li key={step.phase} className="flex min-w-0 flex-col items-center gap-1 text-center">
                <span
                  className={[
                    "flex h-5 w-5 items-center justify-center rounded-act-pill border text-act-xxs font-semibold",
                    current && isActive
                      ? "border-operational bg-operational text-on-operational"
                      : done
                        ? "border-success bg-success-soft text-on-success"
                        : "border-line bg-surface text-text-faint",
                  ].join(" ")}
                >
                  {index + 1}
                </span>
                <span className="w-full truncate text-act-xxs text-text-faint">{step.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-col gap-1 rounded-act-md border border-line bg-surface-subtle px-3 py-2">
          {updatedAt ? <span className="text-act-xs text-text-faint">更新时间：{updatedAt}</span> : null}
          <span className="break-all text-act-xs text-text-subtle">日志：{state.logPath}</span>
        </div>

        {isActive ? (
          <p className="mt-3 text-act-xs leading-relaxed text-text-faint">
            构建阶段不会退出应用；构建完成后才会关闭窗口并执行替换。
          </p>
        ) : null}

        {!isActive ? (
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
