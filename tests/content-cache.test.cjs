const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

const cache = fs.readFileSync('src/services/ContentQueryCache.ts', 'utf8');
const worker = fs.readFileSync('public/service-worker.js', 'utf8');
const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
const search = fs.readFileSync('app/(tabs)/search.tsx', 'utf8');
const homeList = fs.readFileSync('app/home-list.tsx', 'utf8');
const details = fs.readFileSync('app/content/[id].tsx', 'utf8');
const playbackError = fs.readFileSync('src/utils/playbackError.ts', 'utf8');
const downloadContext = fs.readFileSync('src/state/DownloadsContext.tsx', 'utf8');
const offlineBadge = fs.readFileSync('src/components/OfflineBadge.tsx', 'utf8');
const offlineBanner = fs.readFileSync('src/components/OfflineBanner.tsx', 'utf8');
const contentRail = fs.readFileSync('src/components/ContentRail.tsx', 'utf8');
const posterCard = fs.readFileSync('src/components/PosterCard.tsx', 'utf8');
const heroCarousel = fs.readFileSync('src/components/HomeHeroCarousel.tsx', 'utf8');
const library = fs.readFileSync('app/(tabs)/library.tsx', 'utf8');
const webOfflineStore = fs.readFileSync('src/utils/webOfflineStore.ts', 'utf8');
const downloads = fs.readFileSync('src/state/DownloadsContext.tsx', 'utf8');
const downloadsScreen = fs.readFileSync('app/(tabs)/downloads.tsx', 'utf8');
const watchScreen = fs.readFileSync('app/watch/[id].tsx', 'utf8');
const downloadSheet = fs.readFileSync('src/components/detail/DownloadSheet.tsx', 'utf8');

test('catalog cache uses device storage and Cache Storage on web', () => {
  assert.match(cache, /AsyncStorage\.getItem/);
  assert.match(cache, /AsyncStorage\.setItem/);
  assert.match(cache, /caches\.open\(WEB_CACHE_NAME\)/);
  assert.match(cache, /cache\.put\(request/);
});

test('web service worker refreshes app shell and static assets while serving cached images', () => {
  assert.match(worker, /request\.destination !== 'image'/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /\['script', 'style', 'font'\]/);
  assert.match(worker, /cache\.add\('\/'\)/);
  assert.match(worker, /cache\.match\(request\)/);
  assert.match(worker, /event\.waitUntil\(refresh/);
  assert.match(worker, /cached \?\? refresh/);
  assert.match(worker, /MAX_CACHED_IMAGES/);
  assert.match(worker, /MAX_CACHED_SHELL_REQUESTS/);
  assert.doesNotMatch(worker, /destination === 'video'/);
});

test('Home and Search share the same saved catalog and remain rendered offline', () => {
  assert.match(home, /useContentQuery\('home-supabase-catalog',[\s\S]*?'home-catalog'\)/);
  assert.match(search, /useContentQuery\('search-supabase-catalog',[\s\S]*?'home-catalog'\)/);
  assert.match(search, /search-placeholder-\$\{index\}/);
  assert.doesNotMatch(home, /if \(!isOnline\)\s*\{\s*return/);
  assert.doesNotMatch(search, /if \(!isOnline\)\s*\{\s*return/);
  assert.match(homeList, /getCachedPublishedTitlesPage/);
  assert.match(details, /getCachedCatalogItem/);
  assert.doesNotMatch(details, /<OfflineState/);
  assert.match(playbackError, /Connect to the internet to watch/);
  assert.match(downloadContext, /Connect to the internet to prepare this download/);
});

test('cached catalog slides and rows are labeled offline without claiming downloads are required for browsing', () => {
  assert.match(home, /offline=\{!isOnline\}/);
  assert.match(contentRail, /offline=\{offline\}/);
  assert.match(posterCard, /offline \? <OfflineBadge compact \/>/);
  assert.match(heroCarousel, /offline \? <View pointerEvents="none" style=\{styles\.offlineLabel\}><OfflineBadge \/><\/View>/);
  assert.match(search, /offlineSpotBadge/);
  assert.match(library, /offline=\{!isOnline\}/);
  assert.match(offlineBadge, /cloud-offline-outline/);
  assert.match(offlineBanner, /saved catalog is available/);
  assert.doesNotMatch(offlineBanner, /only downloaded titles are available/);
});

test('web downloads persist with title metadata, reappear in Downloads, and feed offline playback', () => {
  assert.match(webOfflineStore, /indexedDB\.open\(DB_NAME/);
  assert.match(webOfflineStore, /meta: WebOfflineMeta = \{ id: item\.id, title: item\.title, item/);
  assert.match(webOfflineStore, /URL\.createObjectURL/);
  assert.match(downloads, /Platform\.OS === 'web'[\s\S]*saveToOffline\(item, url/);
  assert.match(downloads, /loadBrowserDownloadRecords\(\)/);
  assert.match(downloads, /getOfflineUrl\(item\.id\)/);
  assert.match(downloadsScreen, /visibleRecords\.map/);
  assert.match(downloadsScreen, /Platform\.OS !== 'web' && record\.status/);
  assert.match(watchScreen, /setPlaybackUrl\(localDownload\.filePath\)/);
  assert.match(downloadSheet, /Saved in this browser for offline playback/);
});
