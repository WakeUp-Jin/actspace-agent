import type { Bundle } from "@actspace/bundle";
import { manifest } from "./manifest.js";

export const DESKTOP_APP_BUNDLE: Bundle = Object.freeze({
  id: "actspace.desktop-app",
  version: manifest.version,
  manifests: Object.freeze([manifest]),
  provenance: "@actspace/desktop-app",
});
