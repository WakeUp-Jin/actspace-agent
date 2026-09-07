export type CliExitCode = 0 | 1 | 2 | 3 | 4 | 130;

export class CliError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly exitCode: CliExitCode,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export class CliUsageError extends CliError {
  constructor(message: string, code = "USAGE_ERROR") {
    super(message, code, 2);
    this.name = "CliUsageError";
  }
}
