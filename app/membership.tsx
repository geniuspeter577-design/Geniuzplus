import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentNotice } from '../src/components/ContentNotice';
import { useMembership } from '../src/hooks/useMembership';
import { createMemberCheckout } from '../src/services/MembershipClient';
import { useAuth } from '../src/state/AuthContext';
import { theme } from '../src/theme';
import { getProfileInitial } from '../src/utils/accountAuth';
import { formatMembershipDate } from '../src/utils/membership';

const PREMIUM_PLANS = [
  { id: 'monthly', label: 'Monthly', priceNgn: 919, months: 1 },
  { id: 'quarterly', label: 'Quarterly', priceNgn: 2298, months: 3 },
  { id: 'yearly', label: 'Yearly', priceNgn: 6616, months: 12 },
] as const;
type PlanId = (typeof PREMIUM_PLANS)[number]['id'];

export default function MembershipScreen() {
  const auth = useAuth();
  const membership = useMembership();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string>();
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('monthly');
  const paymentWasPending = useRef(false);
  const currentStatus = membership.status;
  const pendingReference = currentStatus?.pendingPayment?.reference;
  const refreshMembership = membership.refresh;
  const isOnline = membership.isOnline;
  const hasMemberAccess = currentStatus?.status === 'active' || currentStatus?.status === 'grace';

  useEffect(() => {
    if (currentStatus?.pendingPayment) {
      paymentWasPending.current = true;
    }
    if (paymentWasPending.current && hasMemberAccess && !currentStatus?.pendingPayment) {
      paymentWasPending.current = false;
      router.back();
    }
  }, [currentStatus, hasMemberAccess]);

  useEffect(() => {
    if (!pendingReference || !isOnline) {
      return undefined;
    }
    const timer = setInterval(() => void refreshMembership(), 8_000);
    return () => clearInterval(timer);
  }, [isOnline, pendingReference, refreshMembership]);

  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/profile');
    }
  };

  const handleMemberAction = async () => {
    setCheckoutError(undefined);
    if (!auth.session) {
      auth.openSignInSheet('sign-in');
      return;
    }
    if (hasMemberAccess) {
      return;
    }
    if (!membership.isOnline) {
      setCheckoutError('You’re offline. Reconnect to open secure checkout.');
      return;
    }
    setIsCheckingOut(true);
    try {
      const checkout = await createMemberCheckout(selectedPlan);
      const expectedKobo = (PREMIUM_PLANS.find((p) => p.id === selectedPlan)?.priceNgn ?? 0) * 100;
      if (checkout.amountKobo !== expectedKobo) {
        throw new Error('This plan price is not ready yet. Please update the app and try again.');
      }
      const checkoutUrl = new URL(checkout.authorizationUrl);
      console.log("Checkout URL diagnostic:", { protocol: checkoutUrl.protocol, hostname: checkoutUrl.hostname });
      const isPaystackUrl =
        checkoutUrl.hostname === 'paystack.com' || checkoutUrl.hostname === 'flutterwave.com' || checkoutUrl.hostname.endsWith('.flutterwave.com') ||
        checkoutUrl.hostname.endsWith('.paystack.com');
      const isFlutterwaveUrl =
        checkoutUrl.hostname === 'flutterwave.com' ||
        checkoutUrl.hostname.endsWith('.flutterwave.com');

      if (checkoutUrl.protocol !== 'https:' || (!isPaystackUrl && !isFlutterwaveUrl && !checkoutUrl.hostname.endsWith('.flutterwave.com.ng') && !checkoutUrl.hostname.endsWith('.dev-flutterwave.com'))) {
        throw new Error('Invalid payment link: ' + checkoutUrl.protocol + '//' + checkoutUrl.hostname);
      }
      const paymentUrl = checkoutUrl.toString();
      const browserResult = await WebBrowser.openBrowserAsync(paymentUrl);

      if (browserResult.type === 'cancel' || browserResult.type === 'dismiss') {
        // The user closed the checkout browser; keep the membership screen open.
      }

      const status = await membership.refresh();
      if (status?.status === 'active' || status?.status === 'grace') {
        close();
      } else if (status?.pendingPayment) {
        paymentWasPending.current = true;
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Checkout could not be opened. Please retry.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const displayName = auth.profile?.display_name || auth.session?.user.email || 'Visitor';
  const membershipUntil = membership.status?.status === 'grace'
    ? membership.status.graceUntil
    : membership.status?.currentPeriodEnd;
  const openLegalPage = async (url: string | undefined, title: string) => {
    if (!url) {
      setCheckoutError(`${title} is Coming soon.`);
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      setCheckoutError(`${title} could not be opened.`);
    }
  };
  const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL?.trim() || (process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '') ? `${process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '')}/legal/terms` : undefined);
  const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() || (process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '') ? `${process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '')}/legal/privacy` : undefined);

  const buttonDisabled =
    isCheckingOut || auth.isLoading || (Boolean(auth.session) && (!membership.isOnline || !membership.plan));
  const buttonLabel = isCheckingOut
    ? 'Opening secure checkout…'
    : !auth.session
      ? 'Sign in to continue'
      : membership.status?.pendingPayment
        ? 'Continue payment'
        : 'Get Premium';
  const perks: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { icon: 'eye-off-outline', label: 'Ad-free' },
    { icon: 'shield-checkmark-outline', label: 'Member badge' },
    { icon: 'swap-horizontal-outline', label: 'Send files' },
    { icon: 'cash-outline', label: 'Earn from Reels' },
  ];
  const compareRows = [
    'Ad-free viewing',
    'Member badge on your profile',
    'Send and receive files between devices',
    'Earn USD from Reels (eligible members)',
    'Member-only content',
    'Early access to new features',
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <View style={styles.userSection}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              {auth.profile?.avatar_url ? (
                <Image source={{ uri: auth.profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>{getProfileInitial(auth.profile?.display_name, auth.session?.user.email)}</Text>
              )}
            </View>
          </View>
          <View style={styles.userInfo}>
            <View style={styles.userTitleRow}>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              <View style={[styles.planBadge, hasMemberAccess && styles.planBadgeActive]}>
                <Text style={[styles.planBadgeText, hasMemberAccess && styles.planBadgeTextActive]}>
                  {hasMemberAccess ? 'MEMBER' : 'FREE'}
                </Text>
              </View>
            </View>
            <Text style={styles.validDate}>
              {hasMemberAccess ? 'Valid until ' + formatMembershipDate(membershipUntil) : 'Upgrade to unlock Premium'}
            </Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close Member page" onPress={close} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#2B2210', '#1A1D23', '#15171C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Geniuzplus Premium</Text>
              <Text style={styles.heroSubtitle}>Ad-free viewing, member badge and more</Text>
            </View>
            <LinearGradient colors={['#F5D77F', '#D4AF37', '#997316']} style={styles.crownBadge}>
              <Ionicons name="ribbon" size={26} color={theme.background} />
            </LinearGradient>
          </View>
          <View style={styles.perksRow}>
            {perks.map((perk) => (
              <View key={perk.label} style={styles.perkItem}>
                <View style={styles.perkIcon}>
                  <Ionicons name={perk.icon} size={20} color="#E8CA65" />
                </View>
                <Text style={styles.perkLabel}>{perk.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>CHOOSE YOUR PLAN</Text>
          <Text style={styles.sectionTag}>No automatic card charging</Text>
        </View>
        <View style={styles.plansRow}>
          {PREMIUM_PLANS.map((plan) => {
            const chosen = plan.id === selectedPlan;
            return (
              <Pressable
                key={plan.id}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                onPress={() => setSelectedPlan(plan.id)}
                style={[styles.planCard, chosen && styles.planCardChosen]}
              >
                {plan.id === 'yearly' ? (
                  <View style={styles.bestPill}>
                    <Text style={styles.bestPillText}>BEST VALUE</Text>
                  </View>
                ) : null}
                <Text style={styles.planName}>{plan.label}</Text>
                <Text style={styles.planPrice}>₦{new Intl.NumberFormat('en-NG').format(plan.priceNgn)}</Text>
                <Text style={styles.planInterval}>{plan.months === 1 ? '1 month' : plan.months + ' months'}</Text>
                <View style={styles.planDivider} />
                <Text style={[styles.planPerMonth, chosen && styles.planPerMonthChosen]}>
                  ₦{Math.round(plan.priceNgn / plan.months)} / mo
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tableCard}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.tableHead, { flex: 2.4 }]}>PREMIUM BENEFITS</Text>
            <Text style={[styles.tableHead, { flex: 1, textAlign: 'center' }]}>Free</Text>
            <Text style={[styles.tableHead, { color: '#E8CA65', flex: 1, textAlign: 'center' }]}>Premium</Text>
          </View>
          {compareRows.map((row, index) => (
            <View key={row} style={[styles.tableRow, index === compareRows.length - 1 && styles.tableRowLast]}>
              <Text style={styles.tableFeature}>{row}</Text>
              <View style={styles.tableCell}>
                <Ionicons name="close" size={16} color={theme.secondaryText} />
              </View>
              <View style={styles.tableCell}>
                <Ionicons name="checkmark-circle" size={18} color={theme.gold} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {hasMemberAccess ? (
          <Text style={styles.memberUntil}>
            {membership.status?.status === 'grace' ? 'Grace period until ' : 'Premium valid until '}
            {formatMembershipDate(membershipUntil)}
          </Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={buttonDisabled}
            onPress={() => void handleMemberAction()}
            style={[styles.upgradeWrap, buttonDisabled && styles.disabled]}
          >
            <LinearGradient
              colors={['#FBE38E', '#D4AF37', '#B38B1C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.upgradePill}
            >
              <Text style={styles.upgradeText}>{buttonLabel}</Text>
            </LinearGradient>
          </Pressable>
        )}
        {checkoutError ? <Text style={styles.errorText}>{checkoutError}</Text> : null}
        <Text style={styles.terms}>Premium lasts for the plan you choose (1, 3 or 12 months). No automatic card charging. Payment status updates after provider confirmation. Membership does not guarantee income.</Text>
        <View style={styles.legalLinks}>
          <Pressable accessibilityRole="link" onPress={() => void openLegalPage(termsUrl, 'Terms')}><Text style={styles.legalLink}>Terms</Text></Pressable>
          <Text style={styles.terms}>·</Text>
          <Pressable accessibilityRole="link" onPress={() => void openLegalPage(privacyUrl, 'Privacy')}><Text style={styles.legalLink}>Privacy</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: theme.background, flex: 1 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  userSection: { alignItems: 'center', flex: 1, flexDirection: 'row', marginRight: 12 },
  avatarRing: { alignItems: 'center', borderColor: theme.accent, borderRadius: 24, borderWidth: 1.5, height: 48, justifyContent: 'center', width: 48 },
  avatar: { alignItems: 'center', backgroundColor: theme.surfaceAlt, borderRadius: 20, height: 40, justifyContent: 'center', overflow: 'hidden', width: 40 },
  avatarImage: { height: '100%', width: '100%' },
  avatarInitial: { color: theme.accent, fontSize: 15, fontWeight: '800' },
  userInfo: { flex: 1, marginLeft: 10 },
  userTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  userName: { color: theme.text, flexShrink: 1, fontSize: 15, fontWeight: '700' },
  planBadge: { backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  planBadgeActive: { backgroundColor: 'rgba(212, 175, 55, 0.16)', borderColor: 'rgba(212, 175, 55, 0.5)' },
  planBadgeText: { color: theme.secondaryText, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  planBadgeTextActive: { color: '#E8CA65' },
  validDate: { color: theme.secondaryText, fontSize: 12, marginTop: 2 },
  closeButton: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  content: { paddingBottom: 24, paddingHorizontal: 16, paddingTop: 6 },
  heroCard: { borderColor: 'rgba(212, 175, 55, 0.4)', borderRadius: 24, borderWidth: 1, marginBottom: 24, padding: 20 },
  heroHeaderRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  heroTitle: { color: theme.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  heroSubtitle: { color: theme.secondaryText, fontSize: 13, marginTop: 4 },
  crownBadge: { alignItems: 'center', borderRadius: 26, height: 52, justifyContent: 'center', marginLeft: 12, width: 52 },
  perksRow: { borderTopColor: 'rgba(255, 255, 255, 0.08)', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, paddingTop: 16 },
  perkItem: { alignItems: 'center', flex: 1 },
  perkIcon: { alignItems: 'center', backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderRadius: 24, borderWidth: 1, height: 48, justifyContent: 'center', marginBottom: 6, width: 48 },
  perkLabel: { color: theme.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 2 },
  sectionTitle: { color: theme.secondaryText, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  sectionTag: { color: theme.accent, fontSize: 11, fontWeight: '600' },
  plansRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  planCard: { alignItems: 'center', backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 24, borderWidth: 1, flex: 1, paddingHorizontal: 6, paddingVertical: 18 },
  planCardChosen: { backgroundColor: '#1E2026', borderColor: theme.gold, borderWidth: 2 },
  bestPill: { backgroundColor: theme.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, position: 'absolute', top: -10 },
  bestPillText: { color: theme.background, fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  planName: { color: theme.secondaryText, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  planPrice: { color: theme.text, fontSize: 18, fontWeight: '800' },
  planInterval: { color: theme.secondaryText, fontSize: 11, marginTop: 2 },
  planDivider: { backgroundColor: theme.border, height: 1, marginVertical: 10, width: '80%' },
  planPerMonth: { color: theme.secondaryText, fontSize: 11, fontWeight: '600' },
  planPerMonthChosen: { color: '#E8CA65' },
  tableCard: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 24, borderWidth: 1, marginBottom: 8, padding: 18 },
  tableHeadRow: { alignItems: 'center', borderBottomColor: theme.border, borderBottomWidth: 1, flexDirection: 'row', marginBottom: 6, paddingBottom: 10 },
  tableHead: { color: theme.secondaryText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  tableRow: { alignItems: 'center', borderBottomColor: 'rgba(46, 52, 62, 0.5)', borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 12 },
  tableRowLast: { borderBottomWidth: 0 },
  tableFeature: { color: theme.text, flex: 2.4, fontSize: 13, fontWeight: '500', paddingRight: 8 },
  tableCell: { alignItems: 'center', flex: 1 },
  footer: { backgroundColor: theme.background, borderTopColor: theme.border, borderTopWidth: 1, gap: 9, paddingBottom: 10, paddingHorizontal: 20, paddingTop: 12 },
  upgradeWrap: { borderRadius: 28, overflow: 'hidden' },
  upgradePill: { alignItems: 'center', borderRadius: 28, justifyContent: 'center', minHeight: 54, paddingHorizontal: 16 },
  upgradeText: { color: '#101216', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  disabled: { opacity: 0.55 },
  errorText: { color: '#D64545', fontSize: 13, textAlign: 'center' },
  memberUntil: { color: theme.gold, fontSize: 16, fontWeight: '800', paddingVertical: 10, textAlign: 'center' },
  terms: { color: theme.secondaryText, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  legalLinks: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
  legalLink: { color: theme.accent, fontSize: 11, fontWeight: '700' },
});
