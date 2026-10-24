import { useState } from "react";
import { Search } from "lucide-react";
import {
  PROVIDER_TEMPLATES,
  PROVIDER_TEMPLATE_GROUP_LABELS,
  isRelayTemplate,
  type ProviderTemplate,
  type ProviderTemplateGroup,
} from "@actspace/shared";
import { ProviderLogo } from "../ProviderLogo";
import { PageHeader, SettingGroup, SettingLinkRow, SettingTag } from "../SettingsPrimitives";
import { useModelsPage } from "./ModelsPage";

const GROUPS: readonly ProviderTemplateGroup[] = ["official", "aggregator", "custom"];

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** 添加连接第一步：选服务商。同一个服务商可以加多次（比如两把 Key），已添加的只做标记。 */
export function TemplateCatalogPage() {
  const { controller, go, setDraft } = useModelsPage();
  const [query, setQuery] = useState("");
  const connections = controller.view?.connections ?? [];
  const q = query.trim().toLowerCase();
  const pick = (template: ProviderTemplate) => {
    setDraft({
      templateId: template.id,
      apiKey: "",
      protocol: template.protocol ?? "openai-completions",
      baseUrl: isRelayTemplate(template) ? "" : template.defaultBaseUrl ?? "",
      proxyUrl: "",
    });
    go({ name: "setup" });
  };
  return (
    <>
      <PageHeader title="添加连接" description="选一个服务商。官方服务只要填 Key。" onBack={() => go({ name: "list" })} backLabel="模型" />
      <label className="flex h-9 items-center gap-2 rounded-act-group border border-line bg-surface px-3 text-text-subtle">
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索服务商"
          aria-label="搜索服务商"
          className="min-w-0 flex-1 bg-transparent text-act-sm text-text-main outline-none placeholder:text-text-subtle"
        />
      </label>
      {GROUPS.map((group) => {
        const templates = PROVIDER_TEMPLATES.filter((template) => template.group === group && !template.hidden && (!q || template.label.toLowerCase().includes(q)));
        if (templates.length === 0) return null;
        return (
          <SettingGroup key={group} title={PROVIDER_TEMPLATE_GROUP_LABELS[group]} headingLevel={3}>
            {templates.map((template) => {
              const added = !isRelayTemplate(template) && connections.some((connection) => connection.templateId === template.id);
              return (
                <SettingLinkRow
                  key={template.id}
                  leading={<ProviderLogo logoKey={template.logoKey} size="sm" />}
                  title={template.label}
                  description={template.description ?? hostOf(template.defaultBaseUrl)}
                  trailing={added ? <SettingTag tone="ok">已添加</SettingTag> : undefined}
                  onClick={() => pick(template)}
                />
              );
            })}
          </SettingGroup>
        );
      })}
    </>
  );
}
