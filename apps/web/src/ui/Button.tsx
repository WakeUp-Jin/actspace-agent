import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-action text-on-action hover:bg-action-hover",
  secondary: "border border-line bg-surface text-text-main hover:bg-hover-overlay",
  ghost: "text-text-main hover:bg-hover-overlay",
  danger: "bg-danger text-on-danger-solid hover:bg-danger-hover",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: ButtonVariant; readonly busy?: boolean; readonly icon?: ReactNode; readonly block?: boolean };

/** 最小高度 44px（触控规范）。busy 时显示转圈并禁用。 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", busy = false, icon, block = false, className, children, disabled, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-act-lg px-4 text-act-base font-medium transition-colors duration-(--motion-fast) disabled:cursor-default disabled:opacity-45",
        VARIANTS[variant],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {busy ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
});
