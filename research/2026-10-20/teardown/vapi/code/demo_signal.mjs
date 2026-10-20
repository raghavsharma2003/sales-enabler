// One short public homepage demo call on vapi.ai to capture signalling (HAR, websockets, RTCPeerConnection config/stats).
// Caller audio is Chromium's synthetic fake device (a tone); no real voice, no account, no form.
// Usage: node demo_signal.mjs <outDir> [callSeconds]
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const [,, outDir, secS] = process.argv; const CALL_MS = 1000 * parseInt(secS || '25');
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now(); const ev = []; const P = (k, d) => { ev.push([Date.now() - t0, k, d]); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: { server: process.env.HTTPS_PROXY },
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] });
const ctx = await browser.newContext({ recordHar: { path: path.join(outDir, 'demo-call.har'), content: 'embed' }, permissions: ['microphone'], viewport: { width: 1366, height: 900 }, locale: 'en-IN' });
await ctx.addInitScript(() => {
  const NativePC = window.RTCPeerConnection; window.__pcs = []; window.__pclog = [];
  const red = s => (s || '').replace(/credential":"[^"]*"/g, 'credential":"<redacted>"');
  window.RTCPeerConnection = function (cfg, ...rest) {
    const pc = new NativePC(cfg, ...rest); window.__pcs.push(pc);
    try { window.__pclog.push({ t: Date.now(), k: 'new', iceServers: (cfg && cfg.iceServers || []).map(s => ({ urls: s.urls })) , policy: cfg && cfg.iceTransportPolicy }); } catch (e) {}
    pc.addEventListener('icecandidate', e => { if (e.candidate) window.__pclog.push({ t: Date.now(), k: 'local-cand', c: e.candidate.candidate.split(' ').slice(4, 8).join(' ') + ' ' + (e.candidate.candidate.match(/typ \w+/) || [''])[0] }); });
    pc.addEventListener('connectionstatechange', () => window.__pclog.push({ t: Date.now(), k: 'state', s: pc.connectionState }));
    const sRD = pc.setRemoteDescription.bind(pc);
    pc.setRemoteDescription = d => { try { const sdp = d && d.sdp || ''; window.__pclog.push({ t: Date.now(), k: 'remote-sdp', codecs: (sdp.match(/a=rtpmap:\d+ [^\r\n]+/g) || []).slice(0, 12), cands: (sdp.match(/a=candidate:[^\r\n]+/g) || []).map(c => c.split(' ').slice(4, 8).join(' ')).slice(0, 12), ua: (sdp.match(/o=[^\r\n]+/) || [''])[0] }); } catch (e) {} return sRD(d); };
    return pc;
  };
  window.RTCPeerConnection.prototype = NativePC.prototype;
  window.__pcstats = async () => { const out = []; for (const pc of window.__pcs) { try { const st = await pc.getStats(); const by = {}; st.forEach(r => by[r.id] = r); st.forEach(r => { if (r.type === 'candidate-pair' && r.nominated) { const l = by[r.localCandidateId] || {}, rm = by[r.remoteCandidateId] || {}; out.push({ state: r.state, rtt: r.currentRoundTripTime, local: { type: l.candidateType, proto: l.protocol, relayProto: l.relayProtocol, url: l.url }, remote: { type: rm.candidateType, addr: rm.address, port: rm.port, proto: rm.protocol } }); } if (r.type === 'inbound-rtp' && r.kind === 'audio') out.push({ inbound: true, codec: (by[r.codecId] || {}).mimeType, packets: r.packetsReceived, jitter: r.jitter, bytes: r.bytesReceived }); }); } catch (e) { out.push({ err: String(e) }); } } return out; };
});
const page = await ctx.newPage();
const wsl = [];
page.on('websocket', w => { const e = { t: Date.now() - t0, url: w.url().replace(/token=[^&]+/, 'token=<redacted>'), rx: 0, tx: 0, firstRx: [], firstTx: [] }; wsl.push(e);
  w.on('framereceived', f => { e.rx++; if (e.firstRx.length < 25) e.firstRx.push(String(f.payload).slice(0, 400)); });
  w.on('framesent', f => { e.tx++; if (e.firstTx.length < 25) e.firstTx.push(String(f.payload).slice(0, 400)); });
  w.on('close', () => e.closed = Date.now() - t0); });
page.on('console', m => { const t = m.text(); if (/vapi|daily|call|webrtc|ice|error/i.test(t)) P('console', t.slice(0, 300)); });
await page.goto('https://vapi.ai/', { waitUntil: 'networkidle', timeout: 60000 }).catch(e => P('goto', e.message));
await page.waitForTimeout(3000);
const btns = await page.getByRole('button').allInnerTexts().catch(() => []);
P('buttons', btns.filter(b => b && b.length < 40).slice(0, 40));
let clicked = false;
for (const name of [/start call/i, /talk to vapi/i, /give it a try/i, /try it/i]) {
  const loc = page.getByRole('button', { name }).first();
  if (await loc.count().catch(() => 0)) { await loc.click({ timeout: 8000 }).then(() => { clicked = true; P('clicked', String(name)); }).catch(e => P('clickerr', e.message)); if (clicked) break; }
}
const statsSeries = [];
if (clicked) {
  const end = Date.now() + CALL_MS;
  while (Date.now() < end) { await page.waitForTimeout(5000); statsSeries.push({ t: Date.now() - t0, s: await page.evaluate(() => window.__pcstats && window.__pcstats()).catch(e => String(e)) }); }
  for (const name of [/end call/i, /hang up/i, /stop/i]) { const loc = page.getByRole('button', { name }).first(); if (await loc.count().catch(() => 0)) { await loc.click({ timeout: 5000 }).then(() => P('ended', String(name))).catch(() => {}); break; } }
  await page.waitForTimeout(3000);
}
const pclog = await page.evaluate(() => window.__pclog || []).catch(() => []);
await page.screenshot({ path: path.join(outDir, 'demo-call.png') }).catch(() => {});
fs.writeFileSync(path.join(outDir, 'demo-call-signal.json'), JSON.stringify({ started: new Date(t0).toISOString(), clicked, ev, ws: wsl, pclog, statsSeries }, null, 1));
await ctx.close(); await browser.close();
console.log(JSON.stringify({ clicked, nws: wsl.length, wsHosts: wsl.map(w => w.url.split('?')[0]).slice(0, 10), npc: pclog.filter(x => x.k === 'new').length }, null, 1));
