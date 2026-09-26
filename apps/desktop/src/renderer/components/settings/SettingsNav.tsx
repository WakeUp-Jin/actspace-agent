import type { ComponentType } from "react";
import { Archive, ArrowLeft, BarChart3, Cpu, RefreshCw, Search, SlidersHorizontal, Sun, Users, Wrench } from "lucide-react";

export type SettingsSectionId =
  | "general"
  | "model"
  | "search"
  | "tools"
  | "subagents"
  | "appearance"
  | "archivedChats"
  | "usage"
  | "update";

type IconComponent = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;

export const SETTINGS_GROUPS: { label: string; sections: { id: SettingsSectionId; label: string; icon: IconComponent }[] }[] = [
  {
    label: "偏好",
    sections: [
      { id: "general", label: "通用", icon: SlidersHorizontal },
      { id: "appearance", label: "外观", icon: Sun },
    ],
  },
  {
    label: "能力",
    sections: [
      { id: "model", label: "模型", icon: Cpu },
      { id: "search", label: "搜索", icon: Search },
      { id: "tools", label: "工具", icon: Wrench },
      { id: "subagents", label: "子 Agent", icon: Users },
    ],
  },
  {
    label: "活动",
    sections: [
      { id: "usage", label: "使用统计", icon: BarChart3 },
      { id: "archivedChats", label: "归档会话", icon: Archive },
    ],
  },
  {
    label: "系统",
    sections: [{ id: "update", label: "更新", icon: RefreshCw }],
  },
];

export const SETTINGS_SECTIONS = SETTINGS_GROUPS.flatMap((group) => group.sections);

const NAV_GROUP_LABEL_CLASS = "px-2.5 pb-1 pt-3.5 text-act-xxs font-medium text-text-faint first:pt-1 max-[820px]:hidden";

const NAV_ITEM_CLASS =
  "flex h-[30px] shrink-0 items-center gap-2.5 rounded-act-sm px-2.5 text-left text-act-sm transition-colors duration-(--motion-fast) ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30";
const NAV_ITEM_ACTIVE_CLASS = "bg-selected font-medium text-text-main";
const NAV_ITEM_IDLE_CLASS = "text-text-muted hover:bg-hover-overlay hover:text-text-main";

function renderSectionButton(
  { id, label, icon: Icon }: { id: SettingsSectionId; label: string; icon: IconComponent },
  active: SettingsSectionId,
  onSelect: (id: SettingsSectionId) => void,
) {
  const isActive = id === active;
  return (
    <button
      key={id}
      type="button"
      onClick={() => onSelect(id)}
      aria-current={isActive ? "page" : undefined}
      className={`${NAV_ITEM_CLASS} ${isActive ? NAV_ITEM_ACTIVE_CLASS : NAV_ITEM_IDLE_CLASS}`}
    >
      <Icon size={15} strokeWidth={1.9} className={isActive ? "text-text-main" : "text-text-faint"} />
      <span>{label}</span>
    </button>
  );
}

export function SettingsNav({
  active,
  onSelect,
  onBack,
}: {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
  onBack: () => void;
}) {
  return (
    <nav
      className="flex h-full w-[216px] shrink-0 flex-col gap-px border-r border-line bg-sidebar px-2.5 pb-4 pt-[calc(var(--window-chrome-strip-height)+10px)] max-[820px]:h-auto max-[820px]:w-full max-[820px]:flex-row max-[820px]:gap-0.5 max-[820px]:overflow-x-auto max-[820px]:border-b max-[820px]:border-r-0 max-[820px]:px-2 max-[820px]:pb-2 max-[820px]:pt-[calc(var(--window-chrome-strip-height)+8px)]"
      aria-label="设置导航"
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="返回应用"
        className={`${NAV_ITEM_CLASS} ${NAV_ITEM_IDLE_CLASS} mb-1.5 h-7 gap-1.5 whitespace-nowrap max-[820px]:mb-0`}
      >
        <ArrowLeft size={14} strokeWidth={2} />
        <span>返回应用</span>
      </button>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label} className="contents">
          <div className={NAV_GROUP_LABEL_CLASS}>{group.label}</div>
          {group.sections.map((section) => renderSectionButton(section, active, onSelect))}
        </div>
      ))}
    </nav>
  );
}
