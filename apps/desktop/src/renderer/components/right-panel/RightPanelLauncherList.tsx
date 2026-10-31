import { useId, type ReactNode } from "react";

/**
 * 右侧面板启动页：没有打开任何 Tab 时显示的对象列表。
 *
 * 白底列表，每行「图标 + 名字 + 一句说明」，和右栏其他列表同一套行样式，
 * 切换 Tab 时不再整块换底色。普通会话和 Space 共用（多智能体协作设计 D29）。
 * 按钮的可读名称只是名字（`aria-label`），说明文字挂在 `aria-describedby` 上。
 */

export type RightPanelLauncherItem = {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  onClick?: () => void;
  onPointerEnter?: () => void;
  onFocus?: () => void;
  disabled?: boolean;
};

const LAUNCHER_CLASS = "flex min-h-0 flex-1 flex-col gap-px overflow-auto bg-surface p-2.5";
const LAUNCHER_CAPTION_CLASS = "m-0 mt-0.5 mb-1.5 px-2 text-act-xs leading-[1.6] text-text-faint";
const LAUNCHER_ITEM_CLASS =
  "group grid h-9 w-full min-w-0 grid-cols-[16px_auto_minmax(0,1fr)] items-center gap-2.5 rounded-act-sm border-0 bg-transparent px-2.5 text-left text-act-sm font-medium text-text-main transition-colors duration-(--motion-fast) hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-45 disabled:hover:bg-transparent [cursor:pointer] disabled:[cursor:not-allowed]";
const LAUNCHER_ICON_CLASS =
  "flex text-text-faint transition-colors duration-(--motion-fast) group-hover:text-text-muted group-focus-visible:text-text-main";
const LAUNCHER_DESCRIPTION_CLASS =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-act-xs font-normal text-text-faint";

export type RightPanelLauncherGroup = {
  id: string;
  caption: string;
  items: readonly RightPanelLauncherItem[];
};

export function RightPanelLauncherList({
  label,
  caption,
  items,
  groups = [],
}: {
  /** 导航区域的可读名称。 */
  label: string;
  caption?: ReactNode;
  items: readonly RightPanelLauncherItem[];
  /** 列在对象之后的分组，例如「本会话的侧边对话 · 已收起」；空分组不显示。 */
  groups?: readonly RightPanelLauncherGroup[];
}) {
  return (
    <nav className={LAUNCHER_CLASS} aria-label={label}>
      {caption ? <p className={LAUNCHER_CAPTION_CLASS}>{caption}</p> : null}
      {items.map((item) => <LauncherItem key={item.id} item={item} />)}
      {groups.filter((group) => group.items.length > 0).map((group) => (
        <section key={group.id} className="mt-3 flex flex-col gap-px" aria-label={group.caption}>
          <p className={LAUNCHER_CAPTION_CLASS}>{group.caption}</p>
          {group.items.map((item) => <LauncherItem key={item.id} item={item} />)}
        </section>
      ))}
    </nav>
  );
}

// 保留原生 <button>：这是三列网格的列表行，ui/Button 固定 inline-flex 和按钮尺寸，套不上。
function LauncherItem({ item }: { item: RightPanelLauncherItem }) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      className={LAUNCHER_ITEM_CLASS}
      disabled={item.disabled}
      aria-label={item.label}
      aria-describedby={descriptionId}
      onClick={item.onClick}
      onPointerEnter={item.onPointerEnter}
      onFocus={item.onFocus}
    >
      <span className={LAUNCHER_ICON_CLASS} aria-hidden="true">
        {item.icon}
      </span>
      <span>{item.label}</span>
      <span id={descriptionId} className={LAUNCHER_DESCRIPTION_CLASS}>{item.description}</span>
    </button>
  );
}
