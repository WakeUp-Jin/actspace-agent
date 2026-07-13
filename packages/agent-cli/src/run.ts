import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Agent,
  type AssistantMessage,
  ContextManager,
  MockLLMService,
  SystemPromptContext,
  buildAgentConfig,
  createEmptyUsage,
  createAgentFromConfig,
  getTextContent,
  type AgentDeps,
} from "@actspace/agent-core";
import type { ModelId } from "@actspace/shared";
import { AgentEventCollector } from "./event-collector";
import { createApprovalGate } from "./permission";
import { writeArtifacts } from "./artifacts";
import type { CliArtifactResult, RunCommandOptions } from "./types";
import { ContextSnapshotCollector } from "./context-snapshot-collector";

export async function runCommand(options: RunCommandOptions): Promise<CliArtifactResult> {
  const workspace = resolveRequiredWorkspace(options.workspace);
  const input = await resolveInput(options);
  const startedAt = new Date().toISOString();
  const collector = new AgentEventCollector();
  const deps = createDeps(options, workspace);
  const contextSnapshots = options.out ? new ContextSnapshotCollector() : undefined;

  const agent = new Agent({
    llm: deps.llm,
    contextManager: deps.contextManager,
    toolManager: deps.toolManager,
    thinkingEnabled: deps.thinkingEnabled,
    summarizer: deps.summarizer,
    onEvent: (event) => {
      collector.sink(event);
      if (event.type === "context_compaction") {
        contextSnapshots?.capturePostCompaction(deps.contextManager.getMessages());
      }
    },
    cacheAudit: contextSnapshots,
  });

  const loopResult = await agent.run(input);
  const finalText = getTextContent(loopResult.message);
  const endedAt = new Date().toISOString();
  const events = collector.getEvents();

  const result: CliArtifactResult = {
    ok: loopResult.message.stopReason !== "error" && loopResult.message.stopReason !== "aborted",
    finalText,
    model: loopResult.message.model,
    provider: loopResult.message.provider,
    stopReason: loopResult.message.stopReason,
    totalUsage: loopResult.totalUsage,
    messageCount: loopResult.messages.length,
    eventCount: events.length,
    permissionMode: options.permissionMode,
    workspace,
    startedAt,
    endedAt,
  };

  if (options.out) {
    contextSnapshots?.captureFinal(loopResult.messages);
    await writeArtifacts({
      outDir: options.out,
      result,
      events,
      finalText,
      contextSnapshots: contextSnapshots?.getSnapshots(),
    });
  }

  return result;
}

function createDeps(options: RunCommandOptions, workspace: string): AgentDeps {
  const approvalGate = createApprovalGate(options.permissionMode, workspace);

  if (options.mock) {
    const config = buildAgentConfig({}, workspace, approvalGate);
    const deps = createAgentFromConfig(config);
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "mock-model" });
    llm.setResponses([createMockText("Mock ActSpace Agent response.")]);
    return {
      ...deps,
      llm,
      contextManager: new ContextManager({
        systemPromptModule: new SystemPromptContext(config.systemPrompt),
        config: { contextWindow: config.modelSpec.contextWindow },
      }),
    };
  }

  const config = buildAgentConfig(
    { model: options.model as ModelId | undefined },
    workspace,
    approvalGate,
  );
  return createAgentFromConfig(config);
}

function createMockText(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    model: "mock-model",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
    source: "llm",
  };
}

async function resolveInput(options: RunCommandOptions): Promise<string> {
  if (options.input && options.inputFile) {
    throw new Error("Use only one of --input or --input-file");
  }
  if (options.input) return options.input;
  if (options.inputFile) {
    return readFile(resolve(options.inputFile), "utf8");
  }
  throw new Error("Missing --input or --input-file");
}

function resolveRequiredWorkspace(workspace: string | undefined): string {
  if (!workspace) {
    throw new Error("Missing --workspace");
  }
  return resolve(workspace);
}
