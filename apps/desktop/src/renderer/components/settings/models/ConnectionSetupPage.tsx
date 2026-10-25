import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { PROTOCOL_LABELS, findProviderTemplate, isRelayTemplate, type ModelApi } from "@actspace/shared";
import { modelConnectionsApi } from "../../../api/model-connections";
import { Button, cx } from "../../ui/Button";
import { ProviderLogo } from "../ProviderLogo";
import { PageHeader, SegmentedControl, SettingGroup, SettingsInput } from "../SettingsPrimitives";
import { FieldRow } from "./model-fields";
import { useModelsPage, type ConnectionDraft } from "./ModelsPage";

const PROTOCOLS = (Object.keys(PROTOCOL_LABELS) as ModelApi[]).map((value) => ({ value, label: PROTOCOL_LABELS[value] }));

/**
 * 添加连接第二步：官方服务只填 Key；中转还要选协议、填地址。地址和代理收在「高级设置」里。
 * 点「连接」先请求一次 /models；连上就以空模型列表建好连接，带着这次的结果进详情页，直接弹出选择窗口。
 */
export function ConnectionSetupPage({ draft }: { draft: ConnectionDraft }) {
  const { controller, go, setDraft } = useModelsPage();
  const template = findProviderTemplate(draft.templateId)!;
  const relay = isRelayTemplate(template);
  const [advanced, setAdvanced] = useState(Boolean(draft.proxyUrl));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<ConnectionDraft>) => setDraft({ ...draft, ...patch });

  const connect = async () => {
    if (!draft.apiKey.trim()) return setError("请输入 API Key。");
    if (relay && !draft.baseUrl.trim()) return setError("请填写服务地址。");
    setBusy(true);
    setError(null);
    const fields = {
      templateId: draft.templateId,
      apiKey: draft.apiKey,
      ...(relay ? { protocol: draft.protocol } : {}),
      baseUrl: draft.baseUrl,
      proxy: draft.proxyUrl.trim() ? { enabled: true, url: draft.proxyUrl.trim() } : { enabled: false, url: null },
    };
    try {
      const probe = await modelConnectionsApi.probe({ kind: "draft", draft: fields });
      if (!probe.ok) {
        setError(probe.message || "连接失败。");
        return;
      }
      const result = await controller.run(
        () => modelConnectionsApi.create({ ...fields, ...(probe.resolvedAuth ? { resolvedAuth: probe.resolvedAuth } : {}), models: [] }),
        "连接已保存",
      );
      if ("error" in result) {
        setError(result.error.message);
        return;
      }
      if (!result.connectionId) return;
      setDraft(null);
      go({ name: "detail", connectionId: result.connectionId, probe });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "连接失败。");
    } finally {
      setBusy(false);
    }
  };

  const address = (
    <FieldRow label="服务地址">
      <SettingsInput width="full" mono value={draft.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} placeholder={relay ? "https://your-relay.com" : template.defaultBaseUrl} aria-label="服务地址" />
    </FieldRow>
  );
  return (
    <>
      <PageHeader
        title={relay ? "自定义中转" : template.label}
        description={relay ? "填协议、地址和 Key，连上后选要用的模型。" : "填入 API Key，连上后选要用的模型。"}
        leading={<ProviderLogo logoKey={template.logoKey} />}
        onBack={() => go({ name: "catalog" })}
        backLabel="添加连接"
      />
      <SettingGroup>
        {relay ? (
          <>
            <FieldRow label="协议">
              <SegmentedControl ariaLabel="协议" value={draft.protocol} options={PROTOCOLS} onChange={(protocol) => update({ protocol })} />
              <span className="whitespace-nowrap text-act-xs text-text-faint">按中转站文档选</span>
            </FieldRow>
            {address}
          </>
        ) : null}
        <FieldRow label="API Key">
          <SettingsInput width="full" mono type="password" autoComplete="off" value={draft.apiKey} onChange={(event) => update({ apiKey: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void connect(); }} placeholder="粘贴 Key" aria-label="API Key" />
          <span className="whitespace-nowrap text-act-xs text-text-faint">只保存在本机</span>
        </FieldRow>
        {advanced ? (
          <>
            {relay ? null : address}
            <FieldRow label="代理">
              <SettingsInput width="full" mono value={draft.proxyUrl} onChange={(event) => update({ proxyUrl: event.target.value })} placeholder="http://127.0.0.1:7890" aria-label="代理" />
              <span className="whitespace-nowrap text-act-xs text-text-faint">留空走系统代理</span>
            </FieldRow>
          </>
        ) : null}
        <div className="flex items-center gap-2.5 px-4 py-3 max-[600px]:flex-wrap">
          <Button variant="ghost" size="xs" className="-ml-2" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
            <ChevronRight size={13} aria-hidden="true" className={cx("transition-transform", advanced && "rotate-90")} />
            高级设置
          </Button>
          <span role={error ? "alert" : undefined} className={cx("min-w-0 flex-1 text-right text-act-xs max-[600px]:text-left", error ? "text-on-danger" : "text-text-faint")}>
            {error ?? "会请求一次 /models，看看这个 Key 能用哪些模型。"}
          </span>
          <Button variant="primary" busy={busy} disabled={busy} onClick={() => void connect()}>{busy ? "正在连接" : "连接"}</Button>
        </div>
      </SettingGroup>
    </>
  );
}
