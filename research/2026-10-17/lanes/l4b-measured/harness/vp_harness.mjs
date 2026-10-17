// vp_harness.mjs: drive a public browser voice demo with scripted caller audio and record both sides.
//
//   node vp_harness.mjs probe <demoId>                       # click through, say hello once, report transport
//   node vp_harness.mjs run   <demoId> <personaId> [repTag]  # full battery turn list for one persona
//
// Inputs:  demos.json (per-vendor click flow), ../battery/battery.json + ../battery/audio/*.wav (caller clips)
// Outputs: <OUT>/<demo>__<persona>__<tag>.{wav,json}   (OUT = $VP_REC_DIR or scratch research-raw/l4b-measured/runs)
//          .wav is 16 kHz stereo: L = caller as fed to the page's microphone, R = agent audio as sent to the speaker.
//          .json holds the turn plan, timestamps, events, websockets and transport diagnostics.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } // owner laptop: npm i playwright next to this file
catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); } // research sandbox

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANE = path.resolve(HERE, '..');
const SANDBOX_OUT = '/tmp/claude-0/-home-user/5e2837be-8576-5279-a870-65aba61ebd82/scratchpad/research-raw/l4b-measured/runs';
const OUT = process.env.VP_REC_DIR || (fs.existsSync(path.dirname(SANDBOX_OUT)) ? SANDBOX_OUT : path.join(LANE, 'recordings', 'owner'));
fs.mkdirSync(OUT, { recursive: true });
const [mode, demoId, personaId = 'P1', tag = String(Date.now())] = process.argv.slice(2);
const demos = JSON.parse(fs.readFileSync(path.join(HERE, 'demos.json'), 'utf8'));
// 'manual' = owner mode: open VP_URL (e.g. a vendor dashboard's agent page) in a visible, persistent browser profile,
// the owner logs in and clicks the platform's own "test call" button, and the harness drives the battery from there.
const demo = demoId === 'manual'
  ? { id: 'manual', vendor: process.env.VP_VENDOR || 'manual', url: process.env.VP_URL, steps: [], gumWaitS: 900, greetMaxMs: 25000 }
  : demos.find(d => d.id === demoId);
if (!demo) { console.error('unknown demo', demoId, demos.map(d => d.id)); process.exit(2); }
const battery = JSON.parse(fs.readFileSync(path.join(LANE, 'battery', 'battery.json'), 'utf8'));
const AUD = path.join(LANE, 'battery', 'audio');

const QUIET_MS = demo.quietMs || 1300;      // agent silence that counts as "agent finished its turn"
const BARGE_DELAY_MS = 1500;                // interrupt this long after the agent starts talking
const NO_REPLY_MS = demo.noReplyMs || 15000; // give up waiting for an agent reply after this long
const MAX_CALL_MS = demo.maxCallMs || 420000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const tnow = () => Date.now() - t0;
const plog = [];
const P = (k, d) => { const e = [tnow(), k, d]; plog.push(e); console.log(JSON.stringify(e)); };

// Sandbox defaults (research container: no UDP egress, HTTPS proxy, bundled Chromium path). On the owner's laptop
// none of these env vars are needed except VP_HEADED=1 and VP_PROFILE_DIR for logged-in dashboards.
const CHROME = process.env.VP_CHROME || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
const launchOpts = {
  executablePath: CHROME,
  headless: process.env.VP_HEADED !== '1',
  proxy: process.env.HTTPS_PROXY && !demo.noProxy ? { server: process.env.HTTPS_PROXY } : undefined,
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    ...(process.env.HTTPS_PROXY ? ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] : []), ...(demo.chromeArgs || [])],
};
const ctxOpts = { viewport: { width: 1366, height: 900 }, permissions: ['microphone'], locale: 'en-IN', userAgent: demo.userAgent || undefined };
let browser, context;
if (process.env.VP_PROFILE_DIR) { context = await chromium.launchPersistentContext(process.env.VP_PROFILE_DIR, { ...launchOpts, ...ctxOpts }); browser = { close: () => context.close() }; }
else { browser = await chromium.launch(launchOpts); context = await browser.newContext(ctxOpts); }
const rawFiles = new Map(); // frameUrl -> fd
await context.exposeBinding('__vpPush', ({ frame }, b64) => {
  const key = frame.url().slice(0, 200);
  if (!rawFiles.has(key)) rawFiles.set(key, { fd: fs.openSync(path.join(OUT, `.raw-${demoId}-${personaId}-${tag}-${rawFiles.size}.s16`), 'w'), bytes: 0, url: key, file: path.join(OUT, `.raw-${demoId}-${personaId}-${tag}-${rawFiles.size}.s16`) });
  const rf = rawFiles.get(key); const buf = Buffer.from(b64, 'base64'); fs.writeSync(rf.fd, buf); rf.bytes += buf.length;
});
await context.addInitScript({ path: path.join(HERE, 'vp_init.js') });
const page = context.pages()[0] || await context.newPage();
const wsLog = [];
const wsDump = fs.openSync(path.join(OUT, `${demoId}__${personaId}__${tag}.ws.jsonl`), 'w');
page.on('websocket', ws => { const e = { t: tnow(), url: ws.url().slice(0, 200), rx: 0, tx: 0 }; const wi = wsLog.length; wsLog.push(e); ws.on('framereceived', f => { const n = (f.payload && f.payload.length) || 0; e.rx += n; try { const pl = typeof f.payload === 'string' ? f.payload : Buffer.from(f.payload).toString('utf8'); if (n > 0 && n < 2000000 && (n < 20000 || /audio|inlineData|delta/i.test(pl.slice(0, 4000)))) fs.writeSync(wsDump, JSON.stringify({ t: tnow(), ws: wi, n, p: pl }) + '\n'); else fs.writeSync(wsDump, JSON.stringify({ t: tnow(), ws: wi, n, head: pl.slice(0, 160) }) + '\n'); } catch {} }); ws.on('framesent', f => { e.tx += (f.payload && f.payload.length) || 0; }); ws.on('close', () => { e.closed = tnow(); }); });
page.on('console', m => { if (/error|fail|denied|webrtc|ice|turn/i.test(m.text())) P('console', m.text().slice(0, 240)); });
page.on('pageerror', e => P('pageerror', String(e).slice(0, 240)));
page.on('popup', p => P('popup', p.url()));

async function frames() { return page.frames(); }
async function activeFrame() {
  let best = null, bestScore = -1;
  for (const f of await frames()) {
    try {
      const s = await f.evaluate(() => window.__vp ? window.__vp.state() : null);
      if (!s) continue;
      const score = s.gum * 10 + s.taps * 5 + (s.frames16 > 0 ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = { f, s }; }
    } catch {}
  }
  return best;
}
async function agentState() {
  // agent VAD may live in whichever frame has taps; report the freshest voice across frames
  let out = { sinceAgent: -1, agentVoiceMs: 0, playing: 0 };
  for (const f of await frames()) {
    try {
      const s = await f.evaluate(() => window.__vp ? window.__vp.state() : null);
      if (!s) continue;
      if (s.sinceAgent >= 0 && (out.sinceAgent < 0 || s.sinceAgent < out.sinceAgent)) out.sinceAgent = s.sinceAgent;
      out.agentVoiceMs = Math.max(out.agentVoiceMs, s.agentVoiceMs); out.playing += s.playing;
    } catch {}
  }
  return out;
}

async function runSteps(steps) {
  for (const st of steps) {
    try {
      if (st.wait) { await sleep(st.wait); continue; }
      if (st.goto) { await page.goto(st.goto, { waitUntil: 'domcontentloaded', timeout: 60000 }); continue; }
      if (st.scroll) { await page.mouse.wheel(0, st.scroll); await sleep(500); continue; }
      if (st.eval) { await page.evaluate(st.eval); continue; }
      if (st.click) {
        let root = page;
        if (st.frame) { const fr = page.frames().find(f => f.url().includes(st.frame)); if (fr) root = fr; }
        const loc = st.role ? root.getByRole(st.role, { name: new RegExp(st.click, 'i') }) : root.locator(st.click);
        const target = st.nth !== undefined ? loc.nth(st.nth) : loc.first();
        await target.scrollIntoViewIfNeeded({ timeout: st.timeout || 15000 }).catch(() => {});
        await target.click({ timeout: st.timeout || 15000, force: !!st.force });
        P('clicked', st.click);
        await sleep(st.after || 1500);
      }
    } catch (e) { P('step-fail', JSON.stringify(st) + ' ' + String(e).split('\n')[0].slice(0, 200)); if (!st.optional) throw e; }
  }
}

async function waitAgentTurnDone(sinceMs, { needVoice = true, maxMs = NO_REPLY_MS } = {}) {
  // waits until the agent has spoken after `sinceMs` (harness clock) and then been quiet QUIET_MS
  const start = tnow(); let heard = false;
  while (tnow() - start < maxMs + 60000) {
    const s = await agentState();
    const lastVoiceAt = s.sinceAgent >= 0 ? tnow() - s.sinceAgent : -1;
    if (lastVoiceAt > sinceMs) heard = true;
    if (heard && s.sinceAgent >= QUIET_MS) return { heard: true, waited: tnow() - start };
    if (!heard && tnow() - start > maxMs) return { heard: false, waited: tnow() - start };
    if (!needVoice && s.sinceAgent >= QUIET_MS) return { heard, waited: tnow() - start };
    await sleep(60);
  }
  return { heard, waited: tnow() - start, capped: true };
}
async function waitAgentOnset(sinceMs, maxMs = NO_REPLY_MS) {
  const start = tnow();
  while (tnow() - start < maxMs) {
    const s = await agentState();
    if (s.sinceAgent >= 0 && tnow() - s.sinceAgent > sinceMs && s.sinceAgent < 200) return true;
    await sleep(40);
  }
  return false;
}

async function loadClips(f, ids) {
  for (const id of ids) {
    const b64 = fs.readFileSync(path.join(AUD, id + '.wav')).toString('base64');
    await f.evaluate(([i, b]) => window.__vp.load(i, b), [id, b64]);
  }
}
async function playClip(f, id, gain = 1.0) {
  const r = await f.evaluate(([i, g]) => window.__vp.play(i, g), [id, gain]);
  P('play', { id, ...r });
  await sleep(r.dur * 1000 + 50);
  while ((await f.evaluate(() => window.__vp.playing)) > 0) await sleep(30);
  P('played', id);
  return r;
}

const result = { demo: demoId, persona: personaId, tag, url: demo.url, startedAt: new Date().toISOString(), turns: [], notes: [] };
let ok = true;
try {
  await page.goto(demo.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(demo.loadWait || 5000);
  await runSteps(demo.steps || []);
  let callStart = tnow();
  // wait for the page to ask for the microphone
  let af = null;
  if (demoId === 'manual') P('manual', 'log in if needed, then click the platform\'s test-call / talk button; the battery starts when the page opens the microphone');
  for (let i = 0; i < 2 * (demo.gumWaitS || 30); i++) { af = await activeFrame(); if (af && af.s.gum > 0) break; await sleep(500); }
  if (!af || af.s.gum === 0) { P('no-gum', 'page never requested the microphone'); result.notes.push('no getUserMedia call'); }
  if (demoId === 'manual') callStart = tnow();
  const f = af ? af.f : page.mainFrame();
  result.frameUrl = f.url();
  const persona = battery.personas.find(p => p.id === personaId);
  const turns = mode === 'probe' ? [{ id: 'probe_hello', type: 'say' }] : persona.turns;
  await loadClips(f, [...new Set(turns.filter(t => t.type !== 'silence').map(t => t.id).concat(persona && persona.noise_bed && mode !== 'probe' ? [persona.noise_bed.clip] : []))]);
  // greeting
  const g = await waitAgentTurnDone(callStart, { maxMs: demo.greetMaxMs || 25000 });
  P('greeting', g);
  result.greeting = g;
  if (persona && persona.noise_bed && mode !== 'probe') await f.evaluate(([i, gn]) => window.__vp.bed(i, gn), [persona.noise_bed.clip, persona.noise_bed.gain]);
  let lastEnd = tnow();
  for (let ti = 0; ti < turns.length; ti++) {
    const turn = turns[ti];
    const nextIsBarge = turns[ti + 1] && turns[ti + 1].type === 'barge';
    if (tnow() > MAX_CALL_MS) { result.notes.push('max call length reached'); break; }
    const rec = { id: turn.id, type: turn.type };
    if (turn.type === 'barge') {
      const on = await waitAgentOnset(lastEnd, NO_REPLY_MS);
      rec.agentOnsetSeen = on;
      if (on) {
        // interrupt at the first moment >= BARGE_DELAY_MS after onset when the agent is audibly mid-speech (give up after 6 s)
        const onAt = tnow(); await sleep(BARGE_DELAY_MS);
        while (tnow() - onAt < 6000) { const s = await agentState(); if (s.sinceAgent >= 0 && s.sinceAgent < 120) { rec.agentStillTalking = true; break; } await sleep(30); }
        rec.bargeOffsetMs = tnow() - onAt;
      }
      rec.bargeApplied = !!(on && rec.agentStillTalking);
      // agent reply too short to interrupt: let it finish, then play the clip as an ordinary turn (scored as not-applied)
      if (!rec.bargeApplied) { await waitAgentTurnDone(lastEnd); }
      rec.play = await playClip(f, turn.id);
      lastEnd = tnow();
      rec.after = await waitAgentTurnDone(lastEnd);
    } else if (turn.type === 'silence') {
      const s0 = tnow();
      await sleep(turn.silence_ms || 5000);
      const s = await agentState();
      rec.agentSpokeDuringSilence = s.sinceAgent >= 0 && (tnow() - s.sinceAgent) > s0;
      if (rec.agentSpokeDuringSilence) rec.after = await waitAgentTurnDone(s0, { maxMs: 8000 });
      lastEnd = tnow();
      P('silence', rec);
    } else {
      rec.play = await playClip(f, turn.id);
      lastEnd = tnow();
      // the next turn interrupts the agent's reply to THIS clip, so do not wait for that reply to finish
      rec.after = nextIsBarge ? { heard: null, deferredToBarge: true } : await waitAgentTurnDone(lastEnd);
    }
    rec.endT = tnow();
    result.turns.push(rec);
    // stop early if the call is evidently over (agent silent after three consecutive caller turns)
    const lastThree = result.turns.slice(-3);
    if (lastThree.length === 3 && lastThree.every(r => r.after && r.after.heard === false)) { result.notes.push('agent silent for 3 turns: call presumed ended at turn ' + turn.id); P('abort', 'agent silent 3 turns'); break; }
    if (mode === 'probe') { await sleep(4000); }
  }
  await sleep(3000);
} catch (e) { ok = false; P('error', String(e).slice(0, 400)); result.error = String(e).slice(0, 400); }
// collect diagnostics from every frame
result.frames = [];
for (const f of page.frames()) {
  try {
    const d = await f.evaluate(() => window.__vp ? (window.__vp.stop(), { st: window.__vp.state(), ev: window.__vp.ev }) : null);
    if (d && (d.st.gum || d.st.taps || d.st.pcs || d.ev.length > 1)) result.frames.push({ url: f.url().slice(0, 200), ...d });
  } catch {}
}
await sleep(800);
try { await page.screenshot({ path: path.join(OUT, `${demoId}__${personaId}__${tag}.png`) }); } catch {}
if (demo.endSteps) { try { await runSteps(demo.endSteps.map(s => ({ ...s, optional: true }))); } catch {} }
result.websockets = wsLog;
result.harnessLog = plog;
result.raw = [];
for (const rf of rawFiles.values()) {
  fs.closeSync(rf.fd);
  result.raw.push({ url: rf.url, bytes: rf.bytes, seconds: rf.bytes / 4 / 16000 });
}
// keep the longest raw stream as the call recording
const best = [...rawFiles.values()].sort((a, b) => b.bytes - a.bytes)[0];
if (best && best.bytes > 0) {
  const wav = path.join(OUT, `${demoId}__${personaId}__${tag}.wav`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '16000', '-ac', '2', '-i', best.file, wav]);
  result.wav = wav;
}
for (const rf of rawFiles.values()) { try { fs.unlinkSync(rf.file); } catch {} }
result.ok = ok;
fs.writeFileSync(path.join(OUT, `${demoId}__${personaId}__${tag}.json`), JSON.stringify(result, null, 1));
console.log('RESULT', JSON.stringify({ ok, wav: result.wav, frames: result.frames.map(f => ({ url: f.url.slice(0, 80), st: f.st })), ws: wsLog.map(w => [w.url.slice(0, 90), w.rx, w.tx]) }));
await browser.close();
