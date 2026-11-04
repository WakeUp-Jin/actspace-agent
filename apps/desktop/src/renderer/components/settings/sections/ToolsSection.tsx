import { useState, type ReactNode } from "react";
import type { SettingsV4NamespacePatch } from "@actspace/shared";
import { BROWSER_TOOL_GROUP, BROWSER_TOOL_ITEMS, PRIMARY_TOOL_ITEMS } from "../tool-catalog";
import { useToolToggle } from "../useToolToggle";
import { SettingGroup, SettingLinkRow, SettingSubhead, InlineWarning, useSettingsSaveNotice, SettingRow, Toggle } from "../SettingsPrimitives";
import type { SectionProps } from "./shared";
import { usePluginLoaded } from "../../../hooks/usePluginLoaded";

export function ToolsSection({ settings, onUpdate, settingsV4, onUpdateNamespace }: SectionProps) {
  const notifySaved = useSettingsSaveNotice();
  const tools = useToolToggle({ settings, settingsV4, onUpdate, onUpdateNamespace });
  const bashAlwaysAsk = settingsV4?.settings.tools.bash.alwaysAsk ?? settings.agent.bashAlwaysAsk;
  const showFileChangeStats = settingsV4?.settings.tools.showFileChangeStats !== false;
  const [browserDetailsOpen, setBrowserDetailsOpen] = useState(false);
  // 操控浏览器插件本次启动没加载时，整个浏览器工具组都不显示。
  const browserPluginLoaded = usePluginLoaded("browser-tools") === true;
  const bashEnabled = tools.isEnabled("bash");
  const browserEnabled = tools.isEnabled(BROWSER_TOOL_GROUP) && tools.isEnabled("browser_help");
  const browserExecutionTools = BROWSER_TOOL_ITEMS.filter((tool) => tool.kind !== "capability");
  const browserCapabilities = BROWSER_TOOL_ITEMS.filter((tool) => tool.kind === "capability");
  const codeTools = PRIMARY_TOOL_ITEMS.filter((tool) => ["read_file", "grep", "glob", "list_directory", "edit_file_diff", "write_file"].includes(tool.name));
  const mediaTools = PRIMARY_TOOL_ITEMS.filter((tool) => ["generate_image", "inspect_image"].includes(tool.name));
  const enabledCodeTools = codeTools.filter((tool) => tools.isEnabled(tool.name)).length;
  const imageGenerationReady = settings.imageGeneration?.hasApiKey === true;

  const writeToolsPatch = (patch: Extract<SettingsV4NamespacePatch, { namespace: "tools" }>["patch"], legacy: () => void, label: string) => {
    if (tools.v4Writable) {
      void onUpdateNamespace({ namespace: "tools", patch }).then(() => notifySaved()).catch((error: unknown) => {
        console.error(`Failed to update ${label}`, error);
      });
    } else {
      legacy();
      notifySaved();
    }
  };

  const toggleBrowserGroup = (enabled: boolean) => {
    tools.setToolEnabled(enabled ? [BROWSER_TOOL_GROUP, "browser_help"] : [BROWSER_TOOL_GROUP], enabled);
  };

  const renderToolRow = (tool: (typeof PRIMARY_TOOL_ITEMS)[number], options: { disabled?: boolean; description?: ReactNode } = {}) => (
    <SettingRow
      key={tool.name}
      tight
      disabled={options.disabled}
      title={tool.label}
      description={options.description ?? tool.description}
      control={<Toggle checked={tools.isEnabled(tool.name)} disabled={options.disabled} onChange={(next) => tools.setToolEnabled(tool.name, next)} ariaLabel={tool.label} />}
    />
  );

  const renderBrowserItem = (tool: (typeof BROWSER_TOOL_ITEMS)[number]) => renderToolRow(tool, { disabled: !browserEnabled });

  const mediaDescription = (tool: (typeof PRIMARY_TOOL_ITEMS)[number]) =>
    tool.name === "generate_image" && !imageGenerationReady
      ? <InlineWarning>图片生成服务尚未配置，工具不会出现。</InlineWarning>
      : undefined;

  return (
    <>
      <SettingGroup title="代码库" headingLevel={3} meta={`${enabledCodeTools} / ${codeTools.length} 已启用`}>
        {codeTools.map((tool) => renderToolRow(tool))}
      </SettingGroup>

      <SettingGroup title="终端" headingLevel={3}>
        {PRIMARY_TOOL_ITEMS.filter((tool) => tool.name === "bash").map((tool) => (
          <SettingRow
            key={tool.name}
            title={tool.label}
            control={<Toggle checked={bashEnabled} onChange={(next) => tools.setToolEnabled(tool.name, next)} ariaLabel={tool.label} />}
          />
        ))}
        <SettingRow
          disabled={!bashEnabled}
          title="执行前确认"
          control={
            <Toggle
              checked={bashAlwaysAsk}
              disabled={!bashEnabled}
              onChange={(next) => writeToolsPatch({ bash: { alwaysAsk: next } }, () => onUpdate({ agent: { bashAlwaysAsk: next } }), "Bash review settings")}
              ariaLabel="执行前确认"
            />
          }
        />
      </SettingGroup>

      {browserPluginLoaded ? <SettingGroup title="浏览器" headingLevel={3}>
        <SettingRow
          title="浏览器工具"
          control={<Toggle checked={browserEnabled} onChange={toggleBrowserGroup} ariaLabel="浏览器" />}
        />
        <SettingLinkRow
          disabled={!browserEnabled}
          title="高级设置"
          ariaLabel="浏览器高级设置"
          expanded={browserDetailsOpen}
          controlsId="browser-tool-details"
          onClick={() => setBrowserDetailsOpen((open) => !open)}
        />
        {browserDetailsOpen ? (
          <div id="browser-tool-details" className="divide-y divide-line/60">
            <SettingSubhead>执行工具</SettingSubhead>
            {browserExecutionTools.map(renderBrowserItem)}
            <SettingSubhead>敏感能力</SettingSubhead>
            {browserCapabilities.map(renderBrowserItem)}
          </div>
        ) : null}
      </SettingGroup> : null}

      <SettingGroup title="多媒体" headingLevel={3}>
        {mediaTools.map((tool) => renderToolRow(tool, { description: mediaDescription(tool) }))}
      </SettingGroup>

      <SettingGroup title="显示" headingLevel={3}>
        <SettingRow
          title="显示写入变动"
          control={
            <Toggle
              checked={showFileChangeStats}
              disabled={!tools.v4Writable}
              onChange={(next) => writeToolsPatch({ showFileChangeStats: next }, () => undefined, "file change display settings")}
              ariaLabel="显示写入变动"
            />
          }
        />
      </SettingGroup>
    </>
  );
}
