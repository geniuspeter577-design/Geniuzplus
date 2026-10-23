import { supabase } from './supabase';

export type TitleComment = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  displayName: string;
};

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function loadTitleComments(titleId: string): Promise<TitleComment[]> {
  if (!supabase) throw new Error('Comments are not configured.');
  const { data, error } = await (supabase as any)
    .from('title_comments')
    .select('id,user_id,body,created_at')
    .eq('title_id', titleId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  if (!rows.length) return [];
  const ids = Array.from(new Set(rows.map((r) => r.user_id as string)));
  const { data: profiles } = await (supabase as any)
    .from('reel_creator_profiles')
    .select('id,display_name')
    .in('id', ids);
  const names = new Map(((profiles ?? []) as any[]).map((p) => [p.id as string, p.display_name as string]));
  return rows.map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    body: r.body as string,
    created_at: r.created_at as string,
    displayName: names.get(r.user_id as string) || 'User',
  }));
}

export async function addTitleComment(titleId: string, body: string) {
  if (!supabase) throw new Error('Comments are not configured.');
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Sign in to comment.');
  const { error } = await (supabase as any)
    .from('title_comments')
    .insert({ title_id: titleId, user_id: userId, body: body.trim() });
  if (error) throw new Error(error.message);
}

export async function deleteTitleComment(id: string) {
  if (!supabase) throw new Error('Comments are not configured.');
  const { error } = await (supabase as any).from('title_comments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
