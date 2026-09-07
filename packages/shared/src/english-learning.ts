export const SPEECH_MODELS = Object.freeze([
  "speech-2.8-hd", "speech-2.8-turbo", "speech-2.6-hd", "speech-2.6-turbo",
  "speech-02-hd", "speech-02-turbo", "speech-01-hd", "speech-01-turbo",
] as const);
export type SpeechModel = (typeof SPEECH_MODELS)[number];
export function isSpeechModel(value: unknown): value is SpeechModel {
  return typeof value === "string" && SPEECH_MODELS.some((model) => model === value);
}

/** Persisted speech preferences; credentials never belong in this object. */
export interface SpeechSettings {
  provider: "minimax";
  model: SpeechModel;
  voiceId: string;
  speed: number;
}

export const DEFAULT_SPEECH_SETTINGS: Readonly<SpeechSettings> = Object.freeze({
  provider: "minimax", model: "speech-2.8-turbo", voiceId: "English_Insightful_Speaker", speed: 1,
});

export interface EnglishLearningState {
  enabled: boolean;
  targetSessionId: string | null;
  revision: number;
  promptStatus: "off" | "active";
  speechStatus: "idle" | "unconfigured" | "unsupported" | "synthesizing" | "playing" | "error";
  queuedSegments: number;
  hasApiKey: boolean;
  notice: string | null;
  error: { code: string; message: string } | null;
}

export interface EnglishLearningTargetInput { enabled: boolean; sessionId: string | null }

export const ENGLISH_LEARNING_CHANNELS = Object.freeze({
  getState: "english-learning:get-state",
  setTarget: "english-learning:set-target",
  stop: "english-learning:stop",
  preview: "english-learning:preview",
  stateChanged: "english-learning:state-changed",
});

export interface EnglishLearningBridge {
  getEnglishLearningState(): Promise<EnglishLearningState>;
  setEnglishLearningTarget(input: EnglishLearningTargetInput): Promise<EnglishLearningState>;
  stopEnglishLearningSpeech(): Promise<EnglishLearningState>;
  previewEnglishLearningSpeech(): Promise<EnglishLearningState>;
  onEnglishLearningStateChanged(listener: (state: EnglishLearningState) => void): () => void;
}
