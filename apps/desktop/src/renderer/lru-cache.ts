/**
 * Least-recently-used cache bounded by total cost (bytes for images, 1 per entry for counts).
 * Map keeps insertion order, so re-inserting on read makes the first key the least recently used.
 * An entry costing more than the whole budget is not kept.
 */
export class LruCache<V> {
  readonly #entries = new Map<string, { value: V; cost: number }>();
  #total = 0;

  constructor(readonly maxCost: number) {
    if (!(maxCost > 0)) throw new RangeError("LruCache maxCost must be positive.");
  }

  get size(): number {
    return this.#entries.size;
  }
  get totalCost(): number {
    return this.#total;
  }

  /** Read and mark as most recently used. */
  get(key: string): V | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  /** Read without touching the recency order. */
  peek(key: string): V | undefined {
    return this.#entries.get(key)?.value;
  }

  set(key: string, value: V, cost = 1): void {
    this.delete(key);
    if (cost > this.maxCost) return;
    this.#entries.set(key, { value, cost });
    this.#total += cost;
    for (const [oldest, entry] of this.#entries) {
      if (this.#total <= this.maxCost) break;
      this.#entries.delete(oldest);
      this.#total -= entry.cost;
    }
  }

  delete(key: string): boolean {
    const entry = this.#entries.get(key);
    if (!entry) return false;
    this.#entries.delete(key);
    this.#total -= entry.cost;
    return true;
  }

  clear(): void {
    this.#entries.clear();
    this.#total = 0;
  }
}
