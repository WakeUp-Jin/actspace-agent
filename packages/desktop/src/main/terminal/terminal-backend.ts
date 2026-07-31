export type TerminalBackendExit = { exitCode: number; signal?: number };

export interface TerminalBackend {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  pause(): void;
  resume(): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): () => void;
  onExit(listener: (event: TerminalBackendExit) => void): () => void;
}

export type CreateTerminalBackendInput = {
  shell: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
};

export type CreateTerminalBackend = (input: CreateTerminalBackendInput) => TerminalBackend;
