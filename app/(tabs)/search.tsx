import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Keyboard,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentNotice } from '../../src/components/ContentNotice';
import { KeyboardAwareScrollView, KeyboardAwareTextInput } from '../../src/components/KeyboardAwareScrollView';
import { OfflineState } from '../../src/components/OfflineState';
import { TitleImage } from '../../src/components/TitleImage';
import { useContentQuery } from '../../src/hooks/useContentQuery';
import { MockContentRepository } from '../../src/repositories/MockContentRepository';
import { supabaseMovieRepository } from '../../src/repositories/SupabaseMovieRepository';
import { useNetwork } from '../../src/state/NetworkContext';
import { theme } from '../../src/theme';
import {
  isDemoCatalogEnabled,
  loadPublishedCatalog,
  searchPublishedCatalog,
  sortPublishedNewest,
} from '../../src/utils/publishedCatalog';

const demoRepository = new MockContentRepository();

export default function SearchScreen() {
  const { isOnline, retryConnection } = useNetwork();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const loadCatalog = useCallback(async () => {
    const catalog = await loadPublishedCatalog(
      () => {
        if (!supabaseMovieRepository) {
          throw new Error('Supabase catalog is not configured.');
        }
        return supabaseMovieRepository.getPublishedMovies();
      },
      () => {
        if (!supabaseMovieRepository) {
          throw new Error('Supabase catalog is not configured.');
        }
        return supabaseMovieRepository.getPublishedSeries();
      },
      () => {
        if (!supabaseMovieRepository) {
          throw new Error('Supabase catalog is not configured.');
        }
        return supabaseMovieRepository.getPublishedShorts();
      },
    );
    if (
      isDemoCatalogEnabled &&
      !catalog.hasFailures &&
      catalog.movies.length + catalog.series.length + catalog.shorts.length === 0
    ) {
      const demos = await demoRepository.getPopular();
      return {
        data: {
          ...catalog,
          movies: demos.filter((item) => item.type === 'movie'),
          series: demos.filter((item) => item.type === 'series'),
          shorts: [],
          showingDemo: true,
        },
        source: 'mock' as const,
      };
    }
    return { data: { ...catalog, showingDemo: false }, source: 'supabase' as const };
  }, []);
  const catalogQuery = useContentQuery('search-supabase-catalog', loadCatalog, isOnline);
  const catalogItems = useMemo(
    () => sortPublishedNewest([
      ...(catalogQuery.data?.movies ?? []),
      ...(catalogQuery.data?.series ?? []),
      ...(catalogQuery.data?.shorts ?? []),
    ]),
    [catalogQuery.data],
  );
  const genres = useMemo(
    () => [...new Set(catalogItems.flatMap((item) => item.genres))],
    [catalogItems],
  );
  const visibleItems = useMemo(() => {
    const searched = searchPublishedCatalog(catalogItems, debouncedQuery);
    return selectedGenre === 'All'
      ? searched
      : searched.filter((item) =>
          item.genres.some((genre) => genre.toLocaleLowerCase() === selectedGenre.toLocaleLowerCase()),
        );
  }, [catalogItems, debouncedQuery, selectedGenre]);
  const retry = catalogQuery.retry;
  const hasError = catalogQuery.error || catalogQuery.data?.hasFailures;

  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const typeIds = useMemo(
    () => ({
      movie: new Set((catalogQuery.data?.movies ?? []).map((item) => item.id)),
      series: new Set((catalogQuery.data?.series ?? []).map((item) => item.id)),
      short: new Set((catalogQuery.data?.shorts ?? []).map((item) => item.id)),
    }),
    [catalogQuery.data],
  );
  const tabItems = useMemo(
    () => (activeTab === 'all' ? visibleItems : visibleItems.filter((item) => typeIds[activeTab].has(item.id))),
    [activeTab, typeIds, visibleItems],
  );
  const spotlightItems = useMemo(() => catalogItems.slice(0, 6), [catalogItems]);

  if (!isOnline) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <OfflineState onRetry={() => void retryConnection()} />
      </SafeAreaView>
    );
  }

  const showRank = !debouncedQuery;
  const cardWidth = Math.round(screenWidth * 0.78);
  const runSearch = () => {
    Keyboard.dismiss();
    setDebouncedQuery(query.trim());
  };
  const openItem = (id: string) => router.push({ pathname: '/content/[id]', params: { id } });
  const showSpotlight = !debouncedQuery && activeTab === 'all' && selectedGenre === 'All' && spotlightItems.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={catalogQuery.isRefreshing}
            onRefresh={retry}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        <Text style={styles.header}>Discover</Text>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={theme.secondaryText} />
            <KeyboardAwareTextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search title, genre, or year"
              placeholderTextColor={theme.secondaryText}
              style={styles.input}
              accessibilityLabel="Search titles, genres, and years"
              returnKeyType="search"
              onSubmitEditing={runSearch}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
                onPress={() => {
                  setQuery('');
                  setDebouncedQuery('');
                }}
              >
                <Ionicons name="close-circle" size={18} color={theme.secondaryText} />
              </Pressable>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" onPress={runSearch} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>Search</Text>
          </Pressable>
        </View>

        {genres.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {['All', ...genres].map((genre) => (
              <Pressable
                key={genre}
                onPress={() => setSelectedGenre(genre)}
                style={[styles.chip, selectedGenre === genre && styles.activeChip]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedGenre === genre }}
              >
                <Text style={[styles.chipText, selectedGenre === genre && styles.activeChipText]}>{genre}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.tabsRow}>
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={styles.tab}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                {active ? <View style={styles.tabUnderline} /> : null}
              </Pressable>
            );
          })}
        </View>

        {hasError ? (
          <ContentNotice
            message={catalogQuery.error ?? 'Some titles could not be loaded. Please retry.'}
            tone="error"
            actionLabel="Retry"
            onAction={retry}
            autoHideMs={5000}
          />
        ) : null}
        {catalogQuery.data?.showingDemo ? (
          <ContentNotice message="Demo catalog — search results are sample content." />
        ) : null}
        {catalogQuery.isLoading ? <ContentNotice message="Loading published titles…" /> : null}

        {showSpotlight ? (
          <View>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>New on Geniuzplus</Text>
            </View>
            <ScrollView
              horizontal
              snapToInterval={cardWidth + 12}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              style={styles.carouselScroll}
              contentContainerStyle={styles.carousel}
            >
              {spotlightItems.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => openItem(item.id)}
                  style={[styles.spotCard, { width: cardWidth }]}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${item.title}`}
                >
                  <View style={styles.spotPoster}>
                    <TitleImage uri={item.posterUrl} style={styles.fillImage} />
                  </View>
                  <View style={styles.spotInfo}>
                    <View style={styles.typePill}>
                      <Text style={styles.typePillText}>{TYPE_LABEL[item.type] ?? item.type}</Text>
                    </View>
                    <Text style={styles.spotTitle} numberOfLines={1}>{item.title}</Text>
                    {item.description ? (
                      <Text style={styles.spotDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                    <Text style={styles.spotMeta} numberOfLines={1}>
                      {[item.year, item.genres[0]].filter(Boolean).join('  ·  ')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{debouncedQuery ? 'Results' : 'Newest titles'}</Text>
          {tabItems.length ? <Text style={styles.sectionCount}>{tabItems.length} titles</Text> : null}
        </View>

        {!catalogQuery.isLoading && !hasError && tabItems.length === 0 ? (
          <ContentNotice message={catalogItems.length ? 'No results' : 'No titles yet'} />
        ) : null}

        {tabItems.map((item, index) => {
          const rank = index + 1;
          const meta = [item.year, item.genres[0], item.contentRating].filter(Boolean).join('  ·  ');
          return (
            <Pressable
              key={item.id}
              onPress={() => openItem(item.id)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.title}`}
            >
              <View style={styles.posterWrap}>
                <View style={styles.posterClip}>
                  <TitleImage uri={item.posterUrl} style={styles.fillImage} />
                </View>
                {showRank ? (
                  <View style={[styles.rankBadge, { backgroundColor: rankColor(rank) }]}>
                    <Text style={styles.rankBadgeText}>{rank}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <View style={styles.rowMetaLine}>
                  {typeof item.rating === 'number' && item.rating > 0 ? (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={12} color={theme.gold} />
                      <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                    </View>
                  ) : null}
                  {meta ? <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text> : null}
                </View>
                <View style={styles.typePill}>
                  <Text style={styles.typePillText}>{TYPE_LABEL[item.type] ?? item.type}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.secondaryText} />
            </Pressable>
          );
        })}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

type TabId = 'all' | 'movie' | 'series' | 'short';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'movie', label: 'Movies' },
  { id: 'series', label: 'Series' },
  { id: 'short', label: 'Short TV' },
];

const TYPE_LABEL: Record<string, string> = { movie: 'Movie', series: 'Series', short: 'Short TV' };

function rankColor(rank: number) {
  if (rank === 1) return '#FF2E63';
  if (rank === 2) return '#FF9234';
  if (rank === 3) return theme.gold;
  return '#373E4D';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.background },
  content: { paddingHorizontal: 18, paddingBottom: 30 },
  header: { color: theme.text, fontSize: 30, fontWeight: '800', marginTop: 18, marginBottom: 16, letterSpacing: -0.9 },
  searchRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  searchBox: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 23, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, minHeight: 46, paddingHorizontal: 14 },
  input: { color: theme.text, flex: 1, fontSize: 15, paddingVertical: 4 },
  searchButton: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 23, height: 46, justifyContent: 'center', paddingHorizontal: 16 },
  searchButtonText: { color: theme.background, fontSize: 13, fontWeight: '800' },
  chipRow: { paddingRight: 18, paddingVertical: 16 },
  chip: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 999, borderWidth: 1, marginRight: 10, paddingHorizontal: 14, paddingVertical: 9 },
  activeChip: { backgroundColor: 'rgba(114, 240, 106, 0.1)', borderColor: theme.accent },
  chipText: { color: theme.secondaryText, fontSize: 12, fontWeight: '700' },
  activeChipText: { color: theme.accent },
  tabsRow: { borderBottomColor: theme.border, borderBottomWidth: 1, flexDirection: 'row', gap: 22, marginBottom: 16 },
  tab: { alignItems: 'center', paddingVertical: 10 },
  tabText: { color: theme.secondaryText, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: theme.text, fontWeight: '800' },
  tabUnderline: { backgroundColor: theme.accent, borderRadius: 2, bottom: -1, height: 3, position: 'absolute', width: '100%' },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
  sectionCount: { color: theme.secondaryText, fontSize: 12 },
  carouselScroll: { marginBottom: 16, marginHorizontal: -18 },
  carousel: { gap: 12, paddingHorizontal: 18 },
  spotCard: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 24, borderWidth: 1, flexDirection: 'row', padding: 12 },
  spotPoster: { backgroundColor: theme.surfaceAlt, borderRadius: 14, height: 110, overflow: 'hidden', width: 80 },
  spotInfo: { flex: 1, justifyContent: 'center', marginLeft: 12 },
  spotTitle: { color: theme.text, fontSize: 15, fontWeight: '700', marginTop: 4 },
  spotDesc: { color: theme.secondaryText, fontSize: 11, lineHeight: 15, marginTop: 4 },
  spotMeta: { color: theme.secondaryText, fontSize: 11, marginTop: 6 },
  typePill: { alignSelf: 'flex-start', backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  typePillText: { color: theme.secondaryText, fontSize: 10, fontWeight: '700' },
  row: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 24, borderWidth: 1, flexDirection: 'row', marginBottom: 12, padding: 12 },
  posterWrap: { height: 90, width: 64 },
  posterClip: { backgroundColor: theme.surfaceAlt, borderRadius: 14, height: '100%', overflow: 'hidden', width: '100%' },
  fillImage: { height: '100%', width: '100%' },
  rankBadge: { alignItems: 'center', borderRadius: 11, height: 22, justifyContent: 'center', left: -4, position: 'absolute', top: -4, width: 22 },
  rankBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  rowInfo: { flex: 1, gap: 6, marginLeft: 14, marginRight: 8 },
  rowTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  rowMetaLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  ratingText: { color: theme.gold, fontSize: 12, fontWeight: '700' },
  rowMeta: { color: theme.secondaryText, fontSize: 12 },
});
