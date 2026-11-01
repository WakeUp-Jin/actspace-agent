/**
 * Desktop 内部的远端会话 key：`host:` + base64url(JSON.stringify([hostId, sessionId]))。
 * main 和 renderer 共用这一份编解码；输出必须与 Node 的 `Buffer.toString("base64url")` 逐字节一致，
 * 因为已持久化的 session cache 和未确认提交都以这个 key 为准。shared 同时跑在浏览器和 Node，所以不用 Buffer。
 */
export type SessionLocatorRef = { readonly hostId: string; readonly sessionId: string };

export const REMOTE_SESSION_KEY_PREFIX = "host:";
const MAX_PART_LENGTH = 128;

export class InvalidSessionLocatorError extends Error {
  constructor(readonly key: string) {
    super("Invalid remote SessionRef");
    this.name = "InvalidSessionLocatorError";
  }
}

export function encodeSessionLocator(ref: SessionLocatorRef): string {
  return REMOTE_SESSION_KEY_PREFIX + base64UrlEncode(utf8Encode(JSON.stringify([ref.hostId, ref.sessionId])));
}

/** 只看前缀：带 `host:` 的 key 一律不是本机会话，损坏的也一样（不解码，不抛错）。 */
export function hasSessionLocatorPrefix(key: string): boolean {
  return key.startsWith(REMOTE_SESSION_KEY_PREFIX);
}

/** 不以 `host:` 开头时返回 null（本机会话）；以 `host:` 开头但不是合法 key 时抛 `InvalidSessionLocatorError`。 */
export function decodeSessionLocator(key: string): SessionLocatorRef | null {
  if (!hasSessionLocatorPrefix(key)) return null;
  try {
    const value: unknown = JSON.parse(utf8Decode(base64UrlDecode(key.slice(REMOTE_SESSION_KEY_PREFIX.length))));
    if (!Array.isArray(value) || value.length !== 2 || value.some(item => typeof item !== "string" || !item.length || item.length > MAX_PART_LENGTH)) throw new Error();
    const ref = { hostId: value[0] as string, sessionId: value[1] as string };
    if (encodeSessionLocator(ref) !== key) throw new Error();
    return ref;
  } catch {
    throw new InvalidSessionLocatorError(key);
  }
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlEncode(bytes: readonly number[]): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!, b = bytes[index + 1], c = bytes[index + 2];
    out += ALPHABET[a >> 2]! + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) out += ALPHABET[c & 63]!;
  }
  return out;
}

/** 严格解码：只接受 base64url 字母表、不带填充。非规范输入最终也会被 round-trip 检查拒绝。 */
function base64UrlDecode(text: string): number[] {
  if (text.length % 4 === 1) throw new Error();
  const bytes: number[] = [];
  let buffer = 0, bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error();
    buffer = (buffer << 6) | value; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff); }
  }
  return bytes;
}

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return bytes;
}

function utf8Decode(bytes: readonly number[]): string {
  let out = "";
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index]!;
    const length = first < 0x80 ? 1 : first >= 0xf0 && first < 0xf8 ? 4 : first >= 0xe0 ? 3 : first >= 0xc0 ? 2 : 0;
    if (!length || index + length > bytes.length) throw new Error();
    let code = length === 1 ? first : first & (0xff >> (length + 1));
    for (let offset = 1; offset < length; offset++) {
      const next = bytes[index + offset]!;
      if ((next & 0xc0) !== 0x80) throw new Error();
      code = (code << 6) | (next & 63);
    }
    out += String.fromCodePoint(code);
    index += length;
  }
  return out;
}
