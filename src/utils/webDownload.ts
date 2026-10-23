import type { ContentItem } from '../models/content';
import { supabaseMovieRepository } from '../repositories/SupabaseMovieRepository';

export async function webDownload(item: ContentItem): Promise<void> {
  const url = await supabaseMovieRepository.getDownloadUrl(item);
  const link = document.createElement('a');
  link.href = String(url);
  link.download = '';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}