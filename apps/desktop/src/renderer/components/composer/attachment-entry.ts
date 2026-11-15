import { useSyncExternalStore } from "react";
import { eventsApi } from "../../api/events";
import { settingsApi } from "../../api/settings";
import { hasDeepseekKey } from "../settings/deepseek-key";

/**
 * Whether 「文档解析」 is on and DeepSeek is connected. Every composer reads it, so all subscribers share one query and one
 * settingsChanged listener, removed when the last subscriber unmounts. A failed read keeps the previous value.
 */
let value = false;
let revision = 0;
let removeListener: (() => void) | null = null;
const listeners = new Set<() => void>();

async function refresh(): Promise<void> {
  const current = ++revision;
  try {
    // The key lives only in the legacy settings; the switch only in v4.
    const [settings, snapshot] = await Promise.all([settingsApi.get(), settingsApi.getV4()]);
    if (current !== revision) return;
    const next = snapshot?.settings.tools.deepseekDocumentEnabled === true && hasDeepseekKey(settings);
    if (next === value) return;
    value = next;
    listeners.forEach((listener) => { listener(); });
  } catch {
    // Keep the current value.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!removeListener) {
    removeListener = eventsApi.settingsChanged(() => { void refresh(); });
    void refresh();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || !removeListener) return;
    removeListener();
    removeListener = null;
  };
}

export function useDocumentParsingAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => value, () => false);
}

/** Tests only: forget the shared value between cases. */
export function resetDocumentParsingAvailableForTests(): void {
  value = false;
  revision += 1;
}

export type AttachmentEntry = {
  readonly label: "图片与文件" | "图片";
  readonly description?: string;
  readonly icon: "files" | "images";
  readonly picker: "files" | "documents" | "images";
};

/** The composer's 「+」 attachment entry; the first matching row wins (front-聊天输入框规范 「附件」). */
export function attachmentEntry(input: { readonly isChatForm: boolean; readonly acceptsFiles: boolean; readonly isRemoteTarget: boolean; readonly documentParsing: boolean }): AttachmentEntry {
  if (input.isChatForm) return { label: "图片与文件", description: "PNG、JPEG、WEBP、GIF、TXT、Markdown、JSON、CSV", icon: "files", picker: "files" };
  if (input.acceptsFiles) return { label: "图片与文件", icon: "files", picker: "files" };
  if (!input.isRemoteTarget && input.documentParsing) return { label: "图片与文件", description: "PNG、JPEG、WEBP、GIF、PDF、Word、PPT", icon: "files", picker: "documents" };
  return { label: "图片", icon: "images", picker: "images" };
}
