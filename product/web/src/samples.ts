// Stack voice samples: one short clip per curated stack, recorded on the lab VM and served as static files from /samples/,
// listed in /samples/manifest.json as { "<stackId>": { file, durationS, text, recordedAt } } (written by product/voice/vpvoice/samples.py;
// Ogg/Opus clips). A stack with no entry (or an
// entry that does not hold up) shows "No sample recorded yet"; nothing is guessed.

export interface Sample { stackId: string; src: string; durationS: number; text: string; recorded: string }

const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(ogg|opus|mp3|wav)$/;   // a plain file name in /samples/: no path, an audio format
const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/;   // a date, or the renderer's UTC timestamp

/** The manifest's entries that are safe and complete, keyed by stack id. The recording date versions the URL, because the
 *  server caches static files for a year: a re-recorded clip gets a new address. */
export function parseSamples(raw: unknown): Record<string, Sample> {
  const out: Record<string, Sample> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [stackId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as Record<string, unknown>;
    const file = typeof e.file === 'string' ? e.file : '', text = typeof e.text === 'string' ? e.text.trim() : '', recorded = typeof e.recordedAt === 'string' ? e.recordedAt : typeof e.recorded === 'string' ? e.recorded : '';
    const durationS = typeof e.durationS === 'number' ? e.durationS : typeof e.duration === 'number' ? e.duration : NaN;
    if (!FILE.test(file) || !text || !WHEN.test(recorded) || !(durationS > 0 && durationS < 600)) continue;
    out[stackId] = { stackId, src: `/samples/${file}?v=${encodeURIComponent(recorded)}`, durationS, text, recorded: recorded.slice(0, 10) };
  }
  return out;
}

/** The manifest, read fresh (a query string skips the year-long static cache). A missing or broken manifest means no samples. */
export async function loadSamples(): Promise<Record<string, Sample>> {
  try {
    const r = await fetch(`/samples/manifest.json?t=${Date.now()}`, { credentials: 'same-origin' });
    return r.ok ? parseSamples(await r.json()) : {};
  } catch { return {}; }
}
