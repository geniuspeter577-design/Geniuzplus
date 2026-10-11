import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../../state/AuthContext';
import { useDownloads } from '../../state/DownloadsContext';
import { useNetwork } from '../../state/NetworkContext';
import { useMembership } from '../../hooks/useMembership';
import { supabase } from '../../services/supabase';
import { addTransferHistoryEntry } from '../../services/TransferHistoryStore';
import {
  deviceTransferService,
  parseTransferConnectionCode,
} from '../../services/DeviceTransferService';
import type { OfflineDownloadRecord } from '../../services/OfflineDownloadService';
import type { TransferOfferItem } from '../../utils/deviceTransferProtocol';
import { theme } from '../../theme';

export function DeviceTransferPanel() {
  const auth = useAuth();
  const downloads = useDownloads();
  const { isOnline } = useNetwork();
  const membership = useMembership();
  const hasMemberAccess = membership.status?.status === 'active' || membership.status?.status === 'grace';
  const [receiveCode, setReceiveCode] = useState('');
  const [receiveExpiresAt, setReceiveExpiresAt] = useState('');
  const [sendCode, setSendCode] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    fileIndex?: number;
    fileCount?: number;
    completedBytes?: number;
    totalBytes?: number;
    title?: string;
  }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [isReceiving, setIsReceiving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [incomingOffer, setIncomingOffer] = useState<TransferOfferItem[]>();
  const [selectedIncomingIds, setSelectedIncomingIds] = useState<string[]>([]);
  const [batchRecords, setBatchRecords] = useState<OfflineDownloadRecord[]>([]);
  const [failedIndex, setFailedIndex] = useState<number>();
  const senderController = useRef<AbortController | null>(null);
  const incomingOfferResolver = useRef<((acceptedIds: string[]) => void) | undefined>(undefined);
  const receiveAvailable = useMemo(
    () => downloads.records.filter((record) => record.status === 'downloaded'),
    [downloads.records],
  );
  const selectedRecords = receiveAvailable.filter((record) => selectedIds.includes(record.item.id));
  const resolveIncomingOffer = (accepted: boolean) => {
    const resolve = incomingOfferResolver.current;
    if (!resolve) return;
    incomingOfferResolver.current = undefined;
    resolve(accepted ? selectedIncomingIds : []);
    setIncomingOffer(undefined);
    setSelectedIncomingIds([]);
  };

  const getAccessToken = useCallback(async () => {
    if (!auth.session || !supabase) {
      throw new Error('Sign in to start a device transfer.');
    }
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error('Your session could not be verified. Sign in again.');
    }
    const token = data.session?.access_token;
    if (!token) {
      throw new Error('Your session expired. Sign in again.');
    }
    return token;
  }, [auth.session]);

  const handleTransferError = (transferError: unknown) => {
    const message = transferError instanceof Error ? transferError.message : 'The transfer could not be completed.';
    if (message.toLocaleLowerCase().includes('membership_required') || message.toLocaleLowerCase().includes('active membership')) {
      router.push('/membership');
      return;
    }
    setError(message);
  };

  useEffect(() => () => {
    incomingOfferResolver.current?.([]);
    incomingOfferResolver.current = undefined;
    senderController.current?.abort();
    void deviceTransferService.stopReceiver().catch((stopError: unknown) => {
      console.error('[DeviceTransfer] Could not stop the receive server while leaving the screen.', stopError);
    });
  }, []);

  const startReceiving = async () => {
    setError(undefined);
    setNotice(undefined);
    if (!hasMemberAccess) {
      return;
    }
    if (!isOnline) {
      setError('Connect to the internet to authorize a transfer, then connect both devices to the same Wi-Fi or hotspot.');
      return;
    }
    try {
      const token = await getAccessToken();
      const receiver = await deviceTransferService.startReceiver(token, {
        canReceive: (contentId) => !downloads.records.some(
          (record) => record.item.id === contentId && record.status === 'downloaded',
        ),
        onProgress: (current, total) => setProgress({ current, total }),
        onIncomingBatch: (items) => new Promise((resolve) => {
          incomingOfferResolver.current?.([]);
          incomingOfferResolver.current = resolve;
          setIncomingOffer(items);
          setSelectedIncomingIds(items.map((item) => item.contentId));
          setNotice('Review the incoming videos and choose which ones to accept.');
        }),
        onReceived: async (item, filePath, size) => {
          await downloads.registerReceived(item, filePath, size);
          await addTransferHistoryEntry({ title: item.title, size, direction: 'received' });
        },
        onComplete: (title) => {
          setProgress(undefined);
          setNotice(`${title} was verified and added to Received.`);
        },
        onError: handleTransferError,
      });
      setReceiveCode(receiver.code);
      setReceiveExpiresAt(receiver.expiresAt);
      setIsReceiving(true);
      setNotice('Keep this screen open and share the receive code with the sender on the same Wi-Fi or hotspot.');
    } catch (startError) {
      handleTransferError(startError);
    }
  };

  const stopReceiving = async () => {
    setError(undefined);
    resolveIncomingOffer(false);
    try {
      await deviceTransferService.stopReceiver();
      setReceiveCode('');
      setReceiveExpiresAt('');
      setIsReceiving(false);
      setProgress(undefined);
      setNotice('Receive session stopped.');
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : 'The receive session could not be stopped.');
    }
  };

  const sendFiles = async (retryFrom?: number) => {
    setError(undefined);
    setNotice(undefined);
    if (!hasMemberAccess) {
      return;
    }
    if (!isOnline) {
      setError('Connect to the internet to authorize a transfer.');
      return;
    }
    const records = retryFrom === undefined ? selectedRecords : batchRecords;
    if (!records.length) {
      setError('Select at least one downloaded video to send.');
      return;
    }
    let address;
    try {
      address = parseTransferConnectionCode(sendCode);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Enter a valid receive code.');
      return;
    }
    const controller = new AbortController();
    senderController.current = controller;
    setIsSending(true);
    try {
      const token = await getAccessToken();
      let queuedRecords = records;
      let startIndex = retryFrom ?? 0;
      if (retryFrom === undefined) {
        const acceptedIds = await deviceTransferService.offerBatch({ address, records, signal: controller.signal });
        queuedRecords = records.filter((record) => acceptedIds.includes(record.item.id));
        if (!queuedRecords.length) {
          setNotice('The receiving device did not accept any videos.');
          return;
        }
        setBatchRecords(queuedRecords);
        setFailedIndex(undefined);
      }
      const totalBytes = queuedRecords.reduce((total, record) => total + record.size, 0);
      let completedBytes = queuedRecords.slice(0, startIndex).reduce((total, record) => total + record.size, 0);
      for (let index = startIndex; index < queuedRecords.length; index += 1) {
        const record = queuedRecords[index];
        setProgress({ current: 0, total: record.size, fileIndex: index + 1, fileCount: queuedRecords.length, completedBytes, totalBytes, title: record.item.title });
        try {
          await deviceTransferService.sendFile({
            address,
            record,
            accessToken: token,
            signal: controller.signal,
            onProgress: (current, total) => setProgress({ current, total, fileIndex: index + 1, fileCount: queuedRecords.length, completedBytes, totalBytes, title: record.item.title }),
          });
        } catch (sendError) {
          setFailedIndex(index);
          throw sendError;
        }
        await addTransferHistoryEntry({ title: record.item.title, size: record.size, direction: 'sent' });
        completedBytes += record.size;
      }
      setBatchRecords([]);
      setFailedIndex(undefined);
      setSelectedIds([]);
      setNotice(`${queuedRecords.length} video${queuedRecords.length === 1 ? '' : 's'} sent and verified by the receiving device.`);
    } catch (sendError) {
      handleTransferError(sendError);
    } finally {
      senderController.current = null;
      setProgress(undefined);
      setIsSending(false);
    }
  };

  const progressPercent = progress?.total
    ? Math.min(100, Math.floor((progress.current / progress.total) * 100))
    : 0;
  const overallProgressPercent = progress?.totalBytes
    ? Math.min(100, Math.floor(((progress.completedBytes ?? 0) + progress.current) / progress.totalBytes * 100))
    : progressPercent;
  const transferDisabled = !hasMemberAccess || membership.isLoading;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Device-to-device transfer</Text>
      <Text style={styles.description}>
        Both sending and receiving require active Member access, verified by the platform.
      </Text>
      {hasMemberAccess ? (
        <View style={styles.memberNotice}>
          <Text style={styles.memberNoticeTitle}>You are a member</Text>
        </View>
      ) : membership.status ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/membership')} style={styles.memberNotice}>
          <Text style={styles.memberNoticeTitle}>Transfer is for Members</Text>
          <Text style={styles.muted}>Upgrade to send and receive downloads.</Text>
          <Text style={styles.actionText}>View Membership</Text>
        </Pressable>
      ) : (
        <View style={styles.memberNotice}>
          <Text style={styles.memberNoticeTitle}>Membership status unavailable</Text>
          <Text style={styles.muted}>{membership.error ?? 'Checking membership status…'}</Text>
        </View>
      )}
      {!isOnline ? (
        <Text style={styles.muted}>
          Internet access is needed to authorize the transfer. Devices must also share a Wi-Fi network or hotspot.
        </Text>
      ) : null}
      <View style={[styles.section, transferDisabled && styles.gatedSection]}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Receive</Text>
          {transferDisabled ? <Text style={styles.lockLabel}>LOCKED</Text> : null}
        </View>
        <Text style={styles.muted}>Start a temporary receive session, then share its code with the sender. Review and choose incoming videos before accepting.</Text>
        {isReceiving ? (
          <>
            <Text selectable style={styles.code}>{receiveCode}</Text>
            <Text style={styles.muted}>
              Session expires {new Date(receiveExpiresAt).toLocaleTimeString()}.
            </Text>
            <Pressable onPress={() => void stopReceiving()} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Stop receiving</Text>
            </Pressable>
          </>
        ) : (
            <Pressable disabled={transferDisabled} onPress={() => void startReceiving()} style={[styles.action, transferDisabled && styles.disabled]}>
            <Ionicons name="radio-outline" size={18} color={theme.background} />
            <Text style={styles.actionText}>Start receiving</Text>
          </Pressable>
        )}
      </View>
      {incomingOffer ? (
        <View style={styles.incomingBatch}>
          <Text style={styles.sectionTitle}>Incoming videos</Text>
          <View style={styles.choiceControls}>
            <Pressable onPress={() => setSelectedIncomingIds(incomingOffer.map((item) => item.contentId))}><Text style={styles.choiceControlText}>Select all</Text></Pressable>
            <Pressable onPress={() => setSelectedIncomingIds([])}><Text style={styles.choiceControlText}>Clear</Text></Pressable>
          </View>
          {incomingOffer.map((item) => (
            <Pressable key={item.contentId} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIncomingIds.includes(item.contentId) }} onPress={() => setSelectedIncomingIds((current) => current.includes(item.contentId) ? current.filter((id) => id !== item.contentId) : [...current, item.contentId])} style={styles.choice}>
              <Ionicons name={selectedIncomingIds.includes(item.contentId) ? 'checkbox' : 'square-outline'} size={18} color={selectedIncomingIds.includes(item.contentId) ? theme.accent : theme.secondaryText} />
              <Text numberOfLines={1} style={styles.choiceText}>{item.title}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => resolveIncomingOffer(true)} style={styles.action}><Text style={styles.actionText}>Accept selected ({selectedIncomingIds.length})</Text></Pressable>
          <Pressable onPress={() => resolveIncomingOffer(false)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Decline</Text></Pressable>
        </View>
      ) : null}
      <View style={[styles.section, transferDisabled && styles.gatedSection]}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Send</Text>
          {transferDisabled ? <Text style={styles.lockLabel}>LOCKED</Text> : null}
        </View>
        <Text style={styles.muted}>Choose downloaded videos to send. The receiving device can review and decline individual videos.</Text>
        {receiveAvailable.length === 0 ? (
          <Text style={styles.muted}>Download a title to this device before sending.</Text>
        ) : (
          <>
          <View style={styles.choiceControls}>
            <Pressable disabled={transferDisabled || isSending} onPress={() => setSelectedIds(receiveAvailable.map((record) => record.item.id))}>
              <Text style={styles.choiceControlText}>Select all</Text>
            </Pressable>
            <Pressable disabled={transferDisabled || isSending} onPress={() => setSelectedIds([])}>
              <Text style={styles.choiceControlText}>Clear</Text>
            </Pressable>
          </View>
          <View style={styles.choices}>
            {receiveAvailable.map((record) => (
              <Pressable
                key={record.item.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedIds.includes(record.item.id), disabled: transferDisabled }}
                disabled={transferDisabled || isSending}
                onPress={() => setSelectedIds((current) => current.includes(record.item.id)
                  ? current.filter((id) => id !== record.item.id)
                  : [...current, record.item.id])}
                style={[styles.choice, selectedIds.includes(record.item.id) && styles.choiceSelected, (transferDisabled || isSending) && styles.disabled]}
              >
                <Ionicons name={selectedIds.includes(record.item.id) ? 'checkbox' : 'square-outline'} size={18} color={selectedIds.includes(record.item.id) ? theme.accent : theme.secondaryText} />
                <Text numberOfLines={1} style={styles.choiceText}>{record.item.title}</Text>
              </Pressable>
            ))}
          </View>
          </>
        )}
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSending && !transferDisabled}
          onChangeText={setSendCode}
          placeholder="Paste receive code"
          placeholderTextColor={theme.secondaryText}
          style={styles.input}
          value={sendCode}
        />
        {isSending ? (
          <Pressable
            onPress={() => senderController.current?.abort()}
            style={styles.secondaryAction}
          >
            <Text style={styles.secondaryActionText}>Cancel sending</Text>
          </Pressable>
        ) : (
          <Pressable
            disabled={transferDisabled || selectedRecords.length === 0 || receiveAvailable.length === 0}
            onPress={() => void sendFiles()}
            style={[styles.action, (transferDisabled || selectedRecords.length === 0 || receiveAvailable.length === 0) && styles.disabled]}
          >
            <Ionicons name="send-outline" size={17} color={theme.background} />
            <Text style={styles.actionText}>Send selected videos ({selectedRecords.length})</Text>
          </Pressable>
        )}
      </View>
      {progress ? (
        <View style={styles.progress}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          {progress.fileCount ? (
            <Text style={styles.muted}>File {progress.fileIndex} of {progress.fileCount}: {progress.title} · {progressPercent}% · Overall {overallProgressPercent}%</Text>
          ) : <Text style={styles.muted}>{progressPercent}% transferred</Text>}
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorGroup}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          {failedIndex !== undefined && !isSending ? <Pressable accessibilityRole="button" onPress={() => void sendFiles(failedIndex)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Retry failed video</Text></Pressable> : null}
        </View>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Text style={styles.footnote}>Device transfer requires a Geniuzplus development build. It is not available in Expo Go.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    gap: 12,
    marginTop: 18,
    padding: 16,
  },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  description: { color: theme.secondaryText, fontSize: 13, lineHeight: 19 },
  memberNotice: {
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  memberNoticeTitle: { color: theme.text, fontSize: 14, fontWeight: '700' },
  section: { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth, gap: 10, paddingTop: 14 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  lockLabel: { color: theme.warning, fontSize: 10, fontWeight: '800' },
  gatedSection: { opacity: 0.4 },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: '700' },
  muted: { color: theme.secondaryText, fontSize: 12, lineHeight: 17 },
  action: {
    alignItems: 'center',
    backgroundColor: theme.accent,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  actionText: { color: theme.background, fontSize: 14, fontWeight: '700' },
  secondaryAction: {
    alignItems: 'center',
    borderColor: theme.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  secondaryActionText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  code: {
    backgroundColor: theme.background,
    borderRadius: 8,
    color: theme.accent,
    fontSize: 12,
    lineHeight: 18,
    padding: 10,
  },
  choices: { gap: 8 },
  incomingBatch: { backgroundColor: theme.background, borderColor: theme.border, borderRadius: 10, borderWidth: 1, gap: 10, padding: 12 },
  choiceControls: { flexDirection: 'row', gap: 16 },
  choiceControlText: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  choice: { alignItems: 'center', borderColor: theme.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 10 },
  choiceSelected: { borderColor: theme.accent },
  choiceText: { color: theme.text, fontSize: 13 },
  input: {
    backgroundColor: theme.background,
    borderColor: theme.border,
    borderRadius: 10,
    borderWidth: 1,
    color: theme.text,
    fontSize: 13,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  disabled: { opacity: 0.45 },
  progress: { gap: 6 },
  progressTrack: { backgroundColor: theme.background, borderRadius: 4, height: 6, overflow: 'hidden' },
  progressFill: { backgroundColor: theme.accent, height: '100%' },
  error: { color: theme.error, fontSize: 13, lineHeight: 18 },
  errorGroup: { gap: 8 },
  notice: { color: theme.accent, fontSize: 13, lineHeight: 18 },
  footnote: { color: theme.secondaryText, fontSize: 11, lineHeight: 16 },
});
