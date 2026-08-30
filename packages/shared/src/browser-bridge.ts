/** Host capability DTOs for the optional browser-bridge binary. */

export type BrowserBridgeRunState =
  | "not_installed"
  | "host_not_installed"
  | "extension_offline"
  | "ready"
  | "error";

export interface BrowserBridgeDoctorCheck {
  name: string;
  status: string;
  backend?: string;
  detail: string;
}

export interface BrowserBridgeStatus {
  installed: boolean;
  abbPath: string;
  extensionDir?: string;
  runState: BrowserBridgeRunState;
  doctorSummary?: string;
  doctorChecks: BrowserBridgeDoctorCheck[];
  capabilitiesJson?: string;
  lastError?: string;
}

export type BrowserBridgeInstallResult = {
  ok: boolean;
  abbPath?: string;
  extensionDir?: string;
  error?: string;
};

export type BrowserBridgeActionResult = {
  ok: boolean;
  error?: string;
};
