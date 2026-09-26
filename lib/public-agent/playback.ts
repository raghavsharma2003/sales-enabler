type Segment = { start: number; end: number; samples: number };
type PlaybackItem = { id: string; responseId: string; heardSamples: number; segments: Segment[]; discarded: boolean };

/** Browser audio-clock ledger. Scheduling gaps never count as heard speech. */
export class PublicPlaybackLedger {
  private items: PlaybackItem[] = [];
  private suppressedResponses = new Set<string>();
  private lastResponseId = '';

  private compact(now: number) {
    for (const item of this.items) while (item.segments.length > 0 && item.segments[0].end <= now) {
      const segment = item.segments.shift()!;
      item.heardSamples += segment.samples;
    }
  }

  schedule(input: { itemId: string; responseId: string; start: number; duration: number; now: number }): boolean {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.itemId) || !/^[A-Za-z0-9_-]{1,100}$/.test(input.responseId) || ![input.start, input.duration, input.now].every(Number.isFinite) || input.duration <= 0 || input.start < input.now) throw new Error('Invalid audio playback item.');
    this.compact(input.now);
    if (this.suppressedResponses.has(input.responseId)) return false;
    let item = this.items.find(candidate => candidate.id === input.itemId);
    if (item && item.responseId !== input.responseId) throw new Error('Audio item changed response ownership.');
    if (item?.discarded) return false;
    if (!item) {
      if (this.items.length >= 100) throw new Error('Audio item limit reached.');
      item = { id: input.itemId, responseId: input.responseId, heardSamples: 0, segments: [], discarded: false }; this.items.push(item);
    }
    if (item.segments.length >= 4096) throw new Error('Audio segment limit reached.');
    // AudioBuffer durations originate from integer 24kHz PCM samples. Never recover a completed
    // duration by subtracting large audio-clock timestamps (4.1 - 4 can become 99.999...ms).
    const samples = Math.round(input.duration * 24000);
    if (samples < 1) throw new Error('Invalid audio sample duration.');
    item.segments.push({ start: input.start, end: input.start + samples / 24000, samples }); this.lastResponseId = input.responseId;
    return true;
  }

  /** A drained queue carries a heard watermark, never a claim that fully heard audio needs truncation. */
  interrupt(now: number): { itemId?: string; lastHeardItemId?: string; playedMs: number } {
    this.compact(now);
    const unheard = this.items.filter(item => !item.discarded && item.segments.some(segment => segment.end > now));
    const first = unheard[0];
    const lastHeard = first ? undefined : [...this.items].reverse().find(item => !item.discarded && item.responseId === this.lastResponseId && item.segments.length === 0 && item.heardSamples > 0);
    const heardMs = first ? first.heardSamples / 24 + first.segments.reduce((sum, segment) => sum + Math.max(0, Math.min(now, segment.end) - segment.start) * 1000, 0) : (lastHeard?.heardSamples || 0) / 24;
    for (const item of unheard) { item.discarded = true; item.segments = []; this.suppressedResponses.add(item.responseId); }
    // A cancel-only interrupt must also discard already-in-flight chunks from the response being cancelled.
    if (this.lastResponseId) this.suppressedResponses.add(this.lastResponseId);
    // This tolerance is <1/400,000 of a PCM sample; it repairs binary floating-point noise
    // at integer-ms boundaries without rounding genuine fractional playback up.
    return { ...(first ? { itemId: first.id } : lastHeard ? { lastHeardItemId: lastHeard.id } : {}), playedMs: Math.max(0, Math.floor(heardMs + 1e-7)) };
  }
}
