import type { Bundle } from "@actspace/bundle";
import { manifest as englishLearningManifest } from "@actspace/english-learning/manifest";
import { manifest } from "./manifest.js";

export const DESKTOP_APP_BUNDLE: Bundle = Object.freeze({
  id: "actspace.desktop-app",
  version: manifest.version,
  manifests: Object.freeze([manifest, englishLearningManifest]),
  provenance: "@actspace/desktop-app",
});
