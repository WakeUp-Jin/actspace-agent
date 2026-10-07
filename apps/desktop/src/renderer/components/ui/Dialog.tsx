import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";
import { cn } from "./cn";
import { OpenerCapture } from "./OpenerCapture";

// 模态对话框的唯一实现。行为全部来自 Radix：portal 到 body、Tab 不出对话框、Esc 只关最上层、
// 关闭后焦点回到打开前的位置（有 DialogTrigger 时回到触发器）、背景不可交互也不滚动。
// 外观沿用迁移前的两套：float（设置、确认框）和 raised（Review、本地更新这类卡片），不新造样式。
// 只负责外框；标题、正文、按钮的排版由调用方决定，DialogHeader / DialogFooter 只是常用的排版。

export type DialogSize = "sm" | "md" | "lg" | "xl" | "full";
export type DialogSurface = "float" | "raised";
export type DialogBackdrop = "scrim" | "overlay";

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: "w-full max-w-[420px]",
  md: "w-full max-w-[460px]",
  lg: "w-full max-w-[520px]",
  xl: "w-full max-w-[760px]",
  full: "fixed inset-4 sm:inset-8",
};

const SURFACE_CLASS: Record<DialogSurface, string> = {
  float: "rounded-act-xl border border-line bg-surface shadow-act-float",
  raised: "rounded-act-lg border border-line bg-surface-raised shadow-act-popover",
};

const BACKDROP_CLASS: Record<DialogBackdrop, string> = {
  scrim: "bg-scrim",
  overlay: "bg-overlay",
};

// 遮罩盖住窗口标题栏，必须 no-drag，否则 Electron 把点击当成拖动窗口。
const NO_DRAG = "[-webkit-app-region:no-drag]";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: DialogSize;
  surface?: DialogSurface;
  backdrop?: DialogBackdrop;
  /** 叠加在遮罩上的类，只放不冲突的效果（如 backdrop-blur）。 */
  overlayClassName?: string;
  /** 打开后先聚焦它；不给时 Radix 聚焦第一个可聚焦元素（`autoFocus` 的元素优先）。 */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** 关闭后聚焦它；不给时回到打开前的焦点（通常就是触发器），那个元素已不在页面上时回到 DialogTrigger。 */
  returnFocus?: React.RefObject<HTMLElement | null> | HTMLElement | null;
  /** 点遮罩是否关闭。确认框、正在编辑的表单设为 false，只能用按钮或 Esc 关。 */
  closeOnOutsideClick?: boolean;
  /** 渲染了 DialogDescription 时设为 true，让 Radix 把它关联到 aria-describedby。 */
  withDescription?: boolean;
};

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(({
  size = "md", surface = "float", backdrop = "scrim", overlayClassName, initialFocus, returnFocus,
  closeOnOutsideClick = true, withDescription = false, className, onOpenAutoFocus, onCloseAutoFocus,
  onInteractOutside, onKeyDown, children, ...props
}, ref) => {
  const descriptionProps = withDescription ? {} : { "aria-describedby": undefined };
  // Radix 的模态 Dialog 关闭时只把焦点还给 DialogTrigger。项目里多数对话框是条件渲染、没有 Trigger 的，
  // 所以由 OpenerCapture 在内容第一次渲染时（React 处理 autoFocus 之前）记下当时的焦点，作为兜底。
  const opener = React.useRef<HTMLElement | null>(null);
  const full = size === "full";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn("fixed inset-0 z-(--act-z-modal)", BACKDROP_CLASS[backdrop], NO_DRAG, overlayClassName)} />
      {/* 定位层只负责居中，不接收指针事件，点到空白处落在遮罩上。full 自己定位。 */}
      <div className={cn("pointer-events-none fixed inset-0 z-(--act-z-modal)", full ? undefined : "grid place-items-center px-5", NO_DRAG)}>
        <DialogPrimitive.Content
          ref={ref}
          {...descriptionProps}
          className={cn("pointer-events-auto outline-none", SIZE_CLASS[size], SURFACE_CLASS[surface], className)}
          onOpenAutoFocus={(event) => {
            onOpenAutoFocus?.(event);
            if (event.defaultPrevented || !initialFocus?.current) return;
            event.preventDefault();
            initialFocus.current.focus();
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            const target = (returnFocus instanceof HTMLElement ? returnFocus : returnFocus?.current) ?? opener.current;
            if (event.defaultPrevented || !target?.isConnected) return;
            event.preventDefault();
            target.focus();
          }}
          // 点外面和焦点移到外面都走 onInteractOutside。
          onInteractOutside={(event) => {
            onInteractOutside?.(event);
            if (!closeOnOutsideClick) event.preventDefault();
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            // Radix 在 document 捕获阶段处理 Esc。React 事件会穿过 portal 冒泡到外层组件，
            // 外层自己的 Esc 处理（返回上一步、关右侧面板）不能再响应同一次按键。
            if (event.key === "Escape") event.stopPropagation();
          }}
          {...props}
        >
          <OpenerCapture target={opener} />
          {children}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = "DialogContent";

const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4", className)} {...props} />;
}

function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 overflow-y-auto", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex justify-end gap-2", className)} {...props} />;
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogBody, DialogFooter };
