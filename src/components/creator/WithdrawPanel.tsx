import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { supabase } from '../../services/supabase';

const C = { text: '#FFFFFF', muted: '#9CA3AF', card: '#1A1D23', border: '#374151', green: '#72F06A', error: '#F87171', dark: '#0E1014' };

function money(value: number) {
  return '$' + value.toFixed(2);
}

export function WithdrawPanel({ availableUsd }: { availableUsd: number }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const left = Math.max(0, Math.round((availableUsd - requested) * 100) / 100);

  const submit = async () => {
    setError(undefined);
    setMessage(undefined);
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (value < 5) {
      setError('The minimum withdrawal is $5.');
      return;
    }
    if (value > left) {
      setError('You do not have that much available.');
      return;
    }
    if (!supabase) {
      setError('Sign in to withdraw.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const base = process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '');
      if (!token) throw new Error('Sign in to withdraw.');
      if (!base) throw new Error('The server address is not configured.');
      const response = await fetch(base + '/api/creator/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ amountUsd: value }),
      });
      const body: any = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message ?? body?.error?.message ?? 'The withdrawal could not be requested. Try again.');
      }
      setRequested((current) => current + value);
      setAmount('');
      setMessage(body?.message ?? 'Your withdrawal was received. Payment arrives within 48 hours.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The withdrawal could not be requested. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 }}>
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>Withdraw earnings</Text>
      <Text style={{ color: C.muted }}>AVAILABLE</Text>
      <Text style={{ color: C.green, fontSize: 28, fontWeight: '700' }}>{money(left)}</Text>
      <Text style={{ color: C.muted }}>
        Minimum $5. Add your payout details first. After you request, payment arrives within 48 hours.
      </Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="Amount in USD"
        placeholderTextColor={C.muted}
        accessibilityLabel="Amount in USD"
        style={{ color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12 }}
      />
      <Pressable onPress={() => setAmount(String(left))} disabled={busy || left <= 0}>
        <Text style={{ color: C.green }}>Use all available</Text>
      </Pressable>
      <Pressable
        disabled={busy}
        onPress={() => void submit()}
        style={{ padding: 14, borderRadius: 12, backgroundColor: busy ? C.border : C.green }}
      >
        <Text style={{ color: C.dark, textAlign: 'center', fontWeight: '700' }}>{busy ? 'Sending…' : 'Withdraw'}</Text>
      </Pressable>
      {busy ? <ActivityIndicator color={C.green} /> : null}
      {message ? <Text style={{ color: C.green }}>{message}</Text> : null}
      {error ? <Text style={{ color: C.error }}>{error}</Text> : null}
    </View>
  );
}
