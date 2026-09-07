export type SkillCatalogScope = "project" | "user";

export interface SkillCatalogItem {
  name: string;
  description: string;
  scope: SkillCatalogScope;
  source: string;
  location: string;
  directory: string;
  status: "available" | "warning";
  warning?: string;
  removable: boolean;
  enabledForAgent: boolean;
  shadowed: boolean;
}

export interface SkillListResult {
  items: SkillCatalogItem[];
  warnings: string[];
}

export type SkillInstallResult = {
  ok: boolean;
  canceled?: boolean;
  name?: string;
  error?: string;
};

export type SkillUninstallInput = {
  directory: string;
};

export type SkillUninstallResult = {
  ok: boolean;
  error?: string;
};
