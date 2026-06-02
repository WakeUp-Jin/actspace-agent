/**
 * DeepSeekAnthropicService — compatibility wrapper for the Anthropic Messages protocol.
 *
 * New routing should select AnthropicMessagesService by `LLMConfig.api`.
 */

import type { LLMConfig } from "../types";
import { AnthropicMessagesService } from "./anthropic-messages";

export class DeepSeekAnthropicService extends AnthropicMessagesService {
  constructor(config: LLMConfig) {
    super({ ...config, provider: "deepseek", api: config.api ?? "anthropic-messages" });
  }
}
