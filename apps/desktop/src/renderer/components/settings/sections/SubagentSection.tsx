import type { SettingsSectionId } from "../SettingsNav";
import { SettingGroup, SettingLinkRow } from "../SettingsPrimitives";

/** 子智能体的两个预设和并发上限只读展示；默认模型在「模型 › 用途 › 子智能体」设置，这里只留入口。 */
export function SubagentSection({ onNavigate }: { onNavigate?: (section: SettingsSectionId) => void }) {
  return (
    <SettingGroup
      title="子智能体"
      headingLevel={3}
      description="主智能体可以把任务委派给子智能体，有两个预设：通用，和主智能体一样的工具，能改文件、跑命令，不弹审批；探索，只读，读取、搜索、列目录，不写文件，不执行命令。每个会话最多同时运行 10 个子智能体。"
    >
      <SettingLinkRow
        title="子智能体默认模型"
        description="在「模型 › 用途 › 子智能体」中设置；默认跟随主智能体。"
        ariaLabel="前往模型设置子智能体默认模型"
        disabled={!onNavigate}
        onClick={() => onNavigate?.("model")}
      />
    </SettingGroup>
  );
}
