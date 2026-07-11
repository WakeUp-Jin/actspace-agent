export interface BridgeRequest {
  protocolVersion: string;
  id: string;
  method: string;
  params?: unknown;
}

export interface BridgeResponse {
  protocolVersion: string;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface BridgeEvent {
  protocolVersion: string;
  method: string;
  params?: unknown;
}

export interface BridgeClientOptions {
  socketPath: string;
  sessionId: string;
  turnId: string;
  timeoutMs?: number;
}

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  active: boolean;
}

export interface ScreenshotResult {
  mimeType: string;
  data: string;
  bytes?: number;
}

export interface DomSnapshotResult {
  text: string;
}

export interface BrowserCommandAction {
  category: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface BrowserPreflightResult {
  actionHash: string;
  highestRisk: "low" | "medium" | "high";
  readOnly: boolean;
  approval?: string;
  expiresAt?: number;
  actions: Array<{
    index: number;
    commandId: string;
    category: string;
    action: string;
    riskLevel: "low" | "medium" | "high";
    readOnly: boolean;
    effect: string;
    originPolicy: string;
    target?: string;
    origin?: string;
    status: "implemented" | "partial" | "not_implemented";
  }>;
}

export interface BrowserCommandExecutionResult {
  commandId: string;
  category: string;
  action: string;
  status?: "completed" | "failed";
  durationMs?: number;
  error?: { code: string; message: string };
  result?: unknown;
}

export interface BrowserRunResult {
  actionHash: string;
  results: BrowserCommandExecutionResult[];
}
