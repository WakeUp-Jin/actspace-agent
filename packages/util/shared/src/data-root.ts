export const ACTSPACE_DATA_DIRECTORY_NAME = "ActSpace";

export type ActSpaceDataRootPlatform = "darwin" | "linux" | "win32" | "other";

export type ActSpaceDataRootOptions = {
  readonly explicit?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform: ActSpaceDataRootPlatform;
  readonly homeDir: string;
};

export function resolveActSpaceDataRoot(options: ActSpaceDataRootOptions): string {
  const env = options.env ?? {};
  const explicit = options.explicit ?? env.ACTSPACE_DATA_DIR;
  if (explicit !== undefined && explicit.trim() !== "") return normalizeAbsolute(explicit, options.platform);

  if (options.platform === "darwin") return join(options.homeDir, "Library", "Application Support", ACTSPACE_DATA_DIRECTORY_NAME);
  if (options.platform === "win32") return join(env.APPDATA ?? join(options.homeDir, "AppData", "Roaming"), ACTSPACE_DATA_DIRECTORY_NAME);

  const dataHome = env.XDG_DATA_HOME;
  return join(dataHome !== undefined && isAbsolute(dataHome, options.platform) ? dataHome : join(options.homeDir, ".local", "share"), ACTSPACE_DATA_DIRECTORY_NAME);
}

function normalizeAbsolute(value: string, platform: ActSpaceDataRootPlatform): string {
  const trimmed = value.trim();
  return platform === "win32" ? trimmed.replaceAll("/", "\\") : trimmed;
}

function isAbsolute(value: string, platform: ActSpaceDataRootPlatform): boolean {
  return platform === "win32" ? /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") : value.startsWith("/");
}

function join(...parts: string[]): string {
  const first = parts[0] ?? "";
  const separator = first.includes("\\") ? "\\" : "/";
  return parts.map((part, index) => index === 0 ? part.replace(/[\\/]+$/, "") : part.replace(/^[\\/]+|[\\/]+$/g, "")).filter(Boolean).join(separator);
}
