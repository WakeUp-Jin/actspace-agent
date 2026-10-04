import type { AddHostInput, HostConnection, HostEvent, HostMethod } from "@actspace/shared/host-protocol";
declare global {
  interface Window {
    actspaceHosts?: {
      onUploadProgress(listener: (value: import("@actspace/shared/host-protocol").HostUploadProgress) => void): () => void;
      preview(input: { hostId: string; sessionId: string; artifactId: string }): Promise<import("@actspace/shared/host-protocol").HostArtifactPreview>;
      activate(sessionId: string | null): Promise<void>;
      download(input: { hostId: string; sessionId: string; artifactId: string }): Promise<void>;
      list(): Promise<HostConnection[]>;
      add(input: AddHostInput): Promise<HostConnection>;
      remove(id: string): Promise<void>;
      reconnect(id: string): Promise<void>;
      call(hostId: string, method: HostMethod, params: Readonly<Record<string, unknown>>): Promise<unknown>;
      onChanged(listener: (connections: HostConnection[]) => void): () => void;
      onEvent(listener: (input: { hostId: string; event: HostEvent }) => void): () => void;
    };
  }
}
