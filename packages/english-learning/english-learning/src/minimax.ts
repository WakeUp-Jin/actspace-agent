import type { SpeechSettings } from "@actspace/shared";
import { SpeechError } from "./host-port.js";

export async function synthesizeEnglish(text: string, settings: SpeechSettings, apiKey: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<Uint8Array> {
  const timeout = AbortSignal.timeout(30_000);
  try {
    const response = await request("https://api.minimaxi.com/v1/t2a_v2", {
      method: "POST", signal: AbortSignal.any([signal, timeout]),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: settings.model, text, stream: false, voice_setting: { voice_id: settings.voiceId, speed: settings.speed, vol: 1, pitch: 0 }, audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 }, output_format: "hex" }),
    });
    if (!response.ok) throw new SpeechError(`http_${response.status}`, response.status === 401 ? "MiniMax Key 无效，请检查语音配置。" : "MiniMax 请求失败，请稍后再试。");
    const body = await response.json() as { base_resp?: { status_code?: number }; data?: { audio?: unknown } };
    const code = body.base_resp?.status_code;
    if (code !== undefined && code !== 0) throw new SpeechError(`minimax_${code}`, code === 1008 ? "MiniMax 余额不足，请检查账户额度。" : "MiniMax 合成失败，请检查音色和账户配置。");
    const hex = body.data?.audio;
    if (typeof hex !== "string" || !hex.length || hex.length % 2 || !/^[\da-f]+$/i.test(hex)) throw new SpeechError("invalid_audio", "MiniMax 未返回有效音频。");
    return Buffer.from(hex, "hex");
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (timeout.aborted) throw new SpeechError("timeout", "语音合成超时，请稍后再试。");
    if (error instanceof SpeechError) throw error;
    // Never expose fetch errors, headers or provider response bodies to the UI/log.
    throw new SpeechError("network", "无法连接 MiniMax，请检查网络后重试。");
  }
}
