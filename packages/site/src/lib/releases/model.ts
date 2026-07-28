export interface ReleaseEntry {
  date: string;
  month: string;
  area: string;
  userValueHtml: string;
  summaryHtml: string;
  anchor: string;
  sourcePath: "docs/releases/feature-release-notes.md";
}

export interface ReleaseMonth {
  month: string;
  entries: ReleaseEntry[];
}
