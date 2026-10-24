// The data layer: turns the real tools' answers into the view models the pages draw, and turns page actions into tool calls.
// Pure TypeScript (no JSX). Every read goes through run(), so a tool that is not registered throws ToolMissing and the page
// shows its "not switched on yet" state. Shapes here follow product/shared/tool-catalog.json and the module code.
import { run, uploadContacts } from './api.ts';
import { partsRan } from './catalog.ts';
import type {
  ActivityRow, AgentConfigDraft, AgentDoc, AgentRow, ApiKey, AudienceRow, Blocker, CallDoc, CallExplain, CallRow, CallTurn, CampaignDoc, CampaignRow, ContactDoc, ContactRow,
  Estimate, FunnelStage, ImportPreview, ImportRowVerdict, KnowledgeItem, Member, NumberLine, PracticeCaller, SimResult, Wallet,
} from './types.ts';

const arr = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : []);

// ---------- agents ----------
interface RawAgent { id: string; name: string; job: string; status: string; updated_at: string; latest_version: number | null }
export function normaliseConfig(d: any): AgentConfigDraft {
  const c = structuredClone(d) as AgentConfigDraft;
  c.voice = { ...c.voice, stackId: c.voice?.stackId ? c.voice.stackId : null };
  c.sectorPacks ??= ['base']; c.neverSay ??= []; c.objections ??= []; c.facts ??= []; c.goals ??= []; c.tools ??= [];
  c.persona.notes ??= []; c.handOff ??= { when: [], target: { kind: 'queue' }, warmSummary: true } as AgentConfigDraft['handOff'];
  return c;
}
export async function agentGet(id: string): Promise<AgentDoc> {
  const r = await run<any>('agent.get', { agentId: id });
  const versions = arr<any>(r.versions).map(v => ({ id: v.id, number: v.number, note: v.note ?? null, createdAt: v.created_at ?? v.createdAt, by: v.author_type === 'member' ? 'A teammate' : v.author_type === 'operator' ? 'Assistant' : 'Vyakti', candidate: v.kind === 'candidate' }))
    .sort((a, b) => b.number - a.number);
  return {
    id, name: r.agent.name, updatedAt: r.agent.updatedAt, draftHash: r.draftHash, config: normaliseConfig(r.draft), compiles: !!r.compiles,
    lint: arr<any>(r.lint).map(l => (typeof l === 'string' ? { message: l } : { message: l.message ?? l.rule ?? JSON.stringify(l), severity: l.severity })),
    briefBytes: r.brief?.bytes ?? null, versions, latestVersionId: r.liveVersion?.id ?? null, latestVersion: r.liveVersion?.number ?? null,
  };
}
/** Which agent and version a campaign or call ran, from its agent version id (agent.list, then each agent's versions). */
export async function agentByVersion(versionId: string): Promise<{ id: string; name: string; number: number } | null> {
  const r = await run<{ agents: { id: string }[] }>('agent.list', {});
  for (const a of r.agents) {
    const d = await agentGet(a.id).catch(() => null);
    const v = d?.versions.find(x => x.id === versionId);
    if (d && v) return { id: a.id, name: d.name, number: v.number };
  }
  return null;
}
export async function agentList(): Promise<AgentRow[]> {
  const r = await run<{ agents: RawAgent[] }>('agent.list', {});
  return Promise.all(r.agents.map(async a => {
    let cfg: AgentConfigDraft | null = null;
    try { cfg = normaliseConfig((await run<any>('agent.get', { agentId: a.id })).draft); } catch { /* keep the row without detail */ }
    return { id: a.id, name: a.name, job: a.job, status: a.latest_version ? 'published' : 'draft', latestVersion: a.latest_version, updatedAt: a.updated_at, category: cfg?.category ?? '', stackId: cfg?.voice.stackId ?? null, components: cfg?.voice.components, languages: cfg?.languages.allowed ?? [] } as AgentRow;
  }));
}
export interface PatchOp { op: 'set'; path: string; value: unknown }
const SKIP = new Set(['schema', 'agentId', 'version', 'versionHash', 'voice']);
/** Leaf-level `set` operations for brief.edit, from the saved config to the edited one. Arrays are replaced whole. */
export function diffOps(a: any, b: any, prefix = ''): PatchOp[] {
  const out: PatchOp[] = [];
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    if (!prefix && SKIP.has(k)) continue;
    const p = prefix ? `${prefix}.${k}` : k; const x = a?.[k], y = b?.[k];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    if (y && x && typeof y === 'object' && typeof x === 'object' && !Array.isArray(y) && !Array.isArray(x)) out.push(...diffOps(x, y, p));
    else if (y !== undefined) out.push({ op: 'set', path: p, value: y });
  }
  return out;
}

export async function practiceCallers(agentId?: string): Promise<PracticeCaller[]> {
  const r = await run<{ callers: any[] }>('simcaller.list', agentId ? { agentId } : {});
  return r.callers.map(c => ({ id: c.id, label: c.label, persona: c.persona, trap: c.trap, source: c.source }));
}
const CHECK_WORDS: Record<string, string> = { trap_reached: 'the simulated caller sprang its trap', opt_out_respected: 'stopped when asked not to be called', stays_on_the_line: 'kept the caller on the line', agent_turns: 'kept to a sensible number of turns', words_per_turn: 'short turns', question_streak: 'not a run of questions', no_repeats: 'no sentence said twice', reply_door: 'safety door' };
export async function simulate(agentId: string, callers: PracticeCaller[]): Promise<SimResult[]> {
  const out = await Promise.allSettled(callers.map(c => run<any>('test.simulate', { agentId, simCallerId: c.id })));
  return out.map((o, i) => {
    const label = callers[i].label;
    if (o.status === 'rejected') return { id: 'sim' + i, scenario: label, verdict: 'invalid', reason: (o.reason as Error).message, turns: [], checks: [] } as SimResult;
    const r = o.value; const grades = arr<any>(r.grades);
    const failed = grades.filter(g => !g.pass);
    // A trap that was never sprung says nothing about the agent: inconclusive, not a failure.
    const verdict = !failed.length ? 'pass' : failed.every(g => g.check === 'trap_reached') ? 'inconclusive' : 'fail';
    return { id: r.runId, scenario: label, verdict, turns: arr<any>(r.transcript).map(t => ({ who: t.who, text: t.text })), endedBy: r.endedBy,
      reason: verdict === 'inconclusive' ? 'The simulated caller never sprang its trap, so this run says nothing about the agent. Run it again.' : undefined,
      checks: grades.map(g => ({ label: CHECK_WORDS[g.check] ?? String(g.check).replace(/_/g, ' '), ok: !!g.pass, detail: g.detail })) } as SimResult;
  });
}

// ---------- people ----------
export async function contactList(o: { q?: string; audienceId?: string; suppressed?: boolean }): Promise<{ rows: ContactRow[]; more: boolean }> {
  if (o.q?.trim()) {
    const r = await run<{ contacts: any[] }>('contact.search', { q: o.q.trim(), limit: 50 });
    return { rows: r.contacts.map(c => ({ id: c.id, name: c.name ?? 'No name', phone: c.e164, language: c.language ?? '', suppressed: false, dnd: 'unknown', dndCheckedAt: null })), more: false };
  }
  const r = await run<{ contacts: any[]; next: string | null }>('contact.list', { limit: 50, audienceId: o.audienceId, suppressed: o.suppressed });
  return { rows: r.contacts.map(c => ({ id: c.id, name: c.name ?? 'No name', phone: c.e164, language: c.language ?? '', suppressed: !!c.suppressed, dnd: c.dnd ?? 'unknown', dndCheckedAt: c.dndCheckedAt ?? null })), more: !!r.next };
}
export async function contactGet(id: string): Promise<ContactDoc> {
  const [c, mem, att] = await Promise.all([
    run<any>('contact.get', { id }),
    run<any>('contact.memory.get', { contactId: id }).catch(() => null),
    run<any>('attempt.list', { contactId: id, limit: 20 }).catch(() => ({ attempts: [] })),
  ]);
  return { id: c.id, name: c.name ?? 'No name', phone: c.e164, language: c.language ?? '', timezone: c.timezone, dnd: { status: c.dnd?.status ?? 'unknown', checkedAt: c.dnd?.checkedAt ?? null, fresh: !!c.dnd?.fresh },
    attributes: arr(c.attributes), consent: arr(c.consent), suppressions: arr(c.suppressions), service: c.service ?? { allowed: false, reasons: [] }, promotional: c.promotional ?? { allowed: false, reasons: [] },
    attempts: arr(att.attempts), memory: mem ? { optedOut: !!mem.optedOut, facts: arr(mem.facts) } : null };
}
export async function audienceList(): Promise<AudienceRow[]> {
  const r = await run<{ audiences: any[] }>('audience.list', {});
  return Promise.all(r.audiences.map(async a => {
    try { const g = await run<any>('audience.get', { id: a.id }); return { id: a.id, name: a.name, matched: g.matched, callable: g.callable, suppressed: g.suppressed, dndUnknown: g.dndUnknown, note: g.note ?? '' }; }
    catch { return { id: a.id, name: a.name, matched: null, callable: null, suppressed: null, dndUnknown: null, note: '' }; }
  }));
}

// ---------- import ----------
const REJECT_TEXT: Record<string, string> = {
  EMPTY: 'The phone cell is empty', SCI_NOTATION: 'Excel turned the number into 9.1E+11; the digits are lost. Re-export the column as text', NON_INDIAN: 'A +country code other than +91; kept but not dialled',
  TOO_SHORT: 'Too few digits for an Indian number', TOO_LONG: 'Too many digits for an Indian number', INVALID_PREFIX: 'An Indian mobile number cannot start with that digit', NOT_A_NUMBER: 'Not a phone number', LANDLINE_TRUNCATED: 'A landline with missing digits',
};
export function parseCsvSample(text: string, col: number): string[] {
  return text.split(/\r?\n/).slice(1, 4).map(l => (l.split(',')[col] ?? '').trim());
}
/** Agents by name, for the import screen's "Which agent will call them?" (no per-agent detail fetched). */
export async function agentNames(): Promise<{ id: string; name: string }[]> {
  return arr<any>((await run<{ agents: unknown[] }>('agent.list', {})).agents).map(a => ({ id: a.id, name: a.name }));
}
export async function importUpload(text: string, name: string): Promise<string> {
  const r = await run<{ uploadId: string }>('source.upload', { kind: 'csv', name, text, filename: name });
  return r.uploadId;
}
/** A chosen file to an upload: Excel goes as base64 and is read on the server; text files go as text. Up to 20 MB. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const isExcel = (f: File) => /\.xlsx$/i.test(f.name) || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export async function importUploadFile(f: File): Promise<{ uploadId: string; text: string }> {
  if (isExcel(f)) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { uploadId: (await uploadContacts({ base64: btoa(bin), filename: f.name })).uploadId, text: '' };
  }
  const text = await f.text();
  return { uploadId: (await uploadContacts({ text, filename: f.name })).uploadId, text };
}
const OVERRIDE_NOTE = /^(voice|first message): /;
export async function importMap(uploadId: string, text: string, overrides?: Record<string, { field: string; key?: string }>, agentId?: string): Promise<ImportPreview> {
  const r = await run<any>('source.map', { uploadId, overrides, previewRows: 100, ...(agentId ? { agentId } : {}) });
  const nameOf = (p: any) => p.attributes?.name as string | undefined;
  const rows: ImportRowVerdict[] = arr<any>(r.preview).map(p => {
    const v: string = p.verdict;
    const refused = arr<string>(p.notes).filter(n => OVERRIDE_NOTE.test(n));
    if ((v === 'new' || v === 'update' || v === 'unchanged') && refused.length) return { row: p.row, phone: p.phone, verdict: 'review', name: nameOf(p), reason: `Will be called, but not with this ${refused.map(n => n.replace(/^(voice|first message): .*/, '$1')).join(' or ')}: ${refused[0].replace(OVERRIDE_NOTE, '')}` };
    if (v === 'new' || v === 'update' || v === 'unchanged') return { row: p.row, phone: p.phone, verdict: 'ok', name: nameOf(p), reason: v === 'update' ? 'Already on file; details will be merged' : undefined };
    if (v === 'duplicate_in_file') return { row: p.row, phone: p.phone, verdict: 'duplicate', name: nameOf(p), reason: 'Same number as an earlier row' };
    if (v === 'suppressed' || v === 'tombstoned') return { row: p.row, phone: p.phone, verdict: 'suppressed', name: nameOf(p), reason: 'This person asked not to be called' };
    if (v === 'conflict_review') return { row: p.row, phone: p.phone, verdict: 'review', name: nameOf(p), reason: 'Two sources disagree; a person should look' };
    return { row: p.row, phone: null, verdict: 'skipped', name: nameOf(p), reason: REJECT_TEXT[v] ?? v };
  });
  const cols = arr<any>(r.columns).map(c => ({ header: c.header, sample: Array.isArray(c.samples) ? c.samples : parseCsvSample(text, c.column), field: c.field === 'attribute' ? `attribute:${c.key}` : c.field, key: c.key, confidence: c.confidence, why: c.why }));
  const rej = Object.values<number>(r.phones?.rejected ?? {}).reduce((a, b) => a + b, 0);
  return { uploadId, columns: cols, rows, counts: { in: r.rowsTotal, callable: r.phones?.ok ?? 0, duplicate: r.phones?.duplicatesInFile ?? 0, skipped: rej }, questions: arr<any>(r.questions).map(q => ({ text: typeof q === 'string' ? q : q.text ?? JSON.stringify(q) })),
    ...(r.agentFacts ? { agentFacts: { agent: r.agentFacts.agent, facts: arr<any>(r.agentFacts.facts).map(f => ({ key: f.key, label: f.label, status: f.status, column: f.column, suggestions: arr<string>(f.suggestions) })) } } : {}),
    ...(r.converted ? { converted: { sheet: r.converted.sheet, rows: r.converted.rows, formulaCells: r.converted.formulaCells, formulaWithoutValue: r.converted.formulaWithoutValue } } : {}) };
}
export function overridesFrom(cols: ImportPreview['columns']): Record<string, { field: string; key?: string }> {
  return Object.fromEntries(cols.map(c => c.field.startsWith('attribute:') ? [c.header, { field: 'attribute', key: c.key }] : [c.header, { field: c.field, key: c.key }]));
}

// ---------- campaigns ----------
export async function campaignList(): Promise<CampaignRow[]> {
  const r = await run<{ campaigns: any[] }>('campaign.list', {});
  return r.campaigns.map(c => ({ id: c.id, name: c.name, category: c.category, state: c.state, pauseCause: c.pause_cause, attempts: c.attempts ?? 0, blocked: c.blocked ?? 0, launchedAt: c.launched_at }));
}
export async function campaignGet(id: string): Promise<CampaignDoc> {
  const r = await run<any>('campaign.get', { id });
  const c = r.campaign, p = c.policy ?? {};
  return { id: c.id, name: c.name, category: c.call_category, state: c.state, policyVersion: c.policy_version, agentVersionId: c.agent_version_id, audienceId: c.audience_id,
    window: p.window ?? { days: [], ranges: [] }, concurrency: p.concurrency ?? null, capInrMilli: p.capInrMilli ?? null, preset: p.preset, counts: arr(r.counts),
    blockers: arr<Blocker>(r.blockers), version: r.version };
}
export async function campaignEstimate(id: string): Promise<Estimate> { return run<Estimate>('campaign.estimate', { id }); }
export async function campaignFunnel(campaignId: string, audienceId: string | null): Promise<FunnelStage[]> {
  const f = await run<any>('campaign.funnel', { campaignId });
  let matched: number | null = null, callable: number | null = null;
  if (audienceId) { try { const a = await run<any>('audience.get', { id: audienceId }); matched = a.matched; callable = a.callable; } catch { /* funnel without the audience rows */ } }
  const t = f.total ?? {};
  return [
    { key: 'matched', label: 'People in the audience', n: matched }, { key: 'callable', label: 'Callable now', n: callable, note: matched != null && callable != null && matched > callable ? `${matched - callable} ${matched - callable === 1 ? 'person is' : 'people are'} suppressed or blocked and will not be called` : undefined },
    { key: 'dialled', label: 'Dialled', n: t.dialled ?? 0 }, { key: 'connected', label: 'Connected', n: t.connected ?? 0 }, { key: 'talked', label: 'Talked', n: t.talked ?? 0 },
    { key: 'goal', label: 'Goal reached', n: t.goalReached ?? 0, note: t.goalByGrade ? `${t.goalByGrade.verified} confirmed by your system, ${t.goalByGrade.manager} by a person, ${t.goalByGrade.ai_guess} AI guess` : undefined },
  ];
}

// ---------- calls ----------
let nameCache: { at: number; map: Map<string, string> } | null = null;
async function contactNames(): Promise<Map<string, string>> {
  if (nameCache && Date.now() - nameCache.at < 30_000) return nameCache.map;
  const m = new Map<string, string>();
  try { for (const c of (await run<{ contacts: any[] }>('contact.list', { limit: 200 })).contacts) m.set(c.id, c.name ?? c.e164); } catch { /* names are optional */ }
  nameCache = { at: Date.now(), map: m }; return m;
}
export async function callSearch(o: { campaignId?: string; outcome?: string; includeTest?: boolean }): Promise<CallRow[]> {
  const [r, names] = await Promise.all([run<{ calls: any[] }>('call.search', { campaignId: o.campaignId, outcome: o.outcome, includeTest: o.includeTest, limit: 100 }), contactNames()]);
  return r.calls.map(c => ({ id: c.id, contactName: names.get(c.contact_id) ?? 'Unknown person', startedAt: c.started_at, durationS: c.duration_s, outcome: c.outcome, grade: c.grade, reasonLabel: c.reasonLabel, costMilli: c.cost_inr_milli, flagged: !!c.flagged, channel: c.channel, status: c.status, campaignId: c.campaign_id ?? null }));
}
export async function callGet(id: string): Promise<CallDoc> {
  const c = await run<any>('call.get', { conversationId: id });
  const names = await contactNames();
  let turns: CallTurn[] = arr<any>(c.turns).map(t => ({ idx: t.idx, who: t.speaker === 'agent' ? 'agent' : 'caller', text: t.text, startMs: t.started_ms, endMs: t.ended_ms, latencyMs: t.latency?.latencyMs ?? (typeof t.latency === 'number' ? t.latency : null), interrupted: !!t.interrupted }));
  if (!turns.length && Array.isArray(c.transcript)) turns = c.transcript.map((t: any, i: number) => ({ idx: i, who: t.speaker === 'agent' ? 'agent' : 'caller', text: t.text, startMs: t.startMs ?? null, endMs: null, latencyMs: null, interrupted: false }));
  const totalMs = Math.max(1000, (c.durationS ?? 0) * 1000, ...turns.map(t => t.endMs ?? t.startMs ?? 0));
  const a = c.analysis;
  return { id: c.id, contactId: c.contactId, contactName: names.get(c.contactId) ?? 'Unknown person', campaignId: c.campaignId ?? null, test: !!c.test, status: c.status, startedAt: c.startedAt, durationS: c.durationS, endReason: c.endReason, reason: c.reason, outcome: c.outcome,
    // The server's fresh signed link when the recording may be played (call.get recording); else the stored address and why not.
    recordingUri: c.recording?.url ?? c.recordingUri, recordingWhy: c.recording?.why ?? null, transcriptWhy: c.transcriptRemoved ?? null, verified: c.verified ?? null, ran: c.runManifest?.stackId ?? c.runManifest?.combinationId ?? null, ranParts: partsRan(c.runManifest?.components), turns,
    moments: arr<any>(c.moments).map(m => ({ source: m.source, kind: m.kind, atMs: m.at_ms, note: m.note, quote: m.quote })), safety: arr(c.safety), judgeMarks: arr<any>(c.judgeMarks).map(j => ({ seq: j.seq, label: j.label, outcome: j.outcome, text: String(j.text) })), tools: arr(c.tools), handOffs: arr(c.handOffs),
    outcomes: arr(c.outcomes), costTotal: c.cost?.totalInrMilli ?? 0, costLines: arr(c.cost?.lines), settlement: c.cost?.settlement?.action ?? (typeof c.cost?.settlement === 'string' ? c.cost.settlement : null),
    analysis: a ? { status: a.status, summary: a.summary, reason: a.reason } : null, totalMs };
}
export const callExplain = (id: string) => run<CallExplain>('call.explain', { conversationId: id });

// ---------- money and settings ----------
export async function walletGet(): Promise<Wallet> {
  const w = await run<any>('wallet.get', {});
  return { state: w.state, balanceMilli: w.balanceInrMilli, heldMilli: w.heldInrMilli, availableMilli: w.availableInrMilli, runwayDays: w.runwayDays ?? null, caps: arr(w.caps), warnings: arr(w.warnings), priceNotSet: w.price?.status === 'not_set', priceText: w.price?.text ?? '' };
}
export async function memberList(): Promise<Member[]> { return arr((await run<any>('member.list', {})).members); }
export async function keyList(): Promise<ApiKey[]> {
  return arr<any>((await run<any>('apikey.list', {})).keys).map(k => ({ id: k.id, name: k.name ?? k.label, prefix: k.prefix ?? '', createdAt: k.created_at ?? k.createdAt, lastUsed: k.last_used_at ?? k.lastUsedAt ?? null, revoked: !!(k.revoked_at ?? k.revokedAt) }));
}
export async function knowledgeList(): Promise<KnowledgeItem[]> {
  return arr<any>((await run<any>('knowledge.list', {})).sources).map(s => ({ id: s.id, title: s.title, status: s.status, passages: s.spans ?? 0, createdAt: s.createdAt, approved: s.approved, pending: s.pending }) as KnowledgeItem);
}
export async function activityList(): Promise<ActivityRow[]> {
  return arr<any>((await run<any>('activity.list', { limit: 50 })).items).map(i => ({ id: i.id, at: i.at, line: i.line, action: i.action, subject: i.subject?.name ?? null, tool: i.tool ?? null, who: i.actor?.type === 'member' ? 'A teammate' : i.actor?.type ?? 'Vyakti' }));
}

export async function numberList(): Promise<NumberLine[]> {
  const r = await run<{ numbers: any[] }>('number.list', { limit: 100 });
  return r.numbers.map(n => ({ id: n.id, e164: n.e164, series: n.series, trial: !!n.trial, status: n.status, kycStatus: n.kyc_status ?? null, a2pStatus: n.a2p_status ?? null, carrier: n.carrier ?? null, byo: !!n.byo, displayName: n.display_name ?? null, pauseCause: n.pause_cause ?? null, campaigns: arr(n.campaigns) }));
}

/** A template agent is made with the template's example business name. Put the workspace's own name there instead, as an ordinary draft edit
 *  the person can see and change on the agent's first tab. (The server could default it; this keeps the screen right either way.) */
export async function adoptBusinessName(act: (tool: string, args: unknown, o?: { quiet?: boolean }) => Promise<{ ok: boolean }>, agentId: string, businessName: string): Promise<boolean> {
  if (!businessName.trim()) return false;
  const r = await act('brief.edit', { agentId, patch: [{ op: 'set', path: ['brand', 'name'].join('.'), value: businessName.trim() }, { op: 'set', path: ['brand', 'spokenName'].join('.'), value: businessName.trim() }] }, { quiet: true });
  return r.ok;
}
