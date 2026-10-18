import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type PillButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** ghost 浅灰文字、tonal 浅灰底、accent 主色实心、danger 危险实心。 */
  readonly tone?: "ghost" | "tonal" | "accent" | "danger";
  /** sm 30px（审批）、xs 26px（排队托盘）。 */
  readonly size?: "sm" | "xs";
  readonly busy?: boolean;
  readonly icon?: ReactNode;
};

/** 胶囊小按钮（审批卡、排队托盘）。样式 .pill-btn 在 styles/web.css。 */
export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton({ tone = "ghost", size = "sm", busy = false, icon, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button ref={ref} type={type} data-tone={tone} data-size={size} disabled={disabled || busy} aria-busy={busy || undefined} className={cx("pill-btn", className)} {...rest}>
      {busy ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
});
