import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { uploadVideoToB2 } from '../src/services/B2UploadService';
import { supabase } from '../src/services/supabase';
import { EducationCoverPicker } from '../src/components/EducationCoverPicker';
import { isAdminMetadata } from '../src/utils/adminAccess';
import { readFilePartBytes } from '../src/utils/readFilePart';

type Course = { id: string; title: string; level: string | null; subject: string | null };

const readVideoDurationSeconds = (file: Blob): Promise<number | null> =>
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

export default function AdminEducationScreen() {
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newLevel, setNewLevel] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [prefix, setPrefix] = useState('Lesson');
  const [startNumber, setStartNumber] = useState('1');
  const [allowDownload, setAllowDownload] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const loadCourses = useCallback(async () => {
    if (!supabase) {
      return;
    }
    const { data, error } = await supabase
      .from('education_courses')
      .select('id,title,level,subject')
      .order('created_at', { ascending: false });
    if (error) {
      setMessage(`Could not load courses: ${error.message}`);
      return;
    }
    setCourses((data ?? []) as Course[]);
  }, []);

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

  const chooseCourse = useCallback(async (id: string) => {
    setCourseId(id);
    if (!supabase || !id) {
      return;
    }
    const { data } = await supabase
      .from('education_lessons')
      .select('lesson_number')
      .eq('course_id', id)
      .order('lesson_number', { ascending: false })
      .limit(1);
    const last = (data as { lesson_number: number }[] | null)?.[0]?.lesson_number ?? 0;
    setStartNumber(String(last + 1));
  }, []);

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
    await loadCourses();
    await chooseCourse((data as { id: string }).id);
    setMessage('Course created and selected.');
  }, [chooseCourse, loadCourses, newDescription, newLevel, newSubject, newTitle]);

  const onPickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    setFiles(picked);
  };

  const uploadLessons = useCallback(async () => {
    if (!supabase || !courseId || !files.length) {
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
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const number = first + index;
        const label = `${prefix.trim() || 'Lesson'} ${number}`;
        setMessage(`Uploading ${index + 1} of ${files.length}: ${label}`);
        setProgress(0);
        const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
        const accessToken = sessionResult.session?.access_token;
        if (sessionError || !accessToken) {
          throw new Error('Your admin session expired. Sign in again.');
        }
        const duration = await readVideoDurationSeconds(file);
        if (!duration || duration < 1 || duration > 86400) {
          throw new Error('Could not read the video length.');
        }
        const contentType = file.type || 'video/mp4';
        const storageKey = await uploadVideoToB2({
          apiBaseUrl: process.env.EXPO_PUBLIC_GENIUZ_API_URL ?? '',
          accessToken,
          file: {
            size: file.size,
            readPart: (start, end, partContentType) =>
              readFilePartBytes(file, start, end, partContentType),
          },
          fileName: file.name,
          contentType,
          objectType: 'episode',
          signal: controller.signal,
          onProgress: setProgress,
        });
        if (controller.signal.aborted) {
          throw new Error('Upload canceled.');
        }
        const extension = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';
        const { error } = await supabase.from('education_lessons').insert({
          course_id: courseId,
          lesson_number: number,
          title: label,
          duration_seconds: duration,
          storage_provider: 'b2',
          storage_key: storageKey,
          file_extension: extension || null,
          mime_type: contentType,
          file_size_bytes: file.size,
          allow_download: allowDownload,
          published: true,
        } as never);
        if (error) {
          throw new Error(`The video uploaded, but the lesson could not be saved: ${error.message}`);
        }
        done += 1;
      }
      setMessage(`${done} of ${files.length} lessons uploaded and saved.`);
      setFiles([]);
      await chooseCourse(courseId);
    } catch (error) {
      setMessage(`Stopped after ${done} lessons. ${error instanceof Error ? error.message : 'Upload failed.'}`);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [allowDownload, chooseCourse, courseId, files, prefix, startNumber]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.page}>
        <Text style={styles.text}>Open this page in the web admin.</Text>
      </View>
    );
  }
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
      <Text style={styles.title}>Education admin</Text>

      <Text style={styles.heading}>1. Create a course</Text>
      <TextInput style={styles.input} placeholder="Course title (Primary 1 Mathematics)" placeholderTextColor="#789" value={newTitle} onChangeText={setNewTitle} />
      <TextInput style={styles.input} placeholder="Level (Primary 1)" placeholderTextColor="#789" value={newLevel} onChangeText={setNewLevel} />
      <TextInput style={styles.input} placeholder="Subject (Mathematics)" placeholderTextColor="#789" value={newSubject} onChangeText={setNewSubject} />
      <TextInput style={styles.input} placeholder="Short description" placeholderTextColor="#789" value={newDescription} onChangeText={setNewDescription} />
      <Pressable style={styles.button} onPress={createCourse} disabled={busy}>
        <Text style={styles.buttonText}>Create course</Text>
      </Pressable>

      <Text style={styles.heading}>2. Choose the course</Text>
      {courses.length ? (
        courses.map((course) => (
          <Pressable key={course.id} style={[styles.choice, course.id === courseId && styles.choiceOn]} onPress={() => chooseCourse(course.id)} disabled={busy}>
            <Text style={styles.text}>{course.title}{course.level ? ` - ${course.level}` : ''}</Text>
          </Pressable>
        ))
      ) : (
        <Text style={styles.text}>No courses yet.</Text>
      )}

      <EducationCoverPicker courseId={courseId} disabled={busy} onSaved={loadCourses} />

      <Text style={styles.heading}>3. Upload lessons</Text>
      <Text style={styles.text}>Videos are sorted by file name. Lesson numbers follow that order.</Text>
      {React.createElement('input', { type: 'file', multiple: true, accept: 'video/*', onChange: onPickFiles, disabled: busy })}
      <Text style={styles.text}>{files.length} video(s) selected</Text>
      <TextInput style={styles.input} placeholder="Title word (Lesson)" placeholderTextColor="#789" value={prefix} onChangeText={setPrefix} />
      <TextInput style={styles.input} placeholder="First lesson number" placeholderTextColor="#789" value={startNumber} onChangeText={setStartNumber} />
      <Pressable style={styles.choice} onPress={() => setAllowDownload((value) => !value)} disabled={busy}>
        <Text style={styles.text}>{allowDownload ? '[x]' : '[ ]'} Allow users to download</Text>
      </Pressable>
      <Pressable style={[styles.button, (!courseId || !files.length || busy) && styles.buttonOff]} onPress={uploadLessons} disabled={!courseId || !files.length || busy}>
        <Text style={styles.buttonText}>{busy ? 'Uploading...' : 'Upload lessons'}</Text>
      </Pressable>
      {busy ? (
        <Pressable style={styles.choice} onPress={() => abortRef.current?.abort()}>
          <Text style={styles.text}>Cancel</Text>
        </Pressable>
      ) : null}
      {busy ? <Text style={styles.text}>{Math.round(progress * (progress <= 1 ? 100 : 1))}%</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#020807' },
  content: { padding: 20, gap: 10, maxWidth: 720 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  heading: { color: '#6ef06e', fontSize: 16, fontWeight: '700', marginTop: 14 },
  text: { color: '#d8e6e0', fontSize: 14 },
  message: { color: '#ffd479', fontSize: 14, marginTop: 8 },
  input: { backgroundColor: '#0c1a16', color: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1f3a32' },
  button: { backgroundColor: '#6ef06e', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: '#020807', fontWeight: '700' },
  choice: { backgroundColor: '#0c1a16', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#1f3a32' },
  choiceOn: { borderColor: '#6ef06e' },
});
