/**
 * Grant audiences Desktop trusts for "本会话允许" (`pluginId\0permissionDomain\0policyVersion`). A tool whose audience is
 * missing here gets no session-allow option on its approval card, and existing session grants never apply to it.
 */
export const DESKTOP_TRUSTED_GRANT_AUDIENCES: ReadonlySet<string> = new Set([
  "actspace.shell-tools\u0000bash\u00001",
  "actspace.filesystem-read\u0000filesystem-read\u00001",
  "actspace.filesystem-search\u0000filesystem-search\u00001",
  "actspace.filesystem-write\u0000filesystem-write\u00001",
  // read_document: its own domain, so read_file grants do not cover it and vice versa.
  "actspace.document\u0000document-read\u00001",
]);
