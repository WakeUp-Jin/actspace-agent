import { useState } from "react";
import { KairosRightPanelView } from "./right-panel/KairosRightPanelView";

type RightPanelTab = "readme" | "diff" | "kairos";

const RIGHT_PANEL_TABS: Array<{ id: RightPanelTab; label: string }> = [
  { id: "readme", label: "README.md" },
  { id: "diff", label: "Session diff" },
  { id: "kairos", label: "Kairos" },
];

const RIGHT_PANEL_CLASS =
  "flex min-w-0 flex-col overflow-hidden border-l border-line bg-surface";
const RIGHT_TABS_CLASS =
  "relative z-[61] flex min-h-[var(--window-chrome-strip-height)] items-center gap-1 overflow-x-auto border-b border-line py-0 pl-2.5 pr-[calc(var(--window-chrome-control-size)+24px)] [pointer-events:none]";
const RIGHT_TAB_BUTTON_CLASS =
  "rounded-act-md border-0 px-2.5 py-2 font-[inherit] [cursor:pointer] [pointer-events:auto] [-webkit-app-region:no-drag]";
const RIGHT_TAB_INACTIVE_CLASS = "bg-transparent text-text-muted";
const RIGHT_TAB_ACTIVE_CLASS = "bg-brand-soft text-brand";
const RIGHT_PANEL_BODY_CLASS = "min-h-0 flex-1 overflow-auto p-[18px] leading-[1.6] text-text-main";
const RIGHT_PANEL_HEADING_CLASS = "m-0 mb-2 text-[15px] font-semibold";
const RIGHT_PANEL_TEXT_CLASS = "m-0 text-[13px] text-text-muted";

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<RightPanelTab>("readme");

  return (
    <aside className={RIGHT_PANEL_CLASS}>
      <div className={RIGHT_TABS_CLASS} role="tablist" aria-label="右侧面板">
        {RIGHT_PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${RIGHT_TAB_BUTTON_CLASS} ${
              activeTab === tab.id ? RIGHT_TAB_ACTIVE_CLASS : RIGHT_TAB_INACTIVE_CLASS
            }`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "kairos" ? <KairosRightPanelView /> : <RightPanelMockBody activeTab={activeTab} />}
    </aside>
  );
}

function RightPanelMockBody({ activeTab }: { activeTab: Exclude<RightPanelTab, "kairos"> }) {
  if (activeTab === "diff") {
    return (
      <div className={RIGHT_PANEL_BODY_CLASS}>
        <h2 className={RIGHT_PANEL_HEADING_CLASS}>Session diff</h2>
        <p className={RIGHT_PANEL_TEXT_CLASS}>
          Session-level diff review will show changed files, hunks, and review notes.
        </p>
      </div>
    );
  }

  return (
    <div className={RIGHT_PANEL_BODY_CLASS}>
      <h2 className={RIGHT_PANEL_HEADING_CLASS}>Markdown preview</h2>
      <p className={RIGHT_PANEL_TEXT_CLASS}>
        Right panel preview will render Markdown, HTML, images, and session-level diffs.
      </p>
    </div>
  );
}
