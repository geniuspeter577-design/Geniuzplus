import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '../../theme';
import {
  addTitleComment,
  deleteTitleComment,
  getCurrentUserId,
  loadTitleComments,
  type TitleComment,
} from '../../services/TitleCommentsRepository';

export function TitleComments({ titleId }: { titleId: string }) {
  const [comments, setComments] = useState<TitleComment[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const lift = useRef(new Animated.Value(0)).current;
  const moveTo = (value: number) =>
    Animated.timing(lift, { toValue: value, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();

  const refresh = useCallback(async () => {
    try {
      const [list, uid] = await Promise.all([loadTitleComments(titleId), getCurrentUserId()]);
      setComments(list);
      setUserId(uid);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load comments.');
    } finally {
      setLoading(false);
    }
  }, [titleId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await addTitleComment(titleId, text);
      setText('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post comment.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteTitleComment(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete comment.');
    }
  };

  return (
    <View style={styles.wrap}>
      {true ? (
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write what you think about this title..."
            placeholderTextColor={theme.border}
            maxLength={500}
            multiline
            ref={inputRef}
            onFocus={() => {
              moveTo(280);
              setTimeout(() => {
                (inputRef.current as any)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
              }, 300);
            }}
            onBlur={() => moveTo(0)}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            onPress={send}
            disabled={busy || !text.trim()}
            style={[styles.postButton, (busy || !text.trim()) && styles.postDisabled]}
          >
            <Text style={styles.postText}>{busy ? '...' : 'Post'}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.note}>Sign in to write a comment.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <Text style={styles.note}>Loading comments…</Text>
      ) : comments.length === 0 ? (
        <Text style={styles.note}>No comments yet. Be the first.</Text>
      ) : (
        comments.map((c) => (
          <View key={c.id} style={styles.comment}>
            <View style={styles.commentHead}>
              <Text style={styles.name}>{c.displayName}</Text>
              <Text style={styles.time}>{new Date(c.created_at).toLocaleString()}</Text>
            </View>
            <Text style={styles.body}>{c.body}</Text>
            {userId && c.user_id === userId ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Delete comment" onPress={() => remove(c.id)}>
                <Text style={styles.delete}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
      <Animated.View style={{ height: lift }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingVertical: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    color: theme.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  postButton: {
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: theme.accent,
    paddingHorizontal: 14,
  },
  postDisabled: { opacity: 0.5 },
  postText: { color: theme.background, fontWeight: '800' },
  note: { color: theme.text, fontSize: 14 },
  error: { color: theme.accent, fontSize: 13, fontWeight: '700' },
  comment: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  commentHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { color: theme.text, fontWeight: '800', fontSize: 14 },
  time: { color: theme.text, fontSize: 11, opacity: 0.6 },
  body: { color: theme.text, fontSize: 14, lineHeight: 20 },
  delete: { color: theme.accent, fontSize: 12, fontWeight: '800', marginTop: 4 },
});
