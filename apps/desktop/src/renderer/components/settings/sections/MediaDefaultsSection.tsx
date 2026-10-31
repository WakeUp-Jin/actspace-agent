import { useRef, useState } from "react";
import { DEFAULT_IMAGE_GENERATION_BASE_URL, DEFAULT_IMAGE_GENERATION_MODEL, type AppSettings, type SecretProviderId } from "@actspace/shared";
import type { SettingsSectionId } from "../SettingsNav";
import { ImageGenerationSettingsDialog, formatImageGenerationEndpoint } from "../dialogs/ImageGenerationSettingsDialog";
import { SettingGroup, SettingLinkRow, StatusDot } from "../SettingsPrimitives";

export function MediaDefaultsSection({
  settings,
  onClear,
  onRefresh,
  onNavigate,
}: {
  settings: AppSettings;
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
      <SettingGroup title="媒体" headingLevel={3} description="图片生成与图片分析使用的服务。">
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
        <SettingLinkRow
          title="看图模型"
          description="图片分析用的模型，在「模型 › 用途 › 看图」中设置；未设置时用会话默认模型。"
          ariaLabel="前往模型设置看图模型"
          disabled={!onNavigate}
          onClick={() => onNavigate?.("model")}
        />
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
