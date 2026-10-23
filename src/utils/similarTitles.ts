import type { ContentItem } from '../models/content';

const norm = (v: string) => v.trim().toLocaleLowerCase();
const KIND_GENRES = ['anime', 'animation', 'football', 'sports', 'documentary'];

export function rankSimilar(current: ContentItem, all: ContentItem[], limit = 12): ContentItem[] {
  const cur = new Set(current.genres.map(norm));
  const kinds = KIND_GENRES.filter((k) => cur.has(k));
  const others = all.filter((c) => c.id !== current.id);
  const scored = others
    .map((c) => {
      const g = c.genres.map(norm);
      const shared = g.filter((x) => cur.has(x)).length;
      const sameKind = !kinds.length || kinds.some((k) => g.includes(k));
      return { c, shared, sameKind, sameType: c.type === current.type };
    })
    .filter((x) => x.shared > 0 && x.sameKind)
    .sort((a, b) => b.shared * 2 + Number(b.sameType) - (a.shared * 2 + Number(a.sameType)))
    .map((x) => x.c);
  if (scored.length || kinds.length) return scored.slice(0, limit);
  return others.filter((c) => c.type === current.type).slice(0, limit);
}
