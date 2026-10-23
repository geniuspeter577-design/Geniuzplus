import { Platform } from 'react-native';

export async function getImageSize(uri: string): Promise<number> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return blob.size;
  }
  const { File } = require('expo-file-system');
  return new File(uri).size;
}

export async function getImageBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  const { File } = require('expo-file-system');
  return new File(uri).bytes();
}