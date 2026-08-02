import type { ComponentType } from "react";
import { Activity, Archive, ArrowLeft, Boxes, FolderSearch, Hourglass, Keyboard, Library, Plug, RefreshCw, Server, Settings, Sparkles, Sun, Wrench } from "lucide-react";

export type SettingsSectionId =
  | "general"
  | "shortcuts"
  | "providers"
  | "model"
  | "agent"
  | "kairos"
  | "tools"
  | "plugins"
  | "fileWatch"
  | "skills"
  | "appearance"
  | "archivedChats"
  | "analysis"
  | "update";

type IconComponent = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;

export const SETTINGS_SECTIONS: { id: SettingsSectionId; label: string; icon: IconComponent }[] = [
  { id: "general", label: "通用", icon: Settings },
  { id: "shortcuts", label: "快捷键", icon: Keyboard },
  { id: "providers", label: "服务商", icon: Server },
  { id: "model", label: "模型", icon: Boxes },
  { id: "agent", label: "智能体", icon: Sparkles },
  { id: "kairos", label: "Kairos", icon: Hourglass },
  { id: "tools", label: "工具", icon: Wrench },
  { id: "plugins", label: "插件", icon: Plug },
  { id: "fileWatch", label: "文件监听", icon: FolderSearch },
  { id: "skills", label: "Skills", icon: Library },
  { id: "appearance", label: "外观", icon: Sun },
  { id: "archivedChats", label: "归档会话", icon: Archive },
  { id: "analysis", label: "分析观测", icon: Activity },
  { id: "update", label: "更新", icon: RefreshCw },
];

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
      {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => {
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
      })}
    </nav>
  );
}
