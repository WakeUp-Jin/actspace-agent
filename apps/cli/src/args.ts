import { CliUsageError } from "./errors";
import type { PermissionMode, RunCommandOptions } from "./types";

export type ParsedCli =
  | { command: "run"; options: RunCommandOptions }
  | { command: "version" }
  | { command: "help"; options: RunCommandOptions };

const DEFAULT_OPTIONS: RunCommandOptions = {
  permissionMode: "default",
  permissionModeExplicit: false,
  outputFormat: "text",
  mock: false,
};

export function parseCliArgs(argv: string[]): ParsedCli {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help", options: { ...DEFAULT_OPTIONS } };
  }
  if (command === "--version" || command === "version" || command === "-v") {
    if (rest.length > 0) throw new CliUsageError("version does not accept options");
    return { command: "version" };
  }

  if (command !== "run") {
    throw new CliUsageError(`Unknown command: ${command}`);
  }

  const options: RunCommandOptions = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    switch (arg) {
      case "--input":
        options.input = readValue(rest, ++i, arg);
        break;
      case "--input-file":
        options.inputFile = readValue(rest, ++i, arg);
        break;
      case "--workspace":
        options.workspace = readValue(rest, ++i, arg);
        break;
      case "--permission-mode":
        options.permissionMode = parsePermissionMode(readValue(rest, ++i, arg));
        options.permissionModeExplicit = true;
        break;
      case "--json":
        setOutputFormat(options, "json");
        break;
      case "--jsonl":
        setOutputFormat(options, "jsonl");
        break;
      case "--out":
        options.out = readValue(rest, ++i, arg);
        break;
      case "--mock":
        options.mock = true;
        break;
      case "--model":
        options.model = readValue(rest, ++i, arg);
        break;
      case "--data-dir":
        options.dataDir = readValue(rest, ++i, arg);
        break;
      case "--persist":
        options.persist = true;
        break;
      case "--resume":
        options.resume = readValue(rest, ++i, arg);
        options.persist = true;
        break;
      case "--help":
      case "-h":
        return { command: "help", options };
      default:
        throw new CliUsageError(`Unknown option: ${arg}`);
    }
  }

  return { command: "run", options };
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`Missing value for ${flag}`);
  }
  return value;
}

function parsePermissionMode(value: string): PermissionMode {
  if (value === "default" || value === "full-access") {
    return value;
  }
  throw new CliUsageError(`Invalid permission mode: ${value}`);
}

function setOutputFormat(options: RunCommandOptions, format: "json" | "jsonl"): void {
  if (options.outputFormat !== "text" && options.outputFormat !== format) {
    throw new CliUsageError("Use only one of --json or --jsonl");
  }
  options.outputFormat = format;
}

export function usage(): string {
  return [
    "Usage:",
    "  actspace-agent run --input <text> [--workspace <path>] [options]",
    "  actspace-agent run --input-file <path> [--workspace <path>] [options]",
    "  <task> | actspace-agent run [--workspace <path>] [options]",
    "",
    "Options:",
    "  --workspace <path> (default: current directory)",
    "  --permission-mode <default|full-access>",
    "  --json",
    "  --jsonl",
    "  --out <directory>",
    "  --data-dir <directory>",
    "  --persist (write a sessions-v2 Journal)",
    "  --resume <session-id> (implies --persist)",
    "  --model <model-id>",
    "  --mock",
  ].join("\n");
}
