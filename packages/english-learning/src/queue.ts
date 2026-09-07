import type { EnglishLearningState } from "@actspace/shared";
import { SpeechError, type SpeechHostPort } from "./host-port.js";
import { synthesizeEnglish } from "./minimax.js";

type QueueStatus = Pick<EnglishLearningState, "speechStatus" | "queuedSegments" | "notice" | "error">;
export class SpeechQueue {
  private items: string[] = [];
  private running = false;
  private epoch = 0;
  private current: AbortController | undefined;
  private closed = false;
  private stopping: Promise<void> = Promise.resolve();
  private phase: EnglishLearningState["speechStatus"] = "idle";
  constructor(private readonly host: SpeechHostPort, private readonly changed: (status: QueueStatus) => void, private readonly synthesize = synthesizeEnglish) {}

  available(): "idle" | "unsupported" | "unconfigured" {
    return !this.host.supported ? "unsupported" : !this.host.resolveCredential() ? "unconfigured" : "idle";
  }

  enqueue(texts: readonly string[]): void {
    if (this.closed) return;
    const availability = this.available();
    if (availability !== "idle") { this.report(availability); return; }
    if (!texts.length) { this.report(this.phase, "没有可朗读的英文。"); return; }
    const count = [...this.items, ...texts].reduce((sum, text) => sum + [...text].length, 0);
    if (this.items.length + texts.length > 20 || count > 20_000) {
      this.report(this.phase, "语音队列已满，本条回答未加入朗读。"); return;
    }
    this.items.push(...texts);
    this.report(this.running ? this.phase : "synthesizing");
    void this.drain();
  }

  async stop(): Promise<void> {
    this.epoch++;
    this.items = [];
    this.current?.abort();
    const epoch = this.epoch;
    this.stopping = this.stopping.then(async () => {
      try { await this.host.stop(); }
      catch { if (epoch === this.epoch) this.report("error", null, { code: "playback", message: "停止语音失败，请重试。" }); return; }
      if (epoch === this.epoch) this.report(this.available());
    });
    await this.stopping;
  }

  async dispose(): Promise<void> { this.closed = true; await this.stop(); }

  private report(speechStatus: EnglishLearningState["speechStatus"], notice: string | null = null, error: EnglishLearningState["error"] = null) {
    this.phase = speechStatus;
    this.changed({ speechStatus, queuedSegments: this.items.length, notice, error });
  }

  private async drain(): Promise<void> {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while (this.items.length && !this.closed) {
        const stopping = this.stopping;
        await stopping;
        if (stopping !== this.stopping) continue;
        if (!this.items.length || this.closed) break;
        const epoch = this.epoch;
        const controller = new AbortController();
        this.current = controller;
        const text = this.items.shift()!;
        try {
          const credential = this.host.resolveCredential();
          if (!credential) { this.items = []; this.report("unconfigured"); break; }
          this.report("synthesizing");
          const audio = await this.synthesize(text, this.host.settings(), credential, controller.signal);
          if (epoch !== this.epoch || controller.signal.aborted) continue;
          this.report("playing");
          await this.host.play(audio, controller.signal);
          if (epoch === this.epoch) this.report(this.available());
        } catch (error) {
          if (epoch !== this.epoch || controller.signal.aborted) continue;
          this.items = [];
          const safe = error instanceof SpeechError ? error : new SpeechError("playback", "语音播放失败，请停止后重试。");
          this.report("error", null, { code: safe.code, message: safe.message });
        } finally {
          if (this.current === controller) this.current = undefined;
        }
      }
    } finally { this.running = false; }
  }
}
