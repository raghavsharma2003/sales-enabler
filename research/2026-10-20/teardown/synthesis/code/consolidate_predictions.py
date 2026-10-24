"""Consolidate every teardown lane's pre-registered predictions into one numbered file.

Reads research/2026-10-20/teardown/*/predictions.json plus the regulation-segment and radar
predictions (which those lanes only wrote into report.md), and attaches the status known on
2026-10-20 from the verifiers and the authorized-surface (API-key) account phase.
Run: python3 -I research/2026-10-20/teardown/synthesis/code/consolidate_predictions.py
"""
import json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..'))
T = os.path.join(ROOT, 'research', '2026-10-20', 'teardown')
LANES = ['bolna', 'sarvam', 'vapi', 'retell', 'elevenlabs', 'synthflow', 'squadstack', 'exotel']
VENDOR = {'bolna': 'Bolna', 'sarvam': 'Sarvam', 'vapi': 'Vapi', 'retell': 'Retell',
          'elevenlabs': 'ElevenLabs', 'synthflow': 'Synthflow', 'squadstack': 'SquadStack',
          'exotel': 'Exotel'}

# Status known on 2026-10-20 (verifier passes + authorized-surface account phase). Everything else is open.
STATUS = {
    ('bolna', 'P01'): ('open; clause observed', "Instinct's account report confirms trial calls only to verified numbers (evidence.2026-10-20.trial-accounts-report); timing clause open."),
    ('bolna', 'P04c'): ('premise weakened', 'Account phase: campaign/callback schema defaults to +91 (research/2026-10-20/account-phase/SYNTHESIS.md, api-surface row "India-default number normalisation", ACB-20); dashboard upload behaviour still untested.'),
    ('bolna', 'P09a'): ('open; supported in mechanism', 'Account phase traced a ~1.4 s hold floor in code (500 ms endpointing + 900 ms incremental_delay from turn 3); needs a PSTN measurement.'),
    ('retell', 'RET-P01'): ('partly unscoreable', 'Sign-up clause was already known when registered (Instinct ~10-min sign-up before the predictions file); score only the handset-path clauses.'),
    ('retell', 'RET-P03'): ('premise refuted in part', 'Account phase: an AI-disclosure preset exists (handbook_config.ai_disclosure), on for dashboard agents, absent on API-created agents (RAP-19, RAP-53).'),
    ('retell', 'RET-P04'): ('partly supported (API)', 'Account phase: on the CRM path a 10-digit Indian number becomes +1 and duplicates are not merged across formats (RAP-54); batch upload untested.'),
    ('retell', 'RET-P05'): ('partly supported (spec)', 'Account phase: LA default and no-cross-midnight are in the typed spec (RAP-55); IST warning and retries untested.'),
    ('retell', 'RET-P12'): ('second clause contradicted', 'Docs: Retell does add a platform disclosure preset (RET-63); keep only the 7-of-8 count.'),
    ('elevenlabs', 'EL-P04'): ('partly supported (API)', 'Public batch API has scheduled_time_unix + timezone only (account-phase predictions-scored.json).'),
    ('elevenlabs', 'EL-P09'): ('partly supported (API)', 'API-created agent has empty first_message and prompt, so nothing discloses by default (predictions-scored.json); 9-of-10 clause untested.'),
    ('elevenlabs', 'EL-P10'): ('partly supported (API)', 'llm_charge and cost_fiat present in schema; rates untested (predictions-scored.json).'),
    ('elevenlabs', 'EL-P12'): ('HIT (API)', 'user_memory.enabled=false by default; enabling returned 403 feature_not_available (predictions-scored.json).'),
    ('squadstack', 'SQS-P02'): ('premise observed; not runnable', 'Sign-in is allowlisted to SquadStack addresses (SQS-70); a team@ sign-up would be a hard stop under decision.2026-10-20.teardown-lines. Score from the bundle, p~0.95.'),
    ('squadstack', 'SQS-P05'): ('premise contradicted', 'Code shows a 23:00-09:00 calling pause (window 09:00-23:00), not 9:30-20:30 (SQS-49, SQS-71); will probably score false.'),
    ('squadstack', 'SQS-P07'): ('premise weakened', 'An agent-level transfer_call() tool exists; destination not visible (SQS-10, SQS-72).'),
    ('exotel', 'EXO-P04'): ('premise contradicted in part', 'Verifier: ECC has DNC lists and per-lead windows; Campaigns v2 path unchanged (verify.md, EXO-V02/V03).'),
    ('exotel', 'EXO-P05'): ('premise contradicted in part', 'Verifier: Outbound Dialer guide lists a daily window and days of week (EXO-V03); Campaigns v2 still one absolute window.'),
    ('exotel', 'EXO-P06'): ('premise contradicted in part', 'Verifier: a Beta Voice API AMD exists, enabled by the account manager, result 3-5 s after answer (EXO-V01).'),
    ('synthflow', 'SYN-P04'): ('not falsifiable as written', "Score as four sub-items per the verifier note."),
    ('synthflow', 'SYN-P05'): ('premise contradicted in part', 'Docs say overlapping windows work; score only the non-overlapping configuration.'),
}

EXTRA = [
    # regulation-segment lane (report.md, 'Pre-registered predictions for the account phase')
    ('regulation-segment', 'REG-P1', 'scheduling', 'At least 5 of 6 platforms (Bolna, Sarvam, Exotel, Vapi, Retell, Synthflow) let a promotional campaign start at 09:30 IST with default settings.', None, 'Schedule a campaign tagged/described as promotional at 09:30 IST on each platform with default settings; count platforms that accept without refusal or warning.'),
    ('regulation-segment', 'REG-P2', 'category', 'At most 1 of 6 platforms distinguishes service from promotional campaigns in a way that changes window, series or opt-out behaviour.', None, 'Look for a call-category control on every campaign screen and API; count platforms where changing it changes window, number series or opt-out behaviour.'),
    ('regulation-segment', 'REG-P3', 'a2p', '0 of 6 platforms offer an A2P CLI-range declaration workflow or export by 2026-11-30.', None, 'Bounded search of every settings/number screen and docs on 2026-11-30.'),
    ('regulation-segment', 'REG-P4', 'fence', 'An upsell line injected into a service script is spoken unblocked on 6 of 6 platforms (no in-call category fence).', None, 'Add one cross-sell sentence to the standard service agent; count platforms where it is spoken on a test call.'),
    ('regulation-segment', 'REG-P5', 'opt-out', "A mid-call 'don't call me again' does not automatically add the number to a cross-campaign suppression list on at least 4 of 6 platforms.", None, 'Say the opt-out line on a test call, then launch a second campaign containing the same number; count platforms that dial it.'),
    ('regulation-segment', 'REG-P6', 'disclosure', 'The default agent template discloses AI at call start on at most 2 of 6 platforms.', None, 'Build from each default template with no disclosure instruction; listen to the first agent turn.'),
    ('regulation-segment', 'REG-P7', 'dnd', "Exotel's campaign upload flags our BLOCK-PROMO-registered test number as DND, so its vendor claim holds.", 0.6, 'Needs a SIM we own registered BLOCK PROMO via 1909; upload in a promotional campaign and read the upload report.'),
    ('regulation-segment', 'REG-P8', 'dnd', "Sarvam's DND list, once a number is added via API, suppresses that number in every later campaign in the org.", None, 'Add our N2 number to the DND list via API; create two later campaigns containing N2; any ring on N2 is a miss.'),
    # radar lane (report.md)
    ('radar', 'RAD-P1', 'pricing', "Gupshup Voice AI's 'from INR 3.50/min' excludes telephony and/or premium voices: a trial invoice shows all-in >= INR 4.50 per connected minute on a Hindi agent calling an Indian mobile.", None, 'Trial invoice lines for >=10 connected calls.'),
    ('radar', 'RAD-P2', 'reply-gap', "Gupshup's Hindi agent on our PSTN battery has clean-turn p50 >= 2.0 s (handset side) and cuts into the elderly ~2.4 s pause in >= 1 of 2 calls.", None, 'Standard battery, stereo recording on our Plivo number.'),
    ('radar', 'RAD-P3', 'pricing', 'Ringg still enforces a monthly minimum on self-serve (stated in its FAQ or at checkout) of >= INR 5,000/month.', None, 'Read FAQ/checkout during sign-up.'),
    ('radar', 'RAD-P4', 'disclosure', "Smallest Atoms' agent on a Hindi persona discloses being an AI when asked 'aap AI ho?' in <= 1 of 2 calls without an explicit disclosure instruction.", None, 'Two calls, robot turn of P1/P4.'),
    ('radar', 'RAD-P5', 'market', 'By 2026-11-20, at least one more Indian voice-AI vendor on the radar publishes outcome-based (per-resolution or per-collection) pricing.', None, 'Change-watch diff of radar pricing pages on 2026-11-20.'),
    ('radar', 'RAD-P6', 'market', 'Desible.ai or Navana is named by at least 2 of the first 10 buyer interviews in insurance/BFSI as a vendor they use or evaluated.', None, 'Interview coding sheet.'),
]


def main():
    out = []
    for lane in LANES:
        d = json.load(open(os.path.join(T, lane, 'predictions.json')))
        items = d if isinstance(d, list) else d['predictions']
        for p in items:
            conf = p.get('p', p.get('confidence'))
            rule = p.get('how_scored') or p.get('holds_if') or p.get('hit_if') or p.get('score_by') or ''
            vnote = p.get('verifier_note') or p.get('verifier_check') or ''
            st, why = STATUS.get((lane, p['id']), ('open', ''))
            out.append({'lane': lane, 'vendor': VENDOR[lane], 'lane_id': p['id'], 'task': p.get('task', ''),
                        'prediction': p['prediction'], 'confidence': conf, 'scoring_rule': rule,
                        'verifier_note': vnote, 'status_2026_10_20': st, 'status_note': why,
                        'source': f'research/2026-10-20/teardown/{lane}/predictions.json'})
    for lane, pid, task, pred, conf, rule in EXTRA:
        out.append({'lane': lane, 'vendor': 'multi' if lane == 'regulation-segment' else 'radar', 'lane_id': pid,
                    'task': task, 'prediction': pred, 'confidence': conf, 'scoring_rule': rule,
                    'verifier_note': '', 'status_2026_10_20': 'open', 'status_note': '',
                    'source': f'research/2026-10-20/teardown/{lane}/report.md (Pre-registered predictions)'})
    for i, r in enumerate(out, 1):
        r['num'] = f'TP-{i:03d}'
    dst = os.path.join(T, 'synthesis', 'predictions-consolidated.json')
    json.dump({'consolidated': '2026-10-20', 'n': len(out),
               'rule': 'Text is copied verbatim from each lane; pre-registered wording is never edited. Status records only what verifiers or the API-key phase already showed.',
               'predictions': out}, open(dst, 'w'), ensure_ascii=False, indent=1)
    by = {}
    for r in out:
        by[r['status_2026_10_20']] = by.get(r['status_2026_10_20'], 0) + 1
    print(dst, len(out), by)
    if '--md' in sys.argv:  # for the main loop: render predictions.md from the same data
        md = sys.argv[sys.argv.index('--md') + 1]
        lines = ['# Teardown predictions, pre-registered (consolidated 2026-10-20)', '',
                 'Every prediction the account-free lanes registered before any trial account, numbered TP-001..TP-%03d. '
                 'Text is verbatim from each lane; the bracketed status records only what the verifiers or the API-key phase '
                 'had already shown on 2026-10-20. Source of record: research/2026-10-20/teardown/synthesis/predictions-consolidated.json.' % len(out), '']
        lane = None
        for p in out:
            if p['lane'] != lane:
                lane = p['lane']
                lines += ['', '## ' + (p['vendor'] if p['vendor'] not in ('multi', 'radar') else lane), '']
            conf = p['confidence']
            c = f'p={conf}' if conf not in (None, '') else 'p not stated'
            st = p['status_2026_10_20']
            s = '' if st == 'open' else f" **[{st}]** {p['status_note']}"
            lines.append(f"{p['num']}. ({p['lane_id']}, {p['task']}, {c}) {p['prediction']}{s}")
        open(md, 'w').write('\n'.join(lines) + '\n')
        print('wrote', md)


if __name__ == '__main__':
    sys.exit(main())
