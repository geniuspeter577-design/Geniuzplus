import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from 'react-native';

import { supabase } from '../../services/supabase';

type AdminUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  publicId: string | null;
  joinedAt: string;
  membershipStatus: string;
  membershipEnds: string | null;
  hasBadge: boolean;
};

type UsersResponse = { total: number; page: number; pageSize: number; users: AdminUser[] };

const COLORS = { text: '#FFFFFF', muted: '#9CA3AF', card: '#1F2937', border: '#374151', gold: '#F5C451', error: '#F87171' };

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

export function UsersPanel() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [membersOnly, setMembersOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error('Admin sign-in is required.');
      const apiBaseUrl = process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '');
      if (!apiBaseUrl) throw new Error('The backend URL is not configured.');
      const params = new URLSearchParams({ q: query, page: String(page) });
      if (membersOnly) params.set('members', '1');
      const response = await fetch(`${apiBaseUrl}/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });
      if (!response.ok) {
        throw new Error(response.status === 401 || response.status === 403
          ? 'Admin session expired. Sign in again and retry.'
          : 'The user list could not be loaded.');
      }
      setData((await response.json()) as UsersResponse);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'The user list could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [query, membersOnly, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '700' }}>Users{data ? ` (${data.total})` : ''}</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => { setPage(1); setQuery(search.trim()); }}
        placeholder="Search name, email or username"
        placeholderTextColor={COLORS.muted}
        autoCapitalize="none"
        returnKeyType="search"
        style={{ color: COLORS.text, borderColor: COLORS.border, borderWidth: 1, borderRadius: 8, padding: 10 }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.text }}>Members only</Text>
        <Switch value={membersOnly} onValueChange={(next) => { setPage(1); setMembersOnly(next); }} />
      </View>
      {loading ? <ActivityIndicator color={COLORS.gold} /> : null}
      {error ? <Text style={{ color: COLORS.error }}>{error}</Text> : null}
      {data && data.users.length === 0 && !loading ? <Text style={{ color: COLORS.muted }}>No users found.</Text> : null}
      {data?.users.map((user) => (
        <View key={user.id} style={{ backgroundColor: COLORS.card, borderRadius: 10, padding: 12, gap: 2 }}>
          <Text style={{ color: COLORS.text, fontWeight: '600' }}>{user.displayName ?? 'No name'}</Text>
          <Text style={{ color: COLORS.muted }}>{user.email ?? 'No email'}</Text>
          {user.publicId ? <Text style={{ color: COLORS.muted }}>ID {user.publicId}</Text> : null}
          <Text style={{ color: COLORS.muted }}>Joined {formatDate(user.joinedAt)}</Text>
          <Text style={{ color: user.hasBadge ? COLORS.gold : COLORS.muted }}>
            {user.hasBadge ? `Member${user.membershipEnds ? ` until ${formatDate(user.membershipEnds)}` : ''}` : 'No badge'}
          </Text>
        </View>
      ))}
      {data && totalPages > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable disabled={page <= 1} onPress={() => setPage(page - 1)}>
            <Text style={{ color: page <= 1 ? COLORS.muted : COLORS.gold }}>Previous</Text>
          </Pressable>
          <Text style={{ color: COLORS.muted }}>Page {page} of {totalPages}</Text>
          <Pressable disabled={page >= totalPages} onPress={() => setPage(page + 1)}>
            <Text style={{ color: page >= totalPages ? COLORS.muted : COLORS.gold }}>Next</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
