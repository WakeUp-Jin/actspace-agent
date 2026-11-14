import { serviceKey } from "@actspace/cordis-adapter";
import type { SpeechSettings } from "@actspace/shared";

export const SPEECH_HOST_PORT_ID = "actspace.host.speech";
export interface SpeechHostPort {
  readonly supported: boolean;
  settings(): SpeechSettings;
  resolveCredential(): string | undefined;
  play(audio: Uint8Array, signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
  subscribeSettings(listener: () => void): () => void;
}
export const SPEECH_HOST_PORT = serviceKey<SpeechHostPort>(SPEECH_HOST_PORT_ID);

export class SpeechError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
