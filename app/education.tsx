import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ImageStyle, NativeScrollEvent, NativeSyntheticEvent, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../src/services/supabase';

type Course = { id: string; title: string; description: string | null; level: string | null; subject: string | null; poster_url: string | null };
type Lesson = { id: string; lesson_number: number; title: string; duration_seconds: number | null; poster_url: string | null; file_size_bytes: number | null };

const C = {
  bg: '#111317',
  low: '#1A1C20',
  card: '#1E2024',
  high: '#282A2E',
  highest: '#333539',
  text: '#E2E2E8',
  muted: '#BDCBB6',
  green: '#72F06A',
  onGreen: '#002202',
  scrim: 'rgba(17,19,23,0.62)',
};

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return '';
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number | null) {
  if (!bytes || bytes <= 0) {
    return '';
  }
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

function formatTotal(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function Poster({ uri, style }: { uri: string | null; style: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[style as object, styles.fallback]}>
        <Ionicons name="school" size={48} color={C.green} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
}

export default function EducationScreen() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ course?: string }>();
  const heroHeight = Math.min(Math.round((width * 9) / 16), 520);
  const heroRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [openCourse, setOpenCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError('The app is not connected yet.');
      setLoading(false);
      return;
    }
    supabase
      .from('education_courses')
      .select('id,title,description,level,subject,poster_url')
      .eq('published', true)
      .order('created_at', { ascending: true })
      .then(({ data, error: e }) => {
        if (e) {
          setError('Could not load courses.');
        } else {
          const list = (data ?? []) as Course[];
          setCourses(list);
          const wanted = list.find((item) => item.id === params.course);
          if (wanted) {
            setTimeout(() => chooseCourse(wanted), 0);
          }
        }
        setLoading(false);
      });
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Course[]>();
    courses.forEach((course) => {
      const key = course.level || 'Courses';
      map.set(key, [...(map.get(key) ?? []), course]);
    });
    return Array.from(map.entries());
  }, [courses]);

  const chooseCourse = (course: Course) => {
    if (!supabase) {
      return;
    }
    setOpenCourse(course);
    setLessons([]);
    setError(null);
    setLoading(true);
    supabase
      .from('education_lessons')
      .select('id,lesson_number,title,duration_seconds,poster_url,file_size_bytes')
      .eq('course_id', course.id)
      .eq('published', true)
      .order('lesson_number', { ascending: true })
      .then(({ data, error: e }) => {
        if (e) {
          setError('Could not load lessons.');
        } else {
          setLessons((data ?? []) as Lesson[]);
        }
        setLoading(false);
      });
  };

  const goBack = () => {
    if (openCourse) {
      if (params.course) {
        router.back();
        return;
      }
      setOpenCourse(null);
      setError(null);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const playLesson = (lesson: Lesson) => {
    router.push({ pathname: '/lesson-player', params: { id: lesson.id, title: lesson.title } });
  };

  const onSwipe = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const goToSlide = (index: number) => {
    setPage(index);
    heroRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const totalSeconds = lessons.reduce((sum, lesson) => sum + (lesson.duration_seconds ?? 0), 0);
  const courseMeta = openCourse
    ? [openCourse.subject, lessons.length > 0 ? `${lessons.length} Lessons` : null, totalSeconds > 0 ? formatTotal(totalSeconds) : null]
        .filter(Boolean)
        .join('  ·  ')
    : '';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.heading} numberOfLines={1}>{openCourse ? 'Course Details' : 'Education'}</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.green} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.muted}>{error}</Text></View>
      ) : openCourse ? (
        <ScrollView contentContainerStyle={styles.page}>
          <View style={{ height: heroHeight, width }}>
            <Poster uri={openCourse.poster_url} style={{ backgroundColor: C.card, height: heroHeight, width }} />
          </View>
          <View style={styles.info}>
            <View style={styles.chipRow}>
              {openCourse.level ? <Text style={styles.chip}>{openCourse.level.toUpperCase()}</Text> : null}
            </View>
            <Text style={styles.courseTitle}>{openCourse.title}</Text>
            {courseMeta ? <Text style={styles.muted}>{courseMeta}</Text> : null}
            {openCourse.description ? <Text style={styles.description}>{openCourse.description}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={lessons.length === 0}
              onPress={() => lessons[0] && playLesson(lessons[0])}
              style={[styles.cta, lessons.length === 0 && styles.ctaOff]}
            >
              <Ionicons name="play" size={20} color={C.onGreen} />
              <Text style={styles.ctaText}>Start Learning</Text>
            </Pressable>
          </View>
          <Text style={styles.section}>Lessons ({lessons.length})</Text>
          <View style={styles.list}>
            {lessons.length === 0 ? <Text style={styles.muted}>No lessons yet.</Text> : null}
            {lessons.map((lesson) => (
              <Pressable key={lesson.id} accessibilityRole="button" onPress={() => playLesson(lesson)} style={styles.row}>
                <Poster uri={lesson.poster_url ?? openCourse.poster_url} style={styles.rowThumb} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{lesson.title}</Text>
                  <Text style={styles.muted}>{[formatDuration(lesson.duration_seconds), formatSize(lesson.file_size_bytes)].filter(Boolean).join('  ·  ')}</Text>
                </View>
                <View style={styles.rowPlay}>
                  <Ionicons name="play" size={18} color={C.green} />
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.page}>
          {courses.length === 0 ? <Text style={[styles.muted, styles.pad]}>No courses yet.</Text> : null}
          {courses.length > 0 ? (
            <ScrollView ref={heroRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onSwipe}>
              {courses.map((course) => (
                <Pressable key={course.id} accessibilityRole="button" onPress={() => chooseCourse(course)} style={{ height: heroHeight, width }}>
                  <Poster uri={course.poster_url} style={{ backgroundColor: C.card, height: heroHeight, width }} />
                  <View style={styles.caption}>
                    <Text style={styles.captionTitle} numberOfLines={2}>{course.title}</Text>
                    <Text style={styles.captionMuted} numberOfLines={1}>{[course.level, course.subject].filter(Boolean).join(' · ')}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {courses.length > 1 ? (
            <View style={styles.dots}>
              {courses.map((course, index) => (
                <Pressable key={course.id} accessibilityRole="button" accessibilityLabel={`Slide ${index + 1}`} onPress={() => goToSlide(index)} hitSlop={8}>
                  <View style={[styles.dot, index === page && styles.dotOn]} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {groups.map(([level, items]) => (
            <View key={level} style={styles.group}>
              <Text style={styles.groupTitle}>{level}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                {items.map((course) => (
                  <Pressable key={course.id} accessibilityRole="button" onPress={() => chooseCourse(course)} style={styles.card}>
                    <Poster uri={course.poster_url} style={styles.cardImage} />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{course.title}</Text>
                      <Text style={styles.cardMuted} numberOfLines={1}>{course.subject ?? ''}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: C.bg, flex: 1 },
  top: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 8 },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  heading: { color: C.text, flex: 1, fontSize: 16, fontWeight: '700' },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  page: { paddingBottom: 40 },
  pad: { paddingHorizontal: 16 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  caption: { backgroundColor: C.scrim, bottom: 0, left: 0, padding: 16, position: 'absolute', right: 0 },
  captionTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
  captionMuted: { color: C.muted, fontSize: 12, marginTop: 2 },
  dots: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 14 },
  dot: { backgroundColor: C.highest, borderRadius: 3, height: 6, width: 6 },
  dotOn: { backgroundColor: C.green, width: 24 },
  group: { marginTop: 10 },
  groupTitle: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 10, paddingHorizontal: 16 },
  rail: { gap: 12, paddingHorizontal: 16 },
  card: { backgroundColor: C.low, borderRadius: 12, overflow: 'hidden', width: 176 },
  cardImage: { backgroundColor: C.highest, height: 110, width: 176 },
  cardBody: { gap: 4, padding: 10 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '600' },
  cardMuted: { color: C.muted, fontSize: 12 },
  heroPlayWrap: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  heroPlay: { alignItems: 'center', backgroundColor: C.green, borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  info: { gap: 10, padding: 16 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: 'rgba(114,240,106,0.15)', borderRadius: 999, color: C.green, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3 },
  courseTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
  description: { color: C.muted, fontSize: 14, lineHeight: 21 },
  cta: { alignItems: 'center', backgroundColor: C.green, borderRadius: 999, flexDirection: 'row', gap: 8, height: 48, justifyContent: 'center', marginTop: 6 },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: C.onGreen, fontSize: 14, fontWeight: '700' },
  section: { color: C.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 10 },
  list: { gap: 8, paddingHorizontal: 16 },
  row: { alignItems: 'center', backgroundColor: C.card, borderRadius: 12, flexDirection: 'row', gap: 14, padding: 14 },
  number: { color: C.green, fontSize: 16, fontWeight: '700', minWidth: 26 },
  rowBody: { flex: 1, gap: 2 },
  rowThumb: { backgroundColor: C.highest, borderRadius: 8, height: 72, width: 52 },
  rowTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  rowPlay: { alignItems: 'center', backgroundColor: C.highest, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  muted: { color: C.muted, fontSize: 12 },
  lessonRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  lessonChip: { alignItems: 'center', backgroundColor: C.card, borderColor: C.highest, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', minHeight: 64, minWidth: 130, paddingHorizontal: 14, paddingVertical: 10 },
  lessonChipText: { color: C.text, fontSize: 14, fontWeight: '700' },
});
