import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'geniuz.study.history';

export type StudyHistoryEntry = {
  id: string;
  title: string;
  posterUrl?: string | null;
  progress: number;
  updatedAt: string;
};

export async function loadStudyHistory(): Promise<StudyHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as StudyHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export async function recordStudyProgress(entry: StudyHistoryEntry) {
  try {
    const list = await loadStudyHistory();
    const rest = list.filter((item) => item.id !== entry.id);
    const next = entry.progress >= 100 ? rest : [entry, ...rest];
    await AsyncStorage.setItem(KEY, JSON.stringify(next.slice(0, 30)));
  } catch {
    // history is a convenience, never block playback
  }
}
