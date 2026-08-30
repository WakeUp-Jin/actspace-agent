export type ReleaseSectionType = "feature" | "improvement" | "fix";

export interface ReleaseSection {
  type: ReleaseSectionType;
  itemsHtml: string[];
}

export interface ReleaseEntry {
  date: string;
  month: string;
  title: string;
  sections: ReleaseSection[];
  anchor: string;
  sourcePath: "docs/releases/feature-release-notes.md";
}

export interface ReleaseMonth {
  month: string;
  entries: ReleaseEntry[];
}
