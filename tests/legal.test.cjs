const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

const documents = fs.readFileSync('src/constants/legalDocuments.ts', 'utf8');
const server = fs.readFileSync('backend/src/http/server.ts', 'utf8');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const sheet = fs.readFileSync('src/components/auth/SignInToContinueSheet.tsx', 'utf8');
const modal = fs.readFileSync('src/components/auth/SignInToContinueModal.tsx', 'utf8');

test('legal documents describe real services and retain only the contact placeholder', () => {
  for (const phrase of ['Flutterwave', 'Supabase', 'Backblaze B2', 'push token', 'creator rewards', 'Downloads']) {
    assert.match(documents, new RegExp(phrase, 'i'));
  }
  assert.match(documents, /\[CONTACT EMAIL\]/);
  assert.doesNotMatch(documents, /\[(?:MINIMUM AGE|REFUND RULE)\]/);
});

test('legal pages are public at app and backend web routes', () => {
  assert.match(server, /pathname === '\/terms' \|\| pathname === '\/legal\/terms'/);
  assert.match(server, /pathname === '\/privacy' \|\| pathname === '\/legal\/privacy'/);
  assert.match(layout, /<Stack\.Screen name="terms"/);
  assert.match(layout, /<Stack\.Screen name="privacy"/);
  assert.match(fs.readFileSync('app/terms.tsx', 'utf8'), /kind="terms"/);
  assert.match(fs.readFileSync('app/privacy.tsx', 'utf8'), /kind="privacy"/);
});

test('both account entry surfaces link Terms and Privacy before continuing', () => {
  for (const screen of [sheet, modal]) {
    assert.match(screen, /By continuing, you agree to the/);
    assert.match(screen, /router\.push\('\/terms'\)/);
    assert.match(screen, /router\.push\('\/privacy'\)/);
  }
});
