import { supabase } from './supabase';

export type TitleComment = {
  id: string;
  user_id: string | null;
  body: string;
  created_at: string;
  displayName: string;
};

const db = () => {
  if (!supabase) throw new Error('Comments are not configured.');
  return supabase as any;
};

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function loadTitleComments(titleId: string): Promise<TitleComment[]> {
  const { data, error } = await db()
    .from('title_comments')
    .select('id,user_id,body,created_at')
    .eq('title_id', titleId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  if (!rows.length) return [];
  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await db()
      .from('reel_creator_profiles')
      .select('id,display_name')
      .in('id', ids);
    ((profiles ?? []) as any[]).forEach((p) => names.set(p.id, p.display_name));
  }
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id ?? null,
    body: r.body,
    created_at: r.created_at,
    displayName: (r.user_id && names.get(r.user_id)) || 'Guest',
  }));
}

export async function addTitleComment(titleId: string, body: string) {
  const userId = await getCurrentUserId();
  const { error } = await db()
    .from('title_comments')
    .insert({ title_id: titleId, user_id: userId, body: body.trim() });
  if (error) throw new Error(error.message);
}

export async function deleteTitleComment(id: string) {
  const { error } = await db().from('title_comments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
