import { Image } from 'react-native';

type TitleImages = {
  posterUrl?: string | undefined;
  coverUrl?: string | undefined;
  backdropUrl?: string | undefined;
};

type CatalogImages = {
  movies?: TitleImages[] | undefined;
  series?: TitleImages[] | undefined;
} | null | undefined;

const requested = new Set<string>();
const PER_ROW = 16;
const MAX_IMAGES = 64;
const WORKERS = 4;

export function preloadTitleImages(catalog: CatalogImages) {
  if (!catalog) {
    return;
  }
  const queue: string[] = [];
  const add = (url?: string) => {
    if (url && /^https?:\/\//.test(url) && !requested.has(url) && queue.length < MAX_IMAGES) {
      requested.add(url);
      queue.push(url);
    }
  };
  const take = (items?: TitleImages[]) => {
    (items ?? []).slice(0, PER_ROW).forEach((item) => {
      add(item.coverUrl);
      add(item.posterUrl);
    });
  };
  take(catalog.movies);
  take(catalog.series);

  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        await Image.prefetch(url);
      } catch {
        requested.delete(url);
      }
    }
  };
  for (let i = 0; i < WORKERS; i += 1) {
    void worker();
  }
}
