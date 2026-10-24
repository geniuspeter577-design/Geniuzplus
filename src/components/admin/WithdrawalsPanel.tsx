import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { supabase } from '../../services/supabase';

type Bank = { country: string; bank_name: string; account_name: string; account_number: string };
type Item = { id: string; userId: string; amountUsd: number; createdAt: string; bank: Bank | null };

const C = { text: '#FFFFFF', muted: '#9CA3AF', card: '#1F2937', border: '#374151', green: '#72F06A', error: '#F87171', dark: '#0E1014' };

async function api(path: string, init?: { method?: string; body?: string }) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '');
  if (!token) throw new Error('Admin sign-in is required.');
  if (!base) throw new Error('The backend URL is not configured.');
  const response = await fetch(base + path, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: init?.body,
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Admin session expired. Sign in again and retry.');
    throw new Error(body?.message ?? body?.error?.message ?? 'Something went wrong (' + response.status + ').');
  }
  return body;
}

export function WithdrawalsPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const body = await api('/admin/withdrawals');
      setItems((body.withdrawals ?? []) as Item[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The withdrawals could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markPaid = async (item: Item) => {
    const reference = (refs[item.id] ?? '').trim();
    if (reference.length < 3) {
      setError('Type the Flutterwave payment reference first.');
      return;
    }
    setBusyId(item.id);
    setError(undefined);
    setMessage(undefined);
    try {
      await api('/admin/withdrawals/paid', { method: 'POST', body: JSON.stringify({ id: item.id, reference }) });
      setMessage('Marked as paid: $' + item.amountUsd.toFixed(2));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It could not be marked as paid.');
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 }}>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>Pending withdrawals</Text>
        <Text style={{ color: C.muted }}>
          Pay the person in Flutterwave first, then type the payment reference and tap Mark as paid. This screen does not send money.
        </Text>
        <Pressable onPress={() => void load()} disabled={loading}>
          <Text style={{ color: C.green }}>{loading ? 'Loading…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={C.green} /> : null}
      {!loading && items.length === 0 && !error ? <Text style={{ color: C.muted }}>No pending withdrawals.</Text> : null}

      {items.map((item) => (
        <View key={item.id} style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 6 }}>
          <Text style={{ color: C.green, fontSize: 22, fontWeight: '700' }}>{'$' + item.amountUsd.toFixed(2)}</Text>
          <Text style={{ color: C.muted }}>Requested {new Date(item.createdAt).toLocaleString()}</Text>
          {item.bank ? (
            <View style={{ gap: 2 }}>
              <Text style={{ color: C.text }}>{item.bank.account_name}</Text>
              <Text style={{ color: C.text }}>{item.bank.bank_name}, {item.bank.country}</Text>
              <Text selectable style={{ color: C.text }}>Account number: {item.bank.account_number}</Text>
            </View>
          ) : (
            <Text style={{ color: C.error }}>This creator has no payout details saved. Do not pay yet.</Text>
          )}
          <TextInput
            value={refs[item.id] ?? ''}
            onChangeText={(text) => setRefs((current) => ({ ...current, [item.id]: text }))}
            placeholder="Flutterwave payment reference"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Flutterwave payment reference"
            style={{ color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginTop: 6 }}
          />
          <Pressable
            disabled={busyId === item.id}
            onPress={() => void markPaid(item)}
            style={{ padding: 14, borderRadius: 12, backgroundColor: busyId === item.id ? C.border : C.green }}
          >
            <Text style={{ color: C.dark, textAlign: 'center', fontWeight: '700' }}>{busyId === item.id ? 'Saving…' : 'Mark as paid'}</Text>
          </Pressable>
        </View>
      ))}

      {message ? <Text style={{ color: C.green }}>{message}</Text> : null}
      {error ? <Text style={{ color: C.error }}>{error}</Text> : null}
    </View>
  );
}
