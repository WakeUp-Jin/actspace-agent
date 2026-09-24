export function sortToolContributions<T extends { readonly id: string; readonly layer: number; readonly order: number }>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values].sort((left, right) => left.layer - right.layer || left.order - right.order || left.id.localeCompare(right.id)));
}
