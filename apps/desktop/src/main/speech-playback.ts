import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SpeechHostPort } from "@actspace/english-learning";
import type { SettingsService } from "./settings-service";

/** All paths and child processes stay in main. The plugin only receives bytes. */
export class DesktopSpeechPlayback implements SpeechHostPort {
  readonly supported: boolean;
  private readonly root: string;
  private ready: Promise<void>;
  private child: ChildProcess | undefined;
  private settled: Promise<void> = Promise.resolve();
  private finishPlayback: (() => void) | undefined;
  private disposed = false;
  private generation = 0;
  private readonly pending = new Set<Promise<void>>();

  constructor(tmpRoot: string, private readonly preferences: SettingsService, private readonly spawnPlayer: typeof spawn = spawn, platform = process.platform) {
    this.supported = platform === "darwin";
    this.root = join(tmpRoot, "english-learning-audio");
    this.ready = this.cleanStart();
    // Retain the rejection for play(), but avoid an unhandled rejection during boot.
    void this.ready.catch(() => {});
  }

  settings() { return this.preferences.getSpeechSettings(); }
  resolveCredential() { return this.preferences.getStoredKey("speech-minimax"); }
  subscribeSettings(listener: () => void): () => void {
    let previousSettings = JSON.stringify(this.settings());
    let previousKey = this.resolveCredential();
    return this.preferences.subscribeV4Changes(() => {
      const settings = JSON.stringify(this.settings());
      const key = this.resolveCredential();
      if (settings === previousSettings && key === previousKey) return;
      previousSettings = settings; previousKey = key;
      listener();
    });
  }

  play(audio: Uint8Array, signal: AbortSignal): Promise<void> {
    const task = this.playOnce(audio, signal);
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task)).catch(() => {});
    return task;
  }

  private async playOnce(audio: Uint8Array, signal: AbortSignal): Promise<void> {
    await this.ready;
    await this.stop();
    signal.throwIfAborted();
    if (this.disposed || !this.supported) throw new Error("语音播放器不可用。");
    const generation = this.generation;
    const directory = await mkdtemp(join(this.root, "play-"));
    try {
      const path = join(directory, "speech.mp3");
      await writeFile(path, audio, { mode: 0o600 });
      signal.throwIfAborted();
      if (this.disposed || generation !== this.generation) return;
      const child = this.spawnPlayer("afplay", [path], { stdio: "ignore" });
      this.child = child;
      const playback = new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        let finished = false;
        const finish = (failed: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer); clearTimeout(killTimer);
          signal.removeEventListener("abort", abort);
          if (this.child === child) { this.child = undefined; this.finishPlayback = undefined; }
          failed && !signal.aborted ? reject(new Error("语音播放失败。")) : resolve();
        };
        this.finishPlayback = () => finish(false);
        const abort = () => {
          child.kill("SIGTERM");
          timer = setTimeout(() => {
            child.kill("SIGKILL");
            killTimer = setTimeout(() => finish(false), 1_000);
          }, 1_000);
        };
        child.once("error", () => finish(true));
        child.once("close", (code) => finish(code !== 0));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
      this.settled = playback.catch(() => {});
      await playback;
    } finally { await rm(directory, { recursive: true, force: true }); }
  }

  async stop(): Promise<void> {
    this.generation++;
    const child = this.child;
    if (!child) return;
    child.kill("SIGTERM");
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.settled, new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        if (this.child === child) this.finishPlayback?.();
        resolve();
      }, 2_000);
    })]);
    clearTimeout(timer);
  }

  async dispose(): Promise<void> { this.disposed = true; await this.stop(); await Promise.allSettled([...this.pending]); }
  private async cleanStart(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
}
