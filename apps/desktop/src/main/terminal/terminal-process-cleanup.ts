import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ProcessRow = { pid: number; ppid: number };

function parseProcessRows(output: string): ProcessRow[] {
  return output.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]) }] : [];
  });
}

function descendantsOf(rootPid: number, rows: ProcessRow[]): number[] {
  const byParent = new Map<number, number[]>();
  for (const row of rows) byParent.set(row.ppid, [...(byParent.get(row.ppid) ?? []), row.pid]);
  const result: number[] = [];
  const visit = (pid: number) => {
    for (const child of byParent.get(pid) ?? []) {
      visit(child);
      result.push(child);
    }
  };
  visit(rootPid);
  return result;
}

function signalPids(pids: number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try { process.kill(pid, signal); } catch { /* already exited */ }
  }
}

export async function terminateProcessTree(rootPid: number): Promise<void> {
  if (!Number.isInteger(rootPid) || rootPid <= 1) return;
  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/pid", String(rootPid), "/T", "/F"]).catch(() => undefined);
    return;
  }
  const output = await execFileAsync("/bin/ps", ["-axo", "pid=,ppid="], { encoding: "utf8" })
    .then((result) => result.stdout)
    .catch(() => "");
  const pids = [...descendantsOf(rootPid, parseProcessRows(output)), rootPid];
  signalPids(pids, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  signalPids(pids, "SIGKILL");
}

export function terminateProcessTreeSync(rootPid: number): void {
  if (!Number.isInteger(rootPid) || rootPid <= 1) return;
  if (process.platform === "win32") {
    try { execFileSync("taskkill", ["/pid", String(rootPid), "/T", "/F"]); } catch { /* best effort */ }
    return;
  }
  let output = "";
  try { output = execFileSync("/bin/ps", ["-axo", "pid=,ppid="], { encoding: "utf8" }); } catch { /* best effort */ }
  signalPids([...descendantsOf(rootPid, parseProcessRows(output)), rootPid], "SIGTERM");
}
