// Repairs soundboard clips that are stored in a container the workers cannot play.
//
// The workers demux Opus in process, so a clip named .ogg/.oga/.opus/.webm that
// actually holds Vorbis (or anything else) used to produce zero audio packets and
// no error at all - the clip simply played as silence. Playback now falls back to
// ffmpeg for those, but the fast path still wants genuine Ogg Opus, so this script
// rewrites every non-Opus clip in place.
//
// The pre-conversion bytes are copied to sounds/archived/ first, and archived
// objects are excluded from the soundboard listing.
//
//   yarn build:ts
//   node scripts/heal-sounds.js --dry-run     # report only, write nothing
//   node scripts/heal-sounds.js               # report, then convert
//
// Requires the STORAGE_* environment variables and ffmpeg on PATH. Run it against
// production with `railway run node scripts/heal-sounds.js`.

const path = require('path');
const { spawnSync } = require('child_process');
const {
  listSounds,
  readSoundHead,
  sweepTranscodeSounds,
  isStorageConfigured,
} = require('@rainbot/utils/storage');
const { detectStreamTypeFromHeader, isOpusContainer } = require('@rainbot/worker-shared');

// Extensions the workers route to an Opus demuxer. A non-Opus payload under one
// of these names is a clip that plays as silence.
const OPUS_EXTENSIONS = ['.ogg', '.oga', '.opus', '.webm'];

const dryRun = process.argv.includes('--dry-run');

function describe(head) {
  if (head === null) return 'unreadable';
  if (head.length === 0) return 'empty';
  return detectStreamTypeFromHeader(head);
}

async function audit() {
  const sounds = await listSounds();
  const rows = [];

  for (const sound of sounds) {
    const head = await readSoundHead(sound.name);
    const opus = head !== null && head.length > 0 && isOpusContainer(head);
    const demuxedAsOpus = OPUS_EXTENSIONS.includes(path.extname(sound.name).toLowerCase());

    rows.push({
      name: sound.name,
      container: describe(head),
      // Named like an Opus container but isn't one: this is a clip that was silent.
      silent: demuxedAsOpus && !opus,
      convert: !opus,
    });
  }

  return rows;
}

(async () => {
  if (!isStorageConfigured()) {
    console.error('Storage is not configured. Set STORAGE_BUCKET_NAME, STORAGE_ACCESS_KEY,');
    console.error('STORAGE_SECRET_KEY and STORAGE_ENDPOINT, or run this under `railway run`.');
    process.exit(1);
  }

  if (spawnSync('ffmpeg', ['-version']).error) {
    console.error('ffmpeg is not on PATH; every conversion would fail.');
    process.exit(1);
  }

  const rows = await audit();
  if (rows.length === 0) {
    console.log('No sounds found in the bucket.');
    process.exit(0);
  }

  const width = Math.max(...rows.map((r) => r.name.length));
  for (const row of rows) {
    const note = row.silent ? 'SILENT - will convert' : row.convert ? 'will convert' : 'ok';
    console.log(`${row.name.padEnd(width)}  ${String(row.container).padEnd(11)}  ${note}`);
  }

  const silent = rows.filter((r) => r.silent);
  const convert = rows.filter((r) => r.convert);
  console.log(
    `\n${rows.length} sound(s): ${silent.length} silent, ${convert.length} to convert, ` +
      `${rows.length - convert.length} already Ogg Opus.`
  );

  if (dryRun) {
    console.log('Dry run - nothing was written.');
    process.exit(0);
  }
  if (convert.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  console.log('\nConverting (originals copied to sounds/archived/ first)...');
  const result = await sweepTranscodeSounds({ deleteOriginal: false });
  console.log(`Converted ${result.converted}, skipped ${result.skipped}.`);

  const remaining = (await audit()).filter((r) => r.silent);
  if (remaining.length > 0) {
    console.error(`\nStill silent after the sweep: ${remaining.map((r) => r.name).join(', ')}`);
    process.exit(1);
  }
  console.log('Every sound is now readable by the workers.');
  process.exit(0);
})().catch((error) => {
  console.error('heal-sounds failed:', error);
  process.exit(1);
});
