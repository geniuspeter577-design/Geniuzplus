import React, { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { supabaseMovieRepository } from '../repositories/SupabaseMovieRepository';
import { supabase } from '../services/supabase';

type Props = {
  courseId?: string | null;
  disabled?: boolean;
  onSaved?: () => void | Promise<void>;
};

export function EducationCoverPicker({ courseId, disabled, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setNote('');
    setPreview(picked ? URL.createObjectURL(picked) : null);
  };

  const save = async () => {
    if (!supabase || !supabaseMovieRepository || !courseId || !file) {
      setNote('Choose a course and a cover image first.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNote('The image is too big. Use one under 5 MB.');
      return;
    }
    setBusy(true);
    try {
      const url = await supabaseMovieRepository.uploadTitleImage(
        URL.createObjectURL(file),
        file.type === 'image/png' ? 'image/png' : 'image/jpeg',
      );
      const { error } = await supabase
        .from('education_courses')
        .update({ poster_url: url } as never)
        .eq('id', courseId);
      if (error) {
        throw new Error(error.message);
      }
      setNote('Cover saved.');
      setFile(null);
      setPreview(null);
      await onSaved?.();
    } catch (e) {
      setNote(`Could not save the cover: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const off = !courseId || !file || busy || disabled;
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>Cover image (for the selected course)</Text>
      <Text style={styles.text}>Use a wide picture, like a series cover. JPG or PNG, small is better.</Text>
      {React.createElement('input', { type: 'file', accept: 'image/jpeg,image/png', onChange: onPick, disabled: busy || disabled })}
      {preview ? React.createElement('img', { src: preview, style: { maxWidth: 320, borderRadius: 8 } }) : null}
      <Pressable style={[styles.button, off && styles.buttonOff]} onPress={save} disabled={!!off}>
        <Text style={styles.buttonText}>{busy ? 'Saving...' : 'Save cover'}</Text>
      </Pressable>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  heading: { color: '#6ef06e', fontSize: 16, fontWeight: '700', marginTop: 14 },
  text: { color: '#d8e6e0', fontSize: 14 },
  note: { color: '#ffd479', fontSize: 14 },
  button: { backgroundColor: '#6ef06e', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: '#020807', fontWeight: '700' },
});
