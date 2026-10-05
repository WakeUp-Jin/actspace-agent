import { shell } from "electron";
import { spawn } from "node:child_process";

const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

/** 只有绝对的 http(s) / mailto URL 才交给系统打开；`file:`、`javascript:`、自定义协议和相对路径一律拒绝。 */
export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** 用系统默认程序打开外部链接。URL 不安全时不打开，返回 false。 */
export async function openExternalSafely(
  url: unknown,
  open: (url: string) => Promise<void> = (target) => shell.openExternal(target),
): Promise<boolean> {
  if (!isSafeExternalUrl(url)) return false;
  await open(url);
  return true;
}

/**
 * 在 Cursor 中打开 main 已经解析过的本机路径（调用方负责 realpath 和范围校验）。
 * `cursor://` 不在 `openExternalSafely` 的白名单里，所以这里单独处理，URL 只由 main 拼出。
 */
export function openInCursor(realPath: string): void {
  if (process.platform === "darwin") {
    const child = spawn("/usr/bin/open", ["-a", "Cursor", realPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return;
  }
  void shell.openExternal(`cursor://file${encodeURI(realPath)}`);
}
