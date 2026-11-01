import { randomUUID } from "node:crypto";
import { HostError } from "@actspace/shared/host-protocol";

const PART_CHARACTERS = 32768;
const MAX_BYTES = 8 * 1024 * 1024;
type Payload = { json: string; bytes: number; expires: number };
/** Immutable, connection-owned overflow pages. Credentials are checked by the gateway on every read. */
export class HostPayloads {
  readonly #values = new Map<string, Payload>();
  constructor(private readonly now = Date.now) {}
  retain(json: string) {
    this.#expire();
    const bytes = Buffer.byteLength(json);
    const retained = [...this.#values.values()].reduce((total, item) => total + item.bytes, 0);
    if (bytes + retained > MAX_BYTES) throw new HostError("LIMIT_EXCEEDED", "Response exceeds connection paging budget", true);
    const id = randomUUID();
    this.#values.set(id, { json, bytes, expires: this.now() + 30_000 });
    return { id, parts: Math.ceil(json.length / PART_CHARACTERS), characters: json.length };
  }
  read(id: string, part: number) {
    this.#expire();
    const value = this.#values.get(id);
    if (!value) throw new HostError("NOT_FOUND", "Response page expired; refresh snapshot", true);
    const parts = Math.ceil(value.json.length / PART_CHARACTERS);
    if (!Number.isSafeInteger(part) || part < 0 || part >= parts) throw new TypeError("Invalid response part");
    // Every page is small even if JSON escaping expands all characters sixfold.
    const text = value.json.slice(part * PART_CHARACTERS, (part + 1) * PART_CHARACTERS);
    value.expires = this.now() + 30_000;
    if (part === parts - 1) this.#values.delete(id);
    return { id, part, parts, text };
  }
  clear() { this.#values.clear(); }
  #expire() { for (const [id, value] of this.#values) if (value.expires <= this.now()) this.#values.delete(id); }
}
