import { useEffect, useState } from "react";
import type { ModelKey, UsableModelView } from "@actspace/shared";
import { SettingGroup, useSettingsSaveNotice } from "../SettingsPrimitives";
import { ModelPurposeSelect } from "../ModelPurposeSelect";
import { modelsApi } from "../../../api/models";
import type { SectionProps } from "./shared";

export function SubagentSection({
  settings,
  onRefresh,
}: Pick<SectionProps, "settings" | "onRefresh">) {
  const notifySaved = useSettingsSaveNotice();
  const [exploreModel, setExploreModel] = useState<ModelKey | null>(settings.taskModels?.exploreModel ?? null);
  const [models, setModels] = useState<UsableModelView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setExploreModel(settings.taskModels?.exploreModel ?? null); }, [settings.taskModels?.exploreModel]);
  useEffect(() => {
    let cancelled = false;
    void modelsApi.listUsable({ purpose: "explore" })
      .then((result) => { if (!cancelled) setModels(result.models); })
      .catch(() => { if (!cancelled) setError("可用模型读取失败。"); });
    return () => { cancelled = true; };
  }, []);

  const update = async (value: ModelKey | null) => {
    setError(null);
    try {
      const result = await modelsApi.updateTaskModels({ exploreModel: value });
      setExploreModel(result.taskModels.exploreModel);
      notifySaved();
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Explore 模型保存失败。");
    }
  };

  return (
    <SettingGroup title="Explore" headingLevel={3} description="只读代码探索：读取、搜索、列目录；不写文件，不执行命令。">
      <ModelPurposeSelect
        label="Explore 模型"
        description={error ? undefined : "未单独设置时跟随默认会话模型。"}
        emptyLabel="跟随会话模型"
        value={exploreModel}
        models={models}
        onChange={(value) => void update(value)}
      />
      {error ? <div role="alert" className="px-4 py-2.5 text-act-xs text-on-danger">{error}</div> : null}
    </SettingGroup>
  );
}
