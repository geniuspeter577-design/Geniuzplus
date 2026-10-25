import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { loadCreatorBankDetails, type CreatorBankDetails } from '../../services/ReelsRepository';
import { supabase } from '../../services/supabase';

const C = { text: '#FFFFFF', muted: '#9CA3AF', card: '#1A1D23', border: '#374151', green: '#72F06A', error: '#F87171', dark: '#0E1014' };

const EMPTY: CreatorBankDetails = { country: '', bank_name: '', account_name: '', account_number: '' };

function maskNumber(value: string) {
  return value.length <= 4 ? value : '•••• ' + value.slice(-4);
}

async function saveViaBackend(details: CreatorBankDetails, password: string) {
  if (!supabase) throw new Error('Sign in to save your payout details.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = process.env.EXPO_PUBLIC_GENIUZ_API_URL?.trim().replace(/\/+$/, '');
  if (!token) throw new Error('Sign in to save your payout details.');
  if (!base) throw new Error('The server address is not configured.');
  const response = await fetch(base + '/api/creator/bank-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      country: details.country,
      bankName: details.bank_name,
      accountName: details.account_name,
      accountNumber: details.account_number,
      password,
    }),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message ?? body?.error?.message ?? 'Your payout details could not be saved. Try again.');
  }
}

export function PayoutDetailsForm() {
  const [saved, setSaved] = useState<CreatorBankDetails | null>(null);
  const [form, setForm] = useState<CreatorBankDetails>(EMPTY);
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const details = await loadCreatorBankDetails();
      setSaved(details);
      setEditing(!details);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your payout details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    setMessage(undefined);
    try {
      if (!password) throw new Error('Enter your password to save.');
      await saveViaBackend(form, password);
      setPassword('');
      setForm(EMPTY);
      setMessage('Payout details saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your payout details could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof CreatorBankDetails, secure?: boolean) => (
    <View style={{ gap: 4 }}>
      <Text style={{ color: C.muted }}>{label}</Text>
      <TextInput
        value={form[key]}
        onChangeText={(text) => setForm((current) => ({ ...current, [key]: text }))}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={false}
        placeholderTextColor={C.muted}
        style={{ color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12 }}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 }}>
      <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>Payout details</Text>
      <Text style={{ color: C.muted }}>
        This is where we send your money after you withdraw. Only you and the Geniuzplus admin can see these details.
      </Text>

      {loading ? <ActivityIndicator color={C.green} /> : null}

      {!loading && saved && !editing ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: C.text }}>{saved.account_name}</Text>
          <Text style={{ color: C.text }}>{saved.bank_name}, {saved.country}</Text>
          <Text style={{ color: C.text }}>Account {maskNumber(saved.account_number)}</Text>
          <Pressable onPress={() => { setForm(EMPTY); setEditing(true); setMessage(undefined); }} style={{ marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.green }}>
            <Text style={{ color: C.green, textAlign: 'center', fontWeight: '700' }}>Change details</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && editing ? (
        <View style={{ gap: 10 }}>
          {field('Country', 'country')}
          {field('Bank name', 'bank_name')}
          {field('Account name', 'account_name')}
          {field('Account number', 'account_number')}
          <View style={{ gap: 4 }}>
            <Text style={{ color: C.muted }}>Your Geniuzplus password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={C.muted}
              style={{ color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12 }}
              accessibilityLabel="Your Geniuzplus password"
            />
          </View>
          <Pressable disabled={saving} onPress={() => void save()} style={{ padding: 14, borderRadius: 12, backgroundColor: saving ? C.border : C.green }}>
            <Text style={{ color: C.dark, textAlign: 'center', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save payout details'}</Text>
          </Pressable>
          {saved ? (
            <Pressable onPress={() => { setEditing(false); setForm(EMPTY); }} style={{ padding: 10 }}>
              <Text style={{ color: C.muted, textAlign: 'center' }}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {message ? <Text style={{ color: C.green }}>{message}</Text> : null}
      {error ? <Text style={{ color: C.error }}>{error}</Text> : null}
    </View>
  );
}
