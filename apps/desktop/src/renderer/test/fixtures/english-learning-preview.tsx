/** Explicit fixture: no network, credentials, or production session writes. */
import { createRoot } from "react-dom/client";
import { DEFAULT_SPEECH_SETTINGS, type EnglishLearningState } from "@actspace/shared";
import { EnglishLearningCapability } from "../../components/extensions/EnglishLearningCapability";
import { SpeechSettingsSection } from "../../components/settings/SpeechSettingsSection";
import "../../styles/index.css";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "light";
let state: EnglishLearningState = { enabled: false, targetSessionId: null, revision: 0, promptStatus: "off", speechStatus: "unconfigured", hasApiKey: false, queuedSegments: 0, notice: null, error: null };
const listeners = new Set<(value: EnglishLearningState) => void>();
let snapshot = { revision: "fixture-1", settings: { general: {}, media: { speech: { ...DEFAULT_SPEECH_SETTINGS } } } };
window.actspace = {
  getEnglishLearningState: async () => state,
  getSettingsV4: async () => snapshot,
  listSessions: async () => [{ id: "a", title: "A · 项目设计讨论", updatedAt: "2026-09-06T12:00:00Z" }, { id: "b", title: "B · 最新会话", updatedAt: "2026-09-06T13:00:00Z" }],
  onEnglishLearningStateChanged: (listener: (value: EnglishLearningState) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  setEnglishLearningTarget: async (input: { enabled: boolean; sessionId: string }) => {
    state = { ...state, enabled: input.enabled, targetSessionId: input.enabled ? input.sessionId : null, promptStatus: input.enabled ? "active" : "off", revision: state.revision + 1 };
    listeners.forEach((listener) => listener(state)); return state;
  },
  updateSettingsV4: async (input: { patch: { speech: typeof DEFAULT_SPEECH_SETTINGS } }) => { snapshot = { ...snapshot, settings: { ...snapshot.settings, media: input.patch } }; return { ok: true, snapshot }; },
} as unknown as typeof window.actspace;
createRoot(document.getElementById("root")!).render(<main className="min-h-screen bg-app-bg p-4 text-text-main"><div className="mx-auto flex max-w-3xl flex-col gap-8"><p className="text-[12px] text-text-faint">固定样例 · 不保存数据、不调用语音</p><EnglishLearningCapability onConfigure={() => document.getElementById("speech-settings")?.scrollIntoView()} /><SpeechSettingsSection /></div></main>);
