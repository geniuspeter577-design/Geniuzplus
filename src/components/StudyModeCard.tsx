import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useStudyMode } from '../state/StudyModeContext';
import { theme } from '../theme';

export function StudyModeCard() {
  const study = useStudyMode();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setPin('');
    setMessage(undefined);
  };

  const submit = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setMessage('Enter exactly 4 digits.');
      return;
    }
    setBusy(true);
    try {
      if (study.enabled) {
        const ok = await study.turnOff(pin);
        if (!ok) {
          setMessage('Wrong PIN. Try again.');
          setPin('');
          return;
        }
      } else {
        await study.turnOn(pin);
      }
      close();
    } catch {
      setMessage('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={styles.title}>Study mode</Text>
          <Text style={styles.subtitle}>
            {study.enabled ? 'On. Only Education is shown. PIN needed to turn off.' : 'Show only Education. Protected by a 4-digit PIN.'}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Study mode"
          disabled={!study.isReady}
          onValueChange={() => setOpen(true)}
          value={study.enabled}
        />
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{study.enabled ? 'Enter PIN to turn off' : 'Choose a 4-digit PIN'}</Text>
            <TextInput
              autoFocus
              keyboardType="number-pad"
              maxLength={4}
              onChangeText={(text) => setPin(text.replace(/[^0-9]/g, ''))}
              secureTextEntry
              style={styles.input}
              value={pin}
            />
            {message ? <Text style={styles.error}>{message}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={styles.primary}>
              <Text style={styles.primaryText}>{study.enabled ? 'Turn off' : 'Turn on'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={close} style={styles.secondary}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 20, borderWidth: 1, marginBottom: 16, padding: 16 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  texts: { flex: 1, gap: 4 },
  title: { color: theme.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: theme.secondaryText, fontSize: 13, lineHeight: 18 },
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 24, borderWidth: 1, gap: 12, maxWidth: 420, padding: 24, width: '100%' },
  dialogTitle: { color: theme.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: 14, color: theme.text, fontSize: 24, fontWeight: '800', letterSpacing: 12, minHeight: 56, textAlign: 'center' },
  error: { color: '#FF6B6B', fontSize: 13, textAlign: 'center' },
  primary: { alignItems: 'center', backgroundColor: theme.accent, borderRadius: 26, justifyContent: 'center', minHeight: 52 },
  primaryText: { color: theme.background, fontSize: 15, fontWeight: '900' },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  secondaryText: { color: theme.secondaryText, fontSize: 14, fontWeight: '700' },
});
