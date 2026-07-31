import { spawn } from "node:child_process";

const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
};

export function exitCodeForSignal(signal) {
  return SIGNAL_EXIT_CODES[signal] ?? 1;
}

export function signalProcessTree(pid, signal) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  if (process.platform === "win32") {
    const args = ["/pid", String(pid), "/T"];
    if (signal === "SIGKILL") args.push("/F");
    const killer = spawn("taskkill", args, { stdio: "ignore", windowsHide: true });
    killer.unref();
    return true;
  }
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

export function startManagedCommand({
  command,
  args = [],
  cwd,
  env = process.env,
  captureOutput = false,
  onStdout,
  onStderr,
}) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    stdio: captureOutput ? ["inherit", "pipe", "pipe"] : "inherit",
    windowsHide: true,
  });

  if (captureOutput) {
    child.stdout?.on("data", (chunk) => onStdout?.(chunk));
    child.stderr?.on("data", (chunk) => onStderr?.(chunk));
  }

  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  return {
    pid: child.pid,
    completed,
    signal(signal) {
      return child.pid ? signalProcessTree(child.pid, signal) : false;
    },
  };
}
