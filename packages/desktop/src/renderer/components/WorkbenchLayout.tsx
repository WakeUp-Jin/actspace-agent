import type { ContextUsageSnapshot, MessageBlock, SessionListItem } from "@actspace/shared";
import { useCallback, useEffect, useState } from "react";
import { ConversationView } from "./ConversationView";
import { RightPanel } from "./RightPanel";
import { Sidebar } from "./Sidebar";
import { SplitView } from "./SplitView";

type SidebarMode = "expanded" | "rail";

type StoredWorkbenchLayout = {
  leftMode?: SidebarMode;
  leftWidth?: number;
  rightWidth?: number;
};

const WORKBENCH_LAYOUT_STORAGE_KEY = "actspace.workbench.layout.v1";
const LEFT_DEFAULT_WIDTH = 260;
const LEFT_MIN_WIDTH = 200;
const LEFT_MAX_WIDTH = 360;
const LEFT_RAIL_WIDTH = 60;
const LEFT_RAIL_SNAP_WIDTH = 148;
const MAIN_MIN_WIDTH = 560;
const RIGHT_DEFAULT_WIDTH = 390;
const RIGHT_MIN_WIDTH = 320;
const RIGHT_MAX_WIDTH = 640;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function loadStoredLayout(): Required<StoredWorkbenchLayout> {
  if (typeof window === "undefined") {
    return {
      leftMode: "expanded",
      leftWidth: LEFT_DEFAULT_WIDTH,
      rightWidth: RIGHT_DEFAULT_WIDTH
    };
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY) ?? "{}") as StoredWorkbenchLayout;
    return {
      leftMode: stored.leftMode === "rail" ? "rail" : "expanded",
      leftWidth: clamp(stored.leftWidth ?? LEFT_DEFAULT_WIDTH, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH),
      rightWidth: clamp(stored.rightWidth ?? RIGHT_DEFAULT_WIDTH, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH)
    };
  } catch {
    return {
      leftMode: "expanded",
      leftWidth: LEFT_DEFAULT_WIDTH,
      rightWidth: RIGHT_DEFAULT_WIDTH
    };
  }
}

export function WorkbenchLayout({
  sessions,
  activeSessionId,
  title,
  messages,
  contextSnapshot,
  rightPanelOpen = false
}: {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  title: string;
  messages: MessageBlock[];
  contextSnapshot: ContextUsageSnapshot | null;
  rightPanelOpen?: boolean;
}) {
  const [storedLayout] = useState(loadStoredLayout);
  const [containerWidth, setContainerWidth] = useState(0);
  const [leftMode, setLeftMode] = useState<SidebarMode>(storedLayout.leftMode);
  const [leftWidth, setLeftWidth] = useState(storedLayout.leftWidth);
  const [rightWidth, setRightWidth] = useState(storedLayout.rightWidth);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(rightPanelOpen);
  const displayedLeftWidth = leftMode === "rail" ? LEFT_RAIL_WIDTH : leftWidth;
  const rightMaxWidth = containerWidth > 0 ? Math.max(RIGHT_MIN_WIDTH, Math.min(RIGHT_MAX_WIDTH, containerWidth / 2)) : RIGHT_MAX_WIDTH;

  const handleContainerWidthChange = useCallback((width: number) => {
    setContainerWidth(width);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      WORKBENCH_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        leftMode,
        leftWidth,
        rightWidth
      })
    );
  }, [leftMode, leftWidth, rightWidth]);

  useEffect(() => {
    if (containerWidth === 0) {
      return;
    }

    if (leftMode === "expanded" && containerWidth - leftWidth < MAIN_MIN_WIDTH) {
      setLeftMode("rail");
      return;
    }

    if (!isRightPanelOpen) {
      return;
    }

    const currentLeftWidth = leftMode === "rail" ? LEFT_RAIL_WIDTH : leftWidth;
    if (containerWidth - currentLeftWidth - RIGHT_MIN_WIDTH < MAIN_MIN_WIDTH) {
      if (leftMode === "expanded") {
        setLeftMode("rail");
        return;
      }

      setIsRightPanelOpen(false);
      return;
    }

    const allowedRightWidth = Math.min(rightMaxWidth, containerWidth - currentLeftWidth - MAIN_MIN_WIDTH);
    if (rightWidth > allowedRightWidth) {
      setRightWidth(clamp(allowedRightWidth, RIGHT_MIN_WIDTH, rightMaxWidth));
    }
  }, [containerWidth, isRightPanelOpen, leftMode, leftWidth, rightMaxWidth, rightWidth]);

  function toggleSidebarMode() {
    if (leftMode === "expanded") {
      setLeftMode("rail");
      return;
    }

    setLeftMode("expanded");
    if (isRightPanelOpen && containerWidth - leftWidth - rightWidth < MAIN_MIN_WIDTH) {
      setIsRightPanelOpen(false);
    }
  }

  function resizeLeftPanel(width: number) {
    if (width <= LEFT_RAIL_SNAP_WIDTH) {
      setLeftMode("rail");
      return;
    }

    setLeftMode("expanded");
    setLeftWidth(clamp(width, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH));
  }

  function toggleRightPanel() {
    if (isRightPanelOpen) {
      setIsRightPanelOpen(false);
      return;
    }

    if (containerWidth > 0 && containerWidth - displayedLeftWidth - RIGHT_MIN_WIDTH < MAIN_MIN_WIDTH) {
      setLeftMode("rail");
    }

    setIsRightPanelOpen(true);
  }

  return (
    <SplitView
      left={<Sidebar sessions={sessions} activeSessionId={activeSessionId} mode={leftMode} onToggleMode={toggleSidebarMode} />}
      leftWidth={displayedLeftWidth}
      leftBounds={{ minWidth: LEFT_RAIL_WIDTH, maxWidth: LEFT_MAX_WIDTH }}
      leftSeparatorLabel="Resize session sidebar"
      main={
        <ConversationView
          title={title}
          messages={messages}
          contextSnapshot={contextSnapshot}
          rightPanelOpen={isRightPanelOpen}
          onToggleRightPanel={toggleRightPanel}
        />
      }
      minMainWidth={MAIN_MIN_WIDTH}
      onContainerWidthChange={handleContainerWidthChange}
      onLeftKeyResize={(width) => {
        if (leftMode === "rail" && width > LEFT_RAIL_WIDTH) {
          setLeftMode("expanded");
          setLeftWidth(LEFT_MIN_WIDTH);
          return;
        }

        resizeLeftPanel(width);
      }}
      onLeftResize={resizeLeftPanel}
      onLeftSeparatorDoubleClick={toggleSidebarMode}
      onRightResize={(width) => setRightWidth(clamp(width, RIGHT_MIN_WIDTH, rightMaxWidth))}
      onRightSeparatorDoubleClick={() => setRightWidth(RIGHT_DEFAULT_WIDTH)}
      right={isRightPanelOpen ? <RightPanel /> : undefined}
      rightBounds={{ minWidth: RIGHT_MIN_WIDTH, maxWidth: rightMaxWidth }}
      rightSeparatorLabel="Resize preview panel"
      rightWidth={rightWidth}
    />
  );
}
