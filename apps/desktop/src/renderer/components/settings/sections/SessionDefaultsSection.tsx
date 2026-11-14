import { useState } from "react";
import type { PermissionMode } from "@actspace/shared/runtime-v2";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { FULL_ACCESS_CONFIRM, PERMISSION_MODES, permissionModeLabel } from "../../workbench/PermissionModeControl";
import { SettingGroup, SettingRow, SettingsSelect } from "../SettingsPrimitives";
import type { SectionProps } from "./shared";

const OPTIONS = PERMISSION_MODES.map((mode) => ({ value: mode, label: permissionModeLabel(mode) }));
const isPermissionMode = (value: string): value is PermissionMode =>
  (PERMISSION_MODES as readonly string[]).includes(value);

/** 新建会话写入的权限模式。只影响之后新建的会话；已有会话在输入框下方的状态行单独切换。 */
export function SessionDefaultsSection({ settingsV4, onUpdateNamespace }: SectionProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const current = settingsV4?.settings.general.defaultPermissionMode ?? "default";

  /** 成功返回 null，失败返回原因（确认框里显示）。 */
  const save = async (mode: PermissionMode): Promise<string | null> => {
    setSaving(true);
    setError(null);
    try {
      await onUpdateNamespace({ namespace: "general", patch: { defaultPermissionMode: mode } });
      return null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "无法保存默认权限";
      setError(message);
      return message;
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingGroup title="新会话" headingLevel={3}>
      <SettingRow
        title="默认权限"
        description="只影响之后新建的会话。已有会话在输入框下方单独切换。"
        control={
          <SettingsSelect
            value={current}
            options={OPTIONS}
            ariaLabel="新会话默认权限"
            disabled={!settingsV4 || saving}
            onChange={(value) => {
              if (!isPermissionMode(value) || value === current) return;
              if (value === "full-access") {
                setConfirmFull(true);
                return;
              }
              void save(value);
            }}
          />
        }
      />
      {error && !confirmFull ? (
        <p role="alert" className="text-act-xs text-on-danger">
          {error}
        </p>
      ) : null}
      {confirmFull ? (
        <ConfirmDialog
          title={FULL_ACCESS_CONFIRM.title}
          description={`${FULL_ACCESS_CONFIRM.description}之后新建的会话都会默认开启。`}
          confirmLabel="开启"
          pendingLabel="保存中…"
          onCancel={() => setConfirmFull(false)}
          onConfirm={async () => {
            const failure = await save("full-access");
            if (!failure) setConfirmFull(false);
            return failure;
          }}
        />
      ) : null}
    </SettingGroup>
  );
}
