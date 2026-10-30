import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ContentItem } from '../models/content';
import { theme } from '../theme';
import { ContentNotice } from './ContentNotice';
import { PosterCard } from './PosterCard';
import { SectionHeader } from './SectionHeader';

type ContentRailProps = {
  title: string;
  items: ContentItem[];
  isLoading: boolean;
  error?: string;
  retry: () => void;
  onSeeAll: () => void;
  compact?: boolean;
  emptyMessage: string;
  showReleaseDate?: boolean;
};

export function ContentRail({
  title,
  items,
  isLoading,
  error,
  retry,
  onSeeAll,
  compact,
  emptyMessage,
  showReleaseDate = false,
}: ContentRailProps) {
  return (
    <>
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      {error ? (
        <ContentNotice
          message={error}
          tone="error"
          actionLabel="Retry"
          onAction={retry}
          autoHideMs={5000}
        />
      ) : null}
      {!isLoading && !error && items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowList}>
        {isLoading && items.length === 0 ? Array.from({ length: 5 }, (_, index) => (
          <View key={`poster-placeholder-${index}`} style={styles.posterPlaceholder} />
        )) : items.map((item) => (
          <PosterCard
            key={item.id}
            item={item}
            compact={compact}
            showReleaseDate={showReleaseDate}
            onPress={() => router.push({ pathname: '/content/[id]', params: { id: item.id } })}
          />
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    color: theme.secondaryText,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 4,
  },
  posterPlaceholder: {
    width: 176,
    height: 240,
    marginRight: 14,
    borderRadius: 8,
    backgroundColor: theme.surfaceAlt,
  },
  rowList: {
    paddingRight: 18,
    paddingBottom: 4,
  },
});
