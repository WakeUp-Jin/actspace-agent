import type { HostConnectionState } from "./index";
export type HostEndpoint = { kind: "wss"; url: string } | { kind: "ssh"; alias: string; port: number };
export interface HostConnection { id: string; hostId: string; name: string; endpoint: HostEndpoint; state: HostConnectionState; error?: string }
export interface AddHostInput { name: string; endpoint: HostEndpoint; code: string }
export const HOST_IPC = Object.freeze({ uploadProgress: "host-connections:upload-progress", preview: "host-connections:preview", activate: "host-connections:activate", download: "host-connections:download", list: "host-connections:list", add: "host-connections:add", remove: "host-connections:remove", reconnect: "host-connections:reconnect", call: "host-connections:call", changed: "host-connections:changed", event: "host-connections:event" });

export interface HostUploadProgress { sessionId: string; submissionId: string; bytes: number; total: number; state: "uploading" | "submitting" | "finished" }
export interface HostArtifactPreview { name: string; size: number; text?: string; dataUrl?: string }
