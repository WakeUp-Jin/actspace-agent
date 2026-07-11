/**
 * KimiService — compatibility wrapper for Kimi provider defaults.
 *
 * Ordinary chat completions use the OpenAI-compatible protocol service.
 */

import type { LLMConfig } from "../types";
import { OpenAICompletionsService } from "./openai-completions";

export class KimiService extends OpenAICompletionsService {
  constructor(config: LLMConfig) {
    super({ ...config, provider: "kimi", api: config.api ?? "openai-completions" });
  }
}
