import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CREATOR_ELIGIBILITY } from '../../src/config/creatorEarnings';
import { loadCreatorCounts, loadCreatorEarnings, loadCreatorEarningsSummary, loadCreatorWithdrawals, type CreatorEarningsRow } from '../../src/services/ReelsRepository';
import { useAuth } from '../../src/state/AuthContext';
import { useMembership } from '../../src/hooks/useMembership';
import { theme } from '../../src/theme';
import { backOrReplace } from '../../src/utils/navigation';

type CreatorSection = 'overview' | 'eligibility' | 'history' | 'payout' | 'withdraw' | 'withdrawals';
type CreatorWithdrawal = { id: string; amount_usd: number; status: string; created_at: string };
const sections: { id: CreatorSection; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'overview', title: 'Earnings overview', icon: 'cash-outline' },
  { id: 'eligibility', title: 'Eligibility and progress', icon: 'ribbon-outline' },
  { id: 'history', title: 'Earnings history', icon: 'time-outline' },
  { id: 'payout', title: 'Payout method', icon: 'card-outline' },
  { id: 'withdraw', title: 'Withdraw', icon: 'wallet-outline' },
  { id: 'withdrawals', title: 'Withdrawal history', icon: 'receipt-outline' },
];

function money(value: number) {
  return `$${value.toFixed(2)} USD`;
}

export default function CreatorEarningsScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const section: CreatorSection = sections.some((item) => item.id === params.section)
    ? params.section as CreatorSection
    : 'overview';
  const auth = useAuth();
  const membership = useMembership();
  const [earnings, setEarnings] = useState<CreatorEarningsRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<CreatorWithdrawal[]>([]);
  const [summary, setSummary] = useState<{ totalEarnedUsd: number; availableUsd: number } | null>(null);
  const [metrics, setMetrics] = useState<{ followers: number; views: number; watchedSeconds: number }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const membershipKnown = membership.status !== null;
  const hasMemberAccess = membership.status?.status === 'active' || membership.status?.status === 'grace';
  const loadData = useCallback(async () => {
    if (membership.isLoading) {
      return;
    }
    if (!auth.session) {
      setIsLoading(false);
      return;
    }
    if (!hasMemberAccess) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [nextEarnings, nextWithdrawals, nextMetrics, nextSummary] = await Promise.all([
        loadCreatorEarnings(),
        loadCreatorWithdrawals(),
        loadCreatorCounts(auth.session.user.id),
        loadCreatorEarningsSummary(),
      ]);
      setEarnings(nextEarnings);
      setWithdrawals(nextWithdrawals);
      setMetrics(nextMetrics);
      setSummary(nextSummary);
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Creator data could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [auth.session, hasMemberAccess, membership.isLoading]);

  React.useEffect(() => {
    const timer = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => backOrReplace('/(tabs)/profile')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={21} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Creator tools</Text>
        <View style={styles.backButton} />
      </View>
      {isLoading || membership.isLoading ? <ActivityIndicator color={theme.accent} style={styles.loading} /> : null}
      {!membership.isLoading && !membershipKnown ? (
        <View style={styles.nonMember}>
          <Text style={styles.copy}>{membership.error ?? 'Membership status is unavailable.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => void membership.refresh()} style={styles.primaryButton}><Text style={styles.primaryText}>Retry</Text></Pressable>
        </View>
      ) : null}
      {!membership.isLoading && membershipKnown && !hasMemberAccess ? (
        <View style={styles.nonMember}>
          <Ionicons name="lock-closed-outline" size={34} color={theme.accent} />
          <Text style={styles.nonMemberTitle}>Become a member to start earning</Text>
          <Text style={styles.copy}>Anyone signed in can post Reels. Earnings are available only to eligible members. Membership does not guarantee income.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/membership')} style={styles.primaryButton}><Text style={styles.primaryText}>View Membership</Text></Pressable>
        </View>
      ) : null}
      {membershipKnown && hasMemberAccess ? (
        <ScrollView contentContainerStyle={styles.content}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
            {sections.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: item.id === section }} onPress={() => router.setParams({ section: item.id })} style={[styles.sectionTab, item.id === section && styles.activeSectionTab]}><Ionicons name={item.icon} size={16} color={item.id === section ? theme.accent : theme.secondaryText} /><Text style={[styles.sectionTabText, item.id === section && styles.activeSectionText]}>{item.title}</Text></Pressable>)}
          </ScrollView>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {section === 'overview' ? (
            <>
              {summary ? <View style={styles.balance}>
                <Text style={styles.eyebrow}>AVAILABLE EARNINGS</Text>
                <Text style={styles.amount}>{money(summary.availableUsd)}</Text>
                <Text style={styles.copy}>Earnings are recorded and calculated by Geniuzplus servers.</Text>
              </View> : null}
              <SectionLink title="Eligibility and progress" onPress={() => router.setParams({ section: 'eligibility' })} />
              <SectionLink title="Earnings history" onPress={() => router.setParams({ section: 'history' })} />
              <SectionLink title="Payout method" onPress={() => router.setParams({ section: 'payout' })} />
              <SectionLink title="Withdraw" onPress={() => router.setParams({ section: 'withdraw' })} />
              <SectionLink title="Withdrawal history" onPress={() => router.setParams({ section: 'withdrawals' })} />
              <Text style={styles.copy}>Membership does not guarantee income. Earnings depend on eligibility and future program rules.</Text>
            </>
          ) : null}
          {section === 'eligibility' ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Creator eligibility</Text>
              <Text style={styles.copy}>Progress is based on server-recorded account and Reel activity. Thresholds are configurable in the app source.</Text>
              {metrics ? <>
                <ProgressRow title="Followers" current={metrics.followers} target={CREATOR_ELIGIBILITY.minimumFollowers} />
                <ProgressRow title="Views" current={metrics.views} target={CREATOR_ELIGIBILITY.minimumViews} />
                <ProgressRow title="Watch time" current={metrics.watchedSeconds} target={CREATOR_ELIGIBILITY.minimumWatchSeconds} format={(value) => `${Math.floor(value / 3600)} h`} />
              </> : <Text style={styles.copy}>Creator metrics are unavailable until the database migration is deployed.</Text>}
              <Text style={styles.copy}>Meeting the thresholds does not guarantee earnings or approval.</Text>
            </View>
          ) : null}
          {section === 'history' ? <Ledger title="Earnings history" rows={earnings.map((row) => ({ id: row.id, amount: Number(row.amount_usd), label: row.description, date: row.created_at }))} empty="No earnings have been recorded." /> : null}
          {section === 'payout' ? <View style={styles.panel}><Text style={styles.panelTitle}>Payout method</Text><Text style={styles.copy}>Payout setup is Coming soon. No payout provider is connected for creator earnings.</Text><Pressable disabled style={[styles.primaryButton, styles.disabled]}><Text style={styles.primaryText}>Coming soon</Text></Pressable></View> : null}
          {section === 'withdraw' ? <View style={styles.panel}><Text style={styles.panelTitle}>Withdraw earnings</Text>{summary ? <><Text style={styles.eyebrow}>AVAILABLE</Text><Text style={styles.amount}>{money(summary.availableUsd)}</Text></> : null}<Text style={styles.copy}>Withdrawals are Coming soon until a payout provider and creator revenue source are configured.</Text><Pressable disabled style={[styles.primaryButton, styles.disabled]}><Text style={styles.primaryText}>Coming soon</Text></Pressable></View> : null}
          {section === 'withdrawals' ? <Ledger title="Withdrawal history" rows={withdrawals.map((row) => ({ id: row.id, amount: Number(row.amount_usd), label: row.status, date: row.created_at }))} empty="No withdrawals have been recorded." /> : null}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function SectionLink({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}><Text style={styles.linkText}>{title}</Text><Ionicons name="chevron-forward" size={19} color={theme.secondaryText} /></Pressable>;
}

function ProgressRow({ title, current, target, format = (value: number) => Math.floor(value).toLocaleString() }: { title: string; current: number; target: number; format?: (value: number) => string }) {
  const progress = Math.min(100, Math.floor(current / target * 100));
  return <View style={styles.progressRow}><View style={styles.progressHeading}><Text style={styles.progressTitle}>{title}</Text><Text style={styles.progressValue}>{format(current)} / {format(target)}</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View></View>;
}

function Ledger({ title, rows, empty }: { title: string; rows: { id: string; amount: number; label: string; date: string }[]; empty: string }) {
  return <View style={styles.panel}><Text style={styles.panelTitle}>{title}</Text>{rows.length ? rows.map((row) => <View key={row.id} style={styles.ledgerRow}><View style={styles.ledgerCopy}><Text style={styles.linkText}>{row.label}</Text><Text style={styles.copy}>{new Date(row.date).toLocaleDateString()}</Text></View><Text style={styles.ledgerAmount}>{money(row.amount)}</Text></View>) : <Text style={styles.copy}>{empty}</Text>}</View>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  backButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
  loading: { marginTop: 30 },
  content: { gap: 12, paddingHorizontal: 16, paddingBottom: 30 },
  sectionTabs: { gap: 8, paddingVertical: 5 },
  sectionTab: { alignItems: 'center', backgroundColor: theme.surface, borderRadius: 8, flexDirection: 'row', gap: 7, minHeight: 38, paddingHorizontal: 11 },
  activeSectionTab: { borderColor: theme.accent, borderWidth: 1 },
  sectionTabText: { color: theme.secondaryText, fontSize: 11, fontWeight: '700' },
  activeSectionText: { color: theme.accent },
  balance: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 12, borderWidth: 1, gap: 9, padding: 18 },
  eyebrow: { color: theme.secondaryText, fontSize: 11, fontWeight: '800' },
  amount: { color: theme.accent, fontSize: 30, fontWeight: '900' },
  copy: { color: theme.secondaryText, fontSize: 13, lineHeight: 19 },
  panel: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 12, borderWidth: 1, gap: 15, padding: 16 },
  panelTitle: { color: theme.text, fontSize: 18, fontWeight: '900' },
  link: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 14 },
  linkText: { color: theme.text, fontSize: 13, fontWeight: '700' },
  progressRow: { gap: 8 },
  progressHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  progressTitle: { color: theme.text, fontSize: 13, fontWeight: '700' },
  progressValue: { color: theme.secondaryText, fontSize: 12 },
  progressTrack: { backgroundColor: theme.background, borderRadius: 4, height: 7, overflow: 'hidden' },
  progressFill: { backgroundColor: theme.accent, height: '100%' },
  ledgerRow: { alignItems: 'center', borderTopColor: theme.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 12 },
  ledgerCopy: { flex: 1 },
  ledgerAmount: { color: theme.text, fontSize: 13, fontWeight: '800' },
  primaryButton: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 9, justifyContent: 'center', minHeight: 48 },
  primaryText: { color: theme.background, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  nonMember: { alignItems: 'center', gap: 14, padding: 24 },
  nonMemberTitle: { color: theme.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  error: { color: theme.error, fontSize: 12, paddingHorizontal: 16 },
});