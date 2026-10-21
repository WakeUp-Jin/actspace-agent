import { Plus } from "lucide-react";
import { PROTOCOL_LABELS, findProviderTemplate, type ConnectionView } from "@actspace/shared";
import { Button } from "../../ui/Button";
import { ProviderLogo } from "../ProviderLogo";
import { SettingGroup, SettingLinkRow, SettingTag, StatusDot, type StatusTone } from "../SettingsPrimitives";
import { pendingCount } from "./model-view";
import { useModelsPage } from "./ModelsPage";

export function connectionStatus(connection: ConnectionView): { tone: StatusTone; label: string } {
  if (!connection.enabled) return { tone: "off", label: "已停用" };
  if (connection.lastConnection.status === "available") return { tone: "ok", label: "已连接" };
  if (connection.lastConnection.status === "unavailable") return { tone: "error", label: "连接失败" };
  return { tone: "neutral", label: "未测试" };
}

export function ConnectionLogo({ connection, size }: { connection: ConnectionView; size?: "sm" | "md" }) {
  return <ProviderLogo logoKey={findProviderTemplate(connection.templateId)?.logoKey ?? "generic"} size={size} />;
}

export function ConnectionListSection({ connections }: { connections: readonly ConnectionView[] }) {
  const { go } = useModelsPage();
  return (
    <SettingGroup
      title="模型连接"
      headingLevel={3}
      action={(
        <Button variant="primary" onClick={() => go({ name: "catalog" })}>
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          添加连接
        </Button>
      )}
    >
      {connections.length === 0 ? (
        <div className="px-4 py-4 text-act-sm text-text-muted">还没有连接。添加一个服务商，填入 API Key 就能用。</div>
      ) : connections.map((connection) => {
        const enabled = connection.models.filter((model) => model.enabled).length;
        const pending = pendingCount(connection);
        const status = connectionStatus(connection);
        return (
          <SettingLinkRow
            key={connection.connectionId}
            leading={<ConnectionLogo connection={connection} size="sm" />}
            title={<>{connection.label}{connection.relay ? <SettingTag>中转</SettingTag> : null}</>}
            description={PROTOCOL_LABELS[connection.protocol]}
            value={<span className="tabular-nums">{enabled} / {connection.models.length} 个模型</span>}
            trailing={(
              <>
                {pending > 0 ? <span className="whitespace-nowrap text-act-xs text-warning">{pending} 个待补充</span> : null}
                <StatusDot tone={status.tone}>{status.label}</StatusDot>
              </>
            )}
            onClick={() => go({ name: "detail", connectionId: connection.connectionId })}
          />
        );
      })}
    </SettingGroup>
  );
}
