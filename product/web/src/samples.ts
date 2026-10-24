// Stack voice samples: one short clip per curated stack, recorded on the lab VM and served as static files from /samples/,
// listed in /samples/manifest.json as { "<stackId>": { file, durationS, text, recordedAt } } (written by product/voice/vpvoice/samples.py;
// Ogg/Opus clips). A stack with no entry (or an
// entry that does not hold up) shows "No sample recorded yet"; nothing is guessed.

export interface SampleSource { src: string; type: string }
export interface Sample { stackId: string; sources: SampleSource[]; durationS: number; text: string; recorded: string }

const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(ogg|opus|mp3|m4a|aac|wav)$/;   // a plain file name in /samples/: no path, an audio format
const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/;   // a date, or the renderer's UTC timestamp
// The type the browser is asked about. Ogg/Opus has gaps on older Safari; an AAC or MP3 rendition beside it covers Macs.
const TYPE: Record<string, string> = { ogg: 'audio/ogg; codecs=opus', opus: 'audio/ogg; codecs=opus', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav' };

/** The manifest's entries that are safe and complete, keyed by stack id. An entry lists its renditions in "files"
 *  ([{src, type}], best first) or one "file" (kept for older manifests). The recording time versions each address, because
 *  the server caches static files for a year: a re-recorded clip gets a new address. */
export function parseSamples(raw: unknown): Record<string, Sample> {
  const out: Record<string, Sample> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [stackId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as Record<string, unknown>;
    const text = typeof e.text === 'string' ? e.text.trim() : '', recorded = typeof e.recordedAt === 'string' ? e.recordedAt : typeof e.recorded === 'string' ? e.recorded : '';
    const durationS = typeof e.durationS === 'number' ? e.durationS : typeof e.duration === 'number' ? e.duration : NaN;
    if (!text || !WHEN.test(recorded) || !(durationS > 0 && durationS < 600)) continue;
    const listed = Array.isArray(e.files) ? e.files : typeof e.file === 'string' ? [{ src: e.file }] : [];
    const sources: SampleSource[] = [];
    for (const f of listed) {
      if (!f || typeof f !== 'object') continue;
      const r = f as Record<string, unknown>;
      const name = typeof r.src === 'string' ? r.src.replace(/^\/samples\//, '') : typeof r.file === 'string' ? r.file : '';
      if (!FILE.test(name)) continue;
      const ext = name.split('.').pop()!.toLowerCase();
      const type = typeof r.type === 'string' && /^audio\/[a-z0-9.+-]+(;\s*codecs="?[a-z0-9.,\s-]+"?)?$/i.test(r.type) ? r.type : TYPE[ext];
      sources.push({ src: `/samples/${name}?v=${encodeURIComponent(recorded)}`, type });
    }
    if (!sources.length) continue;
    out[stackId] = { stackId, sources, durationS, text, recorded: recorded.slice(0, 10) };
  }
  return out;
}

/** Whether this browser says it may play any of the renditions ("maybe" counts; only "" rules a type out). */
export const playableIn = (sources: SampleSource[], canPlay: (type: string) => string) => sources.some(x => canPlay(x.type) !== '');

/** The manifest, read fresh (a query string skips the year-long static cache). A missing or broken manifest means no samples. */
export async function loadSamples(): Promise<Record<string, Sample>> {
  try {
    const r = await fetch(`/samples/manifest.json?t=${Date.now()}`, { credentials: 'same-origin' });
    return r.ok ? parseSamples(await r.json()) : {};
  } catch { return {}; }
}
