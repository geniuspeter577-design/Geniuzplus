import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { createVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabaseMovieRepository } from '../src/repositories/SupabaseMovieRepository';
import { uploadVideoToB2 } from '../src/services/B2UploadService';
import { supabase } from '../src/services/supabase';
import { isAdminMetadata } from '../src/utils/adminAccess';
import { backOrReplace } from '../src/utils/navigation';
import { readFilePartBytes } from '../src/utils/readFilePart';

type Course = {
  id: string;
  title: string;
  level: string | null;
  subject: string | null;
  description: string | null;
  poster_url: string | null;
  published: boolean | null;
};
type Lesson = {
  id: string;
  lesson_number: number;
  title: string;
  poster_url: string | null;
  published: boolean | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
};
type Pending = { kind: 'course' | 'lesson'; id: string; label: string };

const readWebDurationSeconds = (file: Blob): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? Math.round(video.duration) : null);
    video.onerror = () => finish(null);
    video.src = url;
  });

const readNativeDurationSeconds = (uri: string): Promise<number | null> =>
  new Promise((resolve) => {
    let done = false;
    let sub: { remove: () => void } | undefined;
    const player = createVideoPlayer(uri);
    const finish = (value: number | null) => {
      if (done) {
        return;
      }
      done = true;
      try {
        sub?.remove();
      } catch {
        // already removed
      }
      try {
        player.release();
      } catch {
        // already released
      }
      resolve(value);
    };
    sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        const d = player.duration;
        finish(Number.isFinite(d) && d > 0 ? Math.round(d) : null);
      } else if (status === 'error') {
        finish(null);
      }
    });
    setTimeout(() => finish(null), 20000);
  });

const formatSize = (bytes: number | null) => {
  if (!bytes || bytes <= 0) {
    return '';
  }
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
};

export default function AdminEducationScreen() {
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [courseId, setCourseId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [eTitle, setETitle] = useState('');
  const [eLevel, setELevel] = useState('');
  const [eSubject, setESubject] = useState('');
  const [eDescription, setEDescription] = useState('');
  const [editingLessonId, setEditingLessonId] = useState('');
  const [lTitle, setLTitle] = useState('');
  const [lNumber, setLNumber] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [picked, setPicked] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [prefix, setPrefix] = useState('Lesson');
  const [startNumber, setStartNumber] = useState('1');
  const [allowDownload, setAllowDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const course = courses.find((item) => item.id === courseId);

  const loadCourses = useCallback(async (): Promise<Course[]> => {
    if (!supabase) {
      return [];
    }
    const { data, error } = await supabase
      .from('education_courses')
      .select('id,title,description,level,subject,poster_url,published')
      .order('created_at', { ascending: false });
    if (error) {
      setMessage(`Could not load courses: ${error.message}`);
      return [];
    }
    const list = (data ?? []) as unknown as Course[];
    setCourses(list);
    return list;
  }, []);

  const loadLessons = useCallback(async (id: string) => {
    if (!supabase || !id) {
      setLessons([]);
      return;
    }
    const { data, error } = await supabase
      .from('education_lessons')
      .select('id,lesson_number,title,poster_url,published,file_size_bytes,duration_seconds')
      .eq('course_id', id)
      .order('lesson_number', { ascending: true });
    if (error) {
      setMessage(`Could not load lessons: ${error.message}`);
      return;
    }
    const list = (data ?? []) as unknown as Lesson[];
    setLessons(list);
    const last = list.length ? list[list.length - 1].lesson_number : 0;
    setStartNumber(String(last + 1));
  }, []);

  const chooseCourse = useCallback(
    async (id: string, source?: Course[]) => {
      const found = (source ?? courses).find((item) => item.id === id);
      setCourseId(id);
      setETitle(found?.title ?? '');
      setELevel(found?.level ?? '');
      setESubject(found?.subject ?? '');
      setEDescription(found?.description ?? '');
      setEditingLessonId('');
      setPending(null);
      setPicked([]);
      await loadLessons(id);
    },
    [courses, loadLessons],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) {
        setChecked(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const admin = Boolean(data.session && isAdminMetadata(data.session.user.app_metadata));
      if (!active) {
        return;
      }
      setIsAdmin(admin);
      setChecked(true);
      if (admin) {
        await loadCourses();
      }
    })();
    return () => {
      active = false;
    };
  }, [loadCourses]);

  const createCourse = useCallback(async () => {
    if (!supabase) {
      return;
    }
    if (!newTitle.trim()) {
      setMessage('Type the course title first.');
      return;
    }
    const { data, error } = await supabase
      .from('education_courses')
      .insert({
        title: newTitle.trim(),
        level: newLevel.trim() || null,
        subject: newSubject.trim() || null,
        description: newDescription.trim() || null,
        published: true,
      } as never)
      .select('id')
      .single();
    if (error || !data) {
      setMessage(`Could not create the course: ${error?.message ?? 'unknown error'}`);
      return;
    }
    setNewTitle('');
    setNewLevel('');
    setNewSubject('');
    setNewDescription('');
    const list = await loadCourses();
    await chooseCourse((data as { id: string }).id, list);
    setMessage('Course created and selected.');
  }, [chooseCourse, loadCourses, newDescription, newLevel, newSubject, newTitle]);

  const saveCourse = useCallback(async () => {
    if (!supabase || !courseId) {
      return;
    }
    if (!eTitle.trim()) {
      setMessage('The course title cannot be empty.');
      return;
    }
    const { error } = await supabase
      .from('education_courses')
      .update({
        title: eTitle.trim(),
        level: eLevel.trim() || null,
        subject: eSubject.trim() || null,
        description: eDescription.trim() || null,
      } as never)
      .eq('id', courseId);
    setMessage(error ? `Could not save the course: ${error.message}` : 'Course saved.');
    await loadCourses();
  }, [courseId, eDescription, eLevel, eSubject, eTitle, loadCourses]);

  const setCoursePublished = useCallback(
    async (value: boolean) => {
      if (!supabase || !courseId) {
        return;
      }
      const { error } = await supabase
        .from('education_courses')
        .update({ published: value } as never)
        .eq('id', courseId);
      setMessage(error ? `Could not change it: ${error.message}` : value ? 'Course is now visible.' : 'Course is now hidden.');
      await loadCourses();
    },
    [courseId, loadCourses],
  );

  const setLessonPublished = useCallback(
    async (lesson: Lesson) => {
      if (!supabase) {
        return;
      }
      const { error } = await supabase
        .from('education_lessons')
        .update({ published: !(lesson.published ?? true) } as never)
        .eq('id', lesson.id);
      if (error) {
        setMessage(`Could not change it: ${error.message}`);
      }
      await loadLessons(courseId);
    },
    [courseId, loadLessons],
  );

  const startEditLesson = (lesson: Lesson) => {
    setEditingLessonId(lesson.id);
    setLTitle(lesson.title);
    setLNumber(String(lesson.lesson_number));
    setPending(null);
  };

  const saveLesson = useCallback(async () => {
    if (!supabase || !editingLessonId) {
      return;
    }
    const number = Number(lNumber);
    if (!lTitle.trim() || !Number.isInteger(number) || number < 1) {
      setMessage('Give the lesson a title and a number of 1 or more.');
      return;
    }
    const { error } = await supabase
      .from('education_lessons')
      .update({ title: lTitle.trim(), lesson_number: number } as never)
      .eq('id', editingLessonId);
    setMessage(error ? `Could not save the lesson: ${error.message}` : 'Lesson saved.');
    setEditingLessonId('');
    await loadLessons(courseId);
  }, [courseId, editingLessonId, lNumber, lTitle, loadLessons]);

  const confirmDelete = useCallback(async () => {
    if (!supabase || !pending) {
      return;
    }
    setBusy(true);
    try {
      if (pending.kind === 'lesson') {
        const { error } = await supabase.from('education_lessons').delete().eq('id', pending.id);
        if (error) {
          throw new Error(error.message);
        }
        await loadLessons(courseId);
        setMessage('Lesson removed.');
      } else {
        const lessonsResult = await supabase.from('education_lessons').delete().eq('course_id', pending.id);
        if (lessonsResult.error) {
          throw new Error(lessonsResult.error.message);
        }
        const { error } = await supabase.from('education_courses').delete().eq('id', pending.id);
        if (error) {
          throw new Error(error.message);
        }
        setCourseId('');
        setLessons([]);
        await loadCourses();
        setMessage('Course removed.');
      }
    } catch (e) {
      setMessage(`Could not remove it: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setPending(null);
      setBusy(false);
    }
  }, [courseId, loadCourses, loadLessons, pending]);

  const pickAndSaveImage = useCallback(
    async (table: 'education_courses' | 'education_lessons', id: string, onDone: () => Promise<unknown>) => {
      if (!supabase || !supabaseMovieRepository || !id) {
        return;
      }
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['image/jpeg', 'image/png'],
          copyToCacheDirectory: true,
        });
        if (result.canceled) {
          return;
        }
        const asset = result.assets[0];
        if (typeof asset.size === 'number' && asset.size > 5 * 1024 * 1024) {
          setMessage('The image is too big. Use one under 5 MB.');
          return;
        }
        setBusy(true);
        setMessage('Saving the image...');
        const url = await supabaseMovieRepository.uploadTitleImage(
          asset.uri,
          asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
        );
        const { error } = await supabase.from(table).update({ poster_url: url } as never).eq('id', id);
        if (error) {
          throw new Error(error.message);
        }
        setMessage('Image saved.');
        await onDone();
      } catch (e) {
        setMessage(`Could not save the image: ${e instanceof Error ? e.message : 'unknown error'}`);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const pickVideos = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (result.canceled) {
        return;
      }
      setPicked(
        [...result.assets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      );
      setMessage('');
    } catch {
      setMessage('Could not open the video picker. Please try again.');
    }
  }, []);

  const uploadLessons = useCallback(async () => {
    if (!supabase || !courseId || !picked.length) {
      setMessage('Choose a course and at least one video.');
      return;
    }
    const first = Number(startNumber);
    if (!Number.isInteger(first) || first < 1) {
      setMessage('Start number must be 1 or more.');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    let done = 0;
    try {
      for (let index = 0; index < picked.length; index += 1) {
        const asset = picked[index];
        const number = first + index;
        const label = `${prefix.trim() || 'Lesson'} ${number}`;
        setMessage(`Uploading ${index + 1} of ${picked.length}: ${label}`);
        setProgress(0);
        const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
        const accessToken = sessionResult.session?.access_token;
        if (sessionError || !accessToken) {
          throw new Error('Your admin session expired. Sign in again.');
        }
        const file = asset.file ?? new ExpoFile(asset.uri);
        const size = typeof asset.size === 'number' ? asset.size : Number(file.size);
        const duration =
          Platform.OS === 'web' && asset.file
            ? await readWebDurationSeconds(asset.file)
            : await readNativeDurationSeconds(asset.uri);
        if (!duration || duration < 1 || duration > 86400) {
          throw new Error('Could not read the video length.');
        }
        const contentType = asset.mimeType || 'video/mp4';
        const storageKey = await uploadVideoToB2({
          apiBaseUrl: process.env.EXPO_PUBLIC_GENIUZ_API_URL ?? '',
          accessToken,
          file: {
            size,
            readPart: (start, end, partContentType) =>
              readFilePartBytes(file, start, end, partContentType),
          },
          fileName: asset.name,
          contentType,
          objectType: 'episode',
          signal: controller.signal,
          onProgress: setProgress,
        });
        if (controller.signal.aborted) {
          throw new Error('Upload canceled.');
        }
        const extension = asset.name.includes('.') ? (asset.name.split('.').pop() ?? '').toLowerCase() : '';
        const { error } = await supabase.from('education_lessons').insert({
          course_id: courseId,
          lesson_number: number,
          title: label,
          duration_seconds: duration,
          storage_provider: 'b2',
          storage_key: storageKey,
          file_extension: extension || null,
          mime_type: contentType,
          file_size_bytes: size,
          allow_download: allowDownload,
          published: true,
        } as never);
        if (error) {
          throw new Error(`The video uploaded, but the lesson could not be saved: ${error.message}`);
        }
        done += 1;
      }
      setMessage(`${done} of ${picked.length} lessons uploaded and saved.`);
      setPicked([]);
      await loadLessons(courseId);
    } catch (error) {
      setMessage(`Stopped after ${done} lessons. ${error instanceof Error ? error.message : 'Upload failed.'}`);
      await loadLessons(courseId);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [allowDownload, courseId, loadLessons, picked, prefix, startNumber]);

  if (!checked) {
    return (
      <View style={styles.page}>
        <Text style={styles.text}>Checking admin access...</Text>
      </View>
    );
  }
  if (!isAdmin) {
    return (
      <View style={styles.page}>
        <Text style={styles.text}>Admin access is required. Sign in on the admin page first.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Pressable onPress={() => backOrReplace('/admin')} style={styles.smallBtn}>
        <Text style={styles.text}>Back to admin</Text>
      </Pressable>
      <Text style={styles.title}>Education admin</Text>

      <Text style={styles.heading}>1. Create a course</Text>
      <TextInput style={styles.input} placeholder="Course title (Primary 1 Mathematics)" placeholderTextColor="#789" value={newTitle} onChangeText={setNewTitle} />
      <TextInput style={styles.input} placeholder="Level (Primary 1)" placeholderTextColor="#789" value={newLevel} onChangeText={setNewLevel} />
      <TextInput style={styles.input} placeholder="Subject (Mathematics)" placeholderTextColor="#789" value={newSubject} onChangeText={setNewSubject} />
      <TextInput style={styles.input} placeholder="Short description" placeholderTextColor="#789" value={newDescription} onChangeText={setNewDescription} />
      <Pressable style={[styles.button, busy && styles.buttonOff]} onPress={createCourse} disabled={busy}>
        <Text style={styles.buttonText}>Create course</Text>
      </Pressable>

      <Text style={styles.heading}>2. Choose the course</Text>
      {courses.length ? (
        courses.map((item) => (
          <Pressable key={item.id} style={[styles.choice, item.id === courseId && styles.choiceOn]} onPress={() => chooseCourse(item.id)} disabled={busy}>
            <Text style={styles.text}>
              {item.title}{item.level ? ` - ${item.level}` : ''}{item.published === false ? '  (hidden)' : ''}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={styles.text}>No courses yet.</Text>
      )}

      {course ? (
        <>
          <Text style={styles.heading}>3. Edit this course</Text>
          <TextInput style={styles.input} placeholder="Title" placeholderTextColor="#789" value={eTitle} onChangeText={setETitle} />
          <TextInput style={styles.input} placeholder="Level" placeholderTextColor="#789" value={eLevel} onChangeText={setELevel} />
          <TextInput style={styles.input} placeholder="Subject" placeholderTextColor="#789" value={eSubject} onChangeText={setESubject} />
          <TextInput style={styles.input} placeholder="Description" placeholderTextColor="#789" value={eDescription} onChangeText={setEDescription} multiline />
          <Pressable style={[styles.button, busy && styles.buttonOff]} onPress={saveCourse} disabled={busy}>
            <Text style={styles.buttonText}>Save course changes</Text>
          </Pressable>

          <Text style={styles.text}>Cover image (wide, like a series cover). JPG or PNG under 5 MB.</Text>
          {course.poster_url ? <Image source={{ uri: course.poster_url }} style={styles.cover} resizeMode="cover" /> : null}
          <Pressable style={[styles.choice, busy && styles.buttonOff]} onPress={() => pickAndSaveImage('education_courses', courseId, loadCourses)} disabled={busy}>
            <Text style={styles.text}>{course.poster_url ? 'Replace cover' : 'Choose cover'}</Text>
          </Pressable>

          <View style={styles.rowButtons}>
            <Pressable style={styles.smallBtn} onPress={() => setCoursePublished(course.published === false)} disabled={busy}>
              <Text style={styles.text}>{course.published === false ? 'Show course' : 'Hide course'}</Text>
            </Pressable>
            <Pressable style={[styles.smallBtn, styles.danger]} onPress={() => setPending({ kind: 'course', id: course.id, label: course.title })} disabled={busy}>
              <Text style={styles.text}>Remove course</Text>
            </Pressable>
          </View>

          <Text style={styles.heading}>4. Lessons ({lessons.length})</Text>
          {lessons.map((lesson) => (
            <View key={lesson.id} style={styles.lessonBox}>
              <View style={styles.lessonTop}>
                {lesson.poster_url ? (
                  <Image source={{ uri: lesson.poster_url }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}><Text style={styles.text}>{String(lesson.lesson_number).padStart(2, '0')}</Text></View>
                )}
                <View style={styles.grow}>
                  <Text style={styles.text}>{lesson.lesson_number}. {lesson.title}{lesson.published === false ? '  (hidden)' : ''}</Text>
                  <Text style={styles.small}>{formatSize(lesson.file_size_bytes)}</Text>
                </View>
              </View>
              {editingLessonId === lesson.id ? (
                <>
                  <TextInput style={styles.input} value={lTitle} onChangeText={setLTitle} placeholder="Lesson title" placeholderTextColor="#789" />
                  <TextInput style={styles.input} value={lNumber} onChangeText={setLNumber} placeholder="Lesson number" placeholderTextColor="#789" keyboardType="number-pad" />
                  <View style={styles.rowButtons}>
                    <Pressable style={styles.smallBtn} onPress={saveLesson}><Text style={styles.text}>Save</Text></Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => setEditingLessonId('')}><Text style={styles.text}>Cancel</Text></Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.rowButtons}>
                  <Pressable style={styles.smallBtn} onPress={() => startEditLesson(lesson)} disabled={busy}><Text style={styles.text}>Edit</Text></Pressable>
                  <Pressable style={styles.smallBtn} onPress={() => pickAndSaveImage('education_lessons', lesson.id, () => loadLessons(courseId))} disabled={busy}>
                    <Text style={styles.text}>{lesson.poster_url ? 'Change poster' : 'Poster'}</Text>
                  </Pressable>
                  <Pressable style={styles.smallBtn} onPress={() => setLessonPublished(lesson)} disabled={busy}>
                    <Text style={styles.text}>{lesson.published === false ? 'Show' : 'Hide'}</Text>
                  </Pressable>
                  <Pressable style={[styles.smallBtn, styles.danger]} onPress={() => setPending({ kind: 'lesson', id: lesson.id, label: lesson.title })} disabled={busy}>
                    <Text style={styles.text}>Remove</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}

          <Text style={styles.heading}>5. Upload lessons</Text>
          <Text style={styles.text}>Videos are sorted by file name. Lesson numbers follow that order.</Text>
          <Pressable style={[styles.choice, busy && styles.buttonOff]} onPress={pickVideos} disabled={busy}>
            <Text style={styles.text}>Choose videos</Text>
          </Pressable>
          <Text style={styles.text}>{picked.length} video(s) selected</Text>
          <TextInput style={styles.input} placeholder="Title word (Lesson)" placeholderTextColor="#789" value={prefix} onChangeText={setPrefix} />
          <TextInput style={styles.input} placeholder="First lesson number" placeholderTextColor="#789" value={startNumber} onChangeText={setStartNumber} keyboardType="number-pad" />
          <Pressable style={styles.choice} onPress={() => setAllowDownload((value) => !value)} disabled={busy}>
            <Text style={styles.text}>{allowDownload ? '[x]' : '[ ]'} Allow users to download</Text>
          </Pressable>
          <Pressable style={[styles.button, (!picked.length || busy) && styles.buttonOff]} onPress={uploadLessons} disabled={!picked.length || busy}>
            <Text style={styles.buttonText}>{busy ? 'Working...' : 'Upload lessons'}</Text>
          </Pressable>
          {busy && abortRef.current ? (
            <Pressable style={styles.choice} onPress={() => abortRef.current?.abort()}>
              <Text style={styles.text}>Cancel upload</Text>
            </Pressable>
          ) : null}
          {busy && abortRef.current ? <Text style={styles.text}>{Math.round(progress * (progress <= 1 ? 100 : 1))}%</Text> : null}
        </>
      ) : null}

      {pending ? (
        <View style={[styles.lessonBox, styles.danger]}>
          <Text style={styles.text}>
            Remove "{pending.label}"?{pending.kind === 'course' ? ' This also removes all its lessons.' : ''} This cannot be undone.
          </Text>
          <View style={styles.rowButtons}>
            <Pressable style={styles.smallBtn} onPress={confirmDelete}><Text style={styles.text}>Yes, remove</Text></Pressable>
            <Pressable style={styles.smallBtn} onPress={() => setPending(null)}><Text style={styles.text}>Cancel</Text></Pressable>
          </View>
        </View>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#020807' },
  content: { padding: 20, gap: 10, maxWidth: 720, paddingBottom: 80, paddingTop: 50 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  heading: { color: '#6ef06e', fontSize: 16, fontWeight: '700', marginTop: 14 },
  text: { color: '#d8e6e0', fontSize: 14 },
  small: { color: '#9bb0a8', fontSize: 12 },
  message: { color: '#ffd479', fontSize: 14, marginTop: 8 },
  grow: { flex: 1 },
  input: { backgroundColor: '#0c1a16', color: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1f3a32' },
  button: { backgroundColor: '#6ef06e', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: '#020807', fontWeight: '700' },
  choice: { backgroundColor: '#0c1a16', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1f3a32' },
  choiceOn: { borderColor: '#6ef06e' },
  cover: { width: '100%', maxWidth: 360, aspectRatio: 16 / 9, borderRadius: 8 },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallBtn: { backgroundColor: '#0c1a16', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#1f3a32', alignSelf: 'flex-start' },
  danger: { borderColor: '#b24a4a' },
  lessonBox: { backgroundColor: '#0a1512', borderRadius: 10, padding: 10, gap: 8, borderWidth: 1, borderColor: '#1f3a32' },
  lessonTop: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  thumb: { width: 40, height: 60, borderRadius: 6, backgroundColor: '#1f3a32' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
});
