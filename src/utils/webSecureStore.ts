import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

function native(): typeof import('expo-secure-store') {
  return require('expo-secure-store');
}
function webGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function webSet(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
function webDelete(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

export async function getItemAsync(key: string, options?: any): Promise<string | null> {
  return isWeb ? webGet(key) : native().getItemAsync(key, options);
}
export async function setItemAsync(key: string, value: string, options?: any): Promise<void> {
  if (isWeb) { webSet(key, value); return; }
  return native().setItemAsync(key, value, options);
}
export async function deleteItemAsync(key: string, options?: any): Promise<void> {
  if (isWeb) { webDelete(key); return; }
  return native().deleteItemAsync(key, options);
}