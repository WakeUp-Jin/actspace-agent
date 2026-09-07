import { useEffect, useState } from "react";
import { DEFAULT_SPEECH_SETTINGS, SPEECH_MODELS, isSpeechModel, type SpeechModel, type EnglishLearningState, type SettingsV4Snapshot } from "@actspace/shared";
import { SectionShell, SettingGroup, SettingRow } from "./SettingsPrimitives";
import { SPEECH_STATUS_LABELS } from "../extensions/EnglishLearningCapability";

const field = "h-8 min-w-0 rounded-act-md border border-line bg-surface px-2.5 text-[13px] text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const button = "h-8 rounded-act-md border border-line bg-surface px-3 text-[12px] text-text-main hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50";

export function SpeechSettingsSection() {
  const [snapshot, setSnapshot] = useState<SettingsV4Snapshot | null>(null);
  const [state, setState] = useState<EnglishLearningState | null>(null);
  const [voice, setVoice] = useState<string>(DEFAULT_SPEECH_SETTINGS.voiceId);
  const [model, setModel] = useState<SpeechModel>(DEFAULT_SPEECH_SETTINGS.model);
  const [speed, setSpeed] = useState(1);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const available = Boolean(window.actspace?.getSettingsV4 && window.actspace.getEnglishLearningState);
  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const accept = (next: EnglishLearningState) => { if (!cancelled) setState((previous) => !previous || next.revision >= previous.revision ? next : previous); };
    const remove = window.actspace.onEnglishLearningStateChanged?.(accept);
    void Promise.all([window.actspace.getSettingsV4!(), window.actspace.getEnglishLearningState!()]).then(([next, learning]) => {
      if (cancelled) return;
      setSnapshot(next); accept(learning);
      setVoice(next.settings.media.speech?.voiceId ?? DEFAULT_SPEECH_SETTINGS.voiceId);
      setModel(next.settings.media.speech?.model ?? DEFAULT_SPEECH_SETTINGS.model);
      setSpeed(next.settings.media.speech?.speed ?? 1);
      setError(null);
    }).catch(() => { if (!cancelled) setError("语音配置读取失败，请重试。"); });
    return () => { cancelled = true; remove?.(); };
  }, [available, reload]);

  const action = async (run: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null);
    try { await run(); } catch { setError("操作失败，输入已保留，请重试。"); }
    finally { setBusy(false); }
  };
  const save = () => action(async () => {
    if (!snapshot) return;
    const result = await window.actspace.updateSettingsV4!({ expectedRevision: snapshot.revision, namespace: "media", patch: { speech: { ...DEFAULT_SPEECH_SETTINGS, model, voiceId: voice.trim(), speed } } });
    if (result.ok === false) { setSnapshot(result.latest); setError("设置已在其他位置更新，请再次保存当前输入。"); return; }
    setSnapshot(result.snapshot); setMessage("语音配置已保存。");
  });
  return (
    <div id="speech-settings" className="scroll-mt-8">
      <SectionShell title="语音播放" description="英语辅助学习使用 MiniMax 中国站语音服务。朗读的英文文本会发送至 MiniMax。">
        {!available ? <p className="text-[12px] text-text-faint">语音配置仅在桌面端可用。</p> : <>
          <SettingGroup>
            <SettingRow title="语音服务" description="仅朗读英文" control={<span className="text-[13px] text-text-muted">MiniMax</span>} />
            <SettingRow title="语音模型" description="保存后用于试听和会话朗读" control={<select aria-label="语音模型" className={`${field} w-full max-w-[280px]`} value={model} onChange={(event) => { if (isSpeechModel(event.target.value)) setModel(event.target.value); }} disabled={busy || !snapshot}>{SPEECH_MODELS.map((value) => <option key={value} value={value}>{value}</option>)}</select>} />
            <SettingRow title="音色" control={<input aria-label="语音音色" className={`${field} w-full max-w-[280px]`} value={voice} onChange={(event) => setVoice(event.target.value)} disabled={busy || !snapshot} />} />
            <SettingRow title="语速" description="0.5–2.0，默认为 1.0" control={<input aria-label="语音语速" type="number" min="0.5" max="2" step="0.1" className={`${field} w-24`} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} disabled={busy || !snapshot} />} />
            <SettingRow title="MiniMax API Key" description={state?.hasApiKey ? "已保存，密钥不会回显。" : "使用 MiniMax 中国站 Key；未配置时仍可使用双语输出。"} control={<input type="password" autoComplete="new-password" aria-label="MiniMax 语音 API Key" placeholder="输入新的 Key" className={`${field} w-full max-w-[280px]`} value={key} onChange={(event) => setKey(event.target.value)} disabled={busy || !snapshot} />} />
          </SettingGroup>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || !snapshot || !voice.trim() || !Number.isFinite(speed) || speed < 0.5 || speed > 2} onClick={() => void save()}>保存语音配置</button>
            <button type="button" className={button} disabled={busy || !key.trim()} onClick={() => void action(async () => { const result = await window.actspace.setProviderKey({ provider: "speech-minimax", apiKey: key }); if (!result.ok) throw new Error(); setKey(""); setState(await window.actspace.getEnglishLearningState!()); setMessage("Key 已保存。"); })}>保存 Key</button>
            <button type="button" className={button} disabled={busy || !state?.hasApiKey} onClick={() => void action(async () => { const result = await window.actspace.clearProviderKey({ provider: "speech-minimax" }); if (!result.ok) throw new Error(); setState(await window.actspace.getEnglishLearningState!()); setMessage("Key 已清除。"); })}>清除 Key</button>
            <button type="button" className={button} disabled={busy || !state?.hasApiKey || ["unsupported", "playing", "synthesizing"].includes(state?.speechStatus ?? "unsupported")} onClick={() => void action(async () => { setState(await window.actspace.previewEnglishLearningSpeech!()); })}>试听已保存配置</button>
            <button type="button" className={button} disabled={busy || !state || !["playing", "synthesizing"].includes(state.speechStatus)} onClick={() => void action(async () => { setState(await window.actspace.stopEnglishLearningSpeech!()); })}>停止播放</button>
          </div>
          <p role="status" className="text-[12px] text-text-faint">{message ?? (state ? SPEECH_STATUS_LABELS[state.speechStatus] : "加载中…")}</p>
          {(error || state?.error) && <p role="alert" className="text-[12px] text-on-danger">{error ?? state?.error?.message} {!snapshot && <button type="button" className="underline" onClick={() => setReload((value) => value + 1)}>重试</button>}</p>}
        </>}
      </SectionShell>
    </div>
  );
}
