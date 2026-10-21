import type { ModelConnectionsView, PurposeBinding, PurposeId } from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { SettingGroup, SettingRow } from "../SettingsPrimitives";
import { PURPOSES } from "./model-view";
import { PurposePicker } from "./PurposePicker";
import { useModelsPage } from "./ModelsPage";

/** 用途表：每类任务用哪个模型、默认思考档位。 */
export function PurposesSection({ view }: { view: ModelConnectionsView }) {
  const { controller, go } = useModelsPage();
  const update = (purpose: PurposeId, binding: PurposeBinding) =>
    void controller.run(() => modelConnectionsApi.updatePurposes({ [purpose]: binding }));
  const goToModel = (key: string) => {
    const connection = view.connections.find((item) => item.models.some((model) => model.key === key));
    if (connection) go({ name: "detail", connectionId: connection.connectionId, expand: key });
  };
  return (
    <SettingGroup title="用途" description="每类任务用哪个模型，以及默认的思考档位。" headingLevel={3}>
      {PURPOSES.map((purpose) => (
        <SettingRow
          key={purpose.id}
          tight
          title={purpose.label}
          description={purpose.description}
          control={(
            <PurposePicker
              purpose={purpose}
              connections={view.connections}
              binding={view.purposes[purpose.id]}
              onChange={(binding) => update(purpose.id, binding)}
              onGoToModel={goToModel}
            />
          )}
        />
      ))}
    </SettingGroup>
  );
}
