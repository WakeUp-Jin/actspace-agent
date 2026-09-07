export type LocatorKind = "css" | "role" | "text" | "label" | "placeholder" | "test_id";

export interface LocatorTarget {
  kind: LocatorKind;
  value?: string;
  role?: string;
  name?: string;
  exact?: boolean;
  framePath?: LocatorTarget[];
}

export interface LocatorParams {
  selector?: string;
  target?: LocatorTarget;
  timeoutMs?: number;
  state?: "attached" | "detached" | "visible" | "hidden";
  value?: string;
  checked?: boolean;
  name?: string;
  selections?: Array<{ value?: string; label?: string; valueOrLabel?: string }>;
  offset?: number;
  limit?: number;
  relativeSelector?: string;
  x?: number;
  y?: number;
  nodeId?: string;
  scrollX?: number;
  scrollY?: number;
  includeNonInteractable?: boolean;
  localCoordinates?: boolean;
  items?: ClipboardPayloadItem[];
  text?: string;
}

export interface ClipboardPayloadItem {
  entries: Array<{ mimeType?: string; mime_type?: string; text?: string; base64?: string }>;
  presentationStyle?: string;
  presentation_style?: string;
}

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActionPoint {
  x: number;
  y: number;
  box: ElementBox;
}

export interface ActionabilityState {
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  stable: boolean;
  receivesEvents: boolean;
  reason?: string;
}

export interface RuntimeAPI {
  version: string;
  buildHash: string;
  invoke(action: string, params: LocatorParams): Promise<unknown>;
  isVisible(element: Element): boolean;
  isEnabled(element: Element): boolean;
  isEditable(element: Element): boolean;
}

declare global {
  interface Window {
    __actspaceLocator?: RuntimeAPI;
  }
}
