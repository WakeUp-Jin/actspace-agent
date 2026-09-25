import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { DEFAULT_SPEECH_SETTINGS, SPEECH_MODELS, isSpeechModel, type SpeechModel, type EnglishLearningState, type SettingsV4Snapshot } from "@actspace/shared";
import {
  SettingEditor,
  SettingGroup,
  SettingRow,
  SettingsButton,
  SettingsInput,
  SettingsMenuButton,
  SettingsSelect,
  StatusDot,
  Stepper,
  useSettingsSaveNotice,
} from "./SettingsPrimitives";
import { SPEECH_STATUS_LABELS } from "../extensions/EnglishLearningCapability";

const SPEECH_MODEL_OPTIONS = SPEECH_MODELS.map((value) => ({ value, label: value }));

export function SpeechSettingsSection() {
  const notifySaved = useSettingsSaveNotice();
  const [snapshot, setSnapshot] = useState<SettingsV4Snapshot | null>(null);
  const [state, setState] = useState<EnglishLearningState | null>(null);
  const [voice, setVoice] = useState<string>(DEFAULT_SPEECH_SETTINGS.voiceId);
  const [model, setModel] = useState<SpeechModel>(DEFAULT_SPEECH_SETTINGS.model);
  const [speed, setSpeed] = useState(1);
  const [key, setKey] = useState("");
  const [keyEditorOpen, setKeyEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
    setBusy(true); setError(null);
    try { await run(); } catch { setError("操作失败，输入已保留，请重试。"); }
    finally { setBusy(false); }
  };
  /** 模型、音色、语速改动即保存；以当前输入为准，传入的字段覆盖尚未提交的状态。 */
  const saveSpeech = (next: { model?: SpeechModel; voiceId?: string; speed?: number }) => action(async () => {
    if (!snapshot) return;
    const speech = { ...DEFAULT_SPEECH_SETTINGS, model, voiceId: voice.trim(), speed, ...next };
    if (!speech.voiceId || !Number.isFinite(speech.speed) || speech.speed < 0.5 || speech.speed > 2) return;
    const result = await window.actspace.updateSettingsV4!({ expectedRevision: snapshot.revision, namespace: "media", patch: { speech } });
    if (result.ok === false) { setSnapshot(result.latest); setError("设置已在其他位置更新，请再改一次。"); return; }
    setSnapshot(result.snapshot);
    notifySaved();
  });
  const saveKey = () => action(async () => {
    const result = await window.actspace.setProviderKey({ provider: "speech-minimax", apiKey: key });
    if (!result.ok) throw new Error();
    setKey("");
    setKeyEditorOpen(false);
    setState(await window.actspace.getEnglishLearningState!());
    notifySaved();
  });
  const clearKey = () => action(async () => {
    const result = await window.actspace.clearProviderKey({ provider: "speech-minimax" });
    if (!result.ok) throw new Error();
    setState(await window.actspace.getEnglishLearningState!());
    notifySaved("已清除");
  });

  const savedVoice = snapshot?.settings.media.speech?.voiceId ?? DEFAULT_SPEECH_SETTINGS.voiceId;
  const playing = Boolean(state && ["playing", "synthesizing"].includes(state.speechStatus));
  const canPreview = !busy && Boolean(state?.hasApiKey) && !["unsupported", "playing", "synthesizing"].includes(state?.speechStatus ?? "unsupported");
  const statusText = state && state.speechStatus !== "idle" ? SPEECH_STATUS_LABELS[state.speechStatus] : undefined;
  const problem = error ?? state?.error?.message ?? null;
  const disabled = busy || !snapshot;

  return (
    <SettingGroup
      id="speech-settings"
      title="语音播放"
      headingLevel={3}
      description="英语辅助学习的朗读服务（MiniMax 中国站），朗读的英文会发送至 MiniMax。"
    >
      {!available ? (
        <SettingRow title="语音配置仅在桌面端可用。" />
      ) : (
        <>
          <SettingRow
            title="MiniMax API Key"
            description={state?.hasApiKey ? "已保存，Key 不会回显。" : "未配置时仍可使用双语对照输出。"}
            control={state?.hasApiKey ? (
              <>
                <StatusDot tone="ok">已配置</StatusDot>
                <SettingsMenuButton
                  label="管理"
                  ariaLabel="管理 MiniMax Key"
                  disabled={busy}
                  items={[
                    { label: "更换 Key", onSelect: () => setKeyEditorOpen(true) },
                    { label: "清除 Key", danger: true, onSelect: () => void clearKey() },
                  ]}
                />
              </>
            ) : (
              <>
                <StatusDot tone="off">未配置</StatusDot>
                <SettingsButton aria-label="设置 MiniMax Key" aria-expanded={keyEditorOpen} disabled={busy} onClick={() => setKeyEditorOpen((open) => !open)}>设置 Key</SettingsButton>
              </>
            )}
          />
          {keyEditorOpen ? (
            <SettingEditor
              hint="使用 MiniMax 中国站 Key，只保存在本机。"
              saving={busy}
              saveDisabled={!key.trim()}
              saveAriaLabel="保存 Key"
              onCancel={() => { setKey(""); setKeyEditorOpen(false); }}
              onSave={() => void saveKey()}
            >
              <SettingsInput
                type="password"
                autoComplete="new-password"
                autoFocus
                width="full"
                mono
                aria-label="MiniMax 语音 API Key"
                placeholder="粘贴 MiniMax API Key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </SettingEditor>
          ) : null}
          <SettingRow
            title="语音模型"
            control={
              <SettingsSelect
                ariaLabel="语音模型"
                value={model}
                options={SPEECH_MODEL_OPTIONS}
                disabled={disabled}
                onChange={(value) => {
                  if (!isSpeechModel(value)) return;
                  setModel(value);
                  void saveSpeech({ model: value });
                }}
              />
            }
          />
          <SettingRow
            title="音色"
            description={statusText}
            control={
              <>
                <SettingsInput
                  aria-label="语音音色"
                  width="md"
                  value={voice}
                  disabled={disabled}
                  invalid={!voice.trim()}
                  onChange={(event) => setVoice(event.target.value)}
                  onBlur={() => { if (voice.trim() && voice.trim() !== savedVoice) void saveSpeech({ voiceId: voice.trim() }); }}
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                />
                {playing ? (
                  <SettingsButton size="icon" aria-label="停止播放" title="停止播放" disabled={busy} onClick={() => void action(async () => { setState(await window.actspace.stopEnglishLearningSpeech!()); })}>
                    <Square size={11} strokeWidth={2.4} aria-hidden="true" />
                  </SettingsButton>
                ) : (
                  <SettingsButton size="icon" aria-label="试听已保存配置" title={state?.hasApiKey ? "试听已保存配置" : "需要先配置 Key"} disabled={!canPreview} onClick={() => void action(async () => { setState(await window.actspace.previewEnglishLearningSpeech!()); })}>
                    <Play size={11} strokeWidth={2.4} aria-hidden="true" />
                  </SettingsButton>
                )}
              </>
            }
          />
          <SettingRow
            title="语速"
            control={
              <Stepper
                ariaLabel="语音语速"
                value={speed}
                min={0.5}
                max={2}
                step={0.1}
                defaultValue={1}
                disabled={disabled}
                format={(value) => `${value.toFixed(1)}×`}
                onChange={(value) => {
                  setSpeed(value);
                  void saveSpeech({ speed: value });
                }}
              />
            }
          />
          {problem ? (
            <div role="alert" className="flex items-center justify-between gap-3 px-4 py-2.5 text-[12px] text-on-danger">
              <span>{problem}</span>
              {!snapshot ? <SettingsButton variant="quiet" onClick={() => setReload((value) => value + 1)}>重试</SettingsButton> : null}
            </div>
          ) : null}
        </>
      )}
    </SettingGroup>
  );
}
