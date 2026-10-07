// Sidebar 和各子组件共用的样式。只在一个文件里用到的样式留在那个文件。

export const SIDEBAR_BUTTON_RESET_CLASS = "appearance-none border-0 bg-transparent font-[inherit]";
export const NAV_SECTION_CLASS = "flex min-w-0 flex-col gap-0.5 pb-0";
export const NAV_SECTION_TITLE_CLASS = "group/nav-title flex min-h-6 items-center justify-between gap-2 px-2";
export const NAV_SECTION_LABEL_BASE_CLASS =
  `${SIDEBAR_BUTTON_RESET_CLASS} inline-flex min-w-0 flex-1 items-center gap-1 p-0 text-left leading-4 font-medium tracking-[0] text-text-faint transition-colors duration-(--motion-fast) ease-in-out hover:text-text-main`;
export const NAV_SECTION_ACTIONS_CLASS = "inline-flex items-center gap-1 text-text-faint";
export const SESSION_CONTEXT_MENU_ICON_CLASS = "h-4 w-4 text-text-muted";
