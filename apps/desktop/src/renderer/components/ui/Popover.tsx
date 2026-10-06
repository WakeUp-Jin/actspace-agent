import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";
import { cn } from "./cn";
import { OpenerCapture } from "./OpenerCapture";

// 非模态浮层：点外面、按 Esc、焦点移出都会关闭，背景照常可操作。打开时把焦点移进浮层，
// 关闭后回到触发器（没有触发器时回到打开前的焦点）。
// 定位交给 Radix（避让窗口边缘、空间不够时翻到另一侧）。没有触发器元素时用 PopoverAnchor：
// 包住一个元素，或传 virtualRef（例如选区的 getBoundingClientRect）。
// 外框只给层级、边框、背景、阴影；圆角用 radius 选，内边距和宽度由调用方给。

export type PopoverRadius = "md" | "lg" | "xl" | "2xl";

const RADIUS_CLASS: Record<PopoverRadius, string> = {
  md: "rounded-act-md",
  lg: "rounded-act-lg",
  xl: "rounded-act-xl",
  "2xl": "rounded-2xl",
};

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  radius?: PopoverRadius;
};

const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, PopoverContentProps>(({
  radius = "md", className, sideOffset = 6, collisionPadding = 8, onKeyDown, onInteractOutside, onCloseAutoFocus, children, ...props
}, ref) => {
  // Radix 关闭时只把焦点还给 PopoverTrigger。用 PopoverAnchor 定位、没有 Trigger 的浮层，
  // 由 OpenerCapture 记下打开前的焦点作为兜底；只在焦点随浮层一起丢失时还。点了外面关闭的不还，焦点留给用户新点的地方。
  const opener = React.useRef<HTMLElement | null>(null);
  const interactedOutside = React.useRef(false);
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn("z-(--act-z-popover) max-w-[calc(100vw-16px)] border border-line bg-surface-raised text-text-main shadow-act-popover outline-none [-webkit-app-region:no-drag]", RADIUS_CLASS[radius], className)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          // 与 DialogContent 相同：Esc 由 Radix 在 document 上处理，不再沿组件树冒泡到外层的 Esc 处理。
          if (event.key === "Escape") event.stopPropagation();
        }}
        onInteractOutside={(event) => {
          onInteractOutside?.(event);
          if (!event.defaultPrevented) interactedOutside.current = true;
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          const outside = interactedOutside.current;
          interactedOutside.current = false;
          if (event.defaultPrevented || outside || !opener.current?.isConnected) return;
          // 关闭前焦点已经去了别处（例如调用方自己处理了外部点击），也不抢回来。
          const active = document.activeElement;
          if (active && active !== document.body) return;
          event.preventDefault();
          opener.current.focus();
        }}
        {...props}
      >
        <OpenerCapture target={opener} />
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent };
