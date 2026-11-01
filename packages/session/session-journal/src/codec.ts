import type { EventCodec } from "@actspace/cordis-adapter";
export const codecs: readonly EventCodec[] = [
  { type: "plugin/actspace.session.journal/session-metadata", ownerPluginId: "actspace.session.journal", currentVersion: 1, criticality: "ignorable", validate: () => undefined },
];
