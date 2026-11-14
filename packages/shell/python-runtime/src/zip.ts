/**
 * Minimal ZIP reader for wheels: central directory (with ZIP64 sizes/offsets), stored and deflated entries.
 * Wheel files are sha256-verified before they get here, so entry CRCs are not checked again.
 */
import { inflateRawSync } from "node:zlib";

export type ZipEntry = {
  /** Forward-slash path as stored; directories end with `/`. */
  readonly name: string;
  readonly directory: boolean;
  /** Unix permission bits when the archive recorded them, otherwise undefined. */
  readonly mode: number | undefined;
  readonly read: () => Buffer;
};

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const EOCD64_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_COMMENT = 0xffff;

export function readZipEntries(archive: Buffer): readonly ZipEntry[] {
  const eocd = findEndOfCentralDirectory(archive);
  let totalEntries: number = archive.readUInt16LE(eocd + 10);
  let centralSize: number = archive.readUInt32LE(eocd + 12);
  let centralOffset: number = archive.readUInt32LE(eocd + 16);
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || archive.readUInt32LE(locator) !== EOCD64_LOCATOR_SIGNATURE)
      throw new Error("ZIP64 archive without an end-of-central-directory locator.");
    const eocd64 = Number(archive.readBigUInt64LE(locator + 8));
    if (archive.readUInt32LE(eocd64) !== EOCD64_SIGNATURE)
      throw new Error("ZIP64 end-of-central-directory record not found.");
    totalEntries = Number(archive.readBigUInt64LE(eocd64 + 32));
    centralSize = Number(archive.readBigUInt64LE(eocd64 + 40));
    centralOffset = Number(archive.readBigUInt64LE(eocd64 + 48));
  }
  if (centralOffset + centralSize > archive.length) throw new Error("ZIP central directory lies outside the archive.");
  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (archive.readUInt32LE(cursor) !== CENTRAL_SIGNATURE)
      throw new Error("ZIP central directory entry has a bad signature.");
    const versionMadeBy = archive.readUInt16LE(cursor + 4);
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    let compressedSize: number = archive.readUInt32LE(cursor + 20);
    let uncompressedSize: number = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    let localOffset: number = archive.readUInt32LE(cursor + 42);
    const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const extra = archive.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
    ({ compressedSize, uncompressedSize, localOffset } = applyZip64Extra(
      extra,
      compressedSize,
      uncompressedSize,
      localOffset,
    ));
    if (flags & 0x1) throw new Error(`ZIP entry ${name} is encrypted.`);
    if (method !== 0 && method !== 8)
      throw new Error(`ZIP entry ${name} uses unsupported compression method ${method}.`);
    const unixMode = versionMadeBy >> 8 === 3 ? (externalAttributes >>> 16) & 0o7777 : undefined;
    const directory = name.endsWith("/");
    entries.push(
      Object.freeze({
        name,
        directory,
        mode: unixMode,
        read: () => readEntryData(archive, name, localOffset, method, compressedSize, uncompressedSize),
      }),
    );
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const floor = Math.max(0, archive.length - 22 - MAX_COMMENT);
  for (let offset = archive.length - 22; offset >= floor; offset -= 1) {
    if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("Not a ZIP archive: end-of-central-directory record not found.");
}

function applyZip64Extra(extra: Buffer, compressedSize: number, uncompressedSize: number, localOffset: number) {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    if (id === 0x0001) {
      let field = cursor + 4;
      if (uncompressedSize === 0xffffffff) {
        uncompressedSize = Number(extra.readBigUInt64LE(field));
        field += 8;
      }
      if (compressedSize === 0xffffffff) {
        compressedSize = Number(extra.readBigUInt64LE(field));
        field += 8;
      }
      if (localOffset === 0xffffffff) localOffset = Number(extra.readBigUInt64LE(field));
      break;
    }
    cursor += 4 + size;
  }
  return { compressedSize, uncompressedSize, localOffset };
}

function readEntryData(
  archive: Buffer,
  name: string,
  localOffset: number,
  method: number,
  compressedSize: number,
  uncompressedSize: number,
): Buffer {
  if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE)
    throw new Error(`ZIP entry ${name} has a bad local header.`);
  const nameLength = archive.readUInt16LE(localOffset + 26);
  const extraLength = archive.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  if (start + compressedSize > archive.length) throw new Error(`ZIP entry ${name} lies outside the archive.`);
  const raw = archive.subarray(start, start + compressedSize);
  const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
  if (data.length !== uncompressedSize)
    throw new Error(`ZIP entry ${name} inflated to ${data.length} bytes, expected ${uncompressedSize}.`);
  return data;
}
