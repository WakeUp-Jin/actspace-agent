import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";
import { cn } from "./cn";
import {
  MENU_DANGER_ITEM_CLASS, MENU_INDICATOR_SLOT_CLASS, MENU_ITEM_CLASS, MENU_LABEL_CLASS, MENU_SEPARATOR_CLASS, MENU_SHORTCUT_CLASS, MENU_SURFACE_CLASS,
} from "./menu-styles";

// 按钮打开的动作菜单。键盘：↑↓ 移动、Home / End、Enter / 空格执行、→ 进子菜单、← 返回、字母跳到同首字母的项、Esc 只关当前一层。
// 关闭后焦点回到触发器。默认非模态：点菜单外面时菜单关闭，那一下点击照常落到下面的元素上，和迁移前一致。

const Menu = ({ modal = false, ...props }: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Root>) => <MenuPrimitive.Root modal={modal} {...props} />;
const MenuTrigger = MenuPrimitive.Trigger;
const MenuGroup = MenuPrimitive.Group;
const MenuSub = MenuPrimitive.Sub;
const MenuRadioGroup = MenuPrimitive.RadioGroup;

function stopEscape(event: React.KeyboardEvent) {
  // 与 DialogContent 相同：Esc 不再沿组件树冒泡到外层的 Esc 处理。
  if (event.key === "Escape") event.stopPropagation();
}

const MenuContent = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Content>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>>(({
  className, sideOffset = 4, collisionPadding = 8, align = "start", onKeyDown, ...props
}, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Content ref={ref} sideOffset={sideOffset} collisionPadding={collisionPadding} align={align}
      className={cn(MENU_SURFACE_CLASS, className)} onKeyDown={(event) => { onKeyDown?.(event); stopEscape(event); }} {...props} />
  </MenuPrimitive.Portal>
));
MenuContent.displayName = "MenuContent";

type ItemExtras = { danger?: boolean };

const MenuItem = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Item>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & ItemExtras>(({
  className, danger, ...props
}, ref) => <MenuPrimitive.Item ref={ref} className={cn(MENU_ITEM_CLASS, danger && MENU_DANGER_ITEM_CLASS, className)} {...props} />);
MenuItem.displayName = "MenuItem";

const MenuCheckboxItem = React.forwardRef<React.ElementRef<typeof MenuPrimitive.CheckboxItem>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.CheckboxItem>>(({
  className, children, ...props
}, ref) => (
  <MenuPrimitive.CheckboxItem ref={ref} className={cn(MENU_ITEM_CLASS, className)} {...props}>
    <span className={MENU_INDICATOR_SLOT_CLASS}><MenuPrimitive.ItemIndicator><Check size={14} strokeWidth={2.4} aria-hidden="true" /></MenuPrimitive.ItemIndicator></span>
    {children}
  </MenuPrimitive.CheckboxItem>
));
MenuCheckboxItem.displayName = "MenuCheckboxItem";

const MenuRadioItem = React.forwardRef<React.ElementRef<typeof MenuPrimitive.RadioItem>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.RadioItem>>(({
  className, children, ...props
}, ref) => (
  <MenuPrimitive.RadioItem ref={ref} className={cn(MENU_ITEM_CLASS, className)} {...props}>
    <span className={MENU_INDICATOR_SLOT_CLASS}><MenuPrimitive.ItemIndicator><Circle size={7} className="fill-current" aria-hidden="true" /></MenuPrimitive.ItemIndicator></span>
    {children}
  </MenuPrimitive.RadioItem>
));
MenuRadioItem.displayName = "MenuRadioItem";

const MenuSubTrigger = React.forwardRef<React.ElementRef<typeof MenuPrimitive.SubTrigger>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.SubTrigger>>(({
  className, children, ...props
}, ref) => (
  <MenuPrimitive.SubTrigger ref={ref} className={cn(MENU_ITEM_CLASS, "data-[state=open]:bg-hover-overlay", className)} {...props}>
    {children}
    <ChevronRight size={14} className="ml-auto text-text-muted" aria-hidden="true" />
  </MenuPrimitive.SubTrigger>
));
MenuSubTrigger.displayName = "MenuSubTrigger";

const MenuSubContent = React.forwardRef<React.ElementRef<typeof MenuPrimitive.SubContent>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.SubContent>>(({
  className, sideOffset = 4, collisionPadding = 8, onKeyDown, ...props
}, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.SubContent ref={ref} sideOffset={sideOffset} collisionPadding={collisionPadding}
      className={cn(MENU_SURFACE_CLASS, className)} onKeyDown={(event) => { onKeyDown?.(event); stopEscape(event); }} {...props} />
  </MenuPrimitive.Portal>
));
MenuSubContent.displayName = "MenuSubContent";

const MenuLabel = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Label>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>>(({ className, ...props }, ref) => (
  <MenuPrimitive.Label ref={ref} className={cn(MENU_LABEL_CLASS, className)} {...props} />
));
MenuLabel.displayName = "MenuLabel";

const MenuSeparator = React.forwardRef<React.ElementRef<typeof MenuPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>>(({ className, ...props }, ref) => (
  <MenuPrimitive.Separator ref={ref} className={cn(MENU_SEPARATOR_CLASS, className)} {...props} />
));
MenuSeparator.displayName = "MenuSeparator";

function MenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(MENU_SHORTCUT_CLASS, className)} {...props} />;
}

export {
  Menu, MenuTrigger, MenuContent, MenuGroup, MenuItem, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem,
  MenuSub, MenuSubTrigger, MenuSubContent, MenuSeparator, MenuLabel, MenuShortcut,
};
