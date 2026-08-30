declare const __ACTSPACE_CLI_VERSION__: string;
declare const __ACTSPACE_CLI_BUILD_ID__: string;
declare const __ACTSPACE_CLI_TARGET__: string;

export const CLI_VERSION = typeof __ACTSPACE_CLI_VERSION__ === "string"
  ? __ACTSPACE_CLI_VERSION__
  : "0.1.0";
export const CLI_BUILD_ID = typeof __ACTSPACE_CLI_BUILD_ID__ === "string"
  ? __ACTSPACE_CLI_BUILD_ID__
  : "dev";
export const CLI_TARGET = typeof __ACTSPACE_CLI_TARGET__ === "string"
  ? __ACTSPACE_CLI_TARGET__
  : `${process.platform}-${process.arch}`;

export function formatCliVersion(): string {
  return `actspace-agent ${CLI_VERSION} ${CLI_TARGET} build ${CLI_BUILD_ID}`;
}
