import type { ContentItem } from '../models/content';
import type { PublishedTitlesFilter } from '../repositories/SupabaseMovieRepository';
import { readContentQueryCache } from './ContentQueryCache';

type CachedCatalog = {
  movies: ContentItem[];
  series: ContentItem[];
  shorts: ContentItem[];
};

export async function getCachedCatalogItems(): Promise<ContentItem[] | null> {
  const cached = await readContentQueryCache<CachedCatalog>('home-catalog');
  if (!cached) {
    return null;
  }
  return [...cached.data.movies, ...cached.data.series, ...cached.data.shorts]
    .filter((item) => item.availability.discoverable)
    .sort((first, second) => (second.createdAt ?? '').localeCompare(first.createdAt ?? ''));
}

export async function getCachedCatalogItem(id: string): Promise<ContentItem | null> {
  const items = await getCachedCatalogItems();
  return items?.find((item) => item.id === id) ?? null;
}

export async function getCachedPublishedTitlesPage(
  filter: PublishedTitlesFilter,
  offset: number,
  pageSize: number,
): Promise<{ items: ContentItem[]; hasMore: boolean } | null> {
  let items: ContentItem[];
  if (filter.kind === 'upcoming') {
    const cached = await readContentQueryCache<ContentItem[]>('home-upcoming');
    if (!cached) {
      return null;
    }
    items = cached.data;
  } else {
    const cached = await getCachedCatalogItems();
    if (!cached) {
      return null;
    }
    items = cached;
  }

  const matches = items.filter((item) => {
    switch (filter.kind) {
      case 'trending':
        return item.availability.stream;
      case 'movies':
        return item.type === 'movie' && item.availability.stream;
      case 'series':
        return item.type === 'series';
      case 'shorts':
        return item.type === 'short' && item.availability.stream;
      case 'upcoming':
        return item.type === 'movie' && Boolean(item.releaseDate && item.releaseDate > new Date().toISOString().slice(0, 10));
      case 'category':
        return (item.categories ?? []).some((category) => category.toLocaleLowerCase() === filter.value.toLocaleLowerCase());
      case 'genre':
        return item.genres.some((genre) => genre.toLocaleLowerCase() === filter.value.toLocaleLowerCase());
    }
  });
  const start = Math.max(0, Math.floor(offset));
  const size = Math.max(1, Math.floor(pageSize));
  return {
    items: matches.slice(start, start + size),
    hasMore: start + size < matches.length,
  };
}
