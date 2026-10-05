import { hostsApi } from "../api/hosts";
import { remoteSessionRef } from "./useRemoteTarget";
import type { RightPanelTab } from "../components/right-panel/RightPanelContext";
export async function openRemoteFile(sessionId: string, path: string, openTab: (tab: RightPanelTab) => void, download = false): Promise<boolean> {
  const ref = remoteSessionRef(sessionId);
  if (!ref) return false;
  const artifact = await hostsApi.call({ hostId: ref.hostId, method: "files.reference", params: { sessionId: ref.sessionId, path } }) as { id: string };
  const input = { ...ref, artifactId: artifact.id };
  if (download) { await hostsApi.download(input); return true; }
  const preview = await hostsApi.preview(input);
  // No local relativePath metadata: freshness and local workspace APIs do not apply.
  const id = `remote-file:${sessionId}:${artifact.id}`;
  if (preview.text !== undefined) openTab({ id, kind: "text", title: preview.name, content: preview.text });
  else if (preview.dataUrl) openTab({ id, kind: "image", title: preview.name, src: preview.dataUrl });
  else await hostsApi.download(input);
  return true;
}
