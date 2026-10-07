import { useEffect, useState } from "react";
import { SettingGroup, SettingLinkRow, SettingEditor, SettingsInput, useSettingsSaveNotice, useSingleEditor } from "../SettingsPrimitives";
import { type SectionProps, SETTINGS_TEXTAREA_CLASS } from "./shared";

export function GeneralSection({ settingsV4, onUpdateNamespace }: SectionProps) {
  const notifySaved = useSettingsSaveNotice();
  const editor = useSingleEditor<"displayName" | "responseStyle">();
  const saved = settingsV4?.settings.general.personalization;
  const [displayName, setDisplayName] = useState("");
  const [responseStyle, setResponseStyle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const v4Ready = Boolean(settingsV4);

  useEffect(() => {
    if (!saved || editor.openId) return;
    setDisplayName(saved.displayName);
    setResponseStyle(saved.responseStyle);
  }, [saved, editor.openId]);

  const cancelEditing = () => {
    setDisplayName(saved?.displayName ?? "");
    setResponseStyle(saved?.responseStyle ?? "");
    setSaveError(null);
    editor.close();
  };

  const toggleEditor = (field: "displayName" | "responseStyle") => {
    if (editor.isOpen(field)) {
      cancelEditing();
      return;
    }
    setDisplayName(saved?.displayName ?? "");
    setResponseStyle(saved?.responseStyle ?? "");
    setSaveError(null);
    editor.open(field);
  };

  const savePersonalization = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onUpdateNamespace({
        namespace: "general",
        patch: { personalization: { displayName: displayName.trim(), responseStyle: responseStyle.trim() } },
      });
      editor.close();
      notifySaved();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "个人偏好保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingGroup
      title="个人偏好"
      headingLevel={3}
      description="影响 Agent 对你的称呼与表达方式，不覆盖系统规则。"
    >
      <SettingLinkRow
        title="显示名称"
        value={saved?.displayName || "未设置"}
        ariaLabel="编辑显示名称"
        expanded={editor.isOpen("displayName")}
        controlsId="personalization-display-name"
        disabled={!v4Ready}
        onClick={() => toggleEditor("displayName")}
      />
      {editor.isOpen("displayName") ? (
        <SettingEditor
          id="personalization-display-name"
          hint="最多 60 个字符"
          error={saveError}
          saving={saving}
          saveAriaLabel="保存显示名称"
          onCancel={cancelEditing}
          onSave={() => void savePersonalization()}
        >
          <SettingsInput
            aria-label="显示名称"
            width="full"
            autoFocus
            value={displayName}
            maxLength={60}
            placeholder="例如：Jin"
            onChange={(event) => setDisplayName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void savePersonalization();
            }}
          />
        </SettingEditor>
      ) : null}
      <SettingLinkRow
        title="回复风格"
        value={saved?.responseStyle || "未设置"}
        ariaLabel="编辑回复风格"
        expanded={editor.isOpen("responseStyle")}
        controlsId="personalization-response-style"
        disabled={!v4Ready}
        onClick={() => toggleEditor("responseStyle")}
      />
      {editor.isOpen("responseStyle") ? (
        <SettingEditor
          id="personalization-response-style"
          hint="一句话描述偏好的语气、详略或格式 · 最多 500 字"
          error={saveError}
          saving={saving}
          saveAriaLabel="保存回复风格"
          onCancel={cancelEditing}
          onSave={() => void savePersonalization()}
        >
          <textarea
            aria-label="回复风格偏好"
            autoFocus
            value={responseStyle}
            maxLength={500}
            onChange={(event) => setResponseStyle(event.target.value)}
            placeholder="例如：简洁、直接，优先给结论"
            className={SETTINGS_TEXTAREA_CLASS}
          />
        </SettingEditor>
      ) : null}
    </SettingGroup>
  );
}
