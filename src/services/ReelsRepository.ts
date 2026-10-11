import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ReelEdits, ReelFeedItem, ReelVisibility } from '../models/reel';
import type { ContentItem } from '../models/content';
import { supabase } from './supabase';

type ReelRow = {
  id: string;
  user_id: string;
  storage_path: string;
  caption: string;
  hashtags: string[];
  visibility: ReelVisibility;
  allow_comments: boolean;
  created_at: string;
  edits: ReelEdits | null;
};

type CreatorRow = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_member: boolean;
  bio?: string | null;
};

type RelationRow = { reel_id: string; user_id: string };
type CommentRow = { reel_id: string };

const REEL_INTEREST_KEY = '@geniuz/reels/interested/v1';
const REEL_HIDDEN_KEY = '@geniuz/reels/not-interested/v1';

function getBaseUrl() {
  const value = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (!value) {
    throw new Error('Reels are not configured.');
  }
  return value;
}

async function getRequestHeaders(contentType?: string) {
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabase || !key) {
    throw new Error('Reels are not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  const { data, error } = await supabase?.auth.getSession() ?? { data: { session: null }, error: null };
  if (error) {
    throw new Error('Your sign-in session could not be verified.');
  }
  return {
    apikey: key,
    Authorization: `Bearer ${data.session?.access_token ?? key}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await getRequestHeaders(
    init.body && typeof init.body === 'string' ? 'application/json' : undefined,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || 'The Reels service could not complete this request.');
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const bodyText = await response.text();
    return (bodyText ? JSON.parse(bodyText) : undefined) as T;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The Reels service request timed out. Check your connection and retry.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function inFilter(ids: string[]) {
  return `in.(${ids.join(',')})`;
}

export async function loadReelsFeed(legacyShorts: ContentItem[] = [], creatorId?: string): Promise<ReelFeedItem[]> {
  if (!supabase) {
    return [];
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  const hiddenIds = new Set(JSON.parse(await AsyncStorage.getItem(REEL_HIDDEN_KEY) ?? '[]') as string[]);
  const interestedIds = new Set(JSON.parse(await AsyncStorage.getItem(REEL_INTEREST_KEY) ?? '[]') as string[]);
  const creatorFilter = creatorId ? `&user_id=eq.${creatorId}` : '';
  const reels = await request<ReelRow[]>(`/rest/v1/reels?select=id,user_id,storage_path,caption,hashtags,visibility,allow_comments,created_at,edits&order=created_at.desc&limit=${creatorId ? 30 : 10}${creatorFilter}`);
  const userIds = [...new Set(reels.map((item) => item.user_id))];
  const reelIds = reels.map((item) => item.id);
  const [creators, likes, comments, saves, follows] = await Promise.all([
    userIds.length
      ? request<CreatorRow[]>(`/rest/v1/reel_creator_profiles?select=id,display_name,username,avatar_url,is_member&id=${inFilter(userIds)}`)
      : Promise.resolve([]),
    reelIds.length ? request<RelationRow[]>(`/rest/v1/reel_likes?select=reel_id,user_id&reel_id=${inFilter(reelIds)}`) : Promise.resolve([]),
    reelIds.length ? request<CommentRow[]>(`/rest/v1/reel_comments?select=reel_id&reel_id=${inFilter(reelIds)}`) : Promise.resolve([]),
    userId && reelIds.length ? request<RelationRow[]>(`/rest/v1/reel_saves?select=reel_id,user_id&user_id=eq.${userId}&reel_id=${inFilter(reelIds)}`) : Promise.resolve([]),
    userId && userIds.length ? request<{ creator_id: string }[]>(`/rest/v1/reel_follows?select=creator_id&follower_id=eq.${userId}&creator_id=${inFilter(userIds)}`) : Promise.resolve([]),
  ]);
  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
  const signed = await Promise.all(reels.map(async (reel) => {
    let result: { signedURL: string };
    try {
      result = await request<{ signedURL: string }>(`/storage/v1/object/sign/reels/${reel.storage_path}`, {
        method: 'POST',
        body: JSON.stringify({ expiresIn: 3600 }),
      });
    } catch {
      return null;
    }
    let audioUrl: string | undefined;
    if (reel.edits?.audioPath) {
      try {
        const signedAudio = await request<{ signedURL: string }>(`/storage/v1/object/sign/reels/${reel.edits.audioPath}`, {
          method: 'POST',
          body: JSON.stringify({ expiresIn: 3600 }),
        });
        audioUrl = signedAudio.signedURL.startsWith('http') ? signedAudio.signedURL : `${getBaseUrl()}/storage/v1${signedAudio.signedURL}`;
      } catch {
        audioUrl = undefined;
      }
    }
    const creator = creatorById.get(reel.user_id);
    if (!creator) {
      return null;
    }
    const likeRows = likes.filter((entry) => entry.reel_id === reel.id);
    return {
      id: reel.id,
      userId: reel.user_id,
      creatorName: creator.display_name,
      creatorUsername: creator.username,
      ...(creator.avatar_url ? { avatarUrl: creator.avatar_url } : {}),
      isMember: creator.is_member,
      videoUrl: result.signedURL.startsWith('http') ? result.signedURL : `${getBaseUrl()}/storage/v1${result.signedURL}`,
      caption: reel.caption,
      hashtags: reel.hashtags ?? [],
      createdAt: reel.created_at,
      likeCount: likeRows.length,
      commentCount: comments.filter((entry) => entry.reel_id === reel.id).length,
      isLiked: Boolean(userId && likeRows.some((entry) => entry.user_id === userId)),
      isSaved: saves.some((entry) => entry.reel_id === reel.id),
      isFollowing: follows.some((entry) => entry.creator_id === reel.user_id),
      allowComments: reel.allow_comments,
      isOwner: userId === reel.user_id,
      ...(reel.edits ? { edits: reel.edits } : {}),
      ...(audioUrl ? { audioUrl } : {}),
    } satisfies ReelFeedItem;
  }));
  const userItems = signed.filter((item): item is ReelFeedItem => item !== null && (creatorId !== undefined || !hiddenIds.has(item.id)));
  const legacyItems: ReelFeedItem[] = await Promise.all((creatorId ? [] : legacyShorts).map(async (item) => ({
    id: `catalog:${item.id}`,
    userId: '',
    creatorName: 'Geniuzplus',
    creatorUsername: 'geniuzplus',
    isMember: false,
    videoUrl: await supabaseMoviePlayback(item),
    caption: item.description ?? item.title,
    hashtags: [],
    createdAt: item.createdAt ?? new Date(0).toISOString(),
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
    isSaved: false,
    isFollowing: false,
    allowComments: false,
    isOwner: false,
  })));
  return [...userItems, ...legacyItems].sort((a, b) =>
    Number(interestedIds.has(b.id)) - Number(interestedIds.has(a.id)) ||
    b.createdAt.localeCompare(a.createdAt),
  );
}

async function supabaseMoviePlayback(item: ContentItem) {
  const { supabaseMovieRepository } = await import('../repositories/SupabaseMovieRepository');
  if (!supabaseMovieRepository) {
    throw new Error('Reels are not configured.');
  }
  return supabaseMovieRepository.getPlaybackUrl(item);
}

export async function toggleReelRelation(table: 'reel_likes' | 'reel_saves' | 'reel_follows', reelOrCreatorId: string, enabled: boolean) {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  const userId = data.session?.user.id;
  if (!userId) {
    throw new Error('Sign in to use this Reels action.');
  }
  const isFollow = table === 'reel_follows';
  const row = isFollow
    ? { follower_id: userId, creator_id: reelOrCreatorId }
    : { user_id: userId, reel_id: reelOrCreatorId };
  const filters = isFollow
    ? `follower_id=eq.${userId}&creator_id=eq.${reelOrCreatorId}`
    : `user_id=eq.${userId}&reel_id=eq.${reelOrCreatorId}`;
  if (enabled) {
    await request(`/rest/v1/${table}?on_conflict=${isFollow ? 'follower_id,creator_id' : 'reel_id,user_id'}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  } else {
    await request(`/rest/v1/${table}?${filters}`, { method: 'DELETE' });
  }
}

export async function addReelComment(reelId: string, body: string) {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  if (!data.session?.user.id) {
    throw new Error('Sign in to comment on Reels.');
  }
  await request('/rest/v1/reel_comments', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ reel_id: reelId, user_id: data.session.user.id, body: body.trim() }),
  });
}

export async function loadReelComments(reelId: string) {
  const comments = await request<{ id: string; user_id: string; body: string; created_at: string }[]>(
    `/rest/v1/reel_comments?select=id,user_id,body,created_at&reel_id=eq.${reelId}&order=created_at.asc&limit=100`,
  );
  if (!comments.length) {
    return [];
  }
  const creators = await request<CreatorRow[]>(
    `/rest/v1/reel_creator_profiles?select=id,display_name,username,avatar_url,is_member&id=${inFilter([...new Set(comments.map((comment) => comment.user_id))])}`,
  );
  const names = new Map(creators.map((creator) => [creator.id, creator.display_name]));
  return comments.map((comment) => ({ ...comment, displayName: names.get(comment.user_id) ?? 'Creator' }));
}

export async function reportReel(reelId: string, reason: string) {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  if (!data.session?.user.id) {
    throw new Error('Sign in to report a Reel.');
  }
  await request('/rest/v1/reel_reports', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ reel_id: reelId, user_id: data.session.user.id, reason }),
  });
}

export async function setReelInterest(reelId: string, interested: boolean) {
  const key = interested ? REEL_INTEREST_KEY : REEL_HIDDEN_KEY;
  const raw = await AsyncStorage.getItem(key);
  const current = new Set<string>(raw ? JSON.parse(raw) as string[] : []);
  if (interested) current.add(reelId);
  else current.add(reelId);
  await AsyncStorage.setItem(key, JSON.stringify([...current]));
}

export async function updateReel(reelId: string, updates: { caption?: string; allow_comments?: boolean; visibility?: ReelVisibility }) {
  const query = new URLSearchParams({ id: `eq.${reelId}` });
  await request(`/rest/v1/reels?${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(updates),
  });
}

export async function deleteReel(reelId: string) {
  const reel = (await request<ReelRow[]>(`/rest/v1/reels?select=id,storage_path&id=eq.${reelId}&limit=1`))[0];
  if (!reel) {
    return;
  }
  const headers = await getRequestHeaders('application/json');
  const deleteResponse = await fetch(`${getBaseUrl()}/storage/v1/object/reels/${reel.storage_path}`, { method: 'DELETE', headers });
  if (!deleteResponse.ok) {
    throw new Error('The Reel video could not be deleted.');
  }
  await request(`/rest/v1/reels?id=eq.${reelId}`, { method: 'DELETE' });
}

export async function uploadReel(
  asset: ImagePickerAsset,
  input: { caption: string; hashtags: string[]; visibility: ReelVisibility; edits?: ReelEdits | undefined; audio?: { uri: string; name?: string | undefined; mimeType?: string | undefined } | undefined },
  onProgress: (progress: number) => void,
) {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  const userId = data.session?.user.id;
  if (!userId) {
    throw new Error('Sign in to share a Reel.');
  }
  const reelId = crypto.randomUUID();
  const filename = asset.fileName?.replace(/[^a-zA-Z0-9._-]/g, '_') || `${reelId}.mp4`;
  const path = `${userId}/${reelId}/${filename}`;
  const file = new File(asset.uri);
  const headers = await getRequestHeaders(asset.mimeType ?? 'video/mp4');
  const uploadResult = await file.upload(`${getBaseUrl()}/storage/v1/object/reels/${path}`, {
    httpMethod: 'POST',
    headers,
    mimeType: asset.mimeType ?? 'video/mp4',
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) {
        onProgress(Math.min(99, Math.round((bytesSent / totalBytes) * 100)));
      }
    },
  });
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(uploadResult.body || 'The Reel video could not be uploaded.');
  }
  let finalEdits: ReelEdits | null = input.edits ?? null;
  if (input.audio) {
    try {
      const audioName = (input.audio.name ?? 'audio').replace(/[^a-zA-Z0-9._-]/g, '_');
      const audioPath = `${userId}/${reelId}/audio_${audioName}`;
      const audioMime = input.audio.mimeType ?? 'audio/mpeg';
      const audioHeaders = await getRequestHeaders(audioMime);
      const audioResult = await new File(input.audio.uri).upload(`${getBaseUrl()}/storage/v1/object/reels/${audioPath}`, {
        httpMethod: 'POST',
        headers: audioHeaders,
        mimeType: audioMime,
      });
      if (audioResult.status >= 200 && audioResult.status < 300) {
        finalEdits = { ...(finalEdits ?? {}), audioPath };
      }
    } catch {
      // the Reel is still posted, without the audio
    }
  }
  try {
    await request('/rest/v1/reels', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: reelId,
        user_id: userId,
        storage_path: path,
        caption: input.caption.trim(),
        hashtags: input.hashtags,
        visibility: input.visibility,
        edits: finalEdits,
        publish_at: computePublishAt(scheduleOnUpload.choice),
      }),
    });
  } catch (error) {
    await fetch(`${getBaseUrl()}/storage/v1/object/reels/${path}`, { method: 'DELETE', headers });
    throw error;
  }
  if (playlistOnUpload.enabled) {
    try {
      await addToPlaylist(reelId);
    } catch {
      // the Reel is still posted, even if the playlist save fails
    }
  }
  onProgress(100);
}

export async function recordReelWatch(reelId: string, watchedSeconds: number) {
  if (!supabase) {
    return;
  }
  await request('/rest/v1/rpc/record_reel_watch', {
    method: 'POST',
    body: JSON.stringify({ p_reel_id: reelId, p_watched_seconds: Math.min(30, Math.max(1, Math.floor(watchedSeconds))) }),
  });
}

export async function loadCreatorCounts(userId: string) {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  if (data.session?.user.id !== userId) {
    throw new Error('Sign in to load creator metrics.');
  }
  const rows = await request<{ posts: number; followers: number; following: number; views: number; watched_seconds: number }[]>(
    '/rest/v1/rpc/get_creator_metrics',
    { method: 'POST', body: JSON.stringify({ p_user_id: userId }) },
  );
  if (!rows.length) {
    throw new Error('Creator metrics are unavailable.');
  }
  return {
    posts: Number(rows[0].posts),
    followers: Number(rows[0].followers),
    following: Number(rows[0].following),
    views: Number(rows[0].views),
    watchedSeconds: Number(rows[0].watched_seconds),
  };
}

export async function loadCreatorProfile(userId: string) {
  const rows = await request<CreatorRow[]>(
    `/rest/v1/reel_creator_profiles?select=id,display_name,username,avatar_url,is_member,bio&id=eq.${userId}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function loadPublicCreatorCounts(userId: string) {
  const rows = await request<{ posts: number; followers: number; following: number }[]>(
    '/rest/v1/rpc/get_public_creator_counts',
    { method: 'POST', body: JSON.stringify({ p_user_id: userId }) },
  );
  if (!rows.length) {
    throw new Error('Creator counts are unavailable.');
  }
  return { posts: Number(rows[0].posts), followers: Number(rows[0].followers), following: Number(rows[0].following) };
}

export async function isFollowingCreator(creatorId: string) {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  const userId = data.session?.user.id;
  if (!userId) {
    return false;
  }
  const rows = await request<{ creator_id: string }[]>(
    `/rest/v1/reel_follows?select=creator_id&follower_id=eq.${userId}&creator_id=eq.${creatorId}&limit=1`,
  );
  return rows.length > 0;
}

export type CreatorEarningsRow = {
  id: string;
  amount_usd: number;
  description: string;
  created_at: string;
};

export async function loadCreatorEarnings() {
  return request<CreatorEarningsRow[]>('/rest/v1/creator_earnings?select=id,amount_usd,description,created_at&order=created_at.desc&limit=200');
}

export async function loadCreatorEarningsSummary() {
  const rows = await request<{ total_earned_usd: number; available_usd: number }[]>(
    '/rest/v1/rpc/get_creator_earnings_summary',
    { method: 'POST', body: '{}' },
  );
  if (!rows.length || !Number.isFinite(Number(rows[0].available_usd)) || !Number.isFinite(Number(rows[0].total_earned_usd))) {
    throw new Error('Creator earnings are unavailable.');
  }
  return {
    totalEarnedUsd: Number(rows[0].total_earned_usd),
    availableUsd: Number(rows[0].available_usd),
  };
}

export async function loadCreatorWithdrawals() {
  return request<{ id: string; amount_usd: number; status: string; created_at: string }[]>(
    '/rest/v1/creator_withdrawals?select=id,amount_usd,status,created_at&order=created_at.desc&limit=200',
  );
}

// ---- Playlist ----
async function playlistUserId() {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  const userId = data.session?.user.id;
  if (!supabase || !userId) {
    throw new Error('Sign in to use your playlist.');
  }
  return userId;
}

export async function addToPlaylist(reelId: string) {
  const userId = await playlistUserId();
  const client = supabase as any;
  const { error } = await client.from('reel_playlist_items').upsert(
    { user_id: userId, reel_id: reelId },
    { onConflict: 'user_id,reel_id', ignoreDuplicates: true },
  );
  if (error) {
    throw new Error(error.message);
  }
}

export async function removeFromPlaylist(reelId: string) {
  const userId = await playlistUserId();
  const client = supabase as any;
  const { error } = await client.from('reel_playlist_items').delete().eq('user_id', userId).eq('reel_id', reelId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function loadPlaylistReels(): Promise<ReelFeedItem[]> {
  const userId = await playlistUserId();
  const client = supabase as any;
  const { data, error } = await client
    .from('reel_playlist_items')
    .select('reel_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  const order: string[] = (data ?? []).map((row: { reel_id: string }) => row.reel_id);
  if (!order.length) {
    return [];
  }
  const all = await loadReelsFeed();
  return order
    .map((id) => all.find((reel) => reel.id === id))
    .filter((reel): reel is ReelFeedItem => Boolean(reel));
}

export const playlistOnUpload = { enabled: false };


export async function searchUsers(term: string) {
  const q = term.replace(/^@/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 24);
  if (!q) {
    return [];
  }
  return request<{ id: string; display_name: string; username: string; avatar_url?: string | null }[]>(
    `/rest/v1/reel_creator_profiles?select=id,display_name,username,avatar_url&or=(username.ilike.${encodeURIComponent(q)}*,display_name.ilike.*${encodeURIComponent(q)}*)&order=username.asc&limit=8`,
  );
}


export type ReelActivity = {
  id: string;
  kind: 'tag' | 'like' | 'comment' | 'save';
  reelId: string | null;
  createdAt: string;
  read: boolean;
  name: string;
  username: string;
  avatarUrl?: string;
};

export async function loadReelActivity(): Promise<ReelActivity[]> {
  const rows = await request<{ id: string; actor_id: string; kind: string; reel_id: string | null; created_at: string; read_at: string | null }[]>(
    '/rest/v1/reel_notifications?select=id,actor_id,kind,reel_id,created_at,read_at&order=created_at.desc&limit=50',
  );
  if (!rows.length) {
    return [];
  }
  const actors = await request<{ id: string; display_name: string; username: string; avatar_url: string | null }[]>(
    `/rest/v1/reel_creator_profiles?select=id,display_name,username,avatar_url&id=${inFilter([...new Set(rows.map((row) => row.actor_id))])}`,
  );
  const byId = new Map(actors.map((actor) => [actor.id, actor]));
  return rows.map((row) => {
    const actor = byId.get(row.actor_id);
    return {
      id: row.id,
      kind: row.kind as ReelActivity['kind'],
      reelId: row.reel_id,
      createdAt: row.created_at,
      read: Boolean(row.read_at),
      name: actor?.display_name ?? 'Someone',
      username: actor?.username ?? '',
      ...(actor?.avatar_url ? { avatarUrl: actor.avatar_url } : {}),
    };
  });
}

export async function markReelActivityRead(id?: string) {
  await request(`/rest/v1/reel_notifications?read_at=is.null${id ? `&id=eq.${id}` : ''}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  });
}

export const scheduleOnUpload: { choice: 'off' | 'hour' | 'tonight' | 'tomorrow' | 'three' } = { choice: 'off' };

function computePublishAt(choice: typeof scheduleOnUpload.choice): string | null {
  const now = new Date();
  if (choice === 'hour') {
    return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }
  if (choice === 'three') {
    return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (choice === 'tonight') {
    const when = new Date(now);
    when.setHours(20, 0, 0, 0);
    if (when.getTime() <= now.getTime()) {
      when.setDate(when.getDate() + 1);
    }
    return when.toISOString();
  }
  if (choice === 'tomorrow') {
    const when = new Date(now);
    when.setDate(when.getDate() + 1);
    when.setHours(9, 0, 0, 0);
    return when.toISOString();
  }
  return null;
}
