import { useRef, useState } from "react";
import { DEFAULT_IMAGE_GENERATION_BASE_URL, DEFAULT_IMAGE_GENERATION_MODEL, DEFAULT_IMAGE_INSPECTION_MODEL_KEY, IMAGE_INSPECTION_MODEL_LIST, resolveImageInspectionModel, type AppSettings, type SecretProviderId, type SettingsUpdateInput } from "@actspace/shared";
import type { SettingsSectionId } from "../SettingsNav";
import { ImageGenerationSettingsDialog, formatImageGenerationEndpoint } from "../dialogs/ImageGenerationSettingsDialog";
import { SettingGroup, SettingLinkRow, InlineWarning, StatusDot, useSettingsSaveNotice, SettingRow, SettingsSelect } from "../SettingsPrimitives";
import type { SectionProps } from "./shared";

function ImageInspectionSettingsRows({
  settings,
  onUpdate,
  onNavigate,
}: Pick<SectionProps, "settings" | "onUpdate"> & { onNavigate?: (section: SettingsSectionId) => void }) {
  const notifySaved = useSettingsSaveNotice();
  const current = settings.imageInspection ?? { modelKey: DEFAULT_IMAGE_INSPECTION_MODEL_KEY };
  const selectedModel = resolveImageInspectionModel(current.modelKey);
  const provider = settings.providers[selectedModel.provider];
  const credentials = provider?.additionalCredentials ?? [];
  const selectedCredential = credentials.find((credential) => credential.id === current.credentialId);
  const credentialAvailable = current.credentialId
    ? selectedCredential?.hasApiKey === true
    : provider?.hasApiKey === true;
  const providerLabel = selectedModel.provider === "openrouter" ? "OpenRouter" : "Kimi";
  const modelOptions = IMAGE_INSPECTION_MODEL_LIST.map((model) => ({
    value: model.key,
    label: `${model.label} · ${model.provider === "openrouter" ? "OpenRouter" : "Kimi"}`,
  }));
  const credentialOptions = [
    { value: "", label: `默认 Key${provider?.hasApiKey ? "" : "（不可用）"}`, disabled: !provider?.hasApiKey },
    ...(current.credentialId && !selectedCredential ? [{ value: current.credentialId, label: "已删除的 Key（不可用）", disabled: true }] : []),
    ...credentials.map((credential) => ({
      value: credential.id,
      label: `${credential.label}${credential.hasApiKey ? "" : "（不可用）"}`,
      disabled: !credential.hasApiKey,
    })),
  ];

  return (
    <>
      <SettingRow
        title="图片分析模型"
        description={credentialAvailable
          ? `${selectedModel.apiModel} · 调用时会把本地图片发送给 ${providerLabel}。`
          : (
            <InlineWarning actionLabel={onNavigate ? "去连接" : undefined} onAction={onNavigate ? () => onNavigate("model") : undefined}>
              缺少 {providerLabel} Key，调用会失败。
            </InlineWarning>
          )}
        control={
          <SettingsSelect
            value={current.modelKey}
            options={modelOptions}
            ariaLabel="图片分析模型"
            onChange={(modelKey) => {
              const nextModel = resolveImageInspectionModel(modelKey);
              const nextProvider = settings.providers[nextModel.provider];
              const fallbackCredential = nextProvider?.hasApiKey
                ? undefined
                : nextProvider?.additionalCredentials?.find((credential) => credential.hasApiKey)?.id;
              onUpdate({ imageInspection: { modelKey: nextModel.key as typeof current.modelKey, credentialId: fallbackCredential } });
              notifySaved();
            }}
          />
        }
      />
      {credentials.length > 0 ? (
        <SettingRow
          indent
          title="调用 Key"
          description={`${providerLabel} 已保存的凭据；Key 本身不会进入界面设置。`}
          control={
            <SettingsSelect
              value={current.credentialId ?? ""}
              options={credentialOptions}
              ariaLabel="图片分析调用 Key"
              onChange={(credentialId) => {
                onUpdate({ imageInspection: { modelKey: current.modelKey, credentialId: credentialId || undefined } });
                notifySaved();
              }}
            />
          }
        />
      ) : null}
    </>
  );
}

export function MediaDefaultsSection({
  settings,
  onUpdate,
  onClear,
  onRefresh,
  onNavigate,
}: {
  settings: AppSettings;
  onUpdate: (input: SettingsUpdateInput) => void;
  onClear: (provider: SecretProviderId) => Promise<void>;
  onRefresh: () => Promise<void>;
  onNavigate?: (section: SettingsSectionId) => void;
}) {
  const current = settings.imageGeneration ?? {
    hasApiKey: false,
    baseUrl: DEFAULT_IMAGE_GENERATION_BASE_URL,
    model: DEFAULT_IMAGE_GENERATION_MODEL,
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const endpointLabel = formatImageGenerationEndpoint(current.baseUrl);

  return (
    <>
      <SettingGroup title="媒体" headingLevel={3} description="图片生成与图片分析默认使用的服务。">
        <SettingLinkRow
          title="图片生成"
          description={current.hasApiKey
            ? `${current.model} · ${endpointLabel}`
            : "配置 API Key 后，主 Agent 才能使用图片生成工具。"}
          trailing={<StatusDot tone={current.hasApiKey ? "ok" : "off"}>{current.hasApiKey ? "已配置" : "未配置"}</StatusDot>}
          ariaLabel={current.hasApiKey ? "编辑图片生成服务配置" : "配置图片生成服务"}
          onClick={() => {
            triggerRef.current = document.activeElement as HTMLElement | null;
            setDialogOpen(true);
          }}
        />
        <ImageInspectionSettingsRows settings={settings} onUpdate={onUpdate} onNavigate={onNavigate} />
      </SettingGroup>
      {dialogOpen ? (
        <ImageGenerationSettingsDialog
          current={current}
          returnFocus={triggerRef.current}
          onClose={() => setDialogOpen(false)}
          onClear={onClear}
          onRefresh={onRefresh}
        />
      ) : null}
    </>
  );
}
