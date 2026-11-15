/** Builds small ZIP and OLE2 samples in memory so the tests commit no binary files. */

const encoder = new TextEncoder();

function u16(value: number): number[] { return [value & 0xff, (value >> 8) & 0xff]; }
function u32(value: number): number[] { return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff]; }

export function concat(...parts: readonly (Uint8Array | readonly number[])[]): Uint8Array {
  const arrays = parts.map(part => part instanceof Uint8Array ? part : Uint8Array.from(part));
  const out = new Uint8Array(arrays.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of arrays) { out.set(part, offset); offset += part.length; }
  return out;
}

export const ascii = (text: string): Uint8Array => encoder.encode(text);

export type ZipOptions = {
  /** Archive comment after the end record. */
  readonly comment?: string;
  /** Overrides written into the end record. */
  readonly endOffset?: number;
  readonly endCount?: number;
  /** Drops the end record entirely. */
  readonly noEnd?: boolean;
};

/** A stored (uncompressed) ZIP with empty entries; only the names matter to the sniffer. */
export function zip(names: readonly string[], options: ZipOptions = {}): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = ascii(name);
    const local = concat([0x50, 0x4b, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0), u32(0), u16(nameBytes.length), u16(0), nameBytes);
    centrals.push(concat([0x50, 0x4b, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0), u32(0), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes));
    locals.push(local);
    offset += local.length;
  }
  const central = concat(...centrals);
  if (options.noEnd) return concat(...locals, central);
  const comment = ascii(options.comment ?? "");
  const end = concat([0x50, 0x4b, 0x05, 0x06], u16(0), u16(0), u16(options.endCount ?? names.length), u16(options.endCount ?? names.length), u32(central.length), u32(options.endOffset ?? offset), u16(comment.length), comment);
  return concat(...locals, central, end);
}

export type OleEntry = { readonly name: string; readonly type?: number; readonly nameBytes?: number };

/** A fake OLE2 file: the 512-byte header followed by 128-byte directory entries. */
export function ole2(entries: readonly OleEntry[]): Uint8Array {
  const header = new Uint8Array(512);
  header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const dir = new Uint8Array(128 * (entries.length + 1));
  // Entry 0 is the root storage (type 5), like a real file.
  writeEntry(dir, 0, { name: "Root Entry", type: 5 });
  entries.forEach((entry, index) => writeEntry(dir, index + 1, entry));
  return concat(header, dir);
}

function writeEntry(dir: Uint8Array, index: number, entry: OleEntry): void {
  const base = index * 128;
  const name = [...entry.name].flatMap(char => u16(char.charCodeAt(0)));
  dir.set(name, base);
  const nameBytes = entry.nameBytes ?? name.length + 2;
  dir.set(u16(nameBytes), base + 64);
  dir[base + 66] = entry.type ?? 2;
}
