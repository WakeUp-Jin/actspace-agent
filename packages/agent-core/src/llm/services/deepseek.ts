/**
 * DeepSeekService — compatibility wrapper for the OpenAI Chat Completions protocol.
 *
 * New routing should select OpenAICompletionsService by `LLMConfig.api`.
 */

import type { LLMConfig } from "../types";
import { OpenAICompletionsService } from "./openai-completions";

export class DeepSeekService extends OpenAICompletionsService {
  constructor(config: LLMConfig) {
    super({ ...config, provider: "deepseek", api: config.api ?? "openai-completions" });
  }
}
