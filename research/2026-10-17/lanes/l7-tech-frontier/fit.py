#!/usr/bin/env python3
"""l7-tech-frontier: cost curves for a voice-AI 'reference minute' and dated forecasts.

Inputs : prices.csv (same folder) - dated list prices from Azure Retail Prices API, Common Crawl
         captures of vendor price pages, llm-prices git history and other lanes' live reads.
Outputs: curves.png, fit-results.json, series-per-minute.csv (same folder).

Method
------
1. Convert every dated price into USD per *reference connected minute* with one fixed workload,
   so that points from 2023 and 2026 are comparable (the workload is lane l2's base case):
     LLM : 4.8 calls/min (4 agent turns x 1.2 for prefetch/hedge/retry); per call 3,720 input
           tokens (3,000 system + 400 history + 300 context + 20), 70 output tokens; when a cached
           price exists, 85% of the 3,000-token system prompt is billed at the cached rate.
     ASR : 1.0 streamed audio minute per connected minute (caller channel).
     TTS : 440 characters per connected minute (50% agent talk x 800 chars/min x 1.1 waste).
     Realtime S2S (OpenAI audio tokens: 10/s in, 20/s out): 300 fresh input + 600 output audio
           tokens per minute, plus 3,000 audio + 3,000 text context tokens re-read per minute at
           the cached rate (at the full input rate before caching existed).
2. For each series build the 'cheapest available' envelope: at each price date, the minimum
   per-minute cost of anything in that series already released (old SKUs stay purchasable).
   'frontier_latest' is the exception: it tracks the newest flagship conversational model.
3. Fit ln(cost) = a + b*t (t in years) by OLS on the envelope's change points, for the full
   history and for the last 18 months (2025-04-17 .. 2026-10-17). Bootstrap the slope (2,000
   resamples of change points). Report the annual multiplier exp(b) and months since the last cut.
4. Forecast three stacks to 2026-12-31, 2027-12-31, 2028-12-31 by Monte Carlo (20,000 draws):
   for each component draw a regime (long-run slope vs last-18-month slope, p = 0.5 each), a slope
   from that regime's bootstrap, and a log-normal shock with the fit's residual s.d.; sum the
   components. Slopes are capped at 0 (list prices are assumed not to rise) - this biases the
   forecast DOWN, i.e. toward 'voice AI gets cheap'.
   Stacks: A managed Azure cascade at the quality bar (Voice Live BYO ear + newest flagship LLM +
   Azure Neural HD TTS); B managed Azure budget cascade (Voice Live BYO + cheapest small LLM +
   Azure Neural TTS); C Azure realtime speech-to-speech (gpt-realtime flagship family).
   A self-hosted stack D is a computed point today (not a time series) and is reported beside.
INR at the fetched rate 95.11 (open.er-api.com, 2026-10-17) and at the programme default 88.

Round-2 corrections (2026-10-17, package r2-model-corrections, critic A10; l7 verify.md claims 3, 4, 7).
Round-1 code and outputs are kept as fit.round1.py, prices.round1.csv, fit-results.round1.json, curves.round1.png.
  * prices.csv gains GPT-5.1 (2025-11-13, $1.25/$0.125/$10) and GPT-5.2 (2025-12-11, $1.75/$0.175/$14) from the Azure
    Retail Prices API and llm-prices git history. GPT-5.2 is the first per-token rise in the frontier series.
  * Method 3 (new): the cut process of method 2 imports the 2024-25 LLM cut rate (8 of 11 LLM cuts fall in 2024-01 ..
    2025-08) and simulates no rises, which contradicts the series' own last-18-month evidence (frontier multiplier ~1.0,
    small tier has had no new low since 2025-08). Two current-regime variants are now published beside it:
      forecast_llm_flat          LLM components held at today's level (the CURRENT-REGIME HEADLINE); speech and
                                 realtime components follow the method-2 cut process unchanged;
      forecast_llm_recent_regime LLM components follow their own level changes since 2025-04-17, rises included,
                                 as a Poisson jump process (rate = events / 1.5 years).
    Method 3 runs after method 2, so methods 1-2 consume the RNG exactly as in round 1.
  * curves.png bottom panel shows the LLM-flat P50 and P10-P90 beside the cut-process ones; the telephony panel no
    longer calls the 2026-03 Plivo capture a contradiction and shows the like-for-like 30 s pulse fall (0.48 -> 0.38).
  * Not changed: FX is still a fixed 95.11 with no depreciation path (verify.md claim 3), so every INR forecast is
    still optimistic by the rupee's drift; cache-write meters and reasoning tokens are still not modelled.
"""
import csv, json, math, os, random
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
FX_FETCHED, FX_DEFAULT = 95.11, 88.0
RNG = random.Random(20261017)

# --- reference-minute workload (lane l2 base case) ---------------------------------------
CALLS, TIN, SYS, HIT, TOUT = 4.8, 3720, 3000, 0.85, 70
TTS_CHARS = 0.5 * 800 * 1.1
RT_FRESH_IN, RT_OUT, RT_CTX_AUDIO, RT_CTX_TEXT = 300, 600, 3000, 3000
RT_TEXT_IN = {  # text-token input price that goes with each realtime audio price (USD/1M)
    100.0: (5.0, 2.5), 40.0: (5.0, 2.5), 32.0: (4.0, 0.4), 10.0: (0.6, 0.06)}

def yrs(d):
    y, m, dd = map(int, d.split('-'))
    return y + (date(y, m, dd) - date(y, 1, 1)).days / 365.25

def llm_min(pin, pc, pout):
    if pc is None:
        inp = TIN * pin
    else:
        cached = SYS * HIT
        inp = (TIN - cached) * pin + cached * pc
    return CALLS * (inp + TOUT * pout) / 1e6

def rt_min(pin, pc, pout):
    tin, tc = RT_TEXT_IN.get(pin, (pin / 8, None))
    ca = pc if pc is not None else pin
    ct = tc if (tc is not None and pc is not None) else tin
    return (RT_FRESH_IN * pin + RT_OUT * pout + RT_CTX_AUDIO * ca + RT_CTX_TEXT * ct) / 1e6

def f(x):
    return None if x in ('', None) else float(x)

rows = list(csv.DictReader(open(os.path.join(HERE, 'prices.csv'))))
pts = []  # (series_key, date, usd_per_min, label)
for r in rows:
    comp, ser, d = r['component'], r['series'], r['date']
    pin, pc, pout, unit = f(r['price_in']), f(r['price_cached']), f(r['price_out']), r['unit']
    lab = r['model_or_plan']
    if comp == 'llm' and ser in ('frontier_tier', 'small_tier'):
        pts.append((('llm_' + ser), d, llm_min(pin, pc, pout), lab))
    elif comp == 'asr':
        if 'hour' in unit: v = pin / 60
        elif '1K audio tokens' in unit: v = pin * 0.6   # 10 tok/s = 600 tok/min
        else: v = pin
        commit = 'commitment' in lab.lower()   # needs 100k audio-hours/month: not a startup price
        if ser == 'azure_streaming' and not commit: pts.append(('asr_azure_streaming', d, v, lab))
        if ser in ('azure_streaming', 'third_party_streaming') and not commit:
            pts.append(('asr_any_streaming', d, v, lab))
    elif comp == 'tts':
        if ser == 'openai_api' and 'audio output tokens' in unit:
            v = 0.015 * 0.5 * 1.1  # vendor: ~$0.015 per audio minute; 0.5 talk x 1.1 waste
        else:
            v = TTS_CHARS * pin / 1e6
        if ser in ('azure_neural',):
            pts.append(('tts_azure_neural', d, v, lab))
            pts.append(('tts_azure_neural', '2023-03-01', v, lab + ' (carried back)'))
            pts.append(('tts_azure_quality', d, v, lab))
            # carried back to 2023-03 at the 2024-02 level (the earlier $16 list price was not
            # re-read this session); understates the pre-2024 TTS level by <= 7%
            pts.append(('tts_azure_quality', '2023-03-01', v, lab + ' (carried back)'))
        if ser in ('azure_hd',):
            pts.append(('tts_azure_hd', d, v, lab))
            pts.append(('tts_azure_quality', d, v, lab))
        if ser in ('third_party_premium',): pts.append(('tts_premium_thirdparty', d, v, lab))
    elif comp == 'realtime' and ser in ('openai_flagship', 'openai_mini'):
        pts.append(('rt_' + ser, d, rt_min(pin, pc, pout), lab))
    elif comp == 'realtime' and ser == 'openai_duration':
        pts.append(('rt_live1', d, pin / 60, lab))
    elif comp == 'platform':
        pts.append(('platform_' + ser, d, pin, lab))

# Azure neural TTS before 2024-02 ($16/1M) is from memory, not re-read this session: excluded.
series = {}
for k, d, v, lab in pts:
    series.setdefault(k, []).append((d, v, lab))
for k in series:
    series[k].sort()

def envelope(points):
    out, best = [], math.inf
    for d, v, lab in points:
        if v < best - 1e-12:
            best = v; out.append((d, best, lab))
    return out

LATEST = {'llm_frontier_tier', 'tts_azure_quality'}

def latest(points):
    # newest product at the quality bar: keep the last price on each date, in date order
    by = {}
    for d, v, lab in points:
        if d == '2023-03-01' and 'carried back' in lab and any(dd == d for dd, _, _ in points if dd != d):
            pass
        by[d] = (v, lab)
    return [(d, by[d][0], by[d][1]) for d in sorted(by)]

def ols(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0: return 0.0, my, 0.0
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    a = my - b * mx
    res = [y - (a + b * x) for x, y in zip(xs, ys)]
    sd = math.sqrt(sum(e * e for e in res) / max(n - 2, 1)) if n > 2 else 0.0
    return b, a, sd

NOW = '2026-10-17'
REC_START = '2025-04-17'

def fit_series(env, start=None):
    """Fit on the envelope's change points plus a 'still flat today' point at NOW."""
    pts_ = [(d, v) for d, v, _ in env if (start is None or d >= start)]
    if start is not None:
        # the envelope level in force at the window start counts as a point at the window start
        prior = [(d, v) for d, v, _ in env if d < start]
        if prior: pts_ = [(start, prior[-1][1])] + pts_
    if not pts_ or pts_[-1][0] != NOW:
        pts_.append((NOW, pts_[-1][1] if pts_ else env[-1][1]))
    xs = [yrs(d) for d, _ in pts_]; ys = [math.log(v) for _, v in pts_]
    b, a, sd = ols(xs, ys)
    boots = []
    n = len(xs)
    for _ in range(2000):
        idx = [RNG.randrange(n) for _ in range(n)]
        bx = [xs[i] for i in idx]; by = [ys[i] for i in idx]
        bb, _, _ = ols(bx, by)
        boots.append(bb)
    boots.sort()
    return {'n_points': n, 'slope_per_yr': b, 'annual_multiplier': math.exp(b),
            'slope_ci90': [boots[100], boots[1899]],
            'annual_multiplier_ci90': [math.exp(boots[100]), math.exp(boots[1899])],
            'resid_sd_log': sd, 'boot': boots, 'intercept': a}

results = {'workload': {'llm_calls_per_min': CALLS, 'llm_input_tokens_per_call': TIN,
                        'system_tokens': SYS, 'cache_hit': HIT, 'llm_output_tokens_per_call': TOUT,
                        'asr_audio_min_per_min': 1.0, 'tts_chars_per_min': TTS_CHARS,
                        'realtime_tokens_per_min': [RT_FRESH_IN, RT_OUT, RT_CTX_AUDIO, RT_CTX_TEXT]},
           'fx': {'fetched_inr_per_usd': FX_FETCHED, 'fetched_source': 'open.er-api.com 2026-10-17',
                  'default': FX_DEFAULT},
           'series': {}}

FITS = {}
for k, pts_k in series.items():
    env = latest(pts_k) if k in LATEST else envelope(pts_k)
    full = fit_series(env)
    rec = fit_series(env, REC_START)
    last_cut = env[-1][0]
    # for 'latest flagship' the relevant 'cut' is the last date the latest price fell
    if k in LATEST:
        lc = env[0][0]; prev = math.inf
        for d, v, _ in env:
            if v < prev - 1e-12: lc = d
            prev = v
        last_cut = lc
    first, last = env[0], env[-1]
    span = yrs(last[0]) - yrs(first[0])
    results['series'][k] = {
        'points': [{'date': d, 'usd_per_min': round(v, 6), 'label': lab} for d, v, lab in pts_k],
        'envelope': [{'date': d, 'usd_per_min': round(v, 6), 'label': lab} for d, v, lab in env],
        'first': {'date': first[0], 'usd_per_min': first[1]},
        'current': {'date': NOW, 'usd_per_min': env[-1][1]},
        'total_decline_factor': first[1] / env[-1][1],
        'last_cut_date': last_cut,
        'months_since_last_cut': round((yrs(NOW) - yrs(last_cut)) * 12, 1),
        'fit_full': {kk: vv for kk, vv in full.items() if kk != 'boot'},
        'fit_last18m': {kk: vv for kk, vv in rec.items() if kk != 'boot'},
    }
    FITS[k] = (env, full, rec)

# --- stacks -------------------------------------------------------------------------------
STACKS = {
    'A_managed_azure_quality_bar': ['asr_azure_streaming', 'llm_frontier_tier', 'tts_azure_quality'],
    'B_managed_azure_budget': ['asr_azure_streaming', 'llm_small_tier', 'tts_azure_neural'],
    'C_azure_realtime_s2s_flagship': ['rt_openai_flagship'],
    'C2_azure_realtime_s2s_mini': ['rt_openai_mini'],
}
TARGETS = ['2026-12-31', '2027-12-31', '2028-12-31']

def current(k):
    env = FITS[k][0]
    return env[-1][1]

def draw_component(k, t_years):
    env, full, rec = FITS[k]
    fit = full if RNG.random() < 0.5 else rec
    b = min(0.0, RNG.choice(fit['boot']))
    sd = max(fit['resid_sd_log'], 0.05)
    return current(k) * math.exp(b * t_years + RNG.gauss(0, sd) * min(1.0, t_years))

def q(v, p):
    v = sorted(v); i = min(len(v) - 1, max(0, int(round(p * (len(v) - 1)))))
    return v[i]

results['stacks'] = {}
for s, comps in STACKS.items():
    now_v = sum(current(c) for c in comps)
    out = {'components': comps, 'now_usd_per_min': now_v,
           'now_inr_per_min_fetched_fx': now_v * FX_FETCHED, 'forecast': {}}
    for T in TARGETS:
        dt = yrs(T) - yrs(NOW)
        draws = [sum(draw_component(c, dt) for c in comps) for _ in range(20000)]
        out['forecast'][T] = {
            'usd_p10': q(draws, 0.10), 'usd_p50': q(draws, 0.50), 'usd_p90': q(draws, 0.90),
            'inr_p10': q(draws, 0.10) * FX_FETCHED, 'inr_p50': q(draws, 0.50) * FX_FETCHED,
            'inr_p90': q(draws, 0.90) * FX_FETCHED,
            'inr_p50_at88': q(draws, 0.50) * FX_DEFAULT,
            'prob_below_inr_0p5': sum(1 for x in draws if x * FX_FETCHED < 0.5) / len(draws),
            'prob_below_inr_1p0': sum(1 for x in draws if x * FX_FETCHED < 1.0) / len(draws)}
    results['stacks'][s] = out

# --- method 2: empirical price-cut process ------------------------------------------------
# Every downward step of a component's level between 2024-01-01 and NOW is a 'cut'. Pool the cuts
# of the Azure-relevant components, estimate a Poisson rate per component-year and the empirical
# distribution of log cut sizes, and simulate cuts forward. No increases are simulated.
CUT_START = '2024-01-01'
CUT_SERIES = ['llm_frontier_tier', 'llm_small_tier', 'asr_azure_streaming', 'tts_azure_neural',
              'tts_azure_quality', 'rt_openai_flagship', 'rt_openai_mini']
CLASS = {'llm_frontier_tier': 'llm', 'llm_small_tier': 'llm', 'asr_azure_streaming': 'speech',
         'tts_azure_neural': 'speech', 'tts_azure_quality': 'speech', 'rt_openai_flagship': 'realtime',
         'rt_openai_mini': 'realtime'}
cuts = []
for k in CUT_SERIES:
    env = FITS[k][0]
    for (d0, v0, _), (d1, v1, lab1) in zip(env, env[1:]):
        if d1 >= CUT_START and v1 < v0 * 0.995:
            cuts.append({'series': k, 'date': d1, 'log_size': math.log(v1 / v0), 'label': lab1})
W = yrs(NOW) - yrs(CUT_START)
CP = {}
for cl in ('llm', 'speech', 'realtime'):
    ks = [k for k in CUT_SERIES if CLASS[k] == cl]
    cs = [c['log_size'] for c in cuts if CLASS[c['series']] == cl]
    CP[cl] = {'components': ks, 'n_cuts': len(cs), 'component_years': len(ks) * W,
              'rate_per_component_year': len(cs) / (len(ks) * W),
              'median_cut_pct': (1 - math.exp(sorted(cs)[len(cs) // 2])) * 100 if cs else None,
              'sizes': cs}
results['cut_process'] = {'window': [CUT_START, NOW], 'by_class': {k: {kk: vv for kk, vv in v.items() if kk != 'sizes'} for k, v in CP.items()},
                          'cuts': cuts}

def poisson(mu):
    L, k, p = math.exp(-mu), 0, 1.0
    while True:
        p *= RNG.random()
        if p < L: return k
        k += 1

for s_, comps in STACKS.items():
    fc2 = {}
    for T in TARGETS:
        dt_ = yrs(T) - yrs(NOW)
        draws = []
        for _ in range(20000):
            tot = 0.0
            for c in comps:
                v = current(c)
                cl = CP[CLASS[c]]
                for _ in range(poisson(cl['rate_per_component_year'] * dt_)):
                    v *= math.exp(RNG.choice(cl['sizes']))
                tot += v
            draws.append(tot)
        fc2[T] = {'inr_p10': q(draws, 0.10) * FX_FETCHED, 'inr_p50': q(draws, 0.50) * FX_FETCHED,
                  'inr_p90': q(draws, 0.90) * FX_FETCHED,
                  'prob_below_inr_0p5': sum(1 for x in draws if x * FX_FETCHED < 0.5) / len(draws),
                  'prob_below_inr_1p0': sum(1 for x in draws if x * FX_FETCHED < 1.0) / len(draws)}
    results['stacks'][s_]['forecast_cut_process'] = fc2

# --- method 3 (round 2): current-regime LLM forecasts -------------------------------------
# (a) llm_flat: LLM list prices stay where they are today; speech/realtime keep the method-2 cut process.
# (b) llm_recent_regime: each LLM component replays its own level changes since REC_START (rises included).
REC_YEARS = yrs(NOW) - yrs(REC_START)
REC_EVENTS = {}
for k in CUT_SERIES:
    if CLASS[k] != 'llm': continue
    env = FITS[k][0]
    REC_EVENTS[k] = [{'date': d1, 'log_size': math.log(v1 / v0), 'label': lab1}
                     for (d0, v0, _), (d1, v1, lab1) in zip(env, env[1:])
                     if d1 > REC_START and abs(math.log(v1 / v0)) > 0.005]
results['llm_recent_regime_events'] = {'window': [REC_START, NOW], 'years': REC_YEARS,
                                       'by_series': {k: {'n_events': len(v), 'rate_per_year': len(v) / REC_YEARS, 'events': v}
                                                     for k, v in REC_EVENTS.items()}}

def forecast_mode(comps, T, mode, n=20000):
    dt_ = yrs(T) - yrs(NOW)
    draws = []
    for _ in range(n):
        tot = 0.0
        for c in comps:
            v = current(c)
            if CLASS[c] == 'llm':
                if mode == 'llm_recent_regime' and REC_EVENTS.get(c):
                    ev = REC_EVENTS[c]
                    for _ in range(poisson(len(ev) / REC_YEARS * dt_)):
                        v *= math.exp(RNG.choice(ev)['log_size'])
                # mode 'llm_flat' (or no recent events): hold today's level
            else:
                cl = CP[CLASS[c]]
                for _ in range(poisson(cl['rate_per_component_year'] * dt_)):
                    v *= math.exp(RNG.choice(cl['sizes']))
            tot += v
        draws.append(tot)
    return {'inr_p10': q(draws, 0.10) * FX_FETCHED, 'inr_p50': q(draws, 0.50) * FX_FETCHED,
            'inr_p90': q(draws, 0.90) * FX_FETCHED,
            'prob_below_inr_0p5': sum(1 for x in draws if x * FX_FETCHED < 0.5) / len(draws),
            'prob_below_inr_1p0': sum(1 for x in draws if x * FX_FETCHED < 1.0) / len(draws)}

for mode in ('llm_flat', 'llm_recent_regime'):
    for s_, comps in STACKS.items():
        results['stacks'][s_]['forecast_' + mode] = {T: forecast_mode(comps, T, mode) for T in TARGETS}

results['forecast_headline'] = {
    'note': ('Round 2: the cut-process forecast (method 2) assumes the 2024-25 LLM cut rate continues and is the OPTIMISTIC '
             'case. The current-regime headline holds LLM list prices flat (method 3a), consistent with the frontier '
             'series\' last-18-month multiplier of ~1.0 and no new small-tier low since 2025-08. INR at a fixed 95.11.'),
    'by_stack_end_2027_inr_p10_p50_p90': {
        s_: {'current_regime_llm_flat': [round(v['forecast_llm_flat']['2027-12-31'][k], 3) for k in ('inr_p10', 'inr_p50', 'inr_p90')],
             'llm_recent_regime_jumps': [round(v['forecast_llm_recent_regime']['2027-12-31'][k], 3) for k in ('inr_p10', 'inr_p50', 'inr_p90')],
             'optimistic_cut_process': [round(v['forecast_cut_process']['2027-12-31'][k], 3) for k in ('inr_p10', 'inr_p50', 'inr_p90')]}
        for s_, v in results['stacks'].items()}}

# historical value of stack A and B at past dates (step functions of each component's envelope)
def level_at(k, d):
    env = FITS[k][0]
    v = None
    for dd, vv, _ in env:
        if dd <= d: v = vv
    return v

hist_dates = ['2023-04-01', '2024-10-17', '2023-12-01', '2024-06-01', '2024-11-01', '2025-05-01',
              '2025-09-01', '2026-01-01', '2026-04-01', '2026-08-01', NOW]
hist_dates = sorted(hist_dates)
results['stack_history'] = {}
for s in ('A_managed_azure_quality_bar', 'B_managed_azure_budget', 'C_azure_realtime_s2s_flagship'):
    hh = []
    for d in hist_dates:
        vals = [level_at(c, d) for c in STACKS[s]]
        hh.append({'date': d, 'usd_per_min': None if any(v is None for v in vals) else sum(vals)})
    results['stack_history'][s] = hh

# self-hosted point estimate (computed today; see report for sources)
selfhost = {
    'asr_riva_conformer_hi_A100_3yrRI_50util': 1.908 / 60 / (233 * 0.5 * 0.5),
    'tts_magpie_multilingual_H100_3yrRI_50util_x_talkshare': 5.375 / 60 / (64 * 0.5) * 0.5,
    'llm_phonellm_class_30B_A3B_claim_corrected': 0.0025,
    'orchestration_infra_from_l2': 0.064125 / 95.0,
}
selfhost['total_usd_per_min'] = sum(selfhost.values())
selfhost['total_inr_per_min_fetched_fx'] = selfhost['total_usd_per_min'] * FX_FETCHED
selfhost['caveats'] = ('vendor throughput claims (NVIDIA, Daily/Pipecat) not measured by us; 50% utilisation '
                       'and 0.5 derate assumed; excludes N+1 minimum fleet (dominates below ~1M min/month), '
                       'engineering and on-call; PhoneLLM is English-only and Magpie has no published Hindi '
                       'quality metric, so this stack does not yet meet the quality bar')
results['selfhost_point_2026_10'] = selfhost

json.dump(results, open(os.path.join(HERE, 'fit-results.json'), 'w'), indent=1, default=float)
with open(os.path.join(HERE, 'series-per-minute.csv'), 'w', newline='') as fo:
    w = csv.writer(fo)
    w.writerow(['series', 'date', 'usd_per_ref_minute', 'inr_per_ref_minute_at_95.11', 'label', 'on_envelope'])
    for k, pts_k in series.items():
        env_d = {(d, round(v, 9)) for d, v, _ in FITS[k][0]}
        for d, v, lab in pts_k:
            w.writerow([k, d, f'{v:.6f}', f'{v * FX_FETCHED:.4f}', lab, (d, round(v, 9)) in env_d])

# --- figure ---------------------------------------------------------------------------------
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime

INK, INK2, MUTED, GRID, SURF = '#0b0b0b', '#52514e', '#8a8984', '#e4e3df', '#fcfcfb'
S1, S2, S3 = '#2a78d6', '#eb6834', '#1baf7a'
plt.rcParams.update({'font.size': 9, 'axes.edgecolor': GRID, 'axes.labelcolor': INK2,
                     'xtick.color': INK2, 'ytick.color': INK2, 'axes.titlecolor': INK,
                     'figure.facecolor': SURF, 'axes.facecolor': SURF})

def dt(d): return datetime.strptime(d, '%Y-%m-%d')

def step_xy(env, end=NOW):
    xs, ys = [], []
    for i, (d, v, _) in enumerate(env):
        xs.append(dt(d)); ys.append(v)
        nxt = env[i + 1][0] if i + 1 < len(env) else end
        xs.append(dt(nxt)); ys.append(v)
    return xs, ys

def panel(ax, title, items, ylab='USD per reference minute (log)'):
    for k, color, name in items:
        if k not in FITS: continue
        env = FITS[k][0]
        allp = series[k]
        if k in LATEST:
            ax.plot([dt(d) for d, _, _ in allp], [v for _, v, _ in allp], '-', color=color, lw=2)
        else:
            xs, ys = step_xy(env); ax.plot(xs, ys, '-', color=color, lw=2)
        ax.plot([dt(d) for d, _, _ in allp], [v for _, v, _ in allp], 'o', ms=5, color=color,
                markeredgecolor=SURF, markeredgewidth=1.2)
        lastv = env[-1][1]
        ax.annotate(f'{name}\n${lastv:.4f}', xy=(dt(NOW), lastv), xytext=(6, 0),
                    textcoords='offset points', va='center', fontsize=8, color=INK2)
    ax.set_yscale('log'); ax.set_title(title, loc='left', fontsize=10, fontweight='bold')
    ax.set_ylabel(ylab, fontsize=8); ax.grid(True, which='major', color=GRID, lw=0.6)
    ax.xaxis.set_major_locator(mdates.YearLocator()); ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y'))
    ax.set_xlim(dt('2023-01-01'), dt('2027-09-30'))
    for sp in ('top', 'right'): ax.spines[sp].set_visible(False)

fig = plt.figure(figsize=(15, 12.5))
gs = fig.add_gridspec(3, 3, height_ratios=[1, 1, 1.15])
axes = {(0, 0): fig.add_subplot(gs[0, 0]), (0, 1): fig.add_subplot(gs[0, 1]), (0, 2): fig.add_subplot(gs[0, 2]),
        (1, 0): fig.add_subplot(gs[1, 0]), (1, 1): fig.add_subplot(gs[1, 1]), (1, 2): fig.add_subplot(gs[1, 2]),
        (2, 0): fig.add_subplot(gs[2, :])}
panel(axes[(0, 0)], 'LLM per reference minute', [('llm_frontier_tier', S1, 'newest flagship'),
                                               ('llm_small_tier', S2, 'cheapest small')])
panel(axes[(0, 1)], 'Streaming ASR per minute', [('asr_azure_streaming', S1, 'Azure cheapest'),
                                               ('asr_any_streaming', S2, 'any vendor cheapest')])
panel(axes[(0, 2)], 'TTS per reference minute', [('tts_azure_neural', S1, 'Azure Neural'),
                                               ('tts_azure_hd', S2, 'Azure Neural HD'),
                                               ('tts_premium_thirdparty', S3, 'ElevenLabs/Cartesia')])
panel(axes[(1, 0)], 'Realtime speech-to-speech per minute', [('rt_openai_flagship', S1, 'gpt-realtime'),
                                                           ('rt_openai_mini', S2, 'realtime mini')])
panel(axes[(1, 1)], 'Voice-agent platform list price', [('platform_us_platform_fee', S1, 'Vapi fee'),
                                                      ('platform_india_all_in', S2, 'India all-in'),
                                                      ('platform_us_engine', S3, 'US engines')],
      ylab='USD per minute (log)')
axT = axes[(1, 2)]
tel = [r for r in rows if r['component'] == 'telephony' and r['series'] == 'india_cpaas']
for vend, c, dy in (('Plivo', S1, -9), ('Tata Tele Business', S2, 0), ('Sarvam (Vobiz)', S3, 9)):
    pp = sorted((r['date'], float(r['price_in'])) for r in tel if r['vendor'] == vend)
    if not pp: continue
    axT.plot([dt(d) for d, _ in pp], [v for _, v in pp], '-o', color=c, lw=2, ms=5, markeredgecolor=SURF)
    axT.annotate(f'{vend} Rs {pp[-1][1]:.2f}', xy=(dt(pp[-1][0]), pp[-1][1]), xytext=(6, dy),
                 textcoords='offset points', fontsize=8, color=INK2, va='center')
axT.annotate('2026-03 capture: Rs 0.74 is the "Local Calls" row;\nsame capture lists Rs 0.40 (not a price rise)', xy=(dt('2026-03-16'), 0.74),
             xytext=(-170, -8), textcoords='offset points', fontsize=7.5, color=MUTED)
p30 = sorted((r['date'], float(r['price_in'])) for r in rows if r['component'] == 'telephony' and r['series'] == 'india_cpaas_30s_pulse')
if p30:
    live30 = [(r['date'], float(r['price_in'])) for r in tel if r['vendor'] == 'Plivo' and '30 s pulse' in r['model_or_plan']]
    pp30 = p30 + live30
    axT.plot([dt(d) for d, _ in pp30], [v for _, v in pp30], ':', color=S1, lw=1.2)
    axT.plot([dt(d) for d, _ in p30], [v for _, v in p30], 'o', ms=5, color=SURF, markeredgecolor=S1, markeredgewidth=1.4)
    axT.annotate('Plivo at a 30 s pulse: Rs 0.48 (2024-02)\n-> Rs 0.38 (live), -21% like for like', xy=(dt(p30[0][0]), p30[0][1]),
                 xytext=(2, -62), textcoords='offset points', fontsize=7.5, color=MUTED)
axT.axvline(dt('2026-11-17'), color=MUTED, lw=1, ls=':')
axT.annotate('TRAI A2P termination\ncharge up to +Rs 0.05/min\nfrom 2026-11-17 (dotted line)', xy=(dt('2026-11-17'), 0.08),
             xytext=(-118, 0), textcoords='offset points', fontsize=7.5, color=MUTED)
axT.set_ylim(0, 0.9); axT.set_title('What does not fall: India PSTN telephony', loc='left', fontsize=10, fontweight='bold')
axT.set_ylabel('INR per minute (linear)', fontsize=8); axT.grid(True, color=GRID, lw=0.6)
axT.xaxis.set_major_locator(mdates.YearLocator()); axT.xaxis.set_major_formatter(mdates.DateFormatter('%Y'))
axT.set_xlim(dt('2023-01-01'), dt('2027-09-30'))
for sp in ('top', 'right'): axT.spines[sp].set_visible(False)

ax = axes[(2, 0)]
cols = {'A_managed_azure_quality_bar': (S1, 'A managed Azure, quality bar'),
        'B_managed_azure_budget': (S2, 'B managed Azure, budget'),
        'C_azure_realtime_s2s_flagship': (S3, 'C realtime S2S')}
lab_pos = []
for s, (c, name) in cols.items():
    hh = [(dt(h['date']), h['usd_per_min'] * FX_FETCHED) for h in results['stack_history'][s] if h['usd_per_min']]
    ax.plot([x for x, _ in hh], [y for _, y in hh], '-', color=c, lw=2)
    fc = results['stacks'][s]['forecast_cut_process']
    xs = [dt(NOW)] + [dt(T) for T in TARGETS]
    nowv = results['stacks'][s]['now_usd_per_min'] * FX_FETCHED
    lo = [nowv] + [fc[T]['inr_p10'] for T in TARGETS]
    hi = [nowv] + [fc[T]['inr_p90'] for T in TARGETS]
    md = [nowv] + [fc[T]['inr_p50'] for T in TARGETS]
    ax.fill_between(xs, lo, hi, color=c, alpha=0.15, lw=0)
    ax.plot(xs, md, '--', color=c, lw=1.5)
    ff = results['stacks'][s]['forecast_llm_flat']
    has_llm = any(CLASS.get(cc) == 'llm' for cc in STACKS[s])
    if has_llm:
        md2 = [nowv] + [ff[T]['inr_p50'] for T in TARGETS]
        lo2 = [nowv] + [ff[T]['inr_p10'] for T in TARGETS]; hi2 = [nowv] + [ff[T]['inr_p90'] for T in TARGETS]
        ax.plot(xs, md2, ':', color=c, lw=2.2)
        ax.plot(xs, lo2, '-', color=c, lw=0.6, alpha=0.6); ax.plot(xs, hi2, '-', color=c, lw=0.6, alpha=0.6)
        txt = (f'{name}: now Rs {nowv:.2f}\nend-2027 P50 Rs {ff["2027-12-31"]["inr_p50"]:.2f} if LLM prices stay flat (current regime);\n'
               f'Rs {fc["2027-12-31"]["inr_p50"]:.2f} if 2024-25 LLM cuts resume (optimistic)')
    else:
        txt = f'{name}: now Rs {nowv:.2f}; end-2027 P50 Rs {fc["2027-12-31"]["inr_p50"]:.2f} (no LLM component)'
    lab_pos.append([md[-1], c, txt])
lab_pos.sort(key=lambda r: r[0])
for i in range(1, len(lab_pos)):
    if lab_pos[i][0] < lab_pos[i - 1][0] * 1.9: lab_pos[i][0] = lab_pos[i - 1][0] * 1.9
for y, c, txt in lab_pos:
    ax.annotate(txt, xy=(dt('2029-01-15'), y), fontsize=7.5, color=INK2, va='center')
    ax.plot([dt('2028-12-31')], [y], 's', color=c, ms=5)
dval = selfhost['total_inr_per_min_fetched_fx']
ax.plot([dt(NOW)], [dval], 'D', color=INK2, ms=6)
ax.annotate(f'D self-hosted on Azure GPUs, vendor throughput claims, 50% utilisation: Rs {dval:.2f} (not yet at quality bar)',
            xy=(dt(NOW), dval), xytext=(8, 9), textcoords='offset points', fontsize=7.5, color=INK2, va='center')
ax.axhline(0.5, color=MUTED, lw=1, ls=':')
ax.annotate('Rs 0.5/min (H9 prediction, end-2027)', xy=(dt('2023-02-01'), 0.5), xytext=(0, 4),
            textcoords='offset points', fontsize=7.5, color=MUTED)
ax.set_yscale('log'); ax.set_title('AI cost per connected minute (INR, excl. telephony)', loc='left',
                                   fontsize=10, fontweight='bold')
ax.set_ylabel('INR per minute at 95.11 (log)', fontsize=8); ax.grid(True, color=GRID, lw=0.6)
ax.xaxis.set_major_locator(mdates.YearLocator()); ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y'))
ax.set_xlim(dt('2023-01-01'), dt('2031-06-30'))
ax.set_xticks([dt(f'{y}-01-01') for y in range(2023, 2030)])
for sp in ('top', 'right'): ax.spines[sp].set_visible(False)
fig.suptitle('Voice-AI list prices per reference minute, 2023-2026, and forecasts to 2028 '
             '(solid = cheapest available or newest at quality bar; dots = dated list prices)\nForecasts: dashed + shaded band = cut-process P50 and P10-P90 (optimistic: 2024-25 LLM cut rate); '
             'dotted + thin lines = LLM prices held flat (current regime) P50 and P10-P90',
             fontsize=10.5, color=INK, x=0.01, ha='left')
fig.text(0.01, 0.005, 'Sources: prices.csv (Azure Retail Prices API, Common Crawl captures of vendor price pages, '
         'llm-prices git history, lanes l2/l4a). Workload: lane l2 base case. Generated by fit.py, 2026-10-17; round-2 corrections applied (GPT-5.1/5.2 rows, LLM-flat forecast).',
         fontsize=7.5, color=MUTED)
fig.tight_layout(rect=(0, 0.02, 1, 0.95))
fig.savefig(os.path.join(HERE, 'curves.png'), dpi=130)
for k, v in results['stacks'].items():
    print(k, 'now USD %.4f (INR %.2f)' % (v['now_usd_per_min'], v['now_inr_per_min_fetched_fx']),
          {T: (round(x['inr_p10'], 2), round(x['inr_p50'], 2), round(x['inr_p90'], 2), 'P(<0.5)=%.2f' % x['prob_below_inr_0p5'])
           for T, x in v['forecast'].items()})
print('cut process', results['cut_process']['by_class'])
for c in results['cut_process']['cuts']: print('   cut', c['series'], c['date'], '%.0f%%' % ((math.exp(c['log_size']) - 1) * 100), c['label'])
for k, v in results['stacks'].items():
    print(k, 'cut-process', {T: (round(x['inr_p10'], 2), round(x['inr_p50'], 2), round(x['inr_p90'], 2), 'P(<0.5)=%.2f' % x['prob_below_inr_0p5'], 'P(<1)=%.2f' % x['prob_below_inr_1p0']) for T, x in v['forecast_cut_process'].items()})
for k, v in results['stacks'].items():
    for mode in ('forecast_llm_flat', 'forecast_llm_recent_regime'):
        print(k, mode, {T: (round(x['inr_p10'], 2), round(x['inr_p50'], 2), round(x['inr_p90'], 2), 'P(<1)=%.3f' % x['prob_below_inr_1p0']) for T, x in v[mode].items()})
for k, v in results['series'].items():
    print(k, 'decline x%.1f since %s;' % (v['total_decline_factor'], v['first']['date']),
          'full mult/yr %.2f;' % v['fit_full']['annual_multiplier'],
          'last18m mult/yr %.2f;' % v['fit_last18m']['annual_multiplier'],
          'months since last cut', v['months_since_last_cut'])
print('selfhost', round(selfhost['total_usd_per_min'], 5), 'USD/min =', round(selfhost['total_inr_per_min_fetched_fx'], 2), 'INR')
for s_, hh in results['stack_history'].items():
    print(s_, [(h['date'], None if h['usd_per_min'] is None else round(h['usd_per_min'], 4)) for h in hh])
