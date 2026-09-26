import { useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  normalizeCustomConnectionAddress,
  type CustomConnectionAuthMode,
  type ModelApi,
} from "@actspace/shared";
import { SegmentedControl, SettingGroup, SettingRow, SettingsInput, Toggle } from "./SettingsPrimitives";
import { Button } from "../ui/Button";
import { ProviderLogo } from "./ProviderLogo";
import { ConnectionModelPicker, type ListedModel, type ModelPickerValue } from "./ConnectionModelPicker";
import {
  AUTH_MODE_OPTIONS,
  AddressPreview,
  DEFAULT_RELAY_MULTIPLIER,
  FormField,
  MoreSettings,
  MultiplierStepper,
  PROTOCOL_OPTIONS,
  protocolLogoKey,
  ProbeResultNotice,
  SecretInput,
  SetupFooter,
  SetupHeader,
  WizardSteps,
  initialModelSelection,
  invalidateProbe,
  modelDisplayLabel,
  modelDraftsForSave,
  newConnectionId,
  probeErrorResult,
  type ProbeState,
} from "./custom-connection-shared";

/**
 * 自定义服务的两步向导：① 协议、地址、Key，测试并拿到模型列表；② 勾选模型、定默认模型和倍率。
 * 保存后由父组件打开连接详情；没测通或跳过测试时 autoTest 为 true，由详情页补一次测试。
 */
export function CustomConnectionWizard({ onCancel, onSaved }: { onCancel: () => void; onSaved: (connectionId: string, autoTest: boolean) => void | Promise<void> }) {
  const ids = { url: useId(), key: useId(), proxy: useId() };
  const [step, setStep] = useState<1 | 2>(1);
  const [protocol, setProtocol] = useState<ModelApi>("anthropic-messages");
  const [protocolSwitched, setProtocolSwitched] = useState(false);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [authMode, setAuthMode] = useState<CustomConnectionAuthMode>("auto");
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("");
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });
  const [listed, setListed] = useState<readonly ListedModel[] | null>(null);
  const [picker, setPicker] = useState<ModelPickerValue>({ selected: [], defaultId: null });
  const [multiplier, setMultiplier] = useState(DEFAULT_RELAY_MULTIPLIER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const probeToken = useRef(0);

  const anthropic = protocol === "anthropic-messages";
  const address = normalizeCustomConnectionAddress(url, protocol);
  // 自动切换只发生在输入地址时；之后用户手动改了协议，地址后缀就和协议对不上了。
  const addressConflict = "reason" in address ? false : address.inferredProtocol !== null && address.inferredProtocol !== protocol;
  const proxyReady = !proxyEnabled || Boolean(proxyUrl.trim());
  const canTest = Boolean(apiKey.trim()) && !("reason" in address) && !addressConflict && proxyReady;
  const running = probe.status === "running";
  const tested = probe.status === "ok";

  const invalidate = () => {
    probeToken.current += 1;
    setProbe(invalidateProbe);
  };
  const changeUrl = (next: string) => {
    setUrl(next);
    const result = normalizeCustomConnectionAddress(next, protocol);
    if (!("reason" in result) && result.inferredProtocol && result.inferredProtocol !== protocol) {
      setProtocol(result.inferredProtocol);
      setProtocolSwitched(true);
    }
    invalidate();
  };
  const proxy = () => ({ enabled: proxyEnabled, url: proxyEnabled ? proxyUrl.trim() : null });

  const test = async () => {
    if (!canTest || running || !window.actspace.probeCustomConnection) return;
    const token = ++probeToken.current;
    setProbe({ status: "running" });
    setError(null);
    try {
      const result = await window.actspace.probeCustomConnection({ kind: "draft", protocol, baseUrl: url.trim(), apiKey: apiKey.trim(), authMode, proxy: proxy() });
      if (token !== probeToken.current) return;
      if (!result.ok) {
        setProbe({ status: "fail", result });
        if (result.errorKind === "auth" && anthropic && authMode !== "auto") setMoreOpen(true);
        return;
      }
      setProbe({ status: "ok", result });
      const models = result.models?.length ? result.models : null;
      setListed(models);
      // 重新测试时保留已经勾好的模型，只在第一次拿到列表时预选。
      if (models && !picker.selected.length) setPicker(initialModelSelection(models.map((model) => model.id)));
      setStep(2);
    } catch (nextError) {
      if (token === probeToken.current) setProbe({ status: "fail", result: probeErrorResult(nextError) });
    }
  };
  const skip = () => {
    invalidate();
    setListed(null);
    setStep(2);
  };

  const save = async () => {
    if (!picker.selected.length || !picker.defaultId || "reason" in address || !window.actspace.createCustomConnection) return;
    setSaving(true);
    setError(null);
    const connectionId = newConnectionId();
    const labels = new Map((listed ?? []).flatMap((model) => (model.label ? [[model.id, model.label] as const] : [])));
    const resolvedAuth = tested && anthropic && authMode === "auto" ? probe.result.resolvedAuth : undefined;
    try {
      await window.actspace.createCustomConnection({
        providerId: "openrouter",
        connectionId,
        protocol,
        displayName: "",
        apiKey: apiKey.trim(),
        baseUrl: url.trim(),
        catalogId: "custom",
        ...(anthropic ? { authMode, ...(resolvedAuth ? { resolvedAuth } : {}) } : {}),
        billingMode: "reference",
        pricingMultiplier: multiplier,
        initialModels: modelDraftsForSave(picker.selected, labels),
        defaultApiModel: picker.defaultId,
        promptCacheMode: anthropic ? "short" : "off",
        proxy: proxy(),
      });
      await onSaved(connectionId, !(tested && probe.result.models));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存失败。");
      setSaving(false);
    }
  };

  const listedLabel = picker.defaultId ? modelDisplayLabel(picker.defaultId, listed?.find((model) => model.id === picker.defaultId)?.label) : null;
  const autoTest = !(tested && probe.result.models);
  const moreSummary = [anthropic ? `认证：${AUTH_MODE_OPTIONS.find((option) => option.value === authMode)!.label}` : "", proxyEnabled ? "使用代理" : ""].filter(Boolean).join(" · ");

  return (
    <div className="flex w-full flex-col gap-6" onKeyDown={(event) => { if (event.key === "Escape" && !saving) onCancel(); }}>
      <SetupHeader backLabel="添加连接" onBack={onCancel} logo={<ProviderLogo provider="openrouter" logoKey={protocolLogoKey(protocol)} />} title="连接自定义服务">
        <WizardSteps step={step} />
      </SetupHeader>

      {step === 1 ? (
        <>
          <SettingGroup>
            <FormField label="协议">
              <SegmentedControl
                ariaLabel="协议"
                value={protocol}
                options={PROTOCOL_OPTIONS}
                onChange={(next) => { setProtocol(next); setProtocolSwitched(false); invalidate(); }}
              />
              {protocolSwitched ? <p className="mt-1.5 flex items-center gap-1 text-act-xs text-operational"><Check size={12} aria-hidden="true" />已根据地址切换</p> : null}
            </FormField>
            <FormField label="服务地址" htmlFor={ids.url}>
              <SettingsInput id={ids.url} width="full" mono autoFocus autoComplete="off" placeholder="https://relay.example.com" value={url} onChange={(event) => changeUrl(event.target.value)} />
              {addressConflict ? <p role="alert" className="mt-1.5 text-act-xs text-on-danger">地址和所选协议不一致。</p> : <AddressPreview result={address} />}
            </FormField>
            <FormField label="API Key" htmlFor={ids.key}>
              <SecretInput id={ids.key} value={apiKey} onChange={(next) => { setApiKey(next); invalidate(); }} />
            </FormField>
            <MoreSettings open={moreOpen} onToggle={() => setMoreOpen((open) => !open)} summary={moreSummary}>
              {anthropic ? (
                <div className="flex items-center justify-between gap-4 max-[600px]:flex-col max-[600px]:items-start">
                  <span className="text-act-sm font-medium text-text-main">认证方式</span>
                  <SegmentedControl size="sm" ariaLabel="认证方式" value={authMode} options={AUTH_MODE_OPTIONS} onChange={(next) => { setAuthMode(next); invalidate(); }} />
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <span className="text-act-sm font-medium text-text-main">使用代理</span>
                <Toggle checked={proxyEnabled} ariaLabel="使用代理" onChange={(next) => { setProxyEnabled(next); invalidate(); }} />
              </div>
              {proxyEnabled ? <SettingsInput id={ids.proxy} width="full" mono aria-label="代理地址" placeholder="http://127.0.0.1:7890" value={proxyUrl} onChange={(event) => { setProxyUrl(event.target.value); invalidate(); }} /> : null}
            </MoreSettings>
            {probe.status === "idle" ? null : <ProbeResultNotice state={probe} authMode={anthropic ? authMode : undefined} />}
          </SettingGroup>
          <SetupFooter hint={canTest && !running && !tested ? <button type="button" onClick={skip} className="text-act-xs text-text-muted underline-offset-2 hover:text-text-main hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30">跳过测试</button> : null}>
            <Button variant="ghost" size="md" onClick={onCancel}>取消</Button>
            {tested
              ? <Button variant="primary" size="md" onClick={() => setStep(2)}>下一步</Button>
              : <Button variant="primary" size="md" busy={running} disabled={!canTest || running} onClick={() => void test()}>{running ? "测试中…" : "测试并继续"}</Button>}
          </SetupFooter>
        </>
      ) : (
        <>
          <ConnectionModelPicker
            listed={listed}
            value={picker}
            onChange={setPicker}
            showCommon={anthropic}
            footer={
              <SettingRow
                title="按官方价计费"
                description="中转站 3 折就填 0.3"
                control={<MultiplierStepper value={multiplier} onChange={setMultiplier} />}
              />
            }
          />
          {error ? <p role="alert" className="text-act-xs text-on-danger">{error}</p> : null}
          <SetupFooter hint={picker.selected.length ? `默认：${listedLabel}${autoTest ? " · 保存后自动测试" : ""}` : "至少选择一个模型"}>
            <Button variant="ghost" size="md" disabled={saving} onClick={() => setStep(1)}>上一步</Button>
            <Button variant="primary" size="md" busy={saving} disabled={saving || !picker.selected.length} onClick={() => void save()}>{saving ? "保存中…" : "保存连接"}</Button>
          </SetupFooter>
        </>
      )}
    </div>
  );
}
