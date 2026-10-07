// Menu、ContextMenu、Select 共用的外观。取自迁移前的菜单里最常见的写法（Sidebar 右键、排队消息、Settings 下拉）：
// 面板 rounded-act-md + p-1，菜单项 32px 高、px-2、rounded-act-sm。层级统一用 popover，
// 因为它们都 portal 到 body，可能出现在对话框（modal）之上。

export const MENU_SURFACE_CLASS =
  "z-(--act-z-popover) min-w-32 overflow-y-auto rounded-act-md border border-line bg-surface-raised p-1 text-act-sm text-text-main shadow-act-popover outline-none [-webkit-app-region:no-drag] max-h-(--radix-popper-available-height)";

export const MENU_ITEM_CLASS =
  "relative flex min-h-8 w-full cursor-default select-none items-center gap-2 rounded-act-sm px-2 text-left outline-none transition-[background,color] duration-(--motion-fast) data-[highlighted]:bg-hover-overlay data-[disabled]:cursor-not-allowed data-[disabled]:text-text-faint motion-reduce:transition-none";

export const MENU_DANGER_ITEM_CLASS = "text-danger";
export const MENU_LABEL_CLASS = "px-2 pb-1 pt-2 text-act-xxs font-medium text-text-faint";
export const MENU_SEPARATOR_CLASS = "my-1 h-px bg-line";
export const MENU_SHORTCUT_CLASS = "ml-auto pl-4 text-act-xs text-text-faint";
export const MENU_INDICATOR_SLOT_CLASS = "grid h-4 w-4 shrink-0 place-items-center";
