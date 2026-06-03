export type SkillScope = "project" | "user";

export type SkillSource = "actspace" | "actspace-userData" | "agents" | "claude";

export type SkillStatus = "available" | "warning";

export interface SkillScanRoot {
  path: string;
  scope: SkillScope;
  source: SkillSource;
  priority: number;
}

export interface SkillSummary {
  name: string;
  description: string;
  location: string;
  directory: string;
  scope: SkillScope;
  source: SkillSource;
  status: SkillStatus;
  warning?: string;
}

export interface SkillRegistry {
  skills: SkillSummary[];
  shadowed: SkillSummary[];
  warnings: string[];
}

export interface ParsedSkillFile {
  name: string;
  description: string;
  body: string;
  warning?: string;
}

