import type { RuntimeStreamEvent } from "@actspace/shared";

export type TerminalRendererOptions = {
  write: (text: string) => void;
  writeStatus?: (text: string) => void;
  color?: boolean;
};

export class TerminalRenderer {
  private wroteAssistantText = false;
  private thinkingBuffer = "";

  constructor(private readonly options: TerminalRendererOptions) {}

  beginAgentRun(): void {
    this.wroteAssistantText = false;
    this.thinkingBuffer = "";
  }

  render(event: RuntimeStreamEvent): void {
    if (event.type === "assistant_thinking_delta") {
      this.thinkingBuffer += event.delta;
      return;
    }

    this.flushThinking();
    switch (event.type) {
      case "assistant_text_delta":
        this.options.write(event.delta);
        this.wroteAssistantText = true;
        return;
      case "tool_started":
        this.status(`tool: ${event.toolName} started`);
        return;
      case "tool_finished":
        this.status(`tool: ${event.toolName} ${event.isError ? "failed" : "finished"}`);
        return;
      case "llm_retry":
        this.status(`retry ${event.attempt}/${event.maxAttempts}: ${event.reason}`);
        return;
      case "agent_run_failed":
        this.status(`error [${event.error.code}]: ${event.error.message}`, true);
        return;
      case "agent_run_aborted":
        this.status("agent run aborted");
        return;
      case "agent_run_finished":
        if (this.wroteAssistantText) this.options.write("\n");
        return;
      default:
        return;
    }
  }

  note(message: string): void {
    this.flushThinking();
    this.status(message);
  }

  hasAssistantText(): boolean {
    return this.wroteAssistantText;
  }

  private status(message: string, error = false): void {
    this.writeStatus(`[${message}]\n`, error);
  }

  private flushThinking(): void {
    const thinking = this.thinkingBuffer.trim();
    this.thinkingBuffer = "";
    if (!thinking) return;
    this.writeStatus(`[thinking]\n${thinking}\n`);
  }

  private writeStatus(text: string, error = false): void {
    const rendered = this.options.color
      ? `${error ? "\u001b[31m" : "\u001b[2m"}${text}\u001b[0m`
      : text;
    (this.options.writeStatus ?? this.options.write)(rendered);
  }
}

export function shouldUseColor(input: { isTTY: boolean; env?: NodeJS.ProcessEnv }): boolean {
  return input.isTTY && !(input.env ?? process.env).NO_COLOR;
}
