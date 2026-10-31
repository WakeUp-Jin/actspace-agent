#!/usr/bin/env node

import { parseCliArgs, usage } from "./args";
import { CliError, CliUsageError } from "./errors";
import type { CliArtifactResult, CliExitCode } from "./types";
import { formatCliVersion } from "./version";
import { runV2Command } from "./runtime-v2/run";
import { CliTermination } from "./termination";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const termination = new CliTermination((code) => process.exit(code));
  const onSigint = () => termination.signal("SIGINT");
  const onSigterm = () => termination.signal("SIGTERM");

  try {
    if (argv[0] === "host") return await (await import("./runtime-v2/host-command")).runHostCommand(argv.slice(1));
    const parsed = parseCliArgs(argv);
    if (parsed.command === "help") {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    if (parsed.command === "version") {
      process.stdout.write(`${formatCliVersion()}\n`);
      return 0;
    }

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
    const result = await runV2Command(parsed.options, {
      stdinIsTTY: process.stdin.isTTY === true,
      readStdin: readProcessStdin,
      onLiveEvent: parsed.options.outputFormat === "jsonl"
        ? (event) => writeJsonLine({ type: "runtime_event", event })
        : undefined,
      onControl: (nextControl) => {
        termination.setAbort(nextControl.abort);
      },
      onForceCleanup: (cleanup) => termination.addCleanup(cleanup),
      isInterrupted: () => termination.exitCode !== undefined,
      interruptionExitCode: () => termination.exitCode,
      onDiagnostic: (code, message) => {
        process.stderr.write(`[${code}] ${message}\n`);
      },
    });
    writeResult(result, parsed.options.outputFormat);
    return termination.exitCode ?? result.exitCode;
  } catch (error) {
    const code = reportError(error);
    return termination.exitCode ?? code;
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    termination.dispose();
  }
}

function writeResult(result: CliArtifactResult, format: "text" | "json" | "jsonl"): void {
  if (format === "jsonl") {
    writeJsonLine({ type: "run_result", result });
    return;
  }
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.finalText) process.stdout.write(`${result.finalText}\n`);
}

function writeJsonLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function reportError(error: unknown): CliExitCode {
  if (error instanceof CliUsageError) {
    process.stderr.write(`[${error.code}] ${error.message}\n${usage()}\n`);
    return error.exitCode;
  }
  if (error instanceof CliError) {
    process.stderr.write(`[${error.code}] ${error.message}\n`);
    return error.exitCode;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[RUNTIME_ERROR] ${message}\n`);
  return 3;
}

async function readProcessStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
