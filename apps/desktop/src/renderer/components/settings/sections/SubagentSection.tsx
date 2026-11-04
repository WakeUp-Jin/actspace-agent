import type { SettingsSectionId } from "../SettingsNav";
import { SettingGroup, SettingLinkRow } from "../SettingsPrimitives";

/** 子智能体默认模型在「模型 › 用途 › 子智能体」设置，这里只留入口。 */
export function SubagentSection({ onNavigate }: { onNavigate?: (section: SettingsSectionId) => void }) {
  return (
    <SettingGroup
      title="子智能体"
      headingLevel={3}
      description="通用子智能体可改文件、跑命令，不弹审批。"
    >
      <SettingLinkRow
        title="子智能体默认模型"
        ariaLabel="前往模型设置子智能体默认模型"
        disabled={!onNavigate}
        onClick={() => onNavigate?.("model")}
      />
    </SettingGroup>
  );
}
