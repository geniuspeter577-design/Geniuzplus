import React, { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { supabaseMovieRepository } from '../repositories/SupabaseMovieRepository';
import { supabase } from '../services/supabase';

type Lesson = { id: string; lesson_number: number; title: string; poster_url: string | null };
type Props = { courseId?: string | null; disabled?: boolean };

export function LessonPosterPicker({ courseId, disabled }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!supabase || !courseId) {
      setLessons([]);
      setLessonId('');
      return;
    }
    const { data, error } = await supabase
      .from('education_lessons')
      .select('id,lesson_number,title,poster_url')
      .eq('course_id', courseId)
      .order('lesson_number', { ascending: true });
    if (error) {
      setNote(`Could not load lessons: ${error.message}`);
      return;
    }
    setLessons((data ?? []) as unknown as Lesson[]);
  }, [courseId]);

  useEffect(() => {
    setLessonId('');
    void load();
  }, [load]);

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    setFile(picked);
    setNote('');
    setPreview(picked ? URL.createObjectURL(picked) : null);
  };

  const save = async () => {
    if (!supabase || !supabaseMovieRepository || !lessonId || !file) {
      setNote('Choose a lesson and a poster image first.');
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
        .from('education_lessons')
        .update({ poster_url: url } as never)
        .eq('id', lessonId);
      if (error) {
        throw new Error(error.message);
      }
      setNote('Lesson poster saved.');
      setFile(null);
      setPreview(null);
      await load();
    } catch (e) {
      setNote(`Could not save the poster: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const off = !lessonId || !file || busy || disabled;
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>Lesson poster (portrait, for one lesson)</Text>
      {!courseId ? <Text style={styles.text}>Choose a course above first.</Text> : null}
      {courseId && !lessons.length ? <Text style={styles.text}>This course has no lessons yet.</Text> : null}
      {lessons.map((lesson) => (
        <Pressable
          key={lesson.id}
          style={[styles.choice, lesson.id === lessonId && styles.choiceOn]}
          onPress={() => setLessonId(lesson.id)}
          disabled={busy || disabled}
        >
          <Text style={styles.text}>
            {lesson.title}{lesson.poster_url ? '  (has poster)' : ''}
          </Text>
        </Pressable>
      ))}
      {React.createElement('input', { type: 'file', accept: 'image/jpeg,image/png', onChange: onPick, disabled: busy || disabled })}
      {preview ? React.createElement('img', { src: preview, style: { maxWidth: 160, borderRadius: 8 } }) : null}
      <Pressable style={[styles.button, off && styles.buttonOff]} onPress={save} disabled={!!off}>
        <Text style={styles.buttonText}>{busy ? 'Saving...' : 'Save lesson poster'}</Text>
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
  choice: { backgroundColor: '#0c1a16', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1f3a32' },
  choiceOn: { borderColor: '#6ef06e' },
  button: { backgroundColor: '#6ef06e', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: '#020807', fontWeight: '700' },
});
