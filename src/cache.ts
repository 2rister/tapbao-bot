import fs from 'fs';
import path from 'path';
import { config } from './config';

interface CacheEntry<T> {
  cachedAt: number;
  data: T;
}

function ensureCacheDir(): void {
  fs.mkdirSync(config.cacheDir, { recursive: true });
}

function cacheFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(config.cacheDir, `${safeKey}.json`);
}

export function readCache<T>(key: string): T | null {
  try {
    const raw = fs.readFileSync(cacheFilePath(key), 'utf-8');
    const entry = JSON.parse(raw) as CacheEntry<T>;
    const ageHours = (Date.now() - entry.cachedAt) / (1000 * 60 * 60);
    if (ageHours > config.cacheTtlHours) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  ensureCacheDir();
  const entry: CacheEntry<T> = { cachedAt: Date.now(), data };
  fs.writeFileSync(cacheFilePath(key), JSON.stringify(entry), 'utf-8');
}
