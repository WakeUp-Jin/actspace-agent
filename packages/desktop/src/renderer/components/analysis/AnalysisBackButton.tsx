import { ArrowLeft } from "lucide-react";

export function AnalysisBackButton({
  label,
  onClick,
  iconOnly = false,
}: {
  label: string;
  onClick: () => void;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-9 shrink-0 items-center justify-center rounded-act-md text-[13px] font-medium text-text-muted transition-colors duration-[130ms] ease-in-out hover:bg-hover-overlay hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${iconOnly ? "w-9" : "gap-2 px-2.5"}`}
    >
      <ArrowLeft size={16} strokeWidth={2} />
      {iconOnly ? null : <span>{label}</span>}
    </button>
  );
}
