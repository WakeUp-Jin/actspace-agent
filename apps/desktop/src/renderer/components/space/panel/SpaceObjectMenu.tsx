import { Plus } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../../ui/Menu";
import { menuKinds, PANEL_KIND_META, panelContextOf } from "../model/selectors";
import { useSpaceDemoActions, useSpaceDemoSelector } from "../model/use-space-demo";
import { PanelKindIcon } from "./panel-kind-icons";

/** Space 右栏 chrome 右侧的「+」：只列当前上下文能开的标签（协调 Agent 和 Actor 不同）。 */
export function SpaceObjectMenu() {
  const context = useSpaceDemoSelector(panelContextOf);
  const { openPanelTab } = useSpaceDemoActions();
  if (!context) return null;

  return (
    <div className="flex items-center [-webkit-app-region:no-drag]">
      <Menu>
        <MenuTrigger asChild>
          <button className="chrome-button" type="button" aria-label="新建右侧面板对象" title="新建对象">
            <Plus size={15} strokeWidth={1.8} />
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-[188px]">
          {menuKinds(context).map((kind) => (
            <MenuItem key={kind} onSelect={() => openPanelTab(kind)}>
              <PanelKindIcon kind={kind} />
              {PANEL_KIND_META[kind].menuLabel ?? PANEL_KIND_META[kind].label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );
}
