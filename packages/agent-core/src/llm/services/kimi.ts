/**
 * KimiService — compatibility wrapper for Kimi-specific helper capabilities.
 *
 * Ordinary chat completions use the OpenAI-compatible protocol service.
 * 当前唯一的 Kimi 专属辅助能力是 analyze_media 的多模态调用（kimi-assistants.ts）。
 */

import type { LLMConfig } from "../types";
import { OpenAICompletionsService } from "./openai-completions";

export class KimiService extends OpenAICompletionsService {
  constructor(config: LLMConfig) {
    super({ ...config, provider: "kimi", api: config.api ?? "openai-completions" });
  }
}
