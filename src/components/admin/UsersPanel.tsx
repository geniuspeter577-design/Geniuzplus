import React, { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { supabase } from '../../services/supabase';
import { theme } from '../../theme';

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

type UsersResponse = {
  total: number;
  appStats?: { signedInAccounts: number; signedInPhones: number; visitorPhones: number };
  page: number;
  pageSize: number;
  users: AdminUser[];
};

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

export function UsersPanel() {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const userCardBasis = width >= 1180 ? '31%' : width >= 760 ? '48%' : '100%';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [membersOnly, setMembersOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();

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
          : 'The user list could not be loaded (' + response.status + ': ' + (await response.text()).slice(0, 160) + ')');
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

  const removeUser = async (user: AdminUser) => {
    if (!supabase) return;
    setDeletingId(user.id);
    setError(undefined);
    try {
      const { data: s, error: se } = await supabase.auth.getSession();
      if (se || !s.session?.access_token) throw new Error('Admin sign-in is required.');
      const base = process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '');
      if (!base) throw new Error('The backend URL is not configured.');
      const response = await fetch(`${base}/admin/users/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, confirmPaid: user.hasBadge }),
      });
      if (!response.ok) {
        throw new Error(response.status === 400 || response.status === 403
          ? 'This account cannot be deleted (it is you or another admin).'
          : 'The user could not be deleted.');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The user could not be deleted.');
    } finally {
      setDeletingId(undefined);
    }
  };

  const sendBadge = async (user: AdminUser, action: 'grant' | 'remove', days: number) => {
    if (!supabase) return;
    setBusyId(user.id);
    setError(undefined);
    try {
      const { data: s, error: se } = await supabase.auth.getSession();
      if (se || !s.session?.access_token) throw new Error('Admin sign-in is required.');
      const base = process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '');
      if (!base) throw new Error('The backend URL is not configured.');
      const response = await fetch(`${base}/admin/users/badge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, action, days, confirmPaid: true }),
      });
      if (!response.ok) {
        throw new Error(response.status === 409
          ? 'Nothing changed: the badge state was different from what the list showed.'
          : 'The badge could not be changed.');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The badge could not be changed.');
    } finally {
      setBusyId(undefined);
    }
  };

  const askBadge = (user: AdminUser) => {
    const who = user.email ?? user.displayName ?? user.id;
    if (user.hasBadge) {
      Alert.alert('Remove badge?', `${who}\n\nThey lose Member access right now. If they paid for it, no money is refunded.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void sendBadge(user, 'remove', 0) },
      ]);
      return;
    }
    Alert.alert('Give Member badge', `${who}\n\nHow long should it last? (Tap outside to cancel.)`, [
      { text: '30 days', onPress: () => void sendBadge(user, 'grant', 30) },
      { text: '90 days', onPress: () => void sendBadge(user, 'grant', 90) },
      { text: '1 year', onPress: () => void sendBadge(user, 'grant', 365) },
    ], { cancelable: true });
  };

  const confirmDelete = (user: AdminUser) => {
    const who = user.email ?? user.displayName ?? user.id;
    const extra = user.hasBadge ? '\n\nThis person has an ACTIVE membership.' : '';
    Alert.alert(
      'Delete this user?',
      `${who}\n\nTheir login, profile and payment history will be erased. This cannot be undone.${extra}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void removeUser(user) },
      ],
    );
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const applySearch = () => {
    setPage(1);
    setQuery(search.trim());
  };
  const clearSearch = () => {
    setSearch('');
    setPage(1);
    setQuery('');
  };
  const stats = [
    { label: 'Accounts', value: data?.appStats?.signedInAccounts ?? '—', icon: 'people-outline' as const },
    { label: 'Signed-in phones', value: data?.appStats?.signedInPhones ?? '—', icon: 'phone-portrait-outline' as const },
    { label: 'Visitor phones', value: data?.appStats?.visitorPhones ?? '—', icon: 'phone-portrait-outline' as const },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Users</Text>
        {loading ? <ActivityIndicator color={theme.accent} /> : null}
      </View>
      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statTile}>
            <Ionicons name={stat.icon} size={18} color={theme.accent} />
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.toolbar, !isWide && styles.toolbarStack]}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={19} color={theme.secondaryText} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={applySearch}
            placeholder="Search name, email or username"
            placeholderTextColor={theme.secondaryText}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search users"
            style={styles.searchInput}
          />
          {search || query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear user search"
              onPress={clearSearch}
              hitSlop={8}
              style={styles.iconButton}
            >
              <Ionicons name="close-circle" size={20} color={theme.secondaryText} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search users"
            onPress={applySearch}
            style={styles.searchButton}
          >
            <Ionicons name="search" size={18} color={theme.background} />
          </Pressable>
        </View>
        <View style={styles.filterGroup} accessibilityLabel="Filter users">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !membersOnly }}
            onPress={() => { setPage(1); setMembersOnly(false); }}
            style={[styles.filterButton, !membersOnly && styles.filterButtonSelected]}
          >
            <Text style={[styles.filterText, !membersOnly && styles.filterTextSelected]}>All</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: membersOnly }}
            onPress={() => { setPage(1); setMembersOnly(true); }}
            style={[styles.filterButton, membersOnly && styles.filterButtonSelected]}
          >
            <Text style={[styles.filterText, membersOnly && styles.filterTextSelected]}>Members</Text>
          </Pressable>
        </View>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {data && data.users.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={24} color={theme.secondaryText} />
          <Text style={styles.emptyText}>No users found.</Text>
        </View>
      ) : null}
      <View style={styles.usersGrid}>
        {data?.users.map((user) => (
          <View key={user.id} style={[styles.userCard, { flexBasis: userCardBasis }]}>
            <View style={styles.userHeader}>
              <View style={styles.identity}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(user.displayName ?? user.email ?? user.id).slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.identityCopy}>
                  <Text style={styles.userName} numberOfLines={1}>{user.displayName ?? 'No name'}</Text>
                  <Text style={styles.userEmail} numberOfLines={1}>{user.email ?? 'No email'}</Text>
                </View>
              </View>
              <View style={[styles.memberBadge, !user.hasBadge && styles.noBadge]}>
                {user.hasBadge ? <Ionicons name="ribbon" size={13} color={theme.gold} /> : null}
                <Text style={[styles.memberBadgeText, !user.hasBadge && styles.noBadgeText]}>
                  {user.hasBadge ? 'Member' : 'No badge'}
                </Text>
              </View>
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.detailText} numberOfLines={1}>ID {user.publicId ?? '—'}</Text>
              <Text style={styles.detailText}>
                {user.hasBadge && user.membershipEnds
                  ? `Member until ${formatDate(user.membershipEnds)}`
                  : `Joined ${formatDate(user.joinedAt)}`}
              </Text>
            </View>
            <View style={styles.userActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busyId === user.id }}
                disabled={busyId === user.id}
                onPress={() => askBadge(user)}
                style={[styles.actionButton, styles.memberAction, busyId === user.id && styles.disabledButton]}
              >
                <Ionicons name={user.hasBadge ? 'ribbon-outline' : 'ribbon'} size={16} color={theme.gold} />
                <Text style={styles.memberActionText} numberOfLines={1}>
                  {busyId === user.id ? 'Working…' : user.hasBadge ? 'Remove badge' : 'Give badge'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: deletingId === user.id }}
                disabled={deletingId === user.id}
                onPress={() => confirmDelete(user)}
                style={[styles.actionButton, styles.deleteAction, deletingId === user.id && styles.disabledButton]}
              >
                <Ionicons name="trash-outline" size={16} color={theme.error} />
                <Text style={styles.deleteActionText} numberOfLines={1}>
                  {deletingId === user.id ? 'Deleting…' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
      {data && totalPages > 1 ? (
        <View style={styles.pagination}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous page"
            accessibilityState={{ disabled: page <= 1 }}
            disabled={page <= 1}
            onPress={() => setPage(page - 1)}
            style={[styles.pageButton, page <= 1 && styles.disabledButton]}
          >
            <Ionicons name="chevron-back" size={16} color={page <= 1 ? theme.secondaryText : theme.text} />
            <Text style={[styles.pageButtonText, page <= 1 && styles.pageButtonTextDisabled]}>Previous</Text>
          </Pressable>
          <Text style={styles.pageLabel}>Page {page} of {totalPages}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next page"
            accessibilityState={{ disabled: page >= totalPages }}
            disabled={page >= totalPages}
            onPress={() => setPage(page + 1)}
            style={[styles.pageButton, page >= totalPages && styles.disabledButton]}
          >
            <Text style={[styles.pageButtonText, page >= totalPages && styles.pageButtonTextDisabled]}>Next</Text>
            <Ionicons name="chevron-forward" size={16} color={page >= totalPages ? theme.secondaryText : theme.text} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'center', gap: 18, maxWidth: 1400, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: theme.text, fontSize: 24, fontWeight: '800' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statTile: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 100,
    minWidth: 88,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  statValue: { color: theme.text, fontSize: 21, fontWeight: '800' },
  statLabel: { color: theme.secondaryText, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  toolbar: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  toolbarStack: { alignItems: 'stretch', flexDirection: 'column' },
  searchBox: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingLeft: 13,
    paddingRight: 6,
  },
  searchInput: { color: theme.text, flex: 1, fontSize: 14, minWidth: 0, paddingVertical: 10 },
  iconButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 30 },
  searchButton: {
    alignItems: 'center',
    backgroundColor: theme.accent,
    borderRadius: 6,
    height: 36,
    justifyContent: 'center',
    width: 40,
  },
  filterGroup: {
    alignSelf: 'stretch',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  filterButton: { alignItems: 'center', borderRadius: 5, flex: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 14 },
  filterButtonSelected: { backgroundColor: theme.surfaceSoft },
  filterText: { color: theme.secondaryText, fontSize: 13, fontWeight: '700' },
  filterTextSelected: { color: theme.text },
  error: { color: theme.error, fontSize: 14, lineHeight: 20 },
  emptyState: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  emptyText: { color: theme.secondaryText, fontSize: 14 },
  usersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  userCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    gap: 14,
    minWidth: 0,
    padding: 15,
  },
  userHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  identity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
  avatar: {
    alignItems: 'center',
    backgroundColor: theme.surfaceAlt,
    borderColor: theme.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avatarText: { color: theme.accent, fontSize: 16, fontWeight: '800' },
  identityCopy: { flex: 1, gap: 3, minWidth: 0 },
  userName: { color: theme.text, fontSize: 15, fontWeight: '700' },
  userEmail: { color: theme.secondaryText, fontSize: 12 },
  memberBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  memberBadgeText: { color: theme.gold, fontSize: 11, fontWeight: '700' },
  noBadge: { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
  noBadgeText: { color: theme.secondaryText },
  userDetails: { borderTopColor: theme.border, borderTopWidth: 1, gap: 5, paddingTop: 10 },
  detailText: { color: theme.secondaryText, fontSize: 12 },
  userActions: { flexDirection: 'row', gap: 8 },
  actionButton: { alignItems: 'center', borderRadius: 6, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 40, paddingHorizontal: 8 },
  memberAction: { borderColor: 'rgba(212, 175, 55, 0.45)' },
  memberActionText: { color: theme.gold, fontSize: 12, fontWeight: '700' },
  deleteAction: { borderColor: 'rgba(255, 141, 141, 0.45)' },
  deleteActionText: { color: theme.error, fontSize: 12, fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  pageButton: { alignItems: 'center', borderColor: theme.border, borderRadius: 6, borderWidth: 1, flexDirection: 'row', gap: 3, minHeight: 40, paddingHorizontal: 10 },
  pageButtonText: { color: theme.text, fontSize: 12, fontWeight: '600' },
  pageButtonTextDisabled: { color: theme.secondaryText },
  pageLabel: { color: theme.secondaryText, fontSize: 13 },
});
