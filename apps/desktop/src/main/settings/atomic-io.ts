/** settings 文件的原子写入和一次性备份：先写 .tmp 再 rename；备份已存在时只校验内容一致。 */
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import {
  SETTINGS_V2_BACKUP_DIGEST_FILE,
  SETTINGS_V2_BACKUP_FILE,
  SETTINGS_V3_BACKUP_DIGEST_FILE,
  SETTINGS_V3_BACKUP_FILE,
} from "./constants";
import { isAlreadyExistsError, isNotFoundError } from "./utils";

export async function writeJsonAtomic(filePath: string, value: unknown, options?: { mode?: number }): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {
    encoding: "utf8",
    ...(options?.mode !== undefined && { mode: options.mode }),
  });
  if (options?.mode !== undefined) await chmod(tmp, options.mode);
  await rename(tmp, filePath);
  if (options?.mode !== undefined) await chmod(filePath, options.mode);
}

export async function writeTextAtomic(filePath: string, value: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, value, "utf8");
  await rename(tmp, filePath);
}

export async function writeBackupOnce(filePath: string, value: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, value, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
  }
}

export async function writeSettingsV2Backup(dataRoot: string, raw: string): Promise<void> {
  const digest = createHash("sha256").update(raw).digest("hex");
  await writeVerifiedBackup(join(dataRoot, SETTINGS_V2_BACKUP_FILE), raw);
  await writeVerifiedBackup(join(dataRoot, SETTINGS_V2_BACKUP_DIGEST_FILE), `${digest}\n`);
}

export async function writeSettingsV3Backup(dataRoot: string, raw: string): Promise<void> {
  const digest = createHash("sha256").update(raw).digest("hex");
  await writeVerifiedBackup(join(dataRoot, SETTINGS_V3_BACKUP_FILE), raw);
  await writeVerifiedBackup(join(dataRoot, SETTINGS_V3_BACKUP_DIGEST_FILE), `${digest}\n`);
}

export async function writeVerifiedBackup(filePath: string, value: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    const existing = await readFile(filePath, "utf8");
    if (existing !== value) throw new Error(`Existing backup does not match ${filePath}.`);
    return;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  try {
    await writeFile(filePath, value, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    const existing = await readFile(filePath, "utf8");
    if (existing !== value) throw new Error(`Existing backup does not match ${filePath}.`);
  }
}
