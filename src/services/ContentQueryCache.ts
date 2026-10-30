import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type CachedContentSource = 'mock' | 'tmdb' | 'supabase' | 'local' | 'api';
export type CachedContentEntry<T> = { data: T; source: CachedContentSource };

const CACHE_PREFIX = 'geniuzplus:content-cache:v1:';
const WEB_CACHE_NAME = 'geniuzplus-content-v1';
const MAX_CACHE_CHARS = 1_500_000;

function getWebCacheRequest(cacheKey: string): Request | null {
  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    return null;
  }
  const url = new URL(`/__geniuzplus_cache__/${encodeURIComponent(cacheKey)}`, window.location.origin);
  return new Request(url.toString());
}

function parseEntry<T>(raw: string | null): CachedContentEntry<T> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CachedContentEntry<T>;
    return parsed && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}

export async function readContentQueryCache<T>(cacheKey: string): Promise<CachedContentEntry<T> | null> {
  const request = Platform.OS === 'web' ? getWebCacheRequest(cacheKey) : null;
  if (request) {
    try {
      const cache = await caches.open(WEB_CACHE_NAME);
      const response = await cache.match(request);
      const entry = parseEntry<T>(response ? await response.text() : null);
      if (entry) {
        return entry;
      }
    } catch {
      // Continue to the platform storage fallback.
    }
  }

  let entry: CachedContentEntry<T> | null;
  try {
    entry = parseEntry<T>(await AsyncStorage.getItem(CACHE_PREFIX + cacheKey));
  } catch {
    return null;
  }
  if (entry && request) {
    try {
      const cache = await caches.open(WEB_CACHE_NAME);
      await cache.put(request, new Response(JSON.stringify(entry), {
        headers: { 'Content-Type': 'application/json' },
      }));
    } catch {
      // Keep using the platform storage entry.
    }
  }
  return entry;
}

export async function writeContentQueryCache<T>(cacheKey: string, entry: CachedContentEntry<T>) {
  try {
    const raw = JSON.stringify(entry);
    if (raw.length > MAX_CACHE_CHARS) {
      return;
    }
    const request = Platform.OS === 'web' ? getWebCacheRequest(cacheKey) : null;
    if (request) {
      try {
        const cache = await caches.open(WEB_CACHE_NAME);
        await cache.put(request, new Response(raw, {
          headers: { 'Content-Type': 'application/json' },
        }));
        return;
      } catch {
        // Continue to AsyncStorage if the browser cache is unavailable.
      }
    }
    await AsyncStorage.setItem(CACHE_PREFIX + cacheKey, raw);
  } catch {
    // Saving is best-effort; never interrupt catalog rendering.
  }
}
