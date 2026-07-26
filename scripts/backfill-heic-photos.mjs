#!/usr/bin/env node
// GarageHunt — one-time backfill converting existing .heic listing photos to
// JPEG.
//
// WHY. iPhones capture HEIC by default. No browser can decode it, so a HEIC
// photo renders fine in the mobile app but as a blank square on garagehunt.ca.
// Both upload paths now transcode to JPEG before anything reaches Storage
// (mobile: normalizeToJpegIfHeic in utils/listing-photos.ts; web: heic2any in
// src/lib/listing-photos-upload.ts), but photos uploaded before those fixes
// are still sitting in the bucket as .heic. As of 2026-07-26 that was 19 of
// 40 rows.
//
// WHAT IT DOES, per affected row: downloads the object, converts it with
// macOS's built-in `sips` (no npm dependency), uploads the JPEG under a new
// key in the same listing folder, points listing_photos.storage_key at it,
// then deletes the original. The row itself is never replaced — so
// moderation_status, sort_order, photo_type and created_at all carry over
// untouched, and nothing needs re-moderating.
//
// SAFETY. Dry-run by default: it lists what it would do and changes nothing.
// Pass --apply to actually write. Order is upload -> update DB -> delete old,
// so an interruption leaves the photo still working (worst case an orphaned
// object, which is invisible and harmless). Failures are per-photo: one bad
// file is reported and skipped, it doesn't abort the run. Safe to re-run —
// it only ever selects rows whose storage_key still ends in .heic/.heif.
//
// USAGE (macOS only, needs the service_role key to bypass RLS on the update):
//
//   export SUPABASE_URL='https://<project>.supabase.co'
//   export SUPABASE_SERVICE_ROLE_KEY='<service_role secret>'
//   node scripts/backfill-heic-photos.mjs           # dry run
//   node scripts/backfill-heic-photos.mjs --apply   # do it

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BUCKET = 'listing-photos';
const APPLY = process.argv.includes('--apply');

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing env. Set both:\n' +
      "  export SUPABASE_URL='https://<project>.supabase.co'\n" +
      "  export SUPABASE_SERVICE_ROLE_KEY='<service_role secret>'"
  );
  process.exit(1);
}

if (process.platform !== 'darwin') {
  console.error('This script uses macOS\'s `sips` to decode HEIC. Run it on a Mac.');
  process.exit(1);
}

const authHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

function randomName() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.jpg`;
}

async function listHeicPhotos() {
  // or= matches either extension. The service role bypasses RLS, so this sees
  // every seller's rows, which is the point of a backfill.
  const url =
    `${SUPABASE_URL}/rest/v1/listing_photos` +
    `?select=id,listing_id,storage_key,photo_type,moderation_status` +
    `&or=(storage_key.like.*.heic,storage_key.like.*.heif)`;
  const res = await fetch(url, { headers: authHeaders });
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function download(storageKey) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storageKey}`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function upload(storageKey, buffer) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storageKey}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'image/jpeg' },
    body: buffer,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
}

async function pointRowAt(id, storageKey) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/listing_photos?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ storage_key: storageKey }),
  });
  if (!res.ok) throw new Error(`db update failed: ${res.status} ${await res.text()}`);
}

async function removeObject(storageKey) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storageKey}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  // A failure here just leaves an unreferenced object behind — nothing renders
  // it, so warn and carry on rather than failing the photo.
  if (!res.ok) console.warn(`    ! could not delete original (${res.status}) — harmless, it's now unreferenced`);
}

function heicToJpeg(buffer, workDir) {
  const inPath = join(workDir, 'in.heic');
  const outPath = join(workDir, 'out.jpg');
  writeFileSync(inPath, buffer);
  execFileSync('sips', ['-s', 'format', 'jpeg', inPath, '--out', outPath], { stdio: 'pipe' });
  const out = readFileSync(outPath);
  // Same guard the upload paths use — a "successful" conversion that produces
  // a tiny file means the decode silently failed, and uploading it would
  // replace a working photo with a broken one.
  if (out.length < 1000) throw new Error(`converted file suspiciously small (${out.length} bytes)`);
  return out;
}

const rows = await listHeicPhotos();
console.log(`Found ${rows.length} HEIC photo(s).`);
if (rows.length === 0) process.exit(0);
if (!APPLY) console.log('DRY RUN — nothing will be changed. Re-run with --apply to convert.\n');

let converted = 0;
const failures = [];

for (const row of rows) {
  const folder = row.storage_key.split('/')[0];
  const newKey = `${folder}/${randomName()}`;
  console.log(`  ${row.storage_key}`);
  console.log(`    -> ${newKey}`);

  if (!APPLY) continue;

  const workDir = mkdtempSync(join(tmpdir(), 'gh-heic-'));
  try {
    const original = await download(row.storage_key);
    const jpeg = heicToJpeg(original, workDir);
    await upload(newKey, jpeg);
    await pointRowAt(row.id, newKey);
    await removeObject(row.storage_key);
    console.log(`    ok (${original.length} -> ${jpeg.length} bytes)`);
    converted += 1;
  } catch (err) {
    console.error(`    FAILED: ${err.message}`);
    failures.push({ storage_key: row.storage_key, error: err.message });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

console.log('');
if (APPLY) {
  console.log(`Converted ${converted}/${rows.length}.`);
  if (failures.length) {
    console.log(`${failures.length} failed (left untouched, safe to re-run):`);
    failures.forEach((f) => console.log(`  ${f.storage_key} — ${f.error}`));
    process.exit(1);
  }
} else {
  console.log(`Would convert ${rows.length}. Re-run with --apply.`);
}
