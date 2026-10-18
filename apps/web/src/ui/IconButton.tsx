import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & {
  /** 必填：同时作为 aria-label 和悬停提示。 */
  readonly label: string;
  readonly children: ReactNode;
  /** xs 22（芯片里的 ×）、sm 30（回复尾部、托盘）、md 36（顶栏玻璃圆钮）、lg 44。 */
  readonly size?: "xs" | "sm" | "md" | "lg";
  readonly round?: boolean;
  /** faint：浅灰图标（回复尾部、弹层关闭）。颜色只能从这里给，className 里再写 text-* 会和默认色冲突。 */
  readonly tone?: "default" | "faint";
};

const SIZES = { xs: "size-[22px]", sm: "size-[30px]", md: "size-9", lg: "size-11" } as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, children, size = "lg", round = true, tone = "default", className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-grid flex-none place-items-center transition-colors duration-(--motion-fast) disabled:cursor-default disabled:opacity-45",
        tone === "faint" ? "text-text-faint hover:bg-hover-overlay hover:text-text-main active:bg-hover-overlay" : "text-text-main hover:bg-hover-overlay active:bg-hover-overlay",
        SIZES[size],
        round ? "rounded-full" : "rounded-act-md",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
