import { safeStorage } from "electron";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
/** Main process only. A missing platform keyring never falls back to plaintext. */
export class HostCredentials {
  #tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly path: string) {}
  #available() {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")) throw new Error("System credential encryption is unavailable");
  }
  async #read(): Promise<Record<string, string>> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some(item => typeof item !== "string")) throw new Error("Invalid Host credential store");
      return value as Record<string, string>;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  }
  async get(hostId: string): Promise<string | undefined> {
    this.#available(); await this.#tail; const value = (await this.#read())[hostId];
    return value === undefined ? undefined : safeStorage.decryptString(Buffer.from(value, "base64"));
  }
  set(hostId: string, token: string | undefined): Promise<void> {
    this.#available();
    const next = this.#tail.then(async () => {
      const values = await this.#read();
      if (token === undefined) delete values[hostId]; else Object.defineProperty(values, hostId, { value: safeStorage.encryptString(token).toString("base64"), enumerable: true, configurable: true });
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      try {
        const file = await open(temporary, "wx", 0o600);
        try { await file.writeFile(JSON.stringify(values)); await file.sync(); } finally { await file.close(); }
        await rename(temporary, this.path);
        const directory = await open(dirname(this.path), "r");
        try { await directory.sync(); } finally { await directory.close(); }
      } finally { await rm(temporary, { force: true }); }
    });
    this.#tail = next.catch(() => undefined); return next;
  }
}
