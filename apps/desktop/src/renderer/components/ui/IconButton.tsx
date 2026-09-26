import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";
import { BUTTON_VARIANT_CLASS, cx } from "./Button";

// 纯图标按钮。label 必填：同时生成 aria-label 和 Tooltip（front-icon-button-tooltip-guidelines.md），
// 从类型上保证不会再出现没有名字的图标按钮。className 只放布局与显隐类，不要覆盖尺寸、圆角、颜色。

export type IconButtonVariant = "ghost" | "soft" | "secondary" | "primary";
export type IconButtonSize = "xs" | "sm" | "md" | "lg";
export type IconButtonShape = "square" | "round";

const ICON_BUTTON_BASE_CLASS =
  "inline-grid shrink-0 place-items-center border p-0 transition-[background-color,border-color,color,opacity,transform] duration-(--motion-fast) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-default aria-disabled:opacity-50";

// xs = Sidebar / 文件树行内（22px）；sm = 面板工具条、设置（28px）；md = 弹窗标题栏、发送（32px）；lg = Composer 左侧入口（36px）。
const ICON_BUTTON_SIZE_CLASS: Record<IconButtonSize, string> = {
  xs: "size-[22px]",
  sm: "size-7",
  md: "size-8",
  lg: "size-9",
};

const ICON_BUTTON_SHAPE_CLASS: Record<IconButtonShape, string> = {
  square: "rounded-act-sm",
  round: "rounded-act-pill",
};

// ghost 图标默认用更淡的 faint，hover 回到主文字；soft 是带浅底和描边的常驻入口（Composer「+」）；
// secondary / primary 与 Button 共用。展开态用 aria-expanded 统一变深。
const ICON_BUTTON_VARIANT_CLASS: Record<IconButtonVariant, string> = {
  ghost: "border-transparent bg-transparent text-text-faint enabled:hover:bg-hover-overlay enabled:hover:text-text-main aria-expanded:bg-selected aria-expanded:text-text-main",
  soft: "border-line bg-surface-subtle text-text-muted enabled:hover:border-line-strong enabled:hover:bg-hover-overlay enabled:hover:text-text-main aria-expanded:border-line-strong aria-expanded:bg-selected aria-expanded:text-text-main",
  secondary: BUTTON_VARIANT_CLASS.secondary,
  primary: BUTTON_VARIANT_CLASS.primary,
};

export function iconButtonClass({
  variant = "ghost",
  size = "sm",
  shape = "square",
}: { variant?: IconButtonVariant; size?: IconButtonSize; shape?: IconButtonShape } = {}): string {
  return cx(ICON_BUTTON_BASE_CLASS, ICON_BUTTON_VARIANT_CLASS[variant], ICON_BUTTON_SIZE_CLASS[size], ICON_BUTTON_SHAPE_CLASS[shape]);
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  /** 完整动作语义，作为 aria-label；未传 tooltip 时也作为 Tooltip 文案。 */
  label: string;
  /** Tooltip 文案，可比 label 更短；传 false 表示所在组合控件已有可见文字解释，不显示 Tooltip。 */
  tooltip?: ReactNode | false;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  shape?: IconButtonShape;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tooltip, tooltipSide, variant, size, shape, className, children, type = "button", ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cx(iconButtonClass({ variant, size, shape }), className)}
      {...rest}
    >
      {children}
    </button>
  );
  if (tooltip === false) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
});
