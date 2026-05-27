import { useState } from "react";
import { KairosRightPanelView } from "./right-panel/KairosRightPanelView";

type RightPanelTab = "readme" | "diff" | "kairos";

const RIGHT_PANEL_TABS: Array<{ id: RightPanelTab; label: string }> = [
  { id: "readme", label: "README.md" },
  { id: "diff", label: "Session diff" },
  { id: "kairos", label: "Kairos" },
];

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<RightPanelTab>("readme");

  return (
    <aside className="right-panel">
      <div className="right-tabs" role="tablist" aria-label="右侧面板">
        {RIGHT_PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
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
      <div className="right-panel-body">
        <h2>Session diff</h2>
        <p>Session-level diff review will show changed files, hunks, and review notes.</p>
      </div>
    );
  }

  return (
    <div className="right-panel-body">
      <h2>Markdown preview</h2>
      <p>Right panel preview will render Markdown, HTML, images, and session-level diffs.</p>
    </div>
  );
}
