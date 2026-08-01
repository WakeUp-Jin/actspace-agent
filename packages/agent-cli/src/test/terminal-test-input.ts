import type { TerminalLineInput } from "../terminal-input";

export class ScriptedLineInput implements TerminalLineInput {
  readonly prompts: string[] = [];
  closed = false;
  private readonly handlers = new Set<() => void>();
  private pending: ((line: string | null) => void) | undefined;

  constructor(private readonly lines: string[]) {}

  readLine(prompt: string): Promise<string | null> {
    this.prompts.push(prompt);
    if (this.lines.length > 0) return Promise.resolve(this.lines.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => { this.pending = resolve; });
  }

  cancelCurrent(): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.(null);
  }

  onSigint(handler: () => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emitSigint(): void {
    for (const handler of this.handlers) handler();
  }

  close(): void {
    this.closed = true;
    this.cancelCurrent();
  }
}
