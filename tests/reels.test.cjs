const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { getReelFileSizeError } = require('../.test-build/src/utils/reelFileSize.js');

const config = fs.readFileSync('src/config/reels.ts', 'utf8');
const repository = fs.readFileSync('src/services/ReelsRepository.ts', 'utf8');
const player = fs.readFileSync('src/components/ShortsFeed.tsx', 'utf8');
const migration = fs.readFileSync('supabase/pending/reels-original-file-size-limit.sql', 'utf8');

test('Reel uploads accept the 50 MB boundary and reject larger or unknown sizes clearly', () => {
  const limit = 50 * 1024 * 1024;
  assert.match(config, /MAX_REEL_FILE_SIZE_BYTES = 50 \* 1024 \* 1024/);
  assert.equal(getReelFileSizeError(limit), null);
  assert.match(getReelFileSizeError(limit + 1), /larger than 50 MB/);
  assert.match(getReelFileSizeError(undefined), /couldn't check this video's size/i);
  assert.match(repository, /getReelFileSizeError\(asset\.fileSize\)/);
  assert.match(config, /MAX_REEL_DURATION_SECONDS = 180/);
});

test('Reels reuse short-lived signed URLs and set long upload cache metadata', () => {
  assert.match(repository, /signedReelUrlCache = new Map/);
  assert.match(repository, /REEL_SIGNED_URL_CACHE_MS = 55 \* 60 \* 1000/);
  assert.match(repository, /expiresIn: 3600/);
  assert.match(repository, /'Cache-Control': 'max-age=31536000'/);
});

test('Reel player caches on native, preloads only the next item, and unloads other items', () => {
  assert.match(player, /useCaching: true/);
  assert.match(player, /isNext=\{index === nextIndex\}/);
  assert.match(player, /player\.replaceAsync\(null\)/);
  assert.match(player, /audioPlayer\.replaceAsync\(null\)/);
});

test('pending bucket adjustment restores the 50 MB Reel limit', () => {
  assert.match(migration, /file_size_limit = 52428800/);
  assert.match(migration, /where id = 'reels'/);
});
