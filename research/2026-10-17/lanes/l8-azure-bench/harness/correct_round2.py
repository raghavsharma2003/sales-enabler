# Round-2 corrections to l8 cost inputs (package r2-model-corrections, critic item A10, l8 verify.md items 6 and
# "Factual errors to fix" 1-3). 2026-10-17. No network, no paid calls.
#
#   python3 -P harness/correct_round2.py            (run from anywhere; paths are relative to this file)
#
# Why a separate script and not a re-run of analyze.py: cost-inputs.json was hand-extended after analyze.py wrote it
# (Voice Live, async filter, STT latency, number read-back, levers_not_measured, india_hosted_latency_adjustment_ms),
# and analyze.py needs the raw audio + soundfile for unrelated columns. This script starts from the round-1 files
# (kept as *.round1.*), recomputes every INR figure from the stored USD inputs at FX 95, and applies three factual
# fixes. It first re-derives the round-1 INR values at FX 88 and asserts they match, so the recomputation is exact.
#
# Corrections applied:
#   1. FX INR per USD 88.0 -> 95.0. ECB reference 94.96 on 2026-10-16 (range 94.96-96.78 from 2026-09-15 to 10-16,
#      Frankfurter); open.er-api 95.11 on 2026-10-17 (l8 and l2 verify.md). Every INR figure was ~7.3% low.
#   2. MAI-Transcribe-2 price: $0.10 per audio hour in central-india and asia-pacific-southeast, from the Azure pricing
#      calculator API (offer speech-services-mai-transcribe-2-speech-to-text, re-fetched 2026-10-17). The pricing page
#      footnotes it as a limited-time promotional offer until 2026-12-31 (per l8 verify.md; not re-read here). It is a
#      file-based (fast transcription / batch) or Voice Live model, NOT a streaming SDK recogniser, so it cannot be the
#      streaming ear of a cascade; it is costed here only for post-call re-transcription / QA.
#   3. Central India -> France Central RTT p50 is 135 ms (134 ms in reverse), not 118 ms; 118 ms is Central India ->
#      France South (Microsoft "Azure network round-trip latency statistics", ms.date 2026-07-30, re-fetched 2026-10-17).
#   Also: standard STT commitment tiers from the calculator; the unbacked "2 ASR engines agree" note is annotated.
import os, json, csv, math, statistics

HERE = os.path.dirname(os.path.abspath(__file__)); LANE = os.path.dirname(HERE); RES = os.path.join(LANE, "results")
FX_OLD, FX_NEW = 88.0, 95.0

# ---- LLM: identical pricing and cost function to analyze.py ----
PRICE = {'gpt-4.1-mini': (0.40, 0.10, 1.60), 'gpt-4.1-nano': (0.10, 0.025, 0.40), 'gpt-5.4-mini': (0.75, 0.075, 4.50), 'gpt-5.4-nano': (0.20, 0.02, 1.25),
         'gpt-6-luna(DZ-EU)': (0.11, 0.011, 0.55), 'gpt-6-sol(DZ-EU)': (2.20, 0.22, 11.0), 'DeepSeek-V4-Flash(DZ-EU)': (0.21, 0.031, 0.56),
         'DeepSeek-V4.1-Flash': (0.30, 0.006, 1.20), 'Llama-3.3-70B': (0.71, 0.71, 0.71), 'Phi-4': (0.125, 0.125, 0.50), 'gpt-oss-120b': (0.15, 0.15, 0.60)}

def fnum(v):
    try: return float(v)
    except (TypeError, ValueError): return None

def llm_costs():
    """{(run, model, filter, cache_arm): (mean usd per turn, mean usd per turn uncached)} from the raw bench CSVs."""
    acc = {}
    for fn, run in (("llm_bench.csv", "main"), ("llm_bench_async.csv", "filter-ab")):
        for r in csv.DictReader(open(os.path.join(RES, fn), encoding="utf-8")):
            if r["status"] != "200": continue
            m = r["model"]; base = m.replace("+async", ""); filt = "async" if m.endswith("+async") else "default"
            pt = float(r["prompt_tokens"]); ct = fnum(r["cached_tokens"]) or 0.0; co = float(r["completion_tokens"])
            pi, pc, po = PRICE[base]
            usd = ((pt - ct) * pi + ct * pc + co * po) / 1e6; nc = (pt * pi + co * po) / 1e6
            acc.setdefault((run, base, filt, r["cache_arm"]), []).append((usd, nc))
    return {k: (sum(a for a, _ in v) / len(v), sum(b for _, b in v) / len(v)) for k, v in acc.items()}

# ---- TTS: identical to analyze.py ----
def tts_price(v):
    if 'MAI-Voice' in v: return None
    if 'Dragon' in v: return 22.0
    return 15.0

def tts_cps():
    g = {}
    for r in csv.DictReader(open(os.path.join(RES, "tts_bench.csv"), encoding="utf-8")):
        if r["ok"] != "True": continue
        g.setdefault((r["voice"], r["arm"]), []).append(float(r["chars"]) / float(r["audio_s"]))
    return {k: statistics.median(v) for k, v in g.items()}

# ---- Voice Live: identical usage arithmetic to analyze.py ----
def voicelive_usd_per_turn():
    g = {}
    for r in csv.DictReader(open(os.path.join(RES, "voicelive.csv"), encoding="utf-8")):
        u = json.loads(r["usage"]) if r["usage"].startswith("{") else {}
        i = u.get("input_token_details") or {}; o = u.get("output_token_details") or {}
        usd = (i.get("text_tokens", 0) * 0.00066 + o.get("text_tokens", 0) * 0.00264 + i.get("audio_tokens", 0) * 0.015 + o.get("audio_tokens", 0) * 0.026) / 1000
        g.setdefault(r["arm"], []).append(usd)
    return {k: sum(v) / len(v) for k, v in g.items()}

def rewrite_csv(path, round1_path, fn):
    """fn(row) -> dict of replaced columns. Writes path from round1_path, keeping every other cell byte-for-byte."""
    rows = list(csv.reader(open(round1_path, encoding="utf-8", newline="")))
    hdr = rows[0]; out = [hdr]
    for r in rows[1:]:
        d = dict(zip(hdr, r)); rep = fn(d)
        out.append([str(rep[h]) if h in rep else r[i] for i, h in enumerate(hdr)])
    with open(path, "w", encoding="utf-8", newline="") as f:
        csv.writer(f, lineterminator="\n").writerows(out)

def main():
    ci = json.load(open(os.path.join(LANE, "cost-inputs.round1.json"), encoding="utf-8"))
    assert ci["fx_inr_per_usd"] == FX_OLD
    LC = llm_costs(); CPS = tts_cps(); VL = voicelive_usd_per_turn()

    # 1a. llm_summary.csv: verify round-1 INR at 88, rewrite at 95
    def llm_fix(fx):
        def f(d):
            usd, nc = LC[(d["run"], d["model"], d["content_filter"], d["cache_arm"])]
            return {"cost_per_turn_inr_mean": round(usd * fx, 4), "cost_per_turn_inr_if_uncached": round(nc * fx, 4)}
        return f
    r1 = os.path.join(RES, "llm_summary.round1.csv")
    for d in csv.DictReader(open(r1, encoding="utf-8")):
        chk = llm_fix(FX_OLD)(d)
        assert abs(chk["cost_per_turn_inr_mean"] - float(d["cost_per_turn_inr_mean"])) < 1e-9, d["model"]
        assert abs(chk["cost_per_turn_inr_if_uncached"] - float(d["cost_per_turn_inr_if_uncached"])) < 1e-9, d["model"]
    rewrite_csv(os.path.join(RES, "llm_summary.csv"), r1, llm_fix(FX_NEW))

    # 1b. tts_summary.csv
    def tts_fix(fx):
        def f(d):
            pr = tts_price(d["voice"]); cps = CPS[(d["voice"], d["arm"])]
            return {"inr_per_audio_min": round(cps * 60 * pr / 1e6 * fx, 4) if pr else ""}
        return f
    r1 = os.path.join(RES, "tts_summary.round1.csv")
    for d in csv.DictReader(open(r1, encoding="utf-8")):
        v = tts_fix(FX_OLD)(d)["inr_per_audio_min"]
        assert (v == "" and d["inr_per_audio_min"] == "") or abs(v - float(d["inr_per_audio_min"])) < 1e-9, d["voice"]
    rewrite_csv(os.path.join(RES, "tts_summary.csv"), r1, tts_fix(FX_NEW))

    # 1c. voicelive_summary.csv (only the INR column; other columns need raw audio and are unchanged)
    r1 = os.path.join(RES, "voicelive_summary.round1.csv")
    for d in csv.DictReader(open(r1, encoding="utf-8")):
        assert abs(round(VL[d["arm"]] * 5 * FX_OLD, 2) - float(d["est_inr_per_min_at_5_turns"])) < 1e-9, d["arm"]
    rewrite_csv(os.path.join(RES, "voicelive_summary.csv"), r1, lambda d: {"est_inr_per_min_at_5_turns": round(VL[d["arm"]] * 5 * FX_NEW, 2)})
    vl_new = {d["arm"]: round(VL[d["arm"]] * 5 * FX_NEW, 2) for d in csv.DictReader(open(r1, encoding="utf-8"))}

    # 2. cost-inputs.json
    out = json.loads(json.dumps(ci))
    out["fx_inr_per_usd"] = FX_NEW
    out["fx_source"] = ("ECB reference USD/INR 94.96 on 2026-10-16 (94.96-96.78 from 2026-09-15 to 2026-10-16, via Frankfurter); "
                        "open.er-api 95.11 on 2026-10-17; programme convention ~95 (round 1 used 88)")
    for model, row in out["measured"]["llm_per_turn"].items():
        usd, nc = LC[("main", model, "default", "warm")]
        assert abs(round(usd * FX_OLD, 4) - ci["measured"]["llm_per_turn"][model]["cost_inr_per_turn"]) < 1e-9, model
        row["cost_inr_per_turn"] = round(usd * FX_NEW, 4); row["cost_inr_per_turn_uncached"] = round(nc * FX_NEW, 4)
    vlk = out["measured"]["voice_live_first_audio_after_speech_end_ms_server_est_p50"]
    vlk["est_inr_per_min_std_meters"] = {"gpt-4.1-mini arms": [vl_new["vl-gpt41mini-mai2-meeraHD"], vl_new["vl-gpt41mini-azspeech-swara"]],
                                         "azure-realtime": vl_new["vl-azure-realtime-diya"]}
    nb = out["measured"]["tts_number_readback"]
    nb["stimulus_case"] = nb["stimulus_case"].replace(" (2 ASR engines agree)", "")
    nb["round2_note"] = ("The round-1 note '2 ASR engines agree' is unbacked: fix_numbers.py and tts_numbers.py call only "
                         "MAI-Transcribe-2 and no second-engine transcript is stored; no human listening check. 3/99 vs 0/80 "
                         "is not significant (Fisher p=0.25; 4/100 vs 0/80 p=0.13 if the garbled Meera-HD render is counted). "
                         "Source: l8 verify.md item 7.")
    asr = out["prices_usd"]["asr_per_hour"]
    asr["mai_transcribe_2"] = 0.10
    asr["mai_transcribe_2_note"] = ("Azure pricing calculator API offer speech-services-mai-transcribe-2-speech-to-text = 0.10 in "
                                    "central-india and asia-pacific-southeast (re-fetched 2026-10-17); pricing page footnote: "
                                    "limited-time promotional offer until 2026-12-31 (per l8 verify.md). Not in the Retail Prices API "
                                    "on 2026-10-17. Batch/file (fast transcription) or Voice Live only: NOT a streaming SDK recogniser, "
                                    "so it cannot serve as the streaming ear; use for post-call re-transcription/QA.")
    asr["speech_standard_commitment_tiers_usd_per_hour"] = {"2000h_per_month": 0.80, "10000h_per_month": 0.65, "50000h_per_month": 0.50,
                                                            "source": "Azure pricing calculator API, speech-services-azure-commitment-speech-to-text-standard-*, central-india, re-fetched 2026-10-17"}
    stacks = []
    for s in out["example_stacks_ai_only"]:
        u = s["usd_per_min"]
        # analyze.py stack() used the ROUNDED summary values (usd/turn to 6 dp, chars/s to 2 dp); replicate exactly
        llm_min = round(LC[("main", s["llm"], "default", "warm")][0], 6) * out["assumptions"]["llm_turns_per_connected_min"]
        tts_min = round(CPS[(s["voice"], "ws")], 2) * out["assumptions"]["agent_talk_seconds_per_connected_min"] * tts_price(s["voice"]) / 1e6
        tot = 1.00 / 60 + llm_min + tts_min
        assert abs(round(tot * FX_OLD, 3) - s["inr_per_min_total_ai"]) < 1e-9, s
        s2 = dict(s); s2["inr_per_min_total_ai"] = round(tot * FX_NEW, 3)
        s2["inr_per_min_by_component"] = {"asr": round(1.00 / 60 * FX_NEW, 3), "llm": round(llm_min * FX_NEW, 3), "tts": round(tts_min * FX_NEW, 3)}
        stacks.append(s2)
    out["example_stacks_ai_only"] = stacks
    out["post_call_retranscription_mai_transcribe_2"] = {
        "usd_per_call_min": round(0.10 / 60, 5), "inr_per_call_min": round(0.10 / 60 * FX_NEW, 3),
        "note": "Whole-call re-transcription for QA/disposition at the promo price; adds to, does not replace, the streaming ear. Reverts to an unknown list price after 2026-12-31."}
    lv = out["levers_not_measured"]
    lv["vad_gated_streaming_stt"] = ("if billing is per second of audio sent, sending only caller speech (~40-50% of a call) cuts ASR from "
                                     f"INR {1.00/60*FX_NEW:.2f} to ~{0.4/60*FX_NEW:.2f}-{0.5/60*FX_NEW:.2f}/min (derived; round 1 said 1.47 -> 0.6-0.75 at FX 88)")
    lv["stt_commitment_tier"] = ("calculator standard STT commitment: $0.80/0.65/0.50 per hour at 2k/10k/50k h/month = INR "
                                 f"{0.80/60*FX_NEW:.2f}/{0.65/60*FX_NEW:.2f}/{0.50/60*FX_NEW:.2f} per full-call minute; l2 lists $0.40/h at 100k h/month "
                                 f"(INR {0.40/60*FX_NEW:.2f}/min)")
    lv["mai_transcribe_2_price"] = "now known: $0.10/h promo until 2026-12-31 (calculator), batch/Voice Live only; see prices_usd.asr_per_hour"
    lat = out["india_hosted_latency_adjustment_ms"]
    lat["central_india_to_france_central_rtt_p50"] = 135
    lat["france_central_to_central_india_rtt_p50"] = 134
    lat["central_india_to_france_south_rtt_p50"] = 118
    lat["south_india_to_france_central_rtt_p50"] = 147
    lat["source"] = ("https://learn.microsoft.com/en-us/azure/networking/azure-network-latency (ms.date 2026-07-30; 30 days to 2026-07-30), "
                     "re-fetched 2026-10-17. Round 1 gave 118 for Central India -> France Central; 118 is Central India -> France South.")
    out["round2_corrections"] = {
        "date": "2026-10-17", "package": "r2-model-corrections (critic A10)", "round1_file": "cost-inputs.round1.json",
        "changes": ["fx_inr_per_usd 88 -> 95: every INR figure x95/88 (+8.0%); recomputed from stored USD inputs, round-1 values re-derived exactly at 88 first",
                    "prices_usd.asr_per_hour.mai_transcribe_2: 'not listed' -> 0.10 USD/h (calculator, promo to 2026-12-31, batch-only)",
                    "india_hosted_latency_adjustment_ms.central_india_to_france_central_rtt_p50: 118 -> 135",
                    "tts_number_readback: removed unbacked '(2 ASR engines agree)', added round2_note",
                    "added standard STT commitment tiers, MAI-2 post-call QA cost, per-component INR per stack",
                    "results/llm_summary.csv, tts_summary.csv, voicelive_summary.csv INR columns rewritten at FX 95 (round-1 copies *.round1.csv)"],
        "unchanged_and_why": ["rtt_ms_from_test_container francecentral 118 is the measured Ohio-container RTT (rtt.csv), not the Microsoft table, so it stays",
                              "latency figures are still from Ohio via a proxy; India-hosted latency is round-2 package r2-latency's job"]}
    json.dump(out, open(os.path.join(LANE, "cost-inputs.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    for s in stacks: print(f"{s['llm']:26s} {s['voice']:34s} INR/min {s['inr_per_min_total_ai']:.3f}  {s['inr_per_min_by_component']}")
    print("voice live INR/min at 5 turns:", vl_new)

if __name__ == "__main__":
    main()
