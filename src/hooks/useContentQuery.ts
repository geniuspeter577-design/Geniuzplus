import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ContentQueryResult } from '../models/content';
import { getFriendlyCatalogErrorMessage } from '../utils/contentError';

export type ContentQueryState<T> = {
  data: T | null;
  source: 'mock' | 'tmdb' | 'supabase' | 'local' | 'api' | null;
  warning?: string;
  error?: string;
  isLoading: boolean;
  isRefreshing: boolean;
  retry: () => void;
};

type InternalQueryState<T> = Omit<ContentQueryState<T>, 'retry' | 'isLoading' | 'isRefreshing'> & {
  queryKey: string;
  attempt: number;
  isFetching: boolean;
};

type CachedEntry<T> = { data: T; source: ContentQueryState<T>['source'] };

const CACHE_PREFIX = 'geniuzplus:content-cache:v1:';
const MAX_CACHE_CHARS = 1_500_000;

async function readCache<T>(cacheKey: string): Promise<CachedEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + cacheKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedEntry<T>;
    return parsed && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache<T>(cacheKey: string, entry: CachedEntry<T>) {
  try {
    const raw = JSON.stringify(entry);
    if (raw.length > MAX_CACHE_CHARS) {
      return;
    }
    await AsyncStorage.setItem(CACHE_PREFIX + cacheKey, raw);
  } catch {
    // Saving is a bonus. Never break the screen because of it.
  }
}

function hasFailures(data: unknown) {
  return Boolean((data as { hasFailures?: boolean } | null)?.hasFailures);
}

function isDemo(data: unknown) {
  return Boolean((data as { showingDemo?: boolean } | null)?.showingDemo);
}

export function useContentQuery<T>(
  queryKey: string,
  load: () => Promise<ContentQueryResult<T>>,
  enabled = true,
  cacheKey?: string,
): ContentQueryState<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<InternalQueryState<T>>({
    data: null,
    source: null,
    queryKey: '',
    attempt: -1,
    isFetching: false,
  });
  const saved = useRef<CachedEntry<T> | null>(null);

  useEffect(() => {
    if (!cacheKey) {
      return undefined;
    }
    let active = true;
    void readCache<T>(cacheKey).then((cached) => {
      if (!active || !cached) {
        return;
      }
      saved.current = cached;
      setState((current) =>
        current.queryKey === queryKey && current.data !== null
          ? current
          : { queryKey, attempt: -1, data: cached.data, source: cached.source, isFetching: false },
      );
    });
    return () => {
      active = false;
    };
  }, [cacheKey, queryKey]);

  useEffect(() => {
    let active = true;
    if (!enabled) {
      return () => {
        active = false;
      };
    }

    Promise.resolve()
      .then(() => {
        if (!active) {
          return undefined;
        }
        setState((current) => ({
          queryKey,
          attempt,
          data: current.queryKey === queryKey ? current.data : null,
          source: current.queryKey === queryKey ? current.source : null,
          isFetching: true,
        }));
        return load();
      })
      .then((result) => {
        if (!active || !result) {
          return;
        }
        if (cacheKey && saved.current && hasFailures(result.data)) {
          setState({
            queryKey,
            attempt,
            data: saved.current.data,
            source: saved.current.source,
            isFetching: false,
          });
          return;
        }
        setState({
          queryKey,
          attempt,
          data: result.data,
          source: result.source,
          isFetching: false,
          ...(result.warning ? { warning: result.warning } : {}),
        });
        if (cacheKey && result.source !== 'mock' && !hasFailures(result.data) && !isDemo(result.data)) {
          const entry: CachedEntry<T> = { data: result.data, source: result.source };
          saved.current = entry;
          void writeCache(cacheKey, entry);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState((current) => ({
            queryKey,
            attempt,
            data: current.queryKey === queryKey ? current.data : null,
            source: current.queryKey === queryKey ? current.source : null,
            error: getFriendlyCatalogErrorMessage(error),
            isFetching: false,
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, cacheKey, enabled, load, queryKey]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const queryMatchesKey = state.queryKey === queryKey;
  const queryMatchesRequest = queryMatchesKey && state.attempt === attempt;
  const isFetching =
    enabled && (!queryMatchesRequest || (queryMatchesRequest && state.isFetching));

  return {
    data: queryMatchesKey ? state.data : null,
    source: queryMatchesKey ? state.source : null,
    warning: queryMatchesRequest ? state.warning : undefined,
    error: queryMatchesRequest ? state.error : undefined,
    isLoading: enabled && (!queryMatchesKey || (state.data === null && isFetching)),
    isRefreshing: queryMatchesKey && isFetching && state.data !== null,
    retry,
  };
}
