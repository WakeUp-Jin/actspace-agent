import type { CreateTerminalBackend, TerminalBackend } from "./terminal-backend";

type Disposable = { dispose(): void };
type PtyProcess = {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  pause(): void;
  resume(): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): Disposable;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): Disposable;
};

export const createNodePtyBackend: CreateTerminalBackend = (input): TerminalBackend => {
  let nodePty: { spawn: (...args: unknown[]) => PtyProcess };
  try {
    // Keep native loading lazy so a missing/mismatched binary becomes a typed create error,
    // instead of crashing Electron before the application can render.
    nodePty = require("node-pty") as typeof nodePty;
  } catch (error) {
    throw new Error("native_module_unavailable:node-pty native module could not be loaded");
  }

  const process = nodePty.spawn(input.shell, input.args, {
    name: "xterm-256color",
    cwd: input.cwd,
    env: input.env,
    cols: input.cols,
    rows: input.rows,
  });

  return {
    pid: process.pid,
    write: (data) => process.write(data),
    resize: (cols, rows) => process.resize(cols, rows),
    pause: () => process.pause(),
    resume: () => process.resume(),
    kill: (signal) => process.kill(signal),
    onData(listener) {
      const disposable = process.onData(listener);
      return () => disposable.dispose();
    },
    onExit(listener) {
      const disposable = process.onExit(listener);
      return () => disposable.dispose();
    },
  };
};
