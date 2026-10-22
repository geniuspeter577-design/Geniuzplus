import { useWindowDimensions } from '../hooks/useColumnWindow';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, } from 'react-native';
import type { ImageStyle, NativeScrollEvent, NativeSyntheticEvent, StyleProp } from 'react-native';

import { supabase } from '../services/supabase';

type Course = { id: string; title: string; level: string | null; subject: string | null; poster_url: string | null };

const C = {
  card: '#1E2024',
  low: '#1A1C20',
  highest: '#333539',
  text: '#E2E2E8',
  muted: '#BDCBB6',
  green: '#72F06A',
  scrim: 'rgba(17,19,23,0.62)',
};

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

export function EducationHub() {
  const { width } = useWindowDimensions();
  const heroHeight = Math.min(Math.round((width * 9) / 16), 520);
  const heroRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [courses, setCourses] = useState<Course[]>([]);
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
      .select('id,title,level,subject,poster_url')
      .eq('published', true)
      .order('created_at', { ascending: true })
      .then(({ data, error: e }) => {
        if (e) {
          setError('Could not load courses.');
        } else {
          setCourses((data ?? []) as Course[]);
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

  const openCourse = (course: Course) => {
    router.push({ pathname: '/education', params: { course: course.id } });
  };

  const onSwipe = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const goToSlide = (index: number) => {
    setPage(index);
    heroRef.current?.scrollTo({ x: index * width, animated: true });
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.green} /></View>;
  }
  if (error) {
    return <View style={styles.center}><Text style={styles.muted}>{error}</Text></View>;
  }
  if (courses.length === 0) {
    return <View style={styles.center}><Text style={styles.muted}>No courses yet.</Text></View>;
  }

  return (
    <View>
      <ScrollView ref={heroRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onSwipe}>
        {courses.map((course) => (
          <Pressable key={course.id} accessibilityRole="button" onPress={() => openCourse(course)} style={{ height: heroHeight, width }}>
            <Poster uri={course.poster_url} style={{ backgroundColor: C.card, height: heroHeight, width }} />
            <View style={styles.caption}>
              <Text style={styles.captionTitle} numberOfLines={2}>{course.title}</Text>
              <Text style={styles.captionMuted} numberOfLines={1}>{[course.level, course.subject].filter(Boolean).join(' · ')}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {courses.length > 1 ? (
        <View style={styles.dots}>
          {courses.map((course, index) => (
            <Pressable key={course.id} accessibilityRole="button" accessibilityLabel={`Slide ${index + 1}`} onPress={() => goToSlide(index)} hitSlop={8}>
              <View style={[styles.dot, index === page && styles.dotOn]} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.gap} />
      )}
      {groups.map(([level, items]) => (
        <View key={level} style={styles.group}>
          <Text style={styles.groupTitle}>{level}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {items.map((course) => (
              <Pressable key={course.id} accessibilityRole="button" onPress={() => openCourse(course)} style={styles.card}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: C.muted, fontSize: 13 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  caption: { backgroundColor: C.scrim, bottom: 0, left: 0, padding: 16, position: 'absolute', right: 0 },
  captionTitle: { color: C.text, fontSize: 22, fontWeight: '700' },
  captionMuted: { color: C.muted, fontSize: 12, marginTop: 2 },
  dots: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 14 },
  dot: { backgroundColor: C.highest, borderRadius: 3, height: 6, width: 6 },
  dotOn: { backgroundColor: C.green, width: 24 },
  gap: { height: 14 },
  group: { marginTop: 10 },
  groupTitle: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 10, paddingHorizontal: 16 },
  rail: { gap: 12, paddingHorizontal: 16 },
  card: { backgroundColor: C.low, borderRadius: 12, overflow: 'hidden', width: 176 },
  cardImage: { backgroundColor: C.highest, height: 110, width: 176 },
  cardBody: { gap: 4, padding: 10 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '600' },
  cardMuted: { color: C.muted, fontSize: 12 },
});
