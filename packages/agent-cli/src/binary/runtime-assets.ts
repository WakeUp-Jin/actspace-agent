import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { getRawAsset, isSea } from "node:sea";
import { CliUsageError } from "../errors";
import { CLI_VERSION } from "../version";
import { ripgrepRuntimePath } from "./runtime-paths";

declare const __ACTSPACE_RG_ASSET_KEY__: string;
declare const __ACTSPACE_RG_SHA256__: string;

const DEFAULT_ASSET_KEY = "actspace-ripgrep";

export type PrepareRuntimeAssetsInput = {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  version?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  sea?: boolean;
  assetKey?: string;
  expectedSha256?: string;
  readAsset?: (key: string) => ArrayBuffer;
  warn?: (message: string) => void;
};

export async function prepareCliRuntimeAssets(input: PrepareRuntimeAssetsInput): Promise<string | undefined> {
  const env = input.env ?? process.env;
  if (env.ACTSPACE_RG_PATH) {
    await validateExplicitRipgrepPath(env.ACTSPACE_RG_PATH, input.platform ?? process.platform);
    return env.ACTSPACE_RG_PATH;
  }
  if (!(input.sea ?? isSea())) return undefined;

  const assetKey = input.assetKey ?? buildValue("asset", DEFAULT_ASSET_KEY);
  const expectedSha256 = input.expectedSha256 ?? buildValue("sha", "");
  if (!expectedSha256) {
    input.warn?.("Embedded ripgrep checksum is unavailable; falling back to system rg.");
    return undefined;
  }

  let bytes: Uint8Array;
  try {
    const raw = (input.readAsset ?? getRawAsset)(assetKey);
    bytes = new Uint8Array(raw);
  } catch (error) {
    input.warn?.(`Embedded ripgrep asset is unavailable: ${formatError(error)}`);
    return undefined;
  }
  if (sha256(bytes) !== expectedSha256) {
    input.warn?.("Embedded ripgrep checksum mismatch; falling back to system rg.");
    return undefined;
  }

  const target = ripgrepRuntimePath({
    dataDir: input.dataDir,
    version: input.version ?? CLI_VERSION,
    platform: input.platform,
    arch: input.arch,
  });
  try {
    await installAssetAtomically(target, bytes, expectedSha256, input.platform ?? process.platform);
    env.ACTSPACE_RG_PATH = target;
    return target;
  } catch (error) {
    input.warn?.(`Embedded ripgrep could not be installed: ${formatError(error)}; falling back to system rg.`);
    return undefined;
  }
}

async function validateExplicitRipgrepPath(path: string, platform: NodeJS.Platform): Promise<void> {
  if (!isAbsolute(path)) {
    throw new CliUsageError("ACTSPACE_RG_PATH must be an absolute path", "INVALID_RG_PATH");
  }
  try {
    await access(path, platform === "win32" ? constants.F_OK : constants.X_OK);
  } catch {
    throw new CliUsageError(`ACTSPACE_RG_PATH is not executable: ${path}`, "INVALID_RG_PATH");
  }
}

async function installAssetAtomically(
  target: string,
  bytes: Uint8Array,
  expectedSha256: string,
  platform: NodeJS.Platform,
): Promise<void> {
  if (await fileHasHash(target, expectedSha256)) {
    if (platform !== "win32") await chmod(target, 0o755);
    return;
  }

  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temp, "wx", 0o700);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  if (platform !== "win32") await chmod(temp, 0o755);
  try {
    await rename(temp, target);
  } catch (error) {
    if (await fileHasHash(target, expectedSha256)) {
      await unlink(temp).catch(() => {});
      return;
    }
    if (platform === "win32") {
      await unlink(target).catch(() => {});
      try {
        await rename(temp, target);
      } catch (retryError) {
        if (await fileHasHash(target, expectedSha256)) {
          await unlink(temp).catch(() => {});
          return;
        }
        throw retryError;
      }
      return;
    }
    await unlink(temp).catch(() => {});
    throw error;
  }
}

async function fileHasHash(path: string, expectedSha256: string): Promise<boolean> {
  try {
    return sha256(await readFile(path)) === expectedSha256;
  } catch {
    return false;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function buildValue(kind: "asset" | "sha", fallback: string): string {
  if (kind === "asset" && typeof __ACTSPACE_RG_ASSET_KEY__ === "string") return __ACTSPACE_RG_ASSET_KEY__;
  if (kind === "sha" && typeof __ACTSPACE_RG_SHA256__ === "string") return __ACTSPACE_RG_SHA256__;
  return fallback;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
