import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VerifiedBadge } from '../../../src/components/VerifiedBadge';
import { isFollowingCreator, loadPublicCreatorCounts, loadCreatorProfile, loadReelsFeed, toggleReelRelation } from '../../../src/services/ReelsRepository';
import type { ReelFeedItem } from '../../../src/models/reel';
import { useAuth } from '../../../src/state/AuthContext';
import { useMembership } from '../../../src/hooks/useMembership';
import { theme } from '../../../src/theme';
import { backOrReplace } from '../../../src/utils/navigation';

type CreatorProfile = { id: string; display_name: string; username: string; avatar_url: string | null; is_member: boolean; bio?: string | null };
type CreatorCounts = { posts: number; followers: number; following: number };

export default function CreatorProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const membership = useMembership();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [counts, setCounts] = useState<CreatorCounts>();
  const [following, setFollowing] = useState(false);
  const [creatorReels, setCreatorReels] = useState<ReelFeedItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'reels'>('reels');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const isOwnProfile = auth.session?.user.id === id;
  const isMember = isOwnProfile
    ? membership.status?.status === 'active' || membership.status?.status === 'grace'
    : profile?.is_member ?? false;

  React.useEffect(() => {
    let active = true;
    void Promise.all([loadCreatorProfile(id), loadPublicCreatorCounts(id), isFollowingCreator(id), loadReelsFeed([], id)])
      .then(([creator, creatorCounts, follows, reels]) => {
        if (active) {
          setProfile(creator);
          setCounts(creatorCounts);
          setFollowing(follows);
          setCreatorReels(reels);
          setError(undefined);
        }
      }).catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Creator profile could not be loaded.');
      }).finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  const toggleFollow = useCallback(async () => {
    if (!auth.session) {
      auth.openSignInSheet('sign-in');
      return;
    }
    try {
      await toggleReelRelation('reel_follows', id, !following);
      setFollowing((value) => !value);
      setCounts((value) => value ? { ...value, followers: value.followers + (following ? -1 : 1) } : value);
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : 'Follow could not be updated.');
    }
  }, [auth, following, id]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => backOrReplace('/shorts')} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={21} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Creator</Text>
        <View style={styles.iconButton} />
      </View>
      {isLoading ? <ActivityIndicator color={theme.accent} style={styles.loading} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {profile ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileTop}>
            <View style={styles.avatarRing}>
              {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <Text style={styles.avatarInitial}>{profile.display_name.slice(0, 1).toUpperCase()}</Text>}
            </View>
            <View style={styles.nameLine}><Text style={styles.name} numberOfLines={1}>{profile.display_name}</Text>{isMember ? <VerifiedBadge /> : null}</View>
            <Text style={styles.username}>@{profile.username}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          </View>
          <View style={styles.counts}>
            <Count label="Posts" value={counts?.posts ?? 0} />
            <Count label="Followers" value={counts?.followers ?? 0} />
            <Count label="Following" value={counts?.following ?? 0} />
          </View>
          {!isOwnProfile ? <Pressable accessibilityRole="button" onPress={() => void toggleFollow()} style={styles.followButton}><Text style={styles.followText}>{following ? 'Following' : 'Follow'}</Text></Pressable> : null}
          <View style={styles.tabs}>
            {(['all', 'reels'] as const).map((tab) => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab }} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.selectedTab]}><Text style={[styles.tabText, activeTab === tab && styles.selectedTabText]}>{tab === 'all' ? 'All' : 'Reels'}</Text></Pressable>)}
          </View>
          {activeTab === 'all' ? <Text style={styles.sectionTitle}>All posts</Text> : null}
          {creatorReels.map((reel) => (
            <Pressable key={reel.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/shorts', params: { reelId: reel.id } })} style={styles.reelRow}>
              <View style={styles.reelIcon}><Ionicons name="play" size={17} color={theme.accent} /></View>
              <View style={styles.reelCopy}><Text style={styles.reelCaption} numberOfLines={2}>{reel.caption || 'Reel'}</Text><Text style={styles.username}>{new Date(reel.createdAt).toLocaleDateString()}</Text></View>
              <Text style={styles.username}>{reel.likeCount.toLocaleString()} likes</Text>
            </Pressable>
          ))}
          {creatorReels.length === 0 ? <Text style={styles.empty}>No Reels yet.</Text> : null}
        </ScrollView>
      ) : !isLoading && !error ? <Text style={styles.empty}>Creator profile not found.</Text> : null}
    </SafeAreaView>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return <View style={styles.count}><Text style={styles.countValue}>{value.toLocaleString()}</Text><Text style={styles.countLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 10 },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
  loading: { marginTop: 40 },
  content: { alignItems: 'center', padding: 20 },
  profileTop: { alignItems: 'center', gap: 7, paddingVertical: 18, width: '100%' },
  avatarRing: { alignItems: 'center', borderColor: theme.accent, borderRadius: 49, borderWidth: 3, height: 98, justifyContent: 'center', marginBottom: 6, overflow: 'hidden', width: 98 },
  avatar: { height: '100%', width: '100%' },
  avatarInitial: { color: theme.accent, fontSize: 36, fontWeight: '900' },
  nameLine: { alignItems: 'center', flexDirection: 'row', gap: 7, maxWidth: '100%' },
  name: { color: theme.text, fontSize: 22, fontWeight: '900', flexShrink: 1 },
  username: { color: theme.secondaryText, fontSize: 13 },
  bio: { color: theme.text, fontSize: 13, lineHeight: 19, maxWidth: 340, textAlign: 'center' },
  counts: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 14, width: '100%' },
  count: { alignItems: 'center', gap: 3 },
  countValue: { color: theme.text, fontSize: 18, fontWeight: '900' },
  countLabel: { color: theme.secondaryText, fontSize: 11 },
  followButton: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 9, justifyContent: 'center', minHeight: 44, width: '100%' },
  followText: { color: theme.background, fontSize: 14, fontWeight: '900' },
  tabs: { borderBottomColor: theme.border, borderBottomWidth: 1, flexDirection: 'row', marginTop: 22, width: '100%' },
  tab: { alignItems: 'center', flex: 1, minHeight: 42, justifyContent: 'center' },
  selectedTab: { borderBottomColor: theme.accent, borderBottomWidth: 2 },
  tabText: { color: theme.secondaryText, fontSize: 13, fontWeight: '700' },
  selectedTabText: { color: theme.accent },
  sectionTitle: { alignSelf: 'flex-start', color: theme.text, fontSize: 16, fontWeight: '800', paddingTop: 16 },
  reelRow: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 9, padding: 11, width: '100%' },
  reelIcon: { alignItems: 'center', backgroundColor: theme.background, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  reelCopy: { flex: 1, gap: 4, minWidth: 0 },
  reelCaption: { color: theme.text, fontSize: 13, fontWeight: '700' },
  empty: { color: theme.secondaryText, fontSize: 13, lineHeight: 19, padding: 22, textAlign: 'center' },
  error: { color: theme.error, padding: 20, textAlign: 'center' },
});