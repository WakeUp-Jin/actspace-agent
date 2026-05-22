/**
 * 会话存储骨架：统一存储接口 → 读穿写穿实现 → 工厂创建器
 */

// ─── 抽象接口 ───

interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface PersistentBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// ─── UnifiedStorage：读穿写穿编排 ───

interface StorageConfig {
  defaultTtl: number;
  enableReadThrough: boolean;
  enableWriteThrough: boolean;
}

class UnifiedStorage {
  constructor(
    private cache: CacheBackend,
    private persistent: PersistentBackend,
    private config: StorageConfig,
    private inflightQueries: Map<string, Promise<string | null>> = new Map()
  ) {}

  async get(key: string): Promise<string | null> {
    const cached = await this.cache.get(key);
    if (cached !== null) return cached;

    if (!this.config.enableReadThrough) return null;

    // Single-Flight：同 key 只发一次数据库查询
    const inflight = this.inflightQueries.get(key);
    if (inflight) return inflight;

    const query = this.persistent.get(key).then(async (value) => {
      if (value !== null) {
        await this.cache.set(key, value, this.config.defaultTtl);
      }
      this.inflightQueries.delete(key);
      return value;
    });

    this.inflightQueries.set(key, query);
    return query;
  }

  async set(key: string, value: string): Promise<void> {
    if (this.config.enableWriteThrough) {
      await this.persistent.set(key, value);
    }
    await this.cache.set(key, value, this.config.defaultTtl);
  }

  async delete(key: string): Promise<void> {
    await this.persistent.delete(key);
    await this.cache.delete(key);
  }
}

// ─── StorageFactory：按配置创建后端实例 ───

type CacheType = "redis" | "memory";
type PersistentType = "mysql" | "mongodb" | "memory";

interface FactoryConfig {
  cache: { type: CacheType; url?: string };
  persistent: { type: PersistentType; url?: string };
  defaultTtl: number;
  enableReadThrough: boolean;
  enableWriteThrough: boolean;
}

class StorageFactory {
  static create(config: FactoryConfig): UnifiedStorage {
    const cache = this.createCacheBackend(config.cache);
    const persistent = this.createPersistentBackend(config.persistent);

    return new UnifiedStorage(cache, persistent, {
      defaultTtl: config.defaultTtl,
      enableReadThrough: config.enableReadThrough,
      enableWriteThrough: config.enableWriteThrough,
    });
  }

  private static createCacheBackend(
    config: FactoryConfig["cache"]
  ): CacheBackend {
    switch (config.type) {
      case "redis":
        return new RedisCacheBackend(config.url!);
      case "memory":
        return new MemoryCacheBackend();
    }
  }

  private static createPersistentBackend(
    config: FactoryConfig["persistent"]
  ): PersistentBackend {
    switch (config.type) {
      case "mysql":
      case "mongodb":
        return new DatabaseBackend(config.type, config.url!);
      case "memory":
        return new MemoryPersistentBackend();
    }
  }
}

// ─── 具体后端实现（骨架） ───

class RedisCacheBackend implements CacheBackend {
  constructor(private url: string) {}
  async get(key: string) {
    /* redis.get(key) */
    return null;
  }
  async set(key: string, value: string, ttl?: number) {
    /* redis.set(key, value, 'EX', ttl) */
  }
  async delete(key: string) {
    /* redis.del(key) */
  }
}

class MemoryCacheBackend implements CacheBackend {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttl = 3600) {
    this.store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  }

  async delete(key: string) {
    this.store.delete(key);
  }
}

class DatabaseBackend implements PersistentBackend {
  constructor(private type: string, private url: string) {}
  async get(key: string) {
    /* db.query('SELECT value FROM sessions WHERE key = ?', [key]) */
    return null;
  }
  async set(key: string, value: string) {
    /* db.query('INSERT INTO sessions ... ON DUPLICATE KEY UPDATE', [key, value]) */
  }
  async delete(key: string) {
    /* db.query('DELETE FROM sessions WHERE key = ?', [key]) */
  }
}

class MemoryPersistentBackend implements PersistentBackend {
  private store = new Map<string, string>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

// ─── 使用示例 ───

const storage = StorageFactory.create({
  cache: { type: "redis", url: "redis://localhost:6379" },
  persistent: { type: "mysql", url: "mysql://localhost:3306/agent" },
  defaultTtl: 3600,
  enableReadThrough: true,
  enableWriteThrough: true,
});

// 透明地读写——不需关心缓存/数据库的编排细节
await storage.set("session:abc123", JSON.stringify({ messages: [], memory: {} }));
const session = await storage.get("session:abc123");
