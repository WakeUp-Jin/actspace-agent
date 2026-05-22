import type { ModelProvider, ModelProviderInput, ModelTurnOutput } from "./types";

export type ProviderRegistry = {
  register(provider: ModelProvider): void;
  get(providerId: string): ModelProvider | undefined;
  list(): ModelProvider[];
};

export function createProviderRegistry(): ProviderRegistry {
  const providers = new Map<string, ModelProvider>();
  return {
    register(provider) {
      providers.set(provider.id, provider);
    },
    get(providerId) {
      return providers.get(providerId);
    },
    list() {
      return [...providers.values()];
    }
  };
}

export function createMockModelProvider(): ModelProvider {
  return {
    id: "deepseek-mock",
    label: "DeepSeek (mock)",
    async completeTurn(input: ModelProviderInput): Promise<ModelTurnOutput> {
      return {
        model: "deepseek-mock",
        provider: "deepseek",
        thinking: `Plan the turn for session ${input.sessionId}, inspect the workspace, and produce a reviewable result.`,
        toolCalls: [
          {
            id: "tool_read_1",
            name: "read_file",
            arguments: {
              path: "README.md"
            }
          },
          {
            id: "tool_diff_1",
            name: "edit_file_diff",
            arguments: {
              path: "docs/ARCHITECTURE.md",
              diff: "@@ -1,3 +1,5 @@\n- Old architecture notes\n+ actspace desktop workbench skeleton\n+ typed agent runtime contracts\n+ local session persistence wiring\n"
            }
          }
        ],
        finalReply: `I reviewed the request "${input.userInput}" and prepared the first actspace runtime slice.`,
        usage: {
          inputTokens: 1820,
          outputTokens: 640,
          totalTokens: 2460
        }
      };
    }
  };
}
