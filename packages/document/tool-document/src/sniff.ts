/**
 * Local document type checks before anything is uploaded (agent-deep-search-and-document-parsing.md §8.2).
 * Only reads file names inside ZIP and OLE2 containers; never decompresses or follows sector chains.
 */

export type DocumentType = "pdf" | "docx" | "pptx" | "doc" | "ppt";

export const DOCUMENT_TYPES: Readonly<Record<DocumentType, { readonly extension: string; readonly mediaType: string }>> = {
  pdf: { extension: ".pdf", mediaType: "application/pdf" },
  doc: { extension: ".doc", mediaType: "application/msword" },
  docx: { extension: ".docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  ppt: { extension: ".ppt", mediaType: "application/vnd.ms-powerpoint" },
  pptx: { extension: ".pptx", mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
};

const SUPPORTED_EXTENSIONS = new Set(Object.values(DOCUMENT_TYPES).map(type => type.extension));
const HEAD_BYTES = 1_024;
const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04] as const;
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // %PDF-
const ZIP_END_SEARCH = 65_557; // 22-byte end record + 65,535-byte comment
const ZIP_END_SIZE = 22;
const ZIP_CENTRAL_SIZE = 46;

/** Returns undefined when the name has no extension (a leading dot alone does not count). */
export function hasSupportedExtension(name: string): boolean | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return undefined;
  return SUPPORTED_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** Looks at the first 1,024 bytes only. */
export function sniffHead(head: Uint8Array): "pdf" | "zip" | "ole2" | undefined {
  const bytes = head.subarray(0, HEAD_BYTES);
  if (startsWith(bytes, ZIP_LOCAL)) return "zip";
  if (startsWith(bytes, OLE2)) return "ole2";
  if (indexOf(bytes, PDF, 0) >= 0) return "pdf";
  return undefined;
}

export function sniffDocument(bytes: Uint8Array): DocumentType | "encrypted" | undefined {
  switch (sniffHead(bytes)) {
    case "pdf": return "pdf";
    case "zip": return sniffZip(bytes);
    case "ole2": return sniffOle2(bytes);
    default: return undefined;
  }
}

function sniffZip(bytes: Uint8Array): DocumentType | undefined {
  const names = zipEntryNames(bytes);
  if (!names) return undefined;
  let contentTypes = false;
  let word = false;
  let ppt = false;
  for (const raw of names) {
    const name = raw.toLowerCase();
    if (name === "[content_types].xml") contentTypes = true;
    else if (name.startsWith("word/")) word = true;
    else if (name.startsWith("ppt/")) ppt = true;
  }
  if (!contentTypes) return undefined;
  if (word) return "docx";
  if (ppt) return "pptx";
  return undefined;
}

function zipEntryNames(bytes: Uint8Array): string[] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.length - ZIP_END_SEARCH);
  let end = -1;
  for (let at = bytes.length - ZIP_END_SIZE; at >= searchStart; at -= 1) {
    if (bytes[at] === 0x50 && bytes[at + 1] === 0x4b && bytes[at + 2] === 0x05 && bytes[at + 3] === 0x06) { end = at; break; }
  }
  if (end < 0) return undefined;
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const offset = view.getUint32(end + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) return undefined;
  if (offset + size > end) return undefined;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const names: string[] = [];
  let at = offset;
  for (let index = 0; index < count; index += 1) {
    if (at + ZIP_CENTRAL_SIZE > end) return undefined;
    if (view.getUint32(at, true) !== 0x02014b50) return undefined;
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const nameStart = at + ZIP_CENTRAL_SIZE;
    if (nameStart + nameLength > end) return undefined;
    names.push(decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)));
    at = nameStart + nameLength + extraLength + commentLength;
  }
  return names;
}

function sniffOle2(bytes: Uint8Array): DocumentType | "encrypted" | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let encrypted = false;
  let ppt = false;
  for (let at = 512; at + 128 <= bytes.length; at += 128) {
    if (bytes[at + 66] !== 2) continue;
    const nameBytes = view.getUint16(at + 64, true);
    if (nameBytes < 4 || nameBytes > 64 || nameBytes % 2 !== 0) continue;
    // nameBytes includes the terminating 0; the character before it must be non-zero and the terminator zero.
    if (view.getUint16(at + nameBytes - 2, true) !== 0) continue;
    let name = "";
    for (let offset = 0; offset < nameBytes - 2; offset += 2) {
      const code = view.getUint16(at + offset, true);
      if (code === 0) { name = ""; break; }
      name += String.fromCharCode(code);
    }
    if (name === "WordDocument") return "doc";
    if (name === "PowerPoint Document") ppt = true;
    else if (name === "EncryptedPackage") encrypted = true;
  }
  if (ppt) return "ppt";
  return encrypted ? "encrypted" : undefined;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function indexOf(bytes: Uint8Array, needle: readonly number[], from: number): number {
  outer: for (let at = from; at + needle.length <= bytes.length; at += 1) {
    for (let index = 0; index < needle.length; index += 1) if (bytes[at + index] !== needle[index]) continue outer;
    return at;
  }
  return -1;
}
