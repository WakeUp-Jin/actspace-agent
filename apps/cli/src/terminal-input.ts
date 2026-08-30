import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export interface TerminalLineInput {
  readLine(prompt: string): Promise<string | null>;
  cancelCurrent(): void;
  onSigint(handler: () => void): () => void;
  close(): void;
}

export function createTerminalLineInput(input: Readable, output: Writable): TerminalLineInput {
  return new ReadlineTerminalLineInput(input, output);
}

class ReadlineTerminalLineInput implements TerminalLineInput {
  private readonly readline: Interface;
  private readonly queued: string[] = [];
  private readonly sigintHandlers = new Set<() => void>();
  private pending: ((line: string | null) => void) | undefined;
  private closed = false;

  constructor(input: Readable, private readonly output: Writable) {
    this.readline = createInterface({ input, output, terminal: true });
    this.readline.on("line", (line) => {
      if (this.pending) {
        const resolve = this.pending;
        this.pending = undefined;
        resolve(line);
      } else {
        this.queued.push(line);
      }
    });
    this.readline.on("SIGINT", () => {
      for (const handler of this.sigintHandlers) handler();
    });
    this.readline.on("close", () => {
      this.closed = true;
      this.cancelCurrent();
    });
  }

  readLine(prompt: string): Promise<string | null> {
    if (this.pending) throw new Error("Terminal input already has an active reader.");
    this.output.write(prompt);
    if (this.queued.length > 0) return Promise.resolve(this.queued.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  cancelCurrent(): void {
    const resolve = this.pending;
    this.pending = undefined;
    resolve?.(null);
  }

  onSigint(handler: () => void): () => void {
    this.sigintHandlers.add(handler);
    return () => this.sigintHandlers.delete(handler);
  }

  close(): void {
    if (!this.closed) this.readline.close();
  }
}
