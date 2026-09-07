import type { ComponentType } from "react";
import { Archive, ArrowLeft, BarChart3, Boxes, RefreshCw, Settings, Sun, Users, Wrench } from "lucide-react";

export type SettingsSectionId =
  | "general"
  | "model"
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
      { id: "general", label: "通用", icon: Settings },
      { id: "appearance", label: "外观", icon: Sun },
    ],
  },
  {
    label: "能力",
    sections: [
      { id: "model", label: "模型", icon: Boxes },
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

const NAV_GROUP_LABEL_CLASS = "px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint first:pt-1";

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
      <Icon size={16} strokeWidth={1.9} />
      <span>{label}</span>
    </button>
  );
}

const NAV_ITEM_CLASS =
  "flex h-9 shrink-0 items-center gap-2.5 rounded-act-md px-2.5 text-left text-[13px] font-medium transition-colors duration-[130ms] ease-in-out";
const NAV_ITEM_ACTIVE_CLASS = "bg-selected font-semibold text-text-main";
const NAV_ITEM_IDLE_CLASS = "text-text-muted hover:bg-[var(--act-color-hover-overlay)] hover:text-text-main";

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
      className="flex h-full w-[232px] shrink-0 flex-col gap-0.5 border-r border-line bg-surface-subtle px-3 pb-3 pt-2 max-[820px]:h-auto max-[820px]:w-full max-[820px]:flex-row max-[820px]:overflow-x-auto max-[820px]:border-b max-[820px]:border-r-0 max-[820px]:px-2 max-[820px]:py-2"
      aria-label="设置导航"
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="返回应用"
        className={`${NAV_ITEM_CLASS} ${NAV_ITEM_IDLE_CLASS} mb-1.5 max-[820px]:mb-0`}
      >
        <ArrowLeft size={16} strokeWidth={2} />
        <span>返回</span>
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
