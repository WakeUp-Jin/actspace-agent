import { Archive, ArrowUpDown, CalendarDays, Clock, EyeOff, Folder, List, MessagesSquare, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../ui/IconButton";
import {
  Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuShortcut, MenuTrigger,
} from "../ui/Menu";
import { isDefaultViewOptions, type SidebarArchivedFilter, type SidebarGroupBy, type SidebarSort, type SidebarViewOptions } from "./sidebar-view";

const VIEW_MENU_ICON_CLASS = "h-3.5 w-3.5 shrink-0 text-text-muted";
// 视图被改过时滑杆图标着强调色，右上角一个小圆点（Cursor 的 Customize Sidebar）。颜色写在图标上，不覆盖 IconButton 的配色。
const VIEW_ICON_TINT_CLASS = "text-accent";

type SidebarViewMenuProps = {
  options: SidebarViewOptions;
  onGroupBy: (groupBy: SidebarGroupBy) => void;
  onSort: (sort: SidebarSort) => void;
  onArchived: (filter: SidebarArchivedFilter) => void;
  onReset: () => void;
};

function Option({ value, icon, label, disabled, hint }: { value: string; icon: ReactNode; label: string; disabled?: boolean; hint?: string }) {
  // 选了以后菜单不关，方便连着改几项（DSH）。
  return (
    <MenuRadioItem value={value} disabled={disabled} onSelect={(event) => event.preventDefault()}>
      {icon}
      <span>{label}</span>
      {hint ? <MenuShortcut>{hint}</MenuShortcut> : null}
    </MenuRadioItem>
  );
}

/** 侧栏标题上的视图选项：分组方式、排序方式、归档筛选。 */
export function SidebarViewMenu({ options, onGroupBy, onSort, onArchived, onReset }: SidebarViewMenuProps) {
  const modified = !isDefaultViewOptions(options);
  const byTime = options.groupBy === "time";
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          className="sidebar-view-button relative"
          size="xs"
          label={modified ? "视图选项（已改动）" : "视图选项"}
          tooltip={modified ? "视图选项（已改动）" : "视图选项"}
        >
          <SlidersHorizontal size={13} strokeWidth={1.9} className={modified ? VIEW_ICON_TINT_CLASS : undefined} aria-hidden="true" />
          {modified ? <span aria-hidden="true" className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-accent" /> : null}
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" className="w-60" aria-label="视图选项">
        <MenuLabel>分组方式</MenuLabel>
        <MenuRadioGroup value={options.groupBy} onValueChange={(value) => onGroupBy(value as SidebarGroupBy)}>
          <Option value="workspace" icon={<Folder className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />} label="按工作区" />
          <Option value="flat" icon={<List className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />} label="单列表" />
          <Option value="time" icon={<CalendarDays className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />} label="按时间" />
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>排序方式</MenuLabel>
        <MenuRadioGroup value={byTime ? "updated" : options.sort} onValueChange={(value) => onSort(value as SidebarSort)}>
          <Option value="manual" icon={<ArrowUpDown className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />} label="手动排序" disabled={byTime} hint={byTime ? "按时间时不可用" : undefined} />
          <Option value="updated" icon={<Clock className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />} label="最近更新" />
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>筛选会话</MenuLabel>
        <MenuRadioGroup value={options.archived} onValueChange={(value) => onArchived(value as SidebarArchivedFilter)}>
          <Option value="hide" icon={<EyeOff className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />} label="隐藏已归档" />
          <Option value="all" icon={<MessagesSquare className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />} label="全部对话（显示已归档）" />
          <Option value="only" icon={<Archive className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />} label="仅显示已归档" />
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem disabled={!modified} onSelect={(event) => { event.preventDefault(); onReset(); }}>
          <RotateCcw className={VIEW_MENU_ICON_CLASS} aria-hidden="true" />
          恢复默认
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
