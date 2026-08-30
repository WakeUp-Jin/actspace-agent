export type SkillRecord = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly source: string;
  readonly contentDigest: string;
};

export class SkillCatalog {
  readonly #skills = new Map<string, SkillRecord>();

  add(skill: SkillRecord): void {
    if (this.#skills.has(skill.id)) return;
    this.#skills.set(skill.id, Object.freeze(skill));
  }

  get(id: string): SkillRecord | undefined { return this.#skills.get(id); }
  list(): readonly SkillRecord[] { return Object.freeze([...this.#skills.values()].sort((left, right) => left.id.localeCompare(right.id))); }
  toPromptCatalog(): readonly { readonly id: string; readonly name: string; readonly description: string; readonly location: string; readonly source: string }[] {
    return Object.freeze(this.list().map(({ id, name, description, path, source }) => Object.freeze({ id, name, description, location: path, source })));
  }
}
