/** Host capability DTOs for the optional browser-bridge binary. */

export type BrowserBridgeRunState =
  | "disconnected"
  | "not_installed"
  | "host_not_installed"
  | "extension_offline"
  | "awaiting_selection"
  | "waiting_for_runtime"
  | "update_required"
  | "ready"
  | "error";

export interface BrowserBridgeInstance {
  instanceId: string;
  extensionVersion: string;
  hostVersion: string;
  hostId: string;
}

export interface BrowserBridgeDoctorCheck {
  name: string;
  status: string;
  backend?: string;
  detail: string;
}

export interface BrowserBridgeStatus {
  observedAt?: string;
  connectionState?: BrowserConnectionState;
  layers?: Readonly<Record<BrowserConnectionLayer, BrowserLayerObservation>>;
  selectedInstance?: BrowserBridgeInstance;
  preparedVersions?: BrowserComponentVersions;
  runningVersions?: BrowserComponentVersions;
  runtimeRegistration?: "registered" | "pending" | "unavailable";
  lastSuccessAt?: string;
  error?: { code: BrowserConnectionError; message: string };
  allowedActions?: readonly BrowserConnectionAction[];
  sourceRoot?: string;
  enabled?: boolean;
  revision?: number;
  selectedInstanceId?: string;
  instances?: BrowserBridgeInstance[];
  runtimeReady?: boolean;
  bridgeReady?: boolean;
  probeReady?: boolean;
  preparedHostVersion?: string;
  preparedExtensionVersion?: string;
  runningHostVersion?: string;
  runningExtensionVersion?: string;
  installed: boolean;
  abbPath: string;
  extensionDir?: string;
  runState: BrowserBridgeRunState;
  doctorSummary?: string;
  doctorChecks: BrowserBridgeDoctorCheck[];
  capabilitiesJson?: string;
  lastError?: string;
}

export type BrowserConnectionState = "disconnected" | "preparing" | "awaiting_extension" | "awaiting_selection" | "connecting" | "waiting_for_idle" | "connected" | "reconnecting" | "update_required" | "blocked" | "error";
export type BrowserConnectionLayer = "hostFile" | "registration" | "extension" | "socketProtocol" | "runtime" | "tools" | "probe";
export type BrowserLayerObservation = { status: "ok" | "pending" | "unknown" | "failed"; observedAt: string };
export type BrowserComponentVersions = { host?: string; extension?: string; protocol?: string };
export type BrowserConnectionAction = "connect" | "disconnect" | "retry" | "repairHost" | "prepareUpdate" | "openExtensions" | "revealExtensionDirectory";
export type BrowserConnectionError = "HOST_MISSING" | "REGISTRATION_INVALID" | "VERSION_INCOMPATIBLE" | "INSTANCE_CONFLICT" | "PROBE_FAILED" | "CHECK_FAILED";

export type BrowserBridgeInstallResult = {
  ok: boolean;
  abbPath?: string;
  extensionDir?: string;
  error?: string;
};

export type BrowserBridgeActionResult = {
  operationId?: string;
  ok: boolean;
  error?: string;
};
