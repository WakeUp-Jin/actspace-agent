import { useId, useRef, useState } from "react";
import { SettingGroup } from "./SettingsPrimitives";
import { Button } from "../ui/Button";
import { ProviderLogo } from "./ProviderLogo";
import { ConnectionModelPicker, type ListedModel, type ModelPickerValue } from "./ConnectionModelPicker";
import {
  FormField,
  OFFICIAL_ANTHROPIC_BASE_URL,
  ProbeResultNotice,
  SecretInput,
  SetupFooter,
  SetupHeader,
  initialModelSelection,
  invalidateProbe,
  modelDisplayLabel,
  modelDraftsForSave,
  newConnectionId,
  probeErrorResult,
  type ProbeState,
} from "./custom-connection-shared";

/** 官方 Anthropic：只填 Key，测试通过后在同一页选模型；地址、协议、认证方式和价格都是固定的。 */
export function AnthropicKeySetup({ onCancel, onSaved }: { onCancel: () => void; onSaved: (connectionId: string, autoTest: boolean) => void | Promise<void> }) {
  const keyId = useId();
  const [apiKey, setApiKey] = useState("");
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const [listed, setListed] = useState<readonly ListedModel[] | null>(null);
  const [picker, setPicker] = useState<ModelPickerValue>({ selected: [], defaultId: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const probeToken = useRef(0);
  const running = probe.status === "running";
  const tested = probe.status === "ok";

  const test = async () => {
    if (!apiKey.trim() || running || !window.actspace.probeCustomConnection) return;
    const token = ++probeToken.current;
    setProbe({ status: "running" });
    setError(null);
    try {
      const result = await window.actspace.probeCustomConnection({ kind: "draft", protocol: "anthropic-messages", baseUrl: OFFICIAL_ANTHROPIC_BASE_URL, apiKey: apiKey.trim(), authMode: "x-api-key" });
      if (token !== probeToken.current) return;
      setProbe({ status: result.ok ? "ok" : "fail", result });
      if (!result.ok) return;
      const models = result.models?.length ? result.models : null;
      setListed(models);
      if (models && !picker.selected.length) setPicker(initialModelSelection(models.map((model) => model.id)));
    } catch (nextError) {
      if (token === probeToken.current) setProbe({ status: "fail", result: probeErrorResult(nextError) });
    }
  };

  const save = async () => {
    if (!picker.selected.length || !picker.defaultId || !window.actspace.createCustomConnection) return;
    setSaving(true);
    setError(null);
    const connectionId = newConnectionId();
    const labels = new Map((listed ?? []).flatMap((model) => (model.label ? [[model.id, model.label] as const] : [])));
    try {
      await window.actspace.createCustomConnection({
        providerId: "openrouter",
        connectionId,
        protocol: "anthropic-messages",
        displayName: "Anthropic",
        apiKey: apiKey.trim(),
        baseUrl: OFFICIAL_ANTHROPIC_BASE_URL,
        catalogId: "anthropic",
        authMode: "x-api-key",
        billingMode: "reference",
        pricingMultiplier: 1,
        initialModels: modelDraftsForSave(picker.selected, labels),
        defaultApiModel: picker.defaultId,
        promptCacheMode: "short",
        proxy: { enabled: false, url: null },
      });
      await onSaved(connectionId, !(tested && probe.result.models));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存失败。");
      setSaving(false);
    }
  };

  const defaultLabel = picker.defaultId ? modelDisplayLabel(picker.defaultId, listed?.find((model) => model.id === picker.defaultId)?.label) : null;

  return (
    <div className="flex w-full flex-col gap-6" onKeyDown={(event) => { if (event.key === "Escape" && !saving) onCancel(); }}>
      <SetupHeader backLabel="添加连接" onBack={onCancel} logo={<ProviderLogo provider="openrouter" logoKey="anthropic" />} title="连接 Anthropic" subtitle="填写 API Key 即可，模型和价格自动配置。" />
      <SettingGroup>
        <FormField label="API Key" htmlFor={keyId}>
          <SecretInput id={keyId} autoFocus placeholder="sk-ant-…" value={apiKey} onChange={(next) => { setApiKey(next); probeToken.current += 1; setProbe(invalidateProbe); }} />
        </FormField>
        {probe.status === "idle" ? null : <ProbeResultNotice state={probe} />}
      </SettingGroup>
      {tested ? <ConnectionModelPicker listed={listed} value={picker} onChange={setPicker} showCommon /> : null}
      {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
      <SetupFooter hint={tested ? (picker.selected.length ? `默认：${defaultLabel}` : "至少选择一个模型") : null}>
        <Button variant="ghost" size="md" disabled={saving} onClick={onCancel}>取消</Button>
        {tested
          ? <Button variant="primary" size="md" busy={saving} disabled={saving || !picker.selected.length} onClick={() => void save()}>{saving ? "保存中…" : "保存连接"}</Button>
          : <Button variant="primary" size="md" busy={running} disabled={!apiKey.trim() || running} onClick={() => void test()}>{running ? "测试中…" : "测试连接"}</Button>}
      </SetupFooter>
    </div>
  );
}
