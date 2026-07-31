import { spawn } from "node:child_process";
import { parentPort } from "node:worker_threads";
import { parseReviewPatchBatch, runReviewGitCommand } from "./review-git-engine";
import type { ReviewGitObjectOutcome } from "./review-git-engine";
import type { ReviewWorkerRequest, ReviewWorkerResponse } from "./review-git-worker-client";

if (!parentPort) throw new Error("Review Git worker requires a parent port.");

const controllers = new Map<number, AbortController>();

parentPort.on("message", async (request: ReviewWorkerRequest) => {
  if (request.type === "cancel") {
    controllers.get(request.targetId)?.abort();
    return;
  }
  try {
    if (request.type === "parse") {
      post({ id: request.id, ok: true, value: parseReviewPatchBatch(request.input) });
      return;
    }
    const controller = new AbortController();
    controllers.set(request.id, controller);
    const value = request.type === "cat-file"
      ? await loadGitObjects(request.input, controller.signal)
      : await runReviewGitCommand(request.args, { ...request.options, signal: controller.signal });
    controllers.delete(request.id);
    post({ id: request.id, ok: true, value });
  } catch (error) {
    controllers.delete(request.id);
    post({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

function post(response: ReviewWorkerResponse): void {
  parentPort?.postMessage(response);
}

async function loadGitObjects(input: Extract<ReviewWorkerRequest, { type: "cat-file" }>["input"], signal: AbortSignal): Promise<ReviewGitObjectOutcome[]> {
  const requests = input.requests.slice(0, 4);
  const check = await runGitBuffer(input.cwd, ["cat-file", "--batch-check"], requests.map((request) => request.spec).join("\n") + "\n", signal, 256 * 1024);
  if (check.exitCode !== 0) throw new Error(check.stderr || "git cat-file --batch-check failed.");
  const checkLines = check.stdout.toString("utf8").trimEnd().split("\n");
  const outcomes = new Map<string, ReviewGitObjectOutcome>();
  const eligible: Array<{ key: string; spec: string; bytes: number }> = [];
  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    const line = checkLines[index] ?? "";
    if (/ missing$/.test(line)) {
      outcomes.set(request.key, { key: request.key, side: { available: false, bytes: 0, partial: false } });
      continue;
    }
    const match = /^[0-9a-f]+\s+(\S+)\s+(\d+)$/.exec(line);
    const bytes = Number(match?.[2] ?? 0);
    if (!match || match[1] !== "blob") {
      outcomes.set(request.key, { key: request.key, side: { available: false, bytes, partial: false } });
    } else if (bytes > input.maxBytes) {
      outcomes.set(request.key, { key: request.key, side: { available: false, bytes, partial: true } });
    } else {
      eligible.push({ ...request, bytes });
    }
  }
  if (eligible.length > 0) {
    const maxOutput = eligible.reduce((total, item) => total + item.bytes + 256, 0);
    const batch = await runGitBuffer(input.cwd, ["cat-file", "--batch"], eligible.map((request) => request.spec).join("\n") + "\n", signal, maxOutput);
    if (batch.exitCode !== 0) throw new Error(batch.stderr || "git cat-file --batch failed.");
    let offset = 0;
    for (const request of eligible) {
      const newline = batch.stdout.indexOf(10, offset);
      if (newline < 0) throw new Error("git cat-file returned an incomplete header.");
      const header = batch.stdout.subarray(offset, newline).toString("utf8");
      const match = /^[0-9a-f]+\s+blob\s+(\d+)$/.exec(header);
      const bytes = Number(match?.[1] ?? -1);
      if (!match || bytes < 0 || newline + 1 + bytes > batch.stdout.length) throw new Error("git cat-file returned an incomplete object.");
      const content = batch.stdout.subarray(newline + 1, newline + 1 + bytes);
      outcomes.set(request.key, {
        key: request.key,
        side: content.includes(0)
          ? { available: false, bytes, partial: false }
          : { available: true, text: content.toString("utf8"), bytes, partial: false },
      });
      offset = newline + 1 + bytes + 1;
    }
  }
  return requests.map((request) => outcomes.get(request.key) ?? ({ key: request.key, side: { available: false, bytes: 0, partial: false } }));
}

function runGitBuffer(cwd: string, args: string[], input: string, signal: AbortSignal, maxOutputBytes: number): Promise<{ stdout: Buffer; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Review request was cancelled."));
      return;
    }
    const child = spawn("git", ["-C", cwd, ...args], { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    const abort = () => child.kill();
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        child.kill();
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) {
        reject(new Error("Review request was cancelled."));
        return;
      }
      if (stdoutBytes > maxOutputBytes) {
        reject(new Error("git cat-file exceeded the Review output limit."));
        return;
      }
      resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString("utf8").slice(0, 2_000), exitCode: code });
    });
    child.stdin.end(input);
  });
}
