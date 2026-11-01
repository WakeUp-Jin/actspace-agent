import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

// 无外观按钮：只保证 type="button" 和可见的 focus 环，外观全由调用方的 className 决定。
// 只给「整块可点」的区域用（表格行展开、卡片、表头排序）；看起来是按钮的东西仍然用 Button / IconButton。
export const PlainButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function PlainButton(
  { className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring", className)}
      {...rest}
    />
  );
});
