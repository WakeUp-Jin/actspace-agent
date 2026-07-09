import type { PermissionMode, RunCommandOptions } from "./types";

export interface ParsedCli {
  command: "run" | "help";
  options: RunCommandOptions;
}

const DEFAULT_OPTIONS: RunCommandOptions = {
  permissionMode: "default",
  json: false,
  mock: false,
};

export function parseCliArgs(argv: string[]): ParsedCli {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help", options: { ...DEFAULT_OPTIONS } };
  }

  if (command !== "run") {
    throw new Error(`Unknown command: ${command}`);
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
        break;
      case "--json":
        options.json = true;
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
      case "--help":
      case "-h":
        return { command: "help", options };
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command: "run", options };
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePermissionMode(value: string): PermissionMode {
  if (value === "default" || value === "trusted" || value === "yolo") {
    return value;
  }
  throw new Error(`Invalid permission mode: ${value}`);
}

export function usage(): string {
  return [
    "Usage:",
    "  actspace-agent run --input <text> --workspace <path> [options]",
    "  actspace-agent run --input-file <path> --workspace <path> [options]",
    "",
    "Options:",
    "  --permission-mode <default|trusted|yolo>",
    "  --json",
    "  --out <directory>",
    "  --mock",
    "  --model <model-id>",
  ].join("\n");
}
