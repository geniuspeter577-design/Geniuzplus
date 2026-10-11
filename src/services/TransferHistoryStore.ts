import AsyncStorage from '@react-native-async-storage/async-storage';

export type TransferHistoryEntry = {
  id: string;
  title: string;
  size: number;
  date: string;
  direction: 'sent' | 'received';
};

const STORAGE_KEY = '@geniuz/transfer-history/v1';
const MAX_HISTORY_ITEMS = 500;

export async function loadTransferHistory(): Promise<TransferHistoryEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((entry): entry is TransferHistoryEntry =>
    typeof entry === 'object' && entry !== null &&
    typeof entry.id === 'string' && typeof entry.title === 'string' &&
    typeof entry.size === 'number' && typeof entry.date === 'string' &&
    (entry.direction === 'sent' || entry.direction === 'received'),
  );
}

export async function addTransferHistoryEntry(entry: Omit<TransferHistoryEntry, 'id' | 'date'>) {
  const current = await loadTransferHistory();
  const next = [{ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, date: new Date().toISOString() }, ...current]
    .slice(0, MAX_HISTORY_ITEMS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
