import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";
import { cn } from "./cn";
import {
  MENU_DANGER_ITEM_CLASS, MENU_INDICATOR_SLOT_CLASS, MENU_ITEM_CLASS, MENU_LABEL_CLASS, MENU_SEPARATOR_CLASS, MENU_SHORTCUT_CLASS, MENU_SURFACE_CLASS,
} from "./menu-styles";

// 右键菜单。与 Menu 同构，样式共用 menu-styles。右键、或焦点在触发区域内时按 Shift+F10 / 菜单键打开，
// 位置在指针处（键盘打开时浏览器给的是元素位置）。键盘行为与 Menu 相同。
// 默认非模态：点菜单外面时菜单关闭，那一下点击照常落到下面的元素上，和迁移前一致。

const ContextMenu = ({ modal = false, ...props }: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Root>) => <ContextMenuPrimitive.Root modal={modal} {...props} />;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

function stopEscape(event: React.KeyboardEvent) {
  // 与 DialogContent 相同：Esc 不再沿组件树冒泡到外层的 Esc 处理。
  if (event.key === "Escape") event.stopPropagation();
}

const ContextMenuContent = React.forwardRef<React.ElementRef<typeof ContextMenuPrimitive.Content>, React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>>(({
  className, collisionPadding = 8, onKeyDown, ...props
}, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content ref={ref} collisionPadding={collisionPadding}
      className={cn(MENU_SURFACE_CLASS, className)} onKeyDown={(event) => { onKeyDown?.(event); stopEscape(event); }} {...props} />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = "ContextMenuContent";

type ItemExtras = { danger?: boolean };

const ContextMenuItem = React.forwardRef<React.ElementRef<typeof ContextMenuPrimitive.Item>, React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & ItemExtras>(({
  className, danger, ...props
}, ref) => <ContextMenuPrimitive.Item ref={ref} className={cn(MENU_ITEM_CLASS, danger && MENU_DANGER_ITEM_CLASS, className)} {...props} />);
ContextMenuItem.displayName = "ContextMenuItem";

const ContextMenuCheckboxItem = React.forwardRef<React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>, React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>>(({
  className, children, ...props
}, ref) => (
  <ContextMenuPrimitive.CheckboxItem ref={ref} className={cn(MENU_ITEM_CLASS, className)} {...props}>
    <span className={MENU_INDICATOR_SLOT_CLASS}><ContextMenuPrimitive.ItemIndicator><Check size={14} strokeWidth={2.4} aria-hidden="true" /></ContextMenuPrimitive.ItemIndicator></span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

const ContextMenuRadioItem = React.forwardRef<React.ElementRef<typeof ContextMenuPrimitive.RadioItem>, React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>>(({
  className, children, ...props
}, ref) => (
  <ContextMenuPrimitive.RadioItem ref={ref} className={cn(MENU_ITEM_CLASS, className)} {...props}>
    <span className={MENU_INDICATOR_SLOT_CLASS}><ContextMenuPrimitive.ItemIndicator><Circle size={7} className="fill-current" aria-hidden="true" /></ContextMenuPrimitive.ItemIndicator></span>
    {children}
  </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

const ContextMenuSubTrigger = React.forwardRef<React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>, React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger>>(({
  className, children, ...props
}, ref) => (
  <ContextMenuPrimitive.SubTrigger ref={ref} className={cn(MENU_ITEM_CLASS, "data-[state=open]:bg-hover-overlay", className)} {...props}>
    {children}
    <ChevronRight size={14} className="ml-auto text-text-muted" aria-hidden="true" />
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

const ContextMenuSubContent = React.forwardRef<React.ElementRef<typeof ContextMenuPrimitive.SubContent>, React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>>(({
  className, sideOffset = 4, collisionPadding = 8, onKeyDown, ...props
}, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.SubContent ref={ref} sideOffset={sideOffset} collisionPadding={collisionPadding}
      className={cn(MENU_SURFACE_CLASS, className)} onKeyDown={(event) => { onKeyDown?.(event); stopEscape(event); }} {...props} />
  </ContextMenuPrimitive.Portal>
));
ContextMenuSubContent.displayName = "ContextMenuSubContent";

const ContextMenuLabel = React.forwardRef<React.ElementRef<typeof ContextMenuPrimitive.Label>, React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Label ref={ref} className={cn(MENU_LABEL_CLASS, className)} {...props} />
));
ContextMenuLabel.displayName = "ContextMenuLabel";

const ContextMenuSeparator = React.forwardRef<React.ElementRef<typeof ContextMenuPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator ref={ref} className={cn(MENU_SEPARATOR_CLASS, className)} {...props} />
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

function ContextMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(MENU_SHORTCUT_CLASS, className)} {...props} />;
}

export {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioGroup, ContextMenuRadioItem,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuSeparator, ContextMenuLabel, ContextMenuShortcut,
};
