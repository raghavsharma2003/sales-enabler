// One short public demo call on the ElevenLabs marketing site to capture signalling only
// (HAR, WebSocket frame types, RTCPeerConnection ICE/SDP summary, getStats). Caller audio is a synthetic
// TTS clip from our own l4b battery played through Chromium's fake mic. No account, no login, no form input.
// The only clicks are the page's own "voice/start call" control and the click-through demo terms dialog.
// Usage: node demo_signal.mjs <outDir> <pageUrl> <fakeWav> [callSeconds]
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const [,, outDir, pageUrl, wav, secS] = process.argv; const CALL_MS = 1000 * parseInt(secS || '25');
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now(); const ev = []; const P = (k, d) => { ev.push([Date.now() - t0, k, d]); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: { server: process.env.HTTPS_PROXY },
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`,
    '--autoplay-policy=no-user-gesture-required', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] });
const ctx = await browser.newContext({ recordHar: { path: path.join(outDir, 'demo-call.har'), content: 'embed' }, permissions: ['microphone'], viewport: { width: 1366, height: 900 }, locale: 'en-IN' });
await ctx.addInitScript(() => {
  const NativePC = window.RTCPeerConnection; window.__pcs = []; window.__pclog = [];
  window.RTCPeerConnection = function (cfg, ...rest) {
    const pc = new NativePC(cfg, ...rest); window.__pcs.push(pc);
    try { window.__pclog.push({ t: Date.now(), k: 'new', iceServers: (cfg && cfg.iceServers || []).map(s => ({ urls: s.urls })), policy: cfg && cfg.iceTransportPolicy }); } catch (e) {}
    pc.addEventListener('icecandidate', e => { if (e.candidate) window.__pclog.push({ t: Date.now(), k: 'local-cand', c: (e.candidate.candidate.match(/typ \w+/) || [''])[0] + ' ' + (e.candidate.candidate.match(/ (udp|tcp) /i) || [''])[0] }); });
    pc.addEventListener('connectionstatechange', () => window.__pclog.push({ t: Date.now(), k: 'state', s: pc.connectionState }));
    const sRD = pc.setRemoteDescription.bind(pc);
    pc.setRemoteDescription = d => { try { const sdp = d && d.sdp || ''; window.__pclog.push({ t: Date.now(), k: 'remote-sdp', type: d.type, codecs: (sdp.match(/a=rtpmap:\d+ [^\r\n]+/g) || []).slice(0, 12), cands: (sdp.match(/a=candidate:[^\r\n]+/g) || []).map(c => c.split(' ').slice(2, 8).join(' ')).slice(0, 16), origin: (sdp.match(/o=[^\r\n]+/) || [''])[0], ext: (sdp.match(/a=extmap:[^\r\n]+/g) || []).slice(0, 8) }); } catch (e) {} return sRD(d); };
    return pc;
  };
  window.RTCPeerConnection.prototype = NativePC.prototype;
  window.__pcstats = async () => { const out = []; for (const pc of window.__pcs) { try { const st = await pc.getStats(); const by = {}; st.forEach(r => by[r.id] = r); st.forEach(r => { if (r.type === 'candidate-pair' && r.nominated) { const l = by[r.localCandidateId] || {}, rm = by[r.remoteCandidateId] || {}; out.push({ state: r.state, rtt: r.currentRoundTripTime, local: { type: l.candidateType, proto: l.protocol, relayProto: l.relayProtocol, url: l.url }, remote: { type: rm.candidateType, addr: rm.address, port: rm.port, proto: rm.protocol } }); } if (r.type === 'inbound-rtp' && r.kind === 'audio') out.push({ inbound: true, codec: (by[r.codecId] || {}).mimeType, packets: r.packetsReceived, jitter: r.jitter, bytes: r.bytesReceived }); }); } catch (e) { out.push({ err: String(e) }); } } return out; };
});
const page = await ctx.newPage();
const wsl = [];
const typeOf = p => { try { const j = JSON.parse(p); return j.type || Object.keys(j).join(','); } catch { return 'binary/' + String(p).length; } };
page.on('websocket', w => { const e = { t: Date.now() - t0, url: w.url().replace(/(token|conversation_signature|signature)=[^&]+/g, '$1=<redacted>'), rx: 0, tx: 0, rxTypes: {}, txTypes: {}, firstRx: [], firstTx: [], rxTimeline: [] }; wsl.push(e);
  w.on('framereceived', f => { e.rx++; const ty = typeOf(f.payload); e.rxTypes[ty] = (e.rxTypes[ty] || 0) + 1; if (e.rxTimeline.length < 400 && ty !== 'audio' && ty !== 'ping') e.rxTimeline.push([Date.now() - t0, ty]); if (e.firstRx.length < 6 && ty !== 'audio') e.firstRx.push(String(f.payload).replace(/"(audio_base_64|audio_event|user_audio_chunk)":"[^"]{40,}"/g, '"$1":"<b64>"').slice(0, 1200)); });
  w.on('framesent', f => { e.tx++; const ty = typeOf(f.payload); e.txTypes[ty] = (e.txTypes[ty] || 0) + 1; if (e.firstTx.length < 4 && !/user_audio_chunk/.test(String(f.payload))) e.firstTx.push(String(f.payload).slice(0, 600)); });
  w.on('close', () => e.closed = Date.now() - t0); });
page.on('console', m => { const t = m.text(); if (/eleven|convai|livekit|webrtc|ice|error/i.test(t)) P('console', t.slice(0, 300)); });
await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => P('goto', e.message));
P('final_url', page.url());
await page.waitForTimeout(3000);
const btns = await page.getByRole('button').allInnerTexts().catch(() => []);
P('buttons', btns.map(b => b.trim()).filter(b => b && b.length < 40).slice(0, 60));
let clicked = false;
const tryClick = async (re, label) => { const loc = page.getByRole('button', { name: re }).first(); if (await loc.count().catch(() => 0)) { try { await loc.click({ timeout: 8000 }); P('clicked', label); return true; } catch (e) { P('clickerr', label + ' ' + e.message.slice(0, 120)); } } return false; };
await tryClick(/^voice$/i, 'Voice tab');
await page.waitForTimeout(1500);
for (const re of [/web call/i, /start call/i, /call ai agent/i]) { if (await tryClick(re, String(re))) { clicked = true; break; } }
if (!clicked) { const t = page.getByText(/^web call$/i).first(); if (await t.count().catch(() => 0)) { try { await t.click({ timeout: 8000 }); clicked = true; P('clicked', 'text Web call'); } catch (e) { P('clickerr', 'text Web call ' + e.message.slice(0, 120)); } } }
await page.waitForTimeout(3000);
if (clicked && wsl.length === 0) {
  const n = await page.evaluate(() => (window.__pcs || []).length).catch(() => 0);
  if (!n) {
    // the visible control is an icon button above the "Web call" label: click the label's nearest preceding button
    const ok = await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && /^\s*web call\s*$/i.test(e.textContent || '')); if (!el) return 'nolabel'; let c = el; for (let i = 0; i < 4 && c; i++) { c = c.parentElement; const b = c && c.querySelector('button'); if (b) { b.click(); return 'clicked-' + i; } } return 'nobutton'; }).catch(e => 'err ' + e.message);
    P('icon-click', ok);
    await page.waitForTimeout(3000);
  }
}
await tryClick(/i agree|agree|accept/i, 'terms dialog');
const statsSeries = [];
if (clicked) {
  const end = Date.now() + CALL_MS;
  while (Date.now() < end) { await page.waitForTimeout(5000); statsSeries.push({ t: Date.now() - t0, s: await page.evaluate(() => window.__pcstats && window.__pcstats()).catch(e => String(e)) }); }
  for (const re of [/end call/i, /hang up/i, /end/i, /stop/i]) { if (await tryClick(re, 'end ' + String(re))) break; }
  await page.waitForTimeout(3000);
}
const pclog = await page.evaluate(() => window.__pclog || []).catch(() => []);
await page.screenshot({ path: path.join(outDir, 'demo-call.png') }).catch(() => {});
fs.writeFileSync(path.join(outDir, 'demo-call-signal.json'), JSON.stringify({ started: new Date(t0).toISOString(), pageUrl, wav: path.basename(wav), clicked, ev, ws: wsl, pclog, statsSeries }, null, 1));
await ctx.close(); await browser.close();
console.log(JSON.stringify({ clicked, nws: wsl.length, ws: wsl.map(w => ({ u: w.url.split('?')[0], rx: w.rx, tx: w.tx, rxTypes: w.rxTypes })), npc: pclog.filter(x => x.k === 'new').length, states: pclog.filter(x => x.k === 'state').map(x => x.s) }, null, 1));
