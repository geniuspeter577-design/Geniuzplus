import { ApiClient, ApiError } from '../api/ApiClient';
import { GeniuzContentRepository } from '../repositories/GeniuzContentRepository';
import { MockContentRepository } from '../repositories/MockContentRepository';
import { logger } from '../utils/logger';
import { ContentService } from './ContentService';
import { supabase } from './supabase';

const geniuzApiUrl = process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim();
const mockRepository = new MockContentRepository();
let apiWakeupClient: ApiClient | undefined;
let geniuzApiRepository: GeniuzContentRepository | undefined;

function createContentService() {
  if (!geniuzApiUrl) {
    return new ContentService(mockRepository);
  }

  try {
    const apiClient = new ApiClient({ baseUrl: geniuzApiUrl });
    apiWakeupClient = new ApiClient({ baseUrl: geniuzApiUrl });
    geniuzApiRepository = new GeniuzContentRepository(apiClient);
    return new ContentService(geniuzApiRepository, mockRepository, true);
  } catch {
    logger.warn('[ContentService] Invalid EXPO_PUBLIC_GENIUZ_API_URL configuration.');
    return new ContentService(
      mockRepository,
      mockRepository,
      false,
      'The catalog API URL is invalid.',
    );
  }
}

export function prewarmContentApi() {
  void apiWakeupClient?.get('/health').catch(() => undefined);
}

const MEMBER_FOOTBALL_RETRY_MS = 10 * 60_000;
let memberFootballBlockedUntil = 0;

async function tryMemberFootball<T>(call: (accessToken: string) => Promise<T>): Promise<T | undefined> {
  if (!supabase || Date.now() < memberFootballBlockedUntil) {
    return undefined;
  }
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      return undefined;
    }
    return await call(token);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      memberFootballBlockedUntil = Date.now() + MEMBER_FOOTBALL_RETRY_MS;
    }
    return undefined;
  }
}

export async function getFootballMatches(date: string) {
  if (!geniuzApiRepository) {
    throw new Error('Football scores are not configured.');
  }
  const repository = geniuzApiRepository;
  const live = await tryMemberFootball((token) => repository.getMemberFootballMatches(date, token));
  return live ?? repository.getFootballMatches(date);
}

export async function getFootballUpcoming() {
  if (!geniuzApiRepository) {
    throw new Error('Football scores are not configured.');
  }
  const repository = geniuzApiRepository;
  const live = await tryMemberFootball((token) => repository.getMemberFootballUpcoming(token));
  return live ?? repository.getFootballUpcoming();
}

export async function getUpcomingReleases() {
  if (!geniuzApiRepository) {
    throw new Error('Upcoming releases are not configured.');
  }
  return geniuzApiRepository.getUpcomingReleases();
}

export async function getTmdbUpcoming() {
  if (!geniuzApiRepository) {
    throw new Error('Upcoming releases are not configured.');
  }
  return geniuzApiRepository.getUpcoming();
}

export async function getTmdbNowPlaying() {
  if (!geniuzApiRepository) {
    throw new Error('Now playing is not configured.');
  }
  return geniuzApiRepository.getNowPlaying();
}

export const contentService = createContentService();
