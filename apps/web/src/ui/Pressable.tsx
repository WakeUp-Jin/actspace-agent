import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

// className 自带 display / 宽度时不再加 block / w-full，避免两个同属性工具类谁赢取决于生成顺序。
const DISPLAY = /(?:^|\s)(?:flex|grid|inline-flex|inline-grid|inline-block|inline|hidden)(?:\s|$)/;
const WIDTH = /(?:^|\s)w-/;

/** 不带样式的可点击区域（列表行、可展开的工具行等）；按下时显示 hover 背景。 */
export const Pressable = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function Pressable({ className, type = "button", ...rest }, ref) {
  return <button ref={ref} type={type} className={cx(!DISPLAY.test(className ?? "") && "block", !WIDTH.test(className ?? "") && "w-full", "text-left transition-colors duration-(--motion-fast) active:bg-hover-overlay disabled:cursor-default", className)} {...rest} />;
});
