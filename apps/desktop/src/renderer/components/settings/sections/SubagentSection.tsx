import type { SettingsSectionId } from "../SettingsNav";
import { SettingGroup, SettingLinkRow } from "../SettingsPrimitives";

/** Explore 用哪个模型在「模型 › 用途 › 子 Agent 探索」设置，这里只留入口。 */
export function SubagentSection({ onNavigate }: { onNavigate?: (section: SettingsSectionId) => void }) {
  return (
    <SettingGroup title="Explore" headingLevel={3} description="只读代码探索：读取、搜索、列目录；不写文件，不执行命令。">
      <SettingLinkRow
        title="Explore 模型"
        description="在「模型 › 用途 › 子 Agent 探索」中设置；未设置时跟随会话默认。"
        ariaLabel="前往模型设置 Explore 模型"
        disabled={!onNavigate}
        onClick={() => onNavigate?.("model")}
      />
    </SettingGroup>
  );
}
