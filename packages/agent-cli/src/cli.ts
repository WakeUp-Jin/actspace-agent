#!/usr/bin/env node

import { parseCliArgs, usage } from "./args";
import { runCommand } from "./run";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const parsed = parseCliArgs(argv);
    if (parsed.command === "help") {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }

    const result = await runCommand(parsed.options);
    if (parsed.options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${result.finalText}\n`);
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(`${usage()}\n`);
    return 1;
  }
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
