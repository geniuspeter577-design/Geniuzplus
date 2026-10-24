import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';

import { MAX_VIDEO_FILE_SIZE_BYTES } from '../../constants/video';
import { uploadVideoToB2 } from '../../services/B2UploadService';
import { supabaseMovieRepository } from '../../repositories/SupabaseMovieRepository';
import { supabase } from '../../services/supabase';
import { readFilePartBytes } from '../../utils/readFilePart';
import { detectVideoFileType, validateVideoFileSize } from '../../utils/videoFile';

type SeasonChoice = { id: string; label: string };
type EpisodeRow = { id: string; episode_number: number; title: string };
type PickedFile = {
  file: File | ExpoFile;
  name: string;
  size: number;
  fileExtension: string | null;
  mimeType: string;
  contentType: string;
};

const C = { text: '#FFFFFF', muted: '#9CA3AF', card: '#1F2937', border: '#374151', green: '#72F06A', error: '#F87171' };

export function ReplaceVideosPanel({ seasons }: { seasons: SeasonChoice[] }) {
  const [seasonId, setSeasonId] = useState('');
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const loadEpisodes = useCallback(async () => {
    if (!supabase || !seasonId) {
      setEpisodes([]);
      return;
    }
    const { data, error: loadError } = await supabase
      .from('episodes')
      .select('id,episode_number,title')
      .eq('season_id', seasonId)
      .order('episode_number', { ascending: true });
    if (loadError) {
      setError('Could not load the episodes of this season.');
      return;
    }
    setEpisodes((data ?? []) as EpisodeRow[]);
  }, [seasonId]);

  useEffect(() => {
    setFiles([]);
    setMessage(undefined);
    setError(undefined);
    void loadEpisodes();
  }, [loadEpisodes]);

  const pickFiles = async () => {
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: false,
        base64: false,
      });
      if (result.canceled) return;
      const picked: PickedFile[] = [];
      for (const asset of result.assets) {
        const detected = detectVideoFileType(asset.name, asset.mimeType);
        if (!detected) {
          setError(asset.name + ' is not a supported video file.');
          return;
        }
        const file = asset.file ?? new ExpoFile(asset.uri);
        const size = typeof file.size === 'number' ? file.size : Number.NaN;
        const check = validateVideoFileSize(size, MAX_VIDEO_FILE_SIZE_BYTES);
        if (!check.valid) {
          setError(asset.name + ': ' + check.message);
          return;
        }
        picked.push({
          file,
          name: asset.name,
          size,
          fileExtension: detected.originalExtension,
          mimeType: asset.mimeType?.trim() || detected.mimeType,
          contentType: detected.mimeType,
        });
      }
      picked.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setFiles(picked);
    } catch {
      setError('The files could not be selected. Try again.');
    }
  };

  const countsMatch = files.length > 0 && files.length === episodes.length;

  const run = async () => {
    if (!supabase || !countsMatch || busy) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const failed: string[] = [];
    let done = 0;
    let lastReason = '';
    for (let i = 0; i < files.length; i += 1) {
      const ep = episodes[i];
      const item = files[i];
      setStatus('Replacing ' + (i + 1) + ' of ' + files.length + ': Episode ' + ep.episode_number);
      setProgress(0);
      try {
        const { data: s, error: se } = await supabase.auth.getSession();
        const token = s.session?.access_token;
        if (se || !token) throw new Error('Your admin session expired. Sign in again, then retry.');
        const storageKey = await uploadVideoToB2({
          apiBaseUrl: process.env.EXPO_PUBLIC_GENIUZ_API_URL ?? '',
          accessToken: token,
          file: {
            size: item.size,
            readPart: (start, end, contentType) => readFilePartBytes(item.file, start, end, contentType),
          },
          fileName: item.name,
          contentType: item.contentType,
          objectType: 'episode',
          signal: new AbortController().signal,
          onProgress: setProgress,
        });
        if (!supabaseMovieRepository) throw new Error('The database is not configured.');
        await supabaseMovieRepository.replaceB2EpisodeVideo(
          ep.id,
          { fileExtension: item.fileExtension, mimeType: item.mimeType, fileSizeBytes: item.size },
          storageKey,
        );
        done += 1;
      } catch (e) {
        failed.push('Episode ' + ep.episode_number);
        lastReason = e instanceof Error ? e.message : 'Unknown error';
      }
    }
    setBusy(false);
    setStatus('');
    setFiles([]);
    setMessage(done + ' of ' + episodes.length + ' episodes replaced. Test them before deleting anything.');
    if (failed.length) setError('Not replaced: ' + failed.join(', ') + '. Reason: ' + lastReason);
    await loadEpisodes();
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 }}>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>Replace season videos</Text>
        <Text style={{ color: C.muted }}>
          Pick a season, then pick the new video files. Files are matched to episodes in order (by file name). Titles, numbers and watch history stay.
        </Text>
        {seasons.map((season) => (
          <Pressable
            key={season.id}
            disabled={busy}
            onPress={() => setSeasonId(season.id)}
            style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: seasonId === season.id ? C.green : C.border }}
          >
            <Text style={{ color: seasonId === season.id ? C.green : C.text }}>{season.label}</Text>
          </Pressable>
        ))}
      </View>

      {seasonId ? (
        <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 }}>
          <Text style={{ color: C.muted }}>This season has {episodes.length} episodes.</Text>
          <Pressable disabled={busy} onPress={() => void pickFiles()} style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.green }}>
            <Text style={{ color: C.green, textAlign: 'center', fontWeight: '700' }}>Choose the new video files</Text>
          </Pressable>
          {files.length > 0 ? (
            <View style={{ gap: 4 }}>
              {episodes.map((ep, i) => (
                <Text key={ep.id} style={{ color: C.text }}>
                  Episode {ep.episode_number} → {files[i] ? files[i].name : 'NO FILE'}
                </Text>
              ))}
              {files.length > episodes.length ? (
                <Text style={{ color: C.error }}>Extra files with no episode: {files.slice(episodes.length).map((f) => f.name).join(', ')}</Text>
              ) : null}
            </View>
          ) : null}
          {files.length > 0 && !countsMatch ? (
            <Text style={{ color: C.error }}>
              You chose {files.length} files but this season has {episodes.length} episodes. Choose again so the numbers match.
            </Text>
          ) : null}
          <Pressable
            disabled={!countsMatch || busy}
            onPress={() => void run()}
            style={{ padding: 14, borderRadius: 12, backgroundColor: countsMatch && !busy ? C.green : C.border }}
          >
            <Text style={{ color: '#0E1014', textAlign: 'center', fontWeight: '700' }}>
              {busy ? status + ' (' + Math.round(progress) + '%)' : 'Replace ' + (countsMatch ? files.length : '') + ' videos'}
            </Text>
          </Pressable>
          {busy ? <ActivityIndicator color={C.green} /> : null}
        </View>
      ) : null}

      {message ? <Text style={{ color: C.green }}>{message}</Text> : null}
      {error ? <Text style={{ color: C.error }}>{error}</Text> : null}
    </View>
  );
}
