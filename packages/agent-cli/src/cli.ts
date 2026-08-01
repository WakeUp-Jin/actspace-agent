#!/usr/bin/env node

import { AgentRuntimeError } from "@actspace/agent-core";
import { parseCliArgs, usage } from "./args";
import { prepareCliRuntimeAssets } from "./binary/runtime-assets";
import { chatCommand } from "./chat";
import { CliError, CliUsageError } from "./errors";
import { runCommand, type RunCommandControl } from "./run";
import { resolveCliDataDir } from "./runtime-adapter";
import { createTerminalLineInput } from "./terminal-input";
import type { CliArtifactResult, CliExitCode } from "./types";
import { formatCliVersion } from "./version";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let control: RunCommandControl | undefined;
  let interrupted = false;
  let interruptCount = 0;
  const onSigint = () => {
    interrupted = true;
    interruptCount += 1;
    if (interruptCount === 1) {
      control?.abort();
      return;
    }
    process.exit(130);
  };

  try {
    const parsed = parseCliArgs(argv);
    if (parsed.command === "help") {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    if (parsed.command === "version") {
      process.stdout.write(`${formatCliVersion()}\n`);
      return 0;
    }

    await prepareCliRuntimeAssets({
      dataDir: resolveCliDataDir(parsed.options.dataDir),
      warn: (message) => process.stderr.write(`[RUNTIME_ASSET_WARNING] ${message}\n`),
    });

    if (parsed.command === "chat") {
      if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
        throw new CliUsageError("chat requires TTY stdin and stdout; use run for pipes or automation", "TTY_REQUIRED");
      }
      const input = createTerminalLineInput(process.stdin, process.stdout);
      return await chatCommand(parsed.options, {
        input,
        write: (text) => process.stdout.write(text),
        writeStatus: (text) => process.stderr.write(text),
        stdinIsTTY: process.stdin.isTTY === true,
        stdoutIsTTY: process.stdout.isTTY === true,
      });
    }

    process.on("SIGINT", onSigint);
    const result = await runCommand(parsed.options, {
      stdinIsTTY: process.stdin.isTTY === true,
      readStdin: readProcessStdin,
      onRuntimeEvent: parsed.options.outputFormat === "jsonl"
        ? (event) => writeJsonLine({ type: "runtime_event", event })
        : undefined,
      onControl: (nextControl) => {
        control = nextControl;
        if (interrupted) control.abort();
      },
      isInterrupted: () => interrupted,
      onDiagnostic: (code, message) => {
        process.stderr.write(`[${code}] ${message}\n`);
      },
    });
    writeResult(result, parsed.options.outputFormat);
    return result.exitCode;
  } catch (error) {
    return reportError(error);
  } finally {
    process.removeListener("SIGINT", onSigint);
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
  if (error instanceof AgentRuntimeError) {
    process.stderr.write(`[${error.code}] ${error.message}\n`);
    return 3;
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
