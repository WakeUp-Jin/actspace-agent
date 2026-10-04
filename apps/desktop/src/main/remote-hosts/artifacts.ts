import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { dialog, Menu, type BrowserWindow } from "electron";
import type { SessionRef } from "@actspace/shared/host-protocol";
import type { RemoteSessionRouter } from "./session-router";
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export class RemoteArtifacts {
  constructor(private readonly router: RemoteSessionRouter, private readonly getWindow: () => BrowserWindow | undefined) {}
  async read(ref: SessionRef, id: string) {
    const description = await this.router.call(ref, "artifacts.describe", { artifactId: id }) as { size: number; sha256: string; mediaType: string; name: string };
    if (!Number.isSafeInteger(description.size) || description.size < 0 || description.size > 25 * 1024 * 1024) throw new Error("Artifact exceeds download limit");
    const chunks: Buffer[] = []; let offset = 0;
    while (offset < description.size) {
      const part = await this.router.call(ref, "artifacts.read", { artifactId: id, offset, length: Math.min(262144, description.size - offset) }) as { data: string; sha256: string; size: number };
      const bytes = Buffer.from(part.data, "base64");
      if (!bytes.length || bytes.length > description.size - offset || part.size !== description.size || hash(bytes) !== part.sha256) throw new Error("Artifact chunk integrity failure");
      chunks.push(bytes); offset += bytes.length;
    }
    const bytes = Buffer.concat(chunks);
    if (hash(bytes) !== description.sha256) throw new Error("Artifact integrity failure");
    return { ...description, bytes };
  }
  async safePreview(ref: SessionRef, id: string) {
    const description = await this.router.call(ref, "artifacts.describe", { artifactId: id }) as { name: string; size: number; mediaType: string };
    if (description.mediaType === "text/plain" && description.size <= 1024 * 1024) {
      const value = await this.read(ref, id);
      return { name: value.name, size: value.size, text: new TextDecoder("utf-8", { fatal: true }).decode(value.bytes) };
    }
    if (["image/png", "image/jpeg", "image/webp"].includes(description.mediaType)) {
      const value = await this.read(ref, id);
      return { name: value.name, size: value.size, dataUrl: `data:${value.mediaType};base64,${value.bytes.toString("base64")}` };
    }
    return { name: description.name, size: description.size };
  }
  async preview(ref: SessionRef, id: string) {
    const value = await this.read(ref, id);
    if (!["image/png", "image/jpeg", "image/webp"].includes(value.mediaType)) return { name: value.name, relativePath: id, size: value.size, error: "unsupported_format" };
    return { name: value.name, relativePath: id, size: value.size, mimeType: value.mediaType, dataUrl: `data:${value.mediaType};base64,${value.bytes.toString("base64")}` };
  }
  async menu(ref: SessionRef, id: string) {
    const window = this.getWindow(); if (!window) return { shown: false };
    Menu.buildFromTemplate([{ label: "保存远端文件…", click: () => { void this.save(ref, id).catch(error => dialog.showErrorBox("下载失败", error instanceof Error ? error.message : String(error))); } }]).popup({ window });
    return { shown: true };
  }
  async save(ref: SessionRef, id: string) {
    const value = await this.read(ref, id), window = this.getWindow();
    const options = { title: "保存远端文件", defaultPath: value.name.replace(/[/\\]/g, "_") };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;
    // Explicit path selection does not silently overwrite an existing file.
    const file = await open(result.filePath, "wx", 0o600);
    try { await file.writeFile(value.bytes); await file.sync(); } finally { await file.close(); }
  }
}
