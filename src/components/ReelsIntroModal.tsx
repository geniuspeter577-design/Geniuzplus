import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const KEY = 'geniuzplus.reelsIntroSeen';
let shownThisSession = false;

type Props = { isMember: boolean; onPost: () => void; onJoin: () => void };

export function ReelsIntroModal({ isMember, onPost, onJoin }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (shownThisSession) return;
      try {
        const storage = require('@react-native-async-storage/async-storage').default;
        const seen = await storage.getItem(KEY);
        if (alive && !seen) { shownThisSession = true; setVisible(true); }
      } catch {
        if (alive) { shownThisSession = true; setVisible(true); }
      }
    })();
    return () => { alive = false; };
  }, []);

  const close = async (after?: () => void) => {
    setVisible(false);
    try {
      const storage = require('@react-native-async-storage/async-storage').default;
      await storage.setItem(KEY, '1');
    } catch {}
    after?.();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => void close()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Post Reels on Geniuzplus</Text>
          <Text style={styles.body}>
            Members can earn from their Reels once they meet the eligibility requirements. Payouts are coming soon.
          </Text>
          <Pressable style={styles.primary} onPress={() => void close(isMember ? onPost : onJoin)}>
            <Text style={styles.primaryText}>{isMember ? 'Post a Reel' : 'Become a member'}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => void close()}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#14171C', borderRadius: 20, padding: 22 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  body: { color: '#C9CED6', fontSize: 15, lineHeight: 22, marginBottom: 18 },
  primary: { backgroundColor: '#72F06A', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#0E1014', fontSize: 16, fontWeight: '800' },
  secondary: { paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#C9CED6', fontSize: 15 },
});
