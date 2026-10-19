// VP voice lab client. Plain JS, no build step.
const $ = (id) => document.getElementById(id);
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
             set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const S = { key: LS.get('vl_key', ''), name: LS.get('vl_name', ''), cat: null, mode: LS.get('vl_mode', 'blind'), pick: LS.get('vl_pick', 'base'),
            calls: [], live: null, lastCall: null };
const QS = [
  ['voice_human', 'Voice sounds human', 'Timbre, prosody, breath. Does it sound like a person?'],
  ['emotion', 'Emotion fits the moment', 'Warm when you were worried, brisk when you were rushed, never fake'],
  ['conversation', 'What she said', 'Understood you, right facts, sensible, brief, felt like a real conversation'],
  ['hinglish', 'Hinglish naturalness', 'Mixes Hindi and English the way people actually talk; numbers said right'],
  ['turn_taking', 'Turn-taking', 'No cutting in, no awkward waits, stops when you interrupt'],
  ['speed', 'Speed', 'Reply gap feels like a person on the phone'],
];
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 3500); }
async function api(path, opt = {}) {
  const r = await fetch(path, { ...opt, headers: { 'x-lab-key': S.key, 'content-type': 'application/json', ...(opt.headers || {}) } });
  if (r.status === 401) throw new Error('passcode');
  return r.json();
}

// ------------------------------------------------------------------ gate + boot
async function boot() {
  if (!S.key || !S.name) { showGate(); return; }
  try { S.cat = await api('/api/catalog'); } catch (e) { showGate(e.message === 'passcode' ? 'Wrong passcode' : 'Server not reachable'); return; }
  $('gate').hidden = true; $('main').hidden = false;
  renderMeta(); fillSelects(); renderMode(); await refreshCalls(); renderBlind();
}
function showGate(err) {
  $('main').hidden = true; $('gate').hidden = false; $('g-key').value = S.key; $('g-name').value = S.name; $('g-err').textContent = err || '';
}
$('g-go').onclick = () => { S.key = $('g-key').value.trim(); S.name = $('g-name').value.trim(); LS.set('vl_key', S.key); LS.set('vl_name', S.name); boot(); };
function renderMeta() {
  const c = S.cat; const g = c.gemini || {};
  $('meta').innerHTML = `${S.name} · lab spend today $${c.spend_today_usd.toFixed(2)} / $${c.daily_cap_usd}<br>Gemini paid credit left $${(g.paid_left_usd ?? 0).toFixed(2)}`;
}

// ------------------------------------------------------------------ tabs
document.querySelectorAll('.tabs button').forEach((b) => b.onclick = async () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  for (const t of ['call', 'results', 'history']) $('tab-' + t).hidden = b.dataset.tab !== t;
  if (b.dataset.tab === 'results') renderResults();
  if (b.dataset.tab === 'history') renderHistory();
});

// ------------------------------------------------------------------ stack choice
function presets() { return S.cat.presets; }
function preset(id) { return presets().find((p) => p.id === id); }
function seededShuffle(arr, seed) {
  let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 13), 1274126177); const j = Math.abs(h) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function blindOrder() { return seededShuffle(presets().filter((p) => p.enabled).map((p) => p.id), S.name.toLowerCase()); }
function letter(i) { return String.fromCharCode(65 + i); }
function rated(pid) { return S.calls.some((c) => c.preset === pid && c.tester === S.name && c.rating); }
function blindCurrent() {
  const order = blindOrder(); let i = LS.get('vl_blind_' + S.name, 0);
  for (let k = 0; k < order.length; k++) { const j = (i + k) % order.length; if (!rated(order[j])) return { id: order[j], i: j, order }; }
  return { id: order[i % order.length], i: i % order.length, order, allDone: true };
}
function currentPresetId() { return S.mode === 'blind' ? blindCurrent().id : S.pick; }
function renderBlind() {
  const b = blindCurrent(); const done = b.order.filter(rated).length;
  $('m-name').textContent = 'Mystery stack ' + letter(b.i);
  $('m-prog').textContent = `${done} of ${b.order.length} rated` + (b.allDone ? ' · all done, repeats now' : '');
  fillVoices();
}
$('m-skip').onclick = () => { const b = blindCurrent(); LS.set('vl_blind_' + S.name, (b.i + 1) % b.order.length); renderBlind(); };
function renderMode() {
  document.querySelectorAll('#mode button').forEach((x) => x.classList.toggle('on', x.dataset.mode === S.mode));
  $('blindbox').hidden = S.mode !== 'blind'; $('pickbox').hidden = S.mode !== 'pick';
  if (S.mode === 'pick') renderStacks(); else renderBlind();
  fillVoices();
}
document.querySelectorAll('#mode button').forEach((b) => b.onclick = () => { S.mode = b.dataset.mode; LS.set('vl_mode', S.mode); renderMode(); });
function renderStacks() {
  const box = $('stacks'); box.innerHTML = '';
  for (const p of presets()) {
    const el = document.createElement('div'); el.className = 'stack' + (p.id === S.pick ? ' on' : '') + (p.enabled ? '' : ' off');
    el.innerHTML = `<div><div class="t">${p.label}${p.new ? '<span class="tag">new</span>' : ''}${rated(p.id) ? '<span class="tag done">rated</span>' : ''}</div>
      <div class="r">report: ${p.ref}${p.enabled ? '' : ' · needs ' + p.needs}</div></div>`;
    if (p.enabled) el.onclick = () => { S.pick = p.id; LS.set('vl_pick', p.id); renderStacks(); fillVoices(); };
    box.appendChild(el);
  }
}
function fillSelects() {
  const sc = $('scenario'); sc.innerHTML = '';
  for (const [k, v] of Object.entries(S.cat.scenarios)) sc.add(new Option(v.label, k));
  sc.value = LS.get('vl_scen', 'renewal'); sc.onchange = () => LS.set('vl_scen', sc.value);
  const br = $('brain'); br.innerHTML = ''; br.add(new Option("Stack's own brain", ''));
  for (const [k, v] of Object.entries(S.cat.brains)) br.add(new Option(`${v.label} · ${v.ttft_ms ? (v.ttft_ms / 1000).toFixed(2) + ' s to first word' : 'speed not measured'} · $${v.in}/$${v.out} per 1M`, k));
  br.value = LS.get('vl_brain', ''); br.onchange = () => LS.set('vl_brain', br.value);
  $('phone').checked = LS.get('vl_phone', false); $('phone').onchange = () => LS.set('vl_phone', $('phone').checked);
  $('smart').checked = LS.get('vl_smart', true); $('smart').onchange = () => LS.set('vl_smart', $('smart').checked);
  $('hp').checked = LS.get('vl_hp', true); $('hp').onchange = () => LS.set('vl_hp', $('hp').checked);
}
function fillVoices() {
  const p = preset(currentPresetId()); const v = $('voice'); v.innerHTML = '';
  if (!p) return;
  let list = [], def = '';
  if (p.s2s) { const s = S.cat.s2s[p.s2s]; list = s.voices; def = s.default; }
  else if (p.tts) { const t = S.cat.tts[p.tts]; list = t.voices; def = t.default; }
  v.add(new Option("Stack's own voice", ''));
  if (S.mode === 'pick') for (const x of list) v.add(new Option(x + (x === def ? ' (default)' : ''), x));
  v.disabled = S.mode === 'blind' || list.length === 0;
  $('brain').disabled = !!p.s2s || !p.brain;
  if (S.mode === 'blind') $('brain').value = '';
}

// ------------------------------------------------------------------ audio + call
function capTime(sample) {
  const c = S.live && S.live.caps; if (!c || !c.length) return null;
  for (let k = c.length - 1; k >= 0; k--) { if (c[k][0] <= sample) { const nxt = c[k + 1] || c[k]; return nxt[1] - (nxt[0] - sample) / 16; } }
  return c[0][1] - (c[0][0] - sample) / 16;
}
function bandpass(ctx, node) {
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.7;
  node.connect(hp); hp.connect(lp); return lp;
}
async function startCall() {
  const pid = currentPresetId(); const p = preset(pid);
  if (!p || !p.enabled) { toast('This stack is not available yet'); return; }
  $('callerr').textContent = ''; $('caps').innerHTML = ''; $('rate').hidden = true; $('reveal').hidden = true;
  const phone = $('phone').checked;
  const L = S.live = { pid, caps: [], pend: {}, lat: [], t0: performance.now(), started: false, ended: false, partial: {}, blind: S.mode === 'blind' };
  setCallUI(true, 'Connecting');
  try {
    const hp = $('hp').checked;
    L.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: !hp, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    try { L.ctxIn = new AudioContext({ sampleRate: 16000 }); } catch { L.ctxIn = new AudioContext(); }
    try { L.ctxOut = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' }); } catch { L.ctxOut = new AudioContext({ latencyHint: 'interactive' }); }
    await Promise.all([L.ctxIn.audioWorklet.addModule('/static/worklets.js'), L.ctxOut.audioWorklet.addModule('/static/worklets.js')]);
    await L.ctxIn.resume(); await L.ctxOut.resume();
    const src = L.ctxIn.createMediaStreamSource(L.stream);
    L.mic = new AudioWorkletNode(L.ctxIn, 'mic-proc'); L.mic.port.postMessage({ phone });
    (phone ? bandpass(L.ctxIn, src) : src).connect(L.mic);
    L.player = new AudioWorkletNode(L.ctxOut, 'player-proc', { outputChannelCount: [1] }); L.player.port.postMessage({ type: 'phone', phone });
    (phone ? bandpass(L.ctxOut, L.player) : L.player).connect(L.ctxOut.destination);
    L.outRate = L.ctxOut.sampleRate;
    L.player.port.onmessage = (e) => onPlayer(e.data);
    try { L.wake = await navigator.wakeLock?.request('screen'); } catch {}
  } catch (e) { setCallUI(false); $('callerr').textContent = 'Microphone or audio failed: ' + e.message; cleanup(); return; }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = L.ws = new WebSocket(`${proto}://${location.host}/ws?k=${encodeURIComponent(S.key)}`); ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    ws.send(JSON.stringify({ t: 'start', preset: pid, scenario: $('scenario').value, tester: S.name, brain: $('brain').value || null,
                             voice: $('voice').value || null, phone, smart_turn: $('smart').checked, headphones: $('hp').checked, blind: L.blind }));
    L.started = true;
  };
  L.mic.port.onmessage = (e) => {
    if (!L.started || ws.readyState !== 1) return;
    ws.send(e.data.pcm); L.caps.push([e.data.upto, performance.now()]); if (L.caps.length > 4000) L.caps.splice(0, 1000);
  };
  ws.onmessage = (e) => (typeof e.data === 'string' ? onMsg(JSON.parse(e.data)) : onAudio(e.data));
  ws.onclose = () => { if (!L.ended) { L.ended = true; setCallUI(false); cleanup(); if (L.callId) showRate(); } };
  L.timer = setInterval(() => { const s = Math.floor((performance.now() - L.t0) / 1000); $('s-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
}
function onAudio(buf) {
  const L = S.live; if (!L || !L.player) return;
  const rid = new DataView(buf, 0, 4).getUint32(0, true);
  const pcm = new Int16Array(buf, 4, (buf.byteLength - 4) >> 1);
  let f = new Float32Array(pcm.length); for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768;
  if (L.outRate !== 24000) f = resample(f, 24000, L.outRate);
  L.player.port.postMessage({ type: 'push', rid, samples: f }, [f.buffer]);
}
function resample(x, a, b) { const n = Math.floor(x.length * b / a), y = new Float32Array(n), r = a / b; for (let i = 0; i < n; i++) { const p = i * r, k = Math.floor(p), f = p - k; y[i] = x[k] * (1 - f) + (x[k + 1] ?? x[k]) * f; } return y; }
function onPlayer(d) {
  const L = S.live; if (!L) return;
  if (d.type === 'start') {
    const out = (L.ctxOut.outputLatency || L.ctxOut.baseLatency || 0) * 1000;
    const tPlay = performance.now() + (d.t - L.ctxOut.currentTime) * 1000 + out;
    const t0 = L.pend[d.rid];
    if (t0 != null) {
      const ms = Math.round(tPlay - t0); L.lat.push(ms); $('s-lat').textContent = (ms / 1000).toFixed(2) + ' s';
      L.ws?.readyState === 1 && L.ws.send(JSON.stringify({ t: 'client_latency', rid: d.rid, ms }));
      const el = document.querySelector(`.cap.agent[data-rid="${d.rid}"] .lat`); if (el) el.textContent = `replied after ${(ms / 1000).toFixed(2)} s`;
      L.latByRid = L.latByRid || {}; L.latByRid[d.rid] = ms;
    }
  }
}
function onMsg(d) {
  const L = S.live; if (!L) return;
  switch (d.t) {
    case 'ready': L.callId = d.call_id; setState('listening'); break;
    case 'state': setState(d.s); break;
    case 'reply': if (d.eos_sample != null) L.pend[d.rid] = capTime(d.eos_sample); setState('speaking'); break;
    case 'flush': L.player?.port.postMessage({ type: 'flush', rid: d.rid }); setState('listening'); break;
    case 'cap': addCap(d); break;
    case 'cost': $('s-inr').textContent = '₹' + d.inr.toFixed(2); $('s-rpm').textContent = d.secs > 20 ? '₹' + d.inr_per_min.toFixed(2) : '…'; break;
    case 'error': $('callerr').textContent = d.msg; break;
    case 'ended': L.summary = d.summary; L.ended = true; setCallUI(false); cleanup(); showRate(); break;
  }
}
function addCap(d) {
  const box = $('caps'); const who = d.who === 'agent' ? 'agent' : 'user';
  let el = who === 'agent' && d.rid != null ? box.querySelector(`.cap.agent[data-rid="${d.rid}"]`) : box.querySelector(`.cap.${who}.partial`);
  if (!el) { el = document.createElement('div'); el.className = `cap ${who}`; if (who === 'agent' && d.rid != null) el.dataset.rid = d.rid; el.innerHTML = '<span class="tx"></span><span class="lat"></span>'; box.appendChild(el); }
  el.querySelector('.tx').textContent = (d.overlap ? '(over her) ' : '') + d.text;
  el.classList.toggle('partial', !d.final);
  if (who === 'agent' && S.live.latByRid?.[d.rid]) el.querySelector('.lat').textContent = `replied after ${(S.live.latByRid[d.rid] / 1000).toFixed(2)} s`;
  box.scrollTop = box.scrollHeight;
}
function setState(s) { const el = $('state'); el.hidden = false; el.className = 'state ' + s; el.textContent = { listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', Connecting: 'Connecting' }[s] || s; }
function setCallUI(live, state) {
  const b = $('callbtn'); b.classList.toggle('live', live); b.textContent = live ? 'Hang up' : 'Call';
  $('stats').hidden = !live && !S.live; if (live) { $('s-lat').textContent = '–'; $('s-rpm').textContent = '–'; $('s-inr').textContent = '–'; setState(state || 'Connecting'); }
  else $('state').hidden = true;
  $('setup').querySelectorAll('select,input,button').forEach((x) => x.disabled = live);
  if (!live) fillVoices();
}
function hangup() {
  const L = S.live; if (!L) return;
  try { L.ws.send(JSON.stringify({ t: 'hangup' })); } catch {}
  setTimeout(() => { if (!L.ended) { try { L.ws.close(); } catch {} } }, 8000);
  L.mic?.port && (L.mic.port.onmessage = null);
  L.stream?.getTracks().forEach((t) => t.stop());
  $('callbtn').textContent = 'Ending…';
}
function cleanup() {
  const L = S.live; if (!L) return;
  clearInterval(L.timer); L.stream?.getTracks().forEach((t) => t.stop());
  try { L.ctxIn?.close(); } catch {} setTimeout(() => { try { L.ctxOut?.close(); } catch {} }, 300);
  try { L.wake?.release(); } catch {}
}
$('callbtn').onclick = () => { if (S.live && !S.live.ended && $('callbtn').classList.contains('live')) hangup(); else startCall(); };

// ------------------------------------------------------------------ rating
function showRate() {
  const L = S.live; if (!L || !L.callId) return;
  const qs = $('qs'); qs.innerHTML = ''; L.rating = {};
  for (const [k, h, d] of QS) qs.appendChild(scale(k, h, d, 5));
  qs.appendChild(scale('overall', 'Overall', 'Would a customer believe and like this caller? 1–10', 10));
  $('rate').querySelectorAll('.scale[data-k="would_pick"] button').forEach((b) => { b.classList.remove('on'); b.onclick = () => pickBtn(b, 'would_pick'); });
  $('notes').value = ''; $('rate').hidden = false; $('reveal').hidden = true; $('r-save').disabled = false;
  $('rate').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function scale(k, h, d, n) {
  const q = document.createElement('div'); q.className = 'q';
  q.innerHTML = `<div class="h">${h}</div><div class="d">${d}</div><div class="scale" data-k="${k}"></div>`;
  const sc = q.querySelector('.scale');
  for (let i = 1; i <= n; i++) { const b = document.createElement('button'); b.textContent = i; b.dataset.v = i; b.onclick = () => pickBtn(b, k); sc.appendChild(b); }
  return q;
}
function pickBtn(b, k) { b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); S.live.rating[k] = Number(b.dataset.v); }
$('r-save').onclick = async () => {
  const L = S.live; const r = L.rating;
  if (!r.overall) { toast('Give at least an overall score'); return; }
  $('r-save').disabled = true;
  await api('/api/rate', { method: 'POST', body: JSON.stringify({ call_id: L.callId, tester: S.name, preset: L.pid, blind: L.blind, ...r, would_pick: r.would_pick === 1, notes: $('notes').value }) });
  await refreshCalls(); reveal(); if (L.blind) renderBlind();
};
$('r-skip').onclick = () => { reveal(); };
function reveal() {
  const L = S.live; const p = preset(L.pid); const s = L.summary || {};
  const lat = L.lat.length ? (L.lat.slice().sort((a, b) => a - b)[Math.floor(L.lat.length / 2)] / 1000).toFixed(2) + ' s' : '–';
  const comp = s.components ? Object.entries(s.components).map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
  $('reveal').innerHTML = `<b>${L.blind ? 'It was: ' : ''}${p.label}</b><div class="small" style="margin-top:4px">${comp}</div>
    <div class="small" style="margin-top:6px">Measured: ₹${(s.inr_per_min ?? 0).toFixed(2)}/min AI cost · median reply gap ${lat} · ${s.replies ?? 0} replies · ${s.talk_over ?? 0} talk-overs · ${s.barge_ins ?? 0} interruptions handled</div>
    <div class="small muted" style="margin-top:4px">Report predicted: ${p.ref}</div>`;
  $('reveal').hidden = false;
}

// ------------------------------------------------------------------ results + history
async function refreshCalls() { try { S.calls = await api('/api/calls'); } catch { S.calls = []; } }
async function renderResults() {
  const rows = await api('/api/results'); const t = $('rtable');
  const f = (x, d = 1) => (x == null ? '–' : Number(x).toFixed(d));
  t.innerHTML = `<tr><th>Stack</th><th>Overall</th><th>Voice</th><th>Emotion</th><th>Talk</th><th>Hinglish</th><th>Turns</th><th>Speed</th><th>Pick</th><th>₹/min</th><th>Reply gap</th><th>Talk-over</th><th>Calls</th><th>Report</th></tr>` +
    rows.map((r) => `<tr><td>${r.label}</td><td class="num"><b>${f(r.scores.overall)}</b></td><td class="num">${f(r.scores.voice_human)}</td><td class="num">${f(r.scores.emotion)}</td>
      <td class="num">${f(r.scores.conversation)}</td><td class="num">${f(r.scores.hinglish)}</td><td class="num">${f(r.scores.turn_taking)}</td><td class="num">${f(r.scores.speed)}</td>
      <td class="num">${r.would_pick}/${r.rated}</td><td class="num">${r.inr_per_min == null ? '–' : '₹' + r.inr_per_min.toFixed(2)}</td>
      <td class="num">${r.latency_p50_ms == null ? '–' : (r.latency_p50_ms / 1000).toFixed(2) + ' s'}</td><td class="num">${r.talk_over_pct == null ? '–' : r.talk_over_pct + '%'}</td>
      <td class="num">${r.calls}</td><td class="small muted" style="text-align:left">${r.ref || ''}</td></tr>`).join('');
  if (!rows.length) t.innerHTML = '<tr><td>No calls yet.</td></tr>';
}
async function renderHistory() {
  await refreshCalls(); const h = $('hist'); h.innerHTML = '';
  for (const c of S.calls.slice(0, 60)) {
    const p = preset(c.preset); const el = document.createElement('div'); el.className = 'card'; el.style.margin = '0';
    el.innerHTML = `<div><b>${p ? p.label : c.preset}</b> <span class="small muted">· ${c.scenario} · ${c.tester} · ${c.started.replace('T', ' ')}</span></div>
      <div class="small muted">${Math.round(c.duration_s)} s · ₹${(c.inr_per_min ?? 0).toFixed(2)}/min · reply gap ${c.latency_p50_ms ? (c.latency_p50_ms / 1000).toFixed(2) + ' s' : '–'}${c.rating ? ' · overall ' + c.rating.overall + '/10' : ''}</div>
      <audio controls preload="none" src="/api/calls/${c.id}/audio?k=${encodeURIComponent(S.key)}"></audio>
      <details><summary>Transcript</summary><div class="tx small" style="margin-top:6px">loading…</div></details>`;
    el.querySelector('details').ontoggle = async (e) => {
      if (!e.target.open) return; const d = await api('/api/calls/' + c.id);
      e.target.querySelector('.tx').innerHTML = (d.transcript || []).map((t) => `<div><b>${t.who === 'agent' ? 'Her' : 'You'}:</b> ${t.text}${t.interrupted ? ' <i>(interrupted)</i>' : ''}${t.backchannel ? ' <i>(over her)</i>' : ''}</div>`).join('') || 'empty';
    };
    h.appendChild(el);
  }
  if (!S.calls.length) h.innerHTML = '<div class="muted">No calls yet.</div>';
}
boot();
