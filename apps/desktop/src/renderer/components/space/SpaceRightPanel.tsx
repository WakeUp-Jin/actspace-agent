import { RightPanelLauncherList, type RightPanelLauncherItem } from "../right-panel/RightPanelLauncherList";
import { RightPanelTabStrip } from "../right-panel/RightPanelTabStrip";
import {
  availablePanelKinds, contextUsageOf, PANEL_KIND_META, panelContextOf, panelFor, panelScope,
} from "./model/selectors";
import type { PanelContext, PanelTab } from "./model/types";
import { useSpaceDemoActions, useSpaceDemoState } from "./model/use-space-demo";
import { ActorGroups } from "./panel/ActorGroups";
import { LibraryList } from "./panel/LibraryList";
import { SpaceContextView } from "./panel/mock-views/SpaceContextView";
import { SpaceFilesView } from "./panel/mock-views/SpaceFilesView";
import { SpaceFileView } from "./panel/mock-views/SpaceFileView";
import { SpaceReplyView, SpaceReviewView, SpaceSubagentsView } from "./panel/mock-views/SpaceReviewView";
import { SpaceTerminalView } from "./panel/mock-views/SpaceTerminalView";
import { MemoryList } from "./panel/MemoryList";
import { PanelKindIcon } from "./panel/panel-kind-icons";

/**
 * Space 的右栏：外壳复用现有右栏的标签栏和启动页，内容按上下文给不同的标签（设计文档 §4.4）。
 * 协调 Agent：Actor / 库 / 记忆 + 文件 / 终端；Actor 和一对一对话：和普通会话一样。
 */

const RIGHT_PANEL_CLASS = "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-surface";
const SCROLL_CLASS = "min-h-0 flex-1 overflow-y-auto px-2.5 pb-[18px] pt-2.5";

const tabLabel = (t: PanelTab): string => t.label || PANEL_KIND_META[t.kind].label;

function Caption({ context }: { context: PanelContext }) {
  if (context !== "coord") return <>和打开一个普通会话时的右栏一样。</>;
  const b = (text: string) => <strong className="font-medium text-text-muted">{text}</strong>;
  return <>协调 Agent 的右栏：{b("Actor、库、记忆")}，再加只给你用的{b("文件")}和{b("终端")}。</>;
}

export function SpaceRightPanel() {
  const state = useSpaceDemoState();
  const { openPanelTab, selectPanelTab, closePanelTab } = useSpaceDemoActions();
  const panel = panelFor(state);
  const context = panelContextOf(state);
  const scope = panelScope(state);
  if (!panel || !context || !scope) return null;

  const active = panel.tabs.find((t) => t.id === panel.active);
  const items = panel.tabs.map((t) => ({ id: t.id, title: tabLabel(t), label: tabLabel(t) }));

  const launcher: RightPanelLauncherItem[] = availablePanelKinds(context).map((kind) => ({
    id: kind,
    label: PANEL_KIND_META[kind].label,
    description: PANEL_KIND_META[kind].desc,
    icon: <PanelKindIcon kind={kind} />,
    onClick: () => openPanelTab(kind),
  }));

  let body;
  switch (active?.kind) {
    case undefined: body = <RightPanelLauncherList label="右侧面板对象" caption={<Caption context={context} />} items={launcher} />; break;
    case "actors": body = <div className={SCROLL_CLASS}><ActorGroups /></div>; break;
    case "library": body = <div className={SCROLL_CLASS}><LibraryList /></div>; break;
    case "memory": body = <div className={SCROLL_CLASS}><MemoryList /></div>; break;
    case "files": body = <SpaceFilesView roots={scope.roots} />; break;
    case "file": body = <SpaceFileView path={active.path ?? ""} />; break;
    case "terminal": body = <SpaceTerminalView scope={scope} />; break;
    case "review": body = <div className={SCROLL_CLASS}><SpaceReviewView scope={scope} /></div>; break;
    case "context": {
      const usage = contextUsageOf(state);
      body = <div className={SCROLL_CLASS}>{usage ? <SpaceContextView usage={usage} /> : null}</div>;
      break;
    }
    case "subagents": body = <SpaceSubagentsView />; break;
    case "reply": body = <SpaceReplyView />; break;
  }

  return (
    <aside className={RIGHT_PANEL_CLASS} aria-label="Space 右栏">
      <RightPanelTabStrip
        label="右侧面板标签" emptyTitle="对象" items={items} activeId={panel.active}
        onSelect={selectPanelTab} onClose={closePanelTab}
      />
      {body}
    </aside>
  );
}
