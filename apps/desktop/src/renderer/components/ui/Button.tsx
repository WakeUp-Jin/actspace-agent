import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

// 文字按钮的唯一实现。尺寸、圆角、focus、disabled、按下反馈都在这里定义；
// 业务组件只选 variant / size / shape，className 只放布局类（margin、宽度、显隐），
// 不要再传字号、圆角、颜色——同一属性出现两个 utility 时，生效的是 Tailwind 生成顺序而不是书写顺序。

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
export type ButtonSize = "xs" | "sm" | "md";
export type ButtonShape = "default" | "pill";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const BUTTON_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border font-medium transition-[background-color,border-color,color,transform] duration-(--motion-fast) enabled:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50";

// primary 用主题反色 ink action，每个区域最多一个；danger 描边用于设置里的删除入口，danger-solid 用于必须确认的破坏性主操作。
export const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-action text-on-action enabled:hover:bg-action-hover",
  secondary: "border-line bg-surface text-text-main enabled:hover:border-line-strong enabled:hover:bg-surface-subtle",
  ghost: "border-transparent bg-transparent text-text-muted enabled:hover:bg-hover-overlay enabled:hover:text-text-main",
  danger: "border-line bg-surface text-on-danger enabled:hover:border-danger/50 enabled:hover:bg-danger-soft",
  "danger-solid": "border-transparent bg-danger text-on-danger-solid enabled:hover:bg-danger-hover",
};

// xs = 审批行内（26px）；sm = 设置、审批卡、面板工具条（28px）；md = 对话框底部与表单提交（32px）。
const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  xs: "h-[26px] px-[9px] text-act-xs",
  sm: "h-7 px-2.5 text-act-sm",
  md: "h-8 px-3 text-act-sm",
};

const BUTTON_SHAPE_CLASS: Record<ButtonShape, string> = {
  default: "rounded-act-sm",
  pill: "rounded-act-pill",
};

export function buttonClass({
  variant = "secondary",
  size = "sm",
  shape = "default",
}: { variant?: ButtonVariant; size?: ButtonSize; shape?: ButtonShape } = {}): string {
  return cx(BUTTON_BASE_CLASS, BUTTON_VARIANT_CLASS[variant], BUTTON_SIZE_CLASS[size], BUTTON_SHAPE_CLASS[shape]);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  /** 进行中：前置转圈图标并设置 aria-busy；是否禁用由调用方决定。 */
  busy?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, shape, busy = false, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={busy || undefined}
      className={cx(buttonClass({ variant, size, shape }), className)}
      {...rest}
    >
      {busy ? <Loader2 size={size === "xs" ? 12 : 13} strokeWidth={2.2} className="animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});
